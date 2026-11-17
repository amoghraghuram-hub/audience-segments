import { useEffect, useRef, useState } from 'react'
import type { AudienceDefinition } from '../lib/model'
import { hasRules, uid } from '../lib/model'
import { indexFor, type Taxonomy } from '../lib/taxonomy'
import { HOME_COUNTRY, detectGeo, hasGeo } from '../lib/geo'
import { planHasRules, planToDefinition, type BriefSession, type BriefUndo, type ChatTurn, type Plan } from '../lib/plan'
import { planBrief } from '../lib/planner'
import { describeError } from '../lib/claude'
import { Icon } from './ui'

const EXAMPLES = [
  'Launching a new protein shake in Texas and Florida. Target gym-goers and people who shop at sporting goods stores. Exclude anyone who already visits GNC.',
  'Premium coffee subscription in New York City and Chicago for people who visit Starbucks or independent coffee shops and go to coworking spaces.',
  'Weekend family promo for a theme park in Orlando: people who go to malls and movie theaters.',
]

const FOLLOW_UPS = ['Narrow it down', 'Make it broader', 'Add an exclusion']

/** The rules of a definition with ids stripped, to tell whether the sentence was edited by hand since the last draft. */
function signature(d: AudienceDefinition): string {
  const cond = (c: AudienceDefinition['exclude'][number]) => [c.type, !!c.negate, [...c.segmentIds].sort()]
  return JSON.stringify([d.include.map(g => g.conditions.filter(c => c.segmentIds.length).map(cond)).filter(g => g.length), d.exclude.filter(c => c.segmentIds.length).map(cond)])
}

/**
 * Carries a follow-up into a sentence the user has edited by hand, without throwing those edits away.
 * Works from what changed between the previous plan and the new one. Returns null when the new plan drops
 * something, because that cannot be merged safely and the caller replaces the sentence instead.
 */
function mergeIntoEdited(def: AudienceDefinition, prev: Plan, next: Plan): AudienceDefinition | null {
  const had = new Set([...prev.include.flat(), ...prev.exclude].flatMap(c => c.segmentIds))
  const has = new Set([...next.include.flat(), ...next.exclude].flatMap(c => c.segmentIds))
  if ([...had].some(id => !has.has(id))) return null
  // regrouping ("make it broader" merges requirements) is a rewrite too, even though no segment is dropped
  const groupOf = new Map<string, number>()
  next.include.forEach((g, i) => g.forEach(c => c.segmentIds.forEach(id => groupOf.set(id, i))))
  const landed = prev.include.map(g => new Set(g.flatMap(c => c.segmentIds).map(id => groupOf.get(id))))
  if (landed.some(set => set.size !== 1 || set.has(undefined)) || new Set(landed.map(set => [...set][0])).size !== landed.length) return null
  const inDef = new Set([...def.include.flatMap(g => g.conditions), ...def.exclude].flatMap(c => c.segmentIds))
  const fresh = (ids: string[]) => ids.filter(id => !had.has(id) && !inDef.has(id))
  const include = def.include.map(g => ({ ...g, conditions: [...g.conditions] }))
  for (const group of next.include) {
    const anchors = new Set(group.flatMap(c => c.segmentIds).filter(id => had.has(id)))
    const added = group.map(c => ({ id: uid(), type: c.type, segmentIds: fresh(c.segmentIds) })).filter(c => c.segmentIds.length)
    if (!added.length) continue
    // an addition to a requirement the plan already had goes into the matching requirement of the sentence
    const home = anchors.size ? include.find(g => g.conditions.some(c => c.segmentIds.some(id => anchors.has(id)))) : undefined
    if (home) home.conditions.push(...added)
    else include.push({ id: uid(), conditions: added })
  }
  const exclude = [...def.exclude, ...next.exclude.map(c => ({ id: uid(), type: c.type, segmentIds: fresh(c.segmentIds) })).filter(c => c.segmentIds.length)]
  return { ...def, include: include.filter(g => g.conditions.length).length ? include.filter(g => g.conditions.length) : include, exclude }
}

/**
 * The campaign brief box inside the builder. A brief, or a follow-up, is planned into rules and written straight
 * into the sentence above it, where every part stays editable by hand. Both ways of building work on the same audience.
 */
export function BriefAssistant({ tx, def, onApply, session, onSession }: {
  tx: Taxonomy; def: AudienceDefinition; onApply: (next: AudienceDefinition) => void
  /** a conversation saved with the segment, to resume; and where to save it as it changes */
  session?: BriefSession; onSession: (s: BriefSession | undefined) => void
}) {
  const [turns, setTurns] = useState<ChatTurn[]>(() => session?.turns ?? [])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState(() => !hasRules(def) || !!session?.turns.length)
  const [undo, setUndo] = useState<BriefUndo | null>(() => session?.undo ?? null)
  /** the last plan written into the sentence, the sentence as it was written, and whether the user has edited it since */
  const lastPlan = useRef<Plan | null>(session?.lastPlan ?? null)
  const lastWritten = useRef(session?.lastWritten ?? '')
  const edited = useRef(session?.edited ?? false)
  const threadRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  /** the name the last draft gave the segment, so a name the user typed themselves is never overwritten */
  const draftedName = useRef(session?.draftedName ?? '')

  useEffect(() => { threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: 'smooth' }) }, [turns, busy])
  useEffect(() => () => abortRef.current?.abort(), [])
  // Every change to the conversation is saved with the segment. The bookkeeping refs change in step with the turns.
  const firstRun = useRef(true)
  useEffect(() => {
    if (firstRun.current) { firstRun.current = false; return }
    onSession(turns.length ? { turns, lastPlan: lastPlan.current, lastWritten: lastWritten.current, edited: edited.current, draftedName: draftedName.current, undo } : undefined)
  }, [turns, undo]) // eslint-disable-line react-hooks/exhaustive-deps

  const latest = [...turns].reverse().find(t => t.role === 'assistant')

  const submit = async (raw: string) => {
    const text = raw.trim()
    if (!text || busy) return
    const history = [...turns, { role: 'user', text } as ChatTurn]
    setTurns(history); setInput(''); setBusy(true); setOpen(true)
    try {
      const said = history.filter(t => t.role === 'user').map(t => t.text)
      const where = detectGeo(said.join('. ')).geo
      // a place in the brief sets the geography; otherwise whatever is already chosen in the sentence stays
      const geo = hasGeo(where) ? where : def.geo ?? { states: [], cities: [] }
      abortRef.current = new AbortController()
      const reply = await planBrief(tx, history, geo, abortRef.current.signal)
      setTurns([...history, { role: 'assistant', text: reply.message, reply }])
      if (reply.plan && planHasRules(reply.plan)) {
        const drafted = planToDefinition(reply.plan, HOME_COUNTRY, new Set(), geo)
        const keepName = def.name.trim() && def.name !== draftedName.current
        edited.current = edited.current || (lastPlan.current ? signature(def) !== lastWritten.current : hasRules(def))
        // hand edits survive a follow-up that only adds; anything else rewrites the sentence and offers an undo
        const merged = edited.current && lastPlan.current ? mergeIntoEdited(def, lastPlan.current, reply.plan) : null
        const next = merged ? { ...merged, geo } : drafted
        const lostEdits = !merged && edited.current
        if (!merged) edited.current = false
        draftedName.current = drafted.name
        lastPlan.current = reply.plan
        lastWritten.current = signature(next)
        setUndo(hasRules(def) ? { def, replaced: !merged, lostEdits } : null)
        onApply({ ...next, name: keepName ? def.name : drafted.name })
      }
    } catch (e) {
      if ((e as Error).name === 'AbortError') return
      setTurns([...history, { role: 'assistant', text: describeError(e) }])
    } finally { setBusy(false) }
  }

  const reset = () => { abortRef.current?.abort(); setTurns([]); setInput(''); setBusy(false); setUndo(null); lastPlan.current = null; lastWritten.current = ''; edited.current = false }

  if (!open) {
    return (
      <button className="assist-collapsed" onClick={() => setOpen(true)}>
        <span className="avatar"><Icon.Sparkle /></span>
        <span><b>Or draft it from a campaign brief.</b><span className="muted"> Describe the campaign and the sentence above is {hasRules(def) ? 'rewritten' : 'written'} for you.</span></span>
      </button>
    )
  }

  return (
    <div className="card assist">
      <div className="assist-head">
        <span className="avatar"><Icon.Sparkle /></span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <b>Or draft it from a campaign brief</b>
          <div className="hint">Describe the campaign in plain words and the sentence above is written for you. You can still change any part by hand, or tell me what to adjust.</div>
        </div>
        {turns.length > 0 && <button className="btn sm ghost" onClick={reset}>Start over</button>}
        {hasRules(def) && <button className="btn sm ghost" onClick={() => setOpen(false)} aria-label="Hide the brief box">Hide</button>}
      </div>

      {turns.length > 0 && (
        <div className="assist-thread" ref={threadRef}>
          {turns.map((t, i) => (
            <div key={i} className={`bubble ${t.role}`}>
              <div className="bubble-body">
                <p>{t.text}</p>
                {t === latest && t.reply?.plan && planHasRules(t.reply.plan) && <Why tx={tx} plan={t.reply.plan} />}
              </div>
            </div>
          ))}
          {busy && <div className="bubble assistant"><div className="bubble-body"><span className="typing"><i /><i /><i /></span></div></div>}
        </div>
      )}

      {undo && !busy && (
        <div className={`assist-undo ${undo.lostEdits ? '' : 'ok'}`}>
          <span>{undo.lostEdits ? 'This rewrote the sentence, including changes you made by hand.' : undo.replaced ? 'Updated the sentence.' : 'Updated the sentence. Your own changes are kept.'}</span>
          <button className="btn sm" onClick={() => { onApply(undo.def); lastWritten.current = ''; edited.current = true; setUndo(null); setTurns(t => [...t, { role: 'assistant', text: 'Undone. The sentence is back to how you had it.' }]) }}>Undo</button>
        </div>
      )}

      <div className="assist-compose">
        <textarea className="input" rows={turns.length ? 1 : 3} value={input} onChange={e => setInput(e.target.value)}
          placeholder={turns.length
            ? 'Adjust it: “add IKEA”, “exclude existing customers”, “only in Texas”…'
            : "e.g. We're opening a new bubble tea shop in Austin. Reach people who already visit cafes and malls, and skip anyone who's a regular at our competitors."}
          onKeyDown={e => { if (e.key === 'Enter' && (turns.length ? !e.shiftKey : e.metaKey || e.ctrlKey)) { e.preventDefault(); submit(input) } }} />
        <button className="btn primary" disabled={!input.trim() || busy} onClick={() => submit(input)}>
          {turns.length ? <Icon.Send /> : <><Icon.Sparkle /> Draft audience</>}
        </button>
      </div>

      <div className="assist-chips">
        {turns.length === 0
          ? <><span className="hint">Try one:</span>{EXAMPLES.map(ex => <button key={ex} className="chip ghost" onClick={() => submit(ex)}>{ex.split('.')[0]}</button>)}</>
          : !busy && <>
              {(latest?.reply?.plan?.questions ?? []).map(q => <button key={q} className="chip ghost q" onClick={() => (q.trim().endsWith('?') ? setInput(q.replace(/\?$/, '') + ': ') : submit(q))}>{q}</button>)}
              {FOLLOW_UPS.map(f => <button key={f} className="chip ghost" onClick={() => submit(f)}>{f}</button>)}
            </>}
      </div>
    </div>
  )
}

/** Why each rule was chosen, folded away so the sentence stays the thing to read. */
function Why({ tx, plan }: { tx: Taxonomy; plan: Plan }) {
  const idx = indexFor(tx, HOME_COUNTRY)
  const names = (ids: string[]) => {
    const n = ids.map(id => (idx.get(id)?.row[1] ?? id).replace(/ (Visitors|Shoppers)$/, ''))
    return n.slice(0, 3).join(', ') + (n.length > 3 ? ` and ${n.length - 3} more` : '')
  }
  const rows = [...plan.include.flat().map(c => ({ c, ex: false })), ...plan.exclude.map(c => ({ c, ex: true }))].filter(r => r.c.reason)
  if (!rows.length) return null
  return (
    <details className="assist-why">
      <summary>Why these segments</summary>
      <ul>{rows.map((r, i) => <li key={i}><b>{r.ex ? 'Excluded ' : ''}{names(r.c.segmentIds)}</b>: {r.c.reason}</li>)}</ul>
    </details>
  )
}
