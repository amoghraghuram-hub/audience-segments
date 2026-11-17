import { useState } from 'react'
import type { AudienceDefinition, Condition, Group } from '../lib/model'
import type { BriefSession } from '../lib/plan'
import { uid, isDefinitionComplete } from '../lib/model'
import { hasOffline, indexFor, type SegmentType, type Taxonomy } from '../lib/taxonomy'
import { fmtCompact, fmtInt } from '../lib/format'
import { estimateReach } from '../lib/reach'
import { sensitivityOf, type Sensitivity } from '../lib/sensitive'
import { conditionNames, conditionVerb, suggestName } from '../lib/summary'
import { placeLabel } from '../lib/summary'
import { HOME_COUNTRY, hasGeo, type GeoFilter } from '../lib/geo'
import { SegmentPicker, type Selections } from './SegmentPicker'
import { GeoPicker } from './GeoPicker'
import { BriefAssistant } from './BriefAssistant'
import { ReachPanel } from './ReachPanel'
import { Icon, Tag } from './ui'

type PickerTarget = { groupId: string | 'exclude'; conditionId?: string; type?: SegmentType }

export function Builder({ tx, def, onChange, onBack, onSaveDraft, onContinue, brief, onBrief, onResults }: {
  tx: Taxonomy; def: AudienceDefinition; onChange: (d: AudienceDefinition) => void
  onBack: () => void; onSaveDraft: (final: AudienceDefinition) => void; onContinue: (final: AudienceDefinition) => void
  brief?: BriefSession; onBrief: (s: BriefSession | undefined) => void
  /** set when the segment has been activated, to jump to its delivery results */
  onResults?: () => void
}) {
  const [picker, setPicker] = useState<PickerTarget | null>(null)
  const [geoOpen, setGeoOpen] = useState(false)
  const complete = isDefinitionComplete(def)
  const suggested = suggestName(tx, def)
  const est = estimateReach(tx, def)
  const tooSmall = complete && est.status === 'too_small'
  /** segments in the sentence that the sensitive-place policy restricts or flags, e.g. from a segment saved before the policy */
  const flagged = (() => {
    const idx = indexFor(tx, def.country)
    const out: { name: string; flag: Sensitivity }[] = []
    for (const c of [...def.include.flatMap(g => g.conditions), ...def.exclude]) for (const id of c.segmentIds) {
      const name = idx.get(id)?.row[1]; const flag = name ? sensitivityOf(name) : null
      if (name && flag && !out.some(o => o.name === name)) out.push({ name: name.replace(/ (Visitors|Shoppers)$/, ''), flag })
    }
    return out
  })()
  const restricted = flagged.filter(f => f.flag.level === 'blocked')
  const careful = flagged.filter(f => f.flag.level === 'caution')
  /** Fill a blank name with the suggestion before leaving the step; hand the parent the final definition. */
  const withName = (fn: (final: AudienceDefinition) => void) => () => {
    const final = def.name.trim() ? def : { ...def, name: suggested }
    if (final !== def) onChange(final)
    fn(final)
  }

  const update = (patch: Partial<AudienceDefinition>) => onChange({ ...def, ...patch })
  const setGeo = (geo: GeoFilter) => { update({ geo }); setGeoOpen(false) }

  const applyPicks = (target: PickerTarget, sel: Selections) => {
    const entries = (Object.entries(sel) as [SegmentType, string[]][]).filter(([, ids]) => ids.length)
    /**
     * Editing a rule changes that rule in place and keeps its "has not" state. Anything else picked, and everything
     * picked through "+ or", becomes a rule of its own, so each one can be flipped or removed separately.
     */
    const merge = (conds: Condition[]): Condition[] => {
      const pos = conds.findIndex(c => c.id === target.conditionId)
      const orig = conds[pos]
      const fresh: Condition[] = entries.filter(([type]) => type !== orig?.type).map(([type, ids]) => ({ id: uid(), type, segmentIds: ids }))
      if (!orig) return [...conds, ...fresh]
      const kept = entries.find(([type]) => type === orig.type)
      const next = [...conds]
      next.splice(pos, 1, ...(kept ? [{ ...orig, segmentIds: kept[1] }] : []), ...fresh)
      return next
    }
    if (target.groupId === 'exclude') update({ exclude: merge(def.exclude) })
    else update({ include: def.include.map(g => g.id === target.groupId ? { ...g, conditions: merge(g.conditions) } : g) })
    setPicker(null)
  }

  /** Drop a condition; a group left empty disappears unless it is the only one. */
  const removeCondition = (groupId: string | 'exclude', condId: string) => {
    if (groupId === 'exclude') { update({ exclude: def.exclude.filter(c => c.id !== condId) }); return }
    const next = def.include.map(g => g.id === groupId ? { ...g, conditions: g.conditions.filter(c => c.id !== condId) } : g)
    const pruned = next.filter(g => g.conditions.length)
    update({ include: pruned.length ? pruned : [next[0]] })
  }
  const toggleNegate = (groupId: string, condId: string) =>
    update({ include: def.include.map(g => g.id === groupId ? { ...g, conditions: g.conditions.map(c => c.id === condId ? { ...c, negate: !c.negate } : c) } : g) })
  const addGroup = () => update({ include: [...def.include, { id: uid(), conditions: [] }] })
  const removeGroup = (id: string) => update({ include: def.include.length > 1 ? def.include.filter(g => g.id !== id) : [{ id: uid(), conditions: [] }] })

  const pickerInitial = (): Selections => {
    if (!picker?.conditionId) return {}
    const list = picker.groupId === 'exclude' ? def.exclude : def.include.find(g => g.id === picker.groupId)?.conditions ?? []
    const c = list.find(x => x.id === picker.conditionId)
    return c ? { [c.type]: c.segmentIds } : {}
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="builder" style={{ flex: 1, minHeight: 0 }}>
        <aside className="builder-left">
          <Steps current={1} />
          <div className="field">
            <label>Lookback window</label>
            <select className="select" value="90" disabled><option value="90">Last 90 days</option></select>
            <span className="hint">All offline segments use a rolling 90-day observation window and refresh daily.</span>
          </div>
          <div className="field">
            <label>Source</label>
            <div><Tag tone="teal">Offline behaviour</Tag> <span className="faint" style={{ marginLeft: 6 }}>catalogue {tx.version}</span></div>
          </div>
          {onResults && <button className="btn" onClick={onResults} style={{ justifyContent: 'center' }}><Icon.Chart /> View results</button>}
          {!hasOffline(tx, def.country) && <div className="callout warn">No offline behaviour segments are available for this country yet.</div>}
          <div className="callout" style={{ marginTop: 'auto' }}>
            <b>How to read the sentence</b><br />“or” widens the audience, “and who” narrows it, “excluding” removes devices last. Click any highlighted part to change it. Click a verb such as “visited” to flip it to “have not visited”.
          </div>
        </aside>

        <section className="builder-center">
          <div className="seg-title">
            <label htmlFor="segment-name">Segment name</label>
            <input id="segment-name" className="seg-title-input" placeholder={suggested || 'Untitled segment'} value={def.name} onChange={e => update({ name: e.target.value })} autoComplete="off" />
            <span className="hint">{def.name.trim() ? ' ' : suggested ? 'Suggested from the sentence. Type to use your own name.' : 'Leave blank and it will be named from the sentence.'}</span>
          </div>
          <div>
            <h2>Define who's in this audience</h2>
            <p className="muted" style={{ marginTop: 4 }}>Describe the campaign, write the sentence yourself, or do both. They build the same audience.</p>
          </div>

          {def.country === HOME_COUNTRY && <BriefAssistant tx={tx} def={def} onApply={onChange} session={brief} onSession={onBrief} />}

          <div className="card sentence-card">
            <Sentence tx={tx} def={def} onGeo={() => setGeoOpen(true)}
              onAdd={groupId => setPicker({ groupId })}
              onEdit={(groupId, c) => setPicker({ groupId, conditionId: c.id, type: c.type })}
              onToggleNegate={toggleNegate} onRemoveCondition={removeCondition} onRemoveGroup={removeGroup} onAddGroup={addGroup} />
          </div>

          {restricted.length > 0 && (
            <div className="callout danger" role="alert">
              <b>Restricted segments in this audience.</b> {restricted.map(f => f.name).join(', ')} cannot be used. {restricted[0].flag.why} Remove {restricted.length > 1 ? 'them' : 'it'} to continue.
            </div>
          )}
          {careful.length > 0 && (
            <div className="callout warn">
              <b>Use with care.</b> {[...new Set(careful.map(f => f.flag.label))].join(', ')}: {careful.map(f => f.name).slice(0, 4).join(', ')}{careful.length > 4 ? ` and ${careful.length - 4} more` : ''}. {careful[0].flag.why}
            </div>
          )}
        </section>

        <aside className="builder-right">
          <ReachPanel tx={tx} def={def} />
        </aside>
      </div>

      <div className="footer-bar">
        <button className="btn ghost" onClick={onBack}><Icon.Back /> Back to segments</button>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {!complete && <span className="hint">Add at least one condition to continue</span>}
          {tooSmall && <span className="hint" style={{ color: 'var(--color-tag-text-red)' }}>Below the {fmtInt(Math.round(est.bands.floor))}-device minimum. Widen it to activate.</span>}
          {restricted.length > 0 && <span className="hint" style={{ color: 'var(--color-tag-text-red)' }}>Remove the restricted segments to activate.</span>}
          <button className="btn" disabled={!complete} onClick={withName(onSaveDraft)}>Save as draft</button>
          <button className="btn primary" disabled={!complete || tooSmall || restricted.length > 0} onClick={withName(onContinue)}>Continue to activation →</button>
        </div>
      </div>

      {geoOpen && <GeoPicker initial={def.geo ?? { states: [], cities: [] }} onApply={setGeo} onClose={() => setGeoOpen(false)} />}
      {picker && (
        <SegmentPicker tx={tx} country={def.country} initialType={picker.type} initial={pickerInitial()}
          onApply={sel => applyPicks(picker, sel)} onClose={() => setPicker(null)} />
      )}
    </div>
  )
}

export function Steps({ current }: { current: 1 | 2 }) {
  return (
    <div className="steps">
      <span className={`step ${current === 1 ? 'on' : 'done'}`}><b>{current > 1 ? '✓' : 1}</b> Define</span>
      <span className="faint">›</span>
      <span className={`step ${current === 2 ? 'on' : ''}`}><b>2</b> Activate</span>
    </div>
  )
}

/** The whole definition rendered as one editable sentence. */
function Sentence({ tx, def, onGeo, onAdd, onEdit, onToggleNegate, onRemoveCondition, onRemoveGroup, onAddGroup }: {
  tx: Taxonomy; def: AudienceDefinition; onGeo: () => void
  onAdd: (groupId: string | 'exclude') => void; onEdit: (groupId: string | 'exclude', c: Condition) => void
  onToggleNegate: (groupId: string, condId: string) => void
  onRemoveCondition: (groupId: string | 'exclude', condId: string) => void; onRemoveGroup: (id: string) => void; onAddGroup: () => void
}) {
  const filled = (g: Group) => g.conditions.some(c => c.segmentIds.length)
  const anyRule = def.include.some(filled)
  const last = def.include[def.include.length - 1]
  const W = ({ children }: { children: string }) => <span className="w">{children}</span>

  return (
    <div className="sentence">
      <W>People in</W>{' '}
      {def.country === HOME_COUNTRY
        ? <button className={`chip-select geo ${hasGeo(def.geo) ? 'set' : ''}`} onClick={onGeo} title="Filter by State and City">{placeLabel(tx, def)}</button>
        : <span className="fixed" title="Saved before the catalogue moved to United States only">{placeLabel(tx, def)}</span>}{' '}
      <W>who, in the last</W> <span className="fixed">{tx.lookbackDays} days</span><W>,</W>{' '}

      {def.include.map((g, gi) => (
        <span key={g.id} className="group-span">
          {gi > 0 && <><W>and who</W>{' '}</>}
          {g.conditions.map((c, ci) => (
            <span key={c.id}>
              {ci > 0 && <><W>or</W>{' '}</>}
              <CondChip tx={tx} country={def.country} cond={c} onToggle={() => onToggleNegate(g.id, c.id)} onEdit={() => onEdit(g.id, c)} onRemove={() => onRemoveCondition(g.id, c.id)} />{' '}
            </span>
          ))}
          {g.conditions.length
            ? <button className="chip ghost" onClick={() => onAdd(g.id)} title="Add an alternative to this group (OR)"><Icon.Plus /> or</button>
            : <span>
                <button className="chip ghost strong" onClick={() => onAdd(g.id)}><Icon.Plus /> {gi === 0 ? 'did something…' : 'also did something…'}</button>
                {gi > 0 && <button className="chip ghost x" onClick={() => onRemoveGroup(g.id)} aria-label="Remove this part">✕</button>}
              </span>}
          {' '}
        </span>
      ))}

      {filled(last) && <><button className="chip ghost" onClick={onAddGroup} title="Narrow the audience with another requirement (AND)"><Icon.Plus /> and who</button>{' '}</>}

      {anyRule && (
        <span className="group-span">
          {def.exclude.length > 0 && <><W>excluding people who</W>{' '}</>}
          {def.exclude.map((c, ci) => (
            <span key={c.id}>
              {ci > 0 && <><W>or</W>{' '}</>}
              <CondChip tx={tx} country={def.country} cond={c} exclude onEdit={() => onEdit('exclude', c)} onRemove={() => onRemoveCondition('exclude', c.id)} />{' '}
            </span>
          ))}
          <button className="chip ghost" onClick={() => onAdd('exclude')} title="Suppress devices that match (applied last)"><Icon.Plus /> {def.exclude.length ? 'or' : 'excluding'}</button>
        </span>
      )}
      {anyRule && <W>.</W>}
    </div>
  )
}

const MAX_NAMES = 3

function CondChip({ tx, country, cond, exclude, onToggle, onEdit, onRemove }: {
  tx: Taxonomy; country: string; cond: Condition; exclude?: boolean; onToggle?: () => void; onEdit: () => void; onRemove: () => void
}) {
  const negate = !exclude && !!cond.negate
  const [pre, suf] = conditionVerb(cond.type, negate)
  const [flipped] = conditionVerb(cond.type, !negate)
  const names = conditionNames(tx, country, cond)
  const idx = indexFor(tx, country)
  const reach = cond.segmentIds.reduce((a, id) => a + (idx.get(id)?.row[2] ?? 0), 0)
  const shown = names.slice(0, MAX_NAMES)
  const extra = names.length - shown.length
  const label = shown.length > 1 ? shown.slice(0, -1).join(', ') + (extra ? ', ' : ' or ') + shown[shown.length - 1] : shown[0]
  return (
    <>
      {pre && (onToggle
        ? <><button className={`verb ${negate ? 'not' : ''}`} onClick={onToggle} aria-pressed={negate} title={`Switch to “${flipped}”`}>{pre}</button>{' '}</>
        : <><span className="w">{pre}</span>{' '}</>)}
      <span className={`chip cond ${exclude ? 'ex' : ''} ${negate ? 'not' : ''}`} role="button" tabIndex={0} onClick={onEdit} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onEdit() } }}
        title={`${tx.types[cond.type].label} · ${names.join(', ')}`}>
        <span>{label}{extra > 0 && ` +${extra}`}</span>
        {!negate && <small className="num">{fmtCompact(reach)}</small>}
        <button onClick={e => { e.stopPropagation(); onRemove() }} aria-label="Remove">✕</button>
      </span>
      {suf && <>{' '}<span className="w">{suf}</span></>}
    </>
  )
}
