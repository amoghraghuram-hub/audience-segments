import { useCallback, useEffect, useState } from 'react'
import { loadTaxonomy, type Taxonomy } from './lib/taxonomy'
import { emptyDefinition, hasEnded, nextSyncAt, normalize, startsLater, syncHistory, uid, type Activation as ActivationT, type AudienceDefinition, type Campaign, type SavedSegment } from './lib/model'
import { estimateReach } from './lib/reach'
import { loadSegments, saveSegments } from './lib/storage'
import { Shell } from './components/Shell'
import { SegmentList } from './components/SegmentList'
import { SourcePicker } from './components/SourcePicker'
import { Builder } from './components/Builder'
import { Activation } from './components/Activation'
import { Results } from './components/Results'
import { Toast, Icon } from './components/ui'
import { DESTINATIONS } from './lib/destinations'
import { HOME_COUNTRY } from './lib/geo'
import { fmtDate, localDay } from './lib/format'

type View = { name: 'list' } | { name: 'builder' } | { name: 'activate' } | { name: 'results' }

/** What the first sync to each destination looks like once it completes. */
function synced(s: SavedSegment, at: string): SavedSegment {
  return { ...s, status: 'active', activations: s.activations.map(a => record({ ...a, status: 'active' }, at, s.estimatedReach)) }
}

/**
 * Records one completed sync on a destination. SIMULATED: a destination's match rate is drawn once, between 60 and
 * 90%, then held steady with a little noise. In production the activation service reports the real figures.
 */
function record(a: ActivationT, at: string, sent: number): ActivationT {
  const past = syncHistory(a, sent)
  const last = past[past.length - 1]
  // a file export hands over every device, so there is nothing to match
  const isFile = DESTINATIONS.find(d => d.id === a.destinationId)?.kind === 'file'
  const rate = isFile ? 1 : last && last.sent > 0 ? Math.min(0.95, Math.max(0.3, last.matched / last.sent + (Math.random() - 0.5) * 0.03)) : 0.6 + Math.random() * 0.3
  const matched = Math.round(sent * rate)
  return { ...a, lastSyncAt: at, matchedReach: matched, history: [...past, { at, sent, matched }] }
}

/** Runs any refreshes that have come due on a live segment, one per daily or weekly interval, up to the campaign end. */
function refresh(s: SavedSegment): SavedSegment {
  if (s.status !== 'active') return s
  let changed = false
  const activations = s.activations.map(a => {
    let cur = a
    for (let guard = 0; guard < 120; guard++) {
      const due = nextSyncAt(cur, s.campaign)
      if (!due || due.getTime() > Date.now()) break
      cur = record(cur, due.toISOString(), s.estimatedReach); changed = true
    }
    return cur
  })
  return changed ? { ...s, activations } : s
}

/**
 * Moves a segment along its campaign dates: a scheduled one goes live on its start date, and a live or scheduled one
 * expires after its end date. In production the activation service does this on the dates themselves.
 */
function advance(s: SavedSegment): SavedSegment {
  if (hasEnded(s.campaign) && (s.status === 'active' || s.status === 'syncing' || s.status === 'scheduled')) return { ...s, status: 'expired' }
  if (s.status === 'scheduled' && !startsLater(s.campaign)) return refresh(synced(s, s.campaign?.start ? localDay(s.campaign.start).toISOString() : new Date().toISOString()))
  return refresh(s)
}

export default function App() {
  const [tx, setTx] = useState<Taxonomy | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [segments, setSegments] = useState<SavedSegment[]>(() => loadSegments().map(advance))
  const [view, setView] = useState<View>({ name: 'list' })
  const [showSources, setShowSources] = useState(false)
  const [current, setCurrent] = useState<SavedSegment | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => { loadTaxonomy().then(setTx).catch(e => setError(String(e))) }, [])
  useEffect(() => { saveSegments(segments) }, [segments])
  // re-check campaign dates while the app stays open, so a start or end date that arrives is acted on without a reload
  useEffect(() => {
    const t = setInterval(() => setSegments(list => { const next = list.map(advance); return next.some((s, i) => s !== list[i]) ? next : list }), 60_000)
    return () => clearInterval(t)
  }, [])
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 3500); return () => clearTimeout(t) }, [toast])

  const upsert = useCallback((s: SavedSegment) => {
    setSegments(list => list.some(x => x.id === s.id) ? list.map(x => x.id === s.id ? s : x) : [s, ...list])
  }, [])

  if (error) return <div className="page"><div className="callout warn">Could not load the segment catalogue: {error}. Run <code>npm run data</code> with <code>CSV=…</code> to regenerate <code>public/data/taxonomy.json</code>.</div></div>
  if (!tx) return <Shell crumbs={['Audience Studio']}><div className="page muted">Loading segment catalogue…</div></Shell>

  const fresh = (def: AudienceDefinition): SavedSegment => ({ id: uid(), source: 'offline_behaviour', definition: def, estimatedReach: 0, status: 'draft', activations: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
  const startNew = () => {
    setShowSources(false)
    setCurrent(fresh(emptyDefinition(HOME_COUNTRY)))
    setView({ name: 'builder' })
  }
  const open = (s: SavedSegment) => { setCurrent(s); setView({ name: 'builder' }) }
  const openResults = (s: SavedSegment) => { setCurrent(s); setView({ name: 'results' }) }
  /** A copy starts as an unsaved draft: same rules and geography, but no activations, segment ID, campaign or conversation. */
  const duplicate = (s: SavedSegment) => {
    const copyDef: AudienceDefinition = {
      ...s.definition, name: `${s.definition.name} (copy)`,
      include: s.definition.include.map(g => ({ id: uid(), conditions: g.conditions.map(c => ({ ...c, id: uid(), segmentIds: [...c.segmentIds] })) })),
      exclude: s.definition.exclude.map(c => ({ ...c, id: uid(), segmentIds: [...c.segmentIds] })),
    }
    setCurrent(fresh(copyDef)); setView({ name: 'builder' })
    setToast(`Copied “${s.definition.name}”. Save it to keep the copy.`)
  }
  // functional updates, so a sentence change and a conversation change made in the same moment cannot overwrite each other
  const setDef = (definition: AudienceDefinition) => setCurrent(c => c && { ...c, definition })
  const setBrief = (brief: SavedSegment['brief']) => setCurrent(c => c && { ...c, brief })
  const persist = (patch: Partial<SavedSegment> = {}, definition: AudienceDefinition = current!.definition): SavedSegment => {
    const def = normalize(definition)
    const s: SavedSegment = { ...current!, ...patch, definition: def, estimatedReach: estimateReach(tx, def).reach, updatedAt: new Date().toISOString() }
    setCurrent(s); upsert(s); return s
  }

  const activate = (acts: ActivationT[], segmentCode: string, campaign: Campaign | undefined) => {
    const names = acts.map(a => DESTINATIONS.find(d => d.id === a.destinationId)!.name).join(', ')
    if (startsLater(campaign)) {
      // nothing is sent until the start date; the segment waits as scheduled
      const held = persist({ segmentCode, campaign, activations: acts.map(a => ({ ...a, status: 'queued', lastSyncAt: undefined, matchedReach: undefined })), status: 'scheduled' })
      setView({ name: 'list' })
      setToast(`Scheduled “${held.definition.name}” to start on ${fmtDate(campaign!.start!)} on ${names}`)
      return
    }
    const s = persist({ segmentCode, campaign, activations: acts.map(a => ({ ...a, status: 'syncing' })), status: 'syncing' })
    setView({ name: 'list' })
    setToast(`Activating “${s.definition.name}” as ${segmentCode} to ${acts.map(a => DESTINATIONS.find(d => d.id === a.destinationId)!.name).join(', ')}`)
    // Simulate the sync completing. In production this is driven by webhook/status polling from the activation service.
    setTimeout(() => {
      // only if it is still mid-sync: it may have been rescheduled, expired or deleted in the meantime
      setSegments(list => list.map(x => x.id === s.id && x.status === 'syncing' ? synced(x, new Date().toISOString()) : x))
      setToast(`“${s.definition.name}” is live on ${acts.length} destination${acts.length === 1 ? '' : 's'}`)
    }, 4000)
  }

  const crumbs: React.ReactNode[] = ['Audience Studio', <a key="s" href="#" onClick={e => { e.preventDefault(); setView({ name: 'list' }) }}>Segments</a>]
  if (view.name !== 'list' && current) crumbs.push(current.definition.name || 'New segment')
  if (view.name === 'results') crumbs.push('Results')

  return (
    <>
      <Shell onSegments={() => setView({ name: 'list' })} crumbs={view.name === 'list' ? ['Audience Studio', 'Segments'] : crumbs}
        actions={view.name === 'list' ? undefined : <span className="faint" style={{ alignSelf: 'center', fontSize: 12 }}>{current?.status === 'draft' ? 'Draft · changes are saved when you continue' : `Status: ${current?.status}`}</span>}>
        {view.name === 'list' && <SegmentList tx={tx} segments={segments} onNew={() => setShowSources(true)} onOpen={open} onResults={openResults} onDuplicate={duplicate}
          onDelete={s => { setSegments(list => list.filter(x => x.id !== s.id)); if (current?.id === s.id) setCurrent(null); setToast(`Deleted “${s.definition.name}”`) }} />}
        {view.name === 'builder' && current && (
          <Builder key={current.id} tx={tx} def={current.definition} onChange={setDef} brief={current.brief} onBrief={setBrief}
            onBack={() => setView({ name: 'list' })} onResults={current.activations.length ? () => setView({ name: 'results' }) : undefined}
            onSaveDraft={final => { persist({ status: current.activations.length ? current.status : 'draft' }, final); setToast('Draft saved'); setView({ name: 'list' }) }}
            onContinue={final => { persist({ status: current.activations.length ? current.status : 'ready' }, final); setView({ name: 'activate' }) }} />
        )}
        {view.name === 'results' && current && (
          // read from the live list, so a sync that completes while the page is open shows up
          <Results tx={tx} segment={segments.find(s => s.id === current.id) ?? current}
            onBack={() => setView({ name: 'list' })} onEdit={() => setView({ name: 'builder' })} onManage={() => setView({ name: 'activate' })} />
        )}
        {view.name === 'activate' && current && (
          <Activation tx={tx} def={current.definition} reach={current.estimatedReach} existing={current.activations}
            segmentId={current.id} segmentCode={current.segmentCode} campaign={current.campaign}
            takenCodes={segments.filter(s => s.id !== current.id && s.segmentCode).map(s => s.segmentCode!)}
            onBack={() => setView({ name: 'builder' })} onActivate={activate} />
        )}
      </Shell>
      {showSources && <SourcePicker onClose={() => setShowSources(false)} onPick={startNew} />}
      {toast && <Toast><Icon.Check /> {toast}</Toast>}
    </>
  )
}
