import { useMemo, useState } from 'react'
import type { Activation as ActivationT, AudienceDefinition, Delivery } from '../lib/model'
import { DELIVERY_LABEL, SEGMENT_CODE_MAX, deliveryOf, segmentCodeProblem, suggestSegmentCode } from '../lib/model'
import type { Taxonomy } from '../lib/taxonomy'
import { DESTINATIONS, KIND_LABEL, creditsFor, type DestinationKind } from '../lib/destinations'
import { fmtCompact, fmtInt } from '../lib/format'
import { describeDefinition } from '../lib/summary'
import { Steps } from './Builder'
import { Icon, Tag } from './ui'
import { DestLogo } from './DestLogo'


type Draft = { accountId: string; delivery: Delivery }

export function Activation({ tx, def, reach, existing, segmentId, segmentCode, takenCodes, plannedImpressions, onBack, onActivate }: {
  tx: Taxonomy; def: AudienceDefinition; reach: number; existing: ActivationT[]
  segmentId: string; segmentCode?: string; takenCodes: string[]; plannedImpressions?: number
  onBack: () => void; onActivate: (acts: ActivationT[], segmentCode: string, plannedImpressions: number | undefined) => void
}) {
  const suggestedCode = useMemo(() => suggestSegmentCode(def.name, def.country, segmentId), [def.name, def.country, segmentId])
  const [code, setCode] = useState(segmentCode ?? suggestedCode)
  const [copied, setCopied] = useState(false)
  const [impressions, setImpressions] = useState<number | undefined>(plannedImpressions)
  /** rough delivery check: channels usually recognise 60 to 90% of devices, so plan on three quarters */
  const matched = Math.max(1, Math.round(reach * 0.75))
  const perDevice = impressions ? impressions / matched : null
  const sizing = perDevice === null ? null
    : perDevice > 30 ? { tone: 'warn', text: `That is about ${Math.round(perDevice)} impressions per device. The audience is too small for this plan, so widen it or lower the target.` }
    : perDevice < 1 ? { tone: '', text: `That is under 1 impression per device, so only about ${fmtCompact(impressions!)} of ${fmtCompact(matched)} devices reachable on the channel will be reached. You could narrow the audience.` }
    : { tone: '', text: `That is about ${perDevice >= 10 ? Math.round(perDevice) : perDevice.toFixed(1)} impressions per device, a workable frequency.` }
  /** Destinations already hold the audience under this ID, so renaming it would orphan those copies. */
  const codeLocked = !!segmentCode && existing.length > 0
  const codeProblem = segmentCodeProblem(code, takenCodes)
  const copyCode = () => { navigator.clipboard?.writeText(code.trim()).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) }).catch(() => {}) }
  const [drafts, setDrafts] = useState<Record<string, Draft>>(() =>
    Object.fromEntries(existing.map(a => [a.destinationId, { accountId: a.accountId, delivery: deliveryOf(a) }])))
  const chosen = DESTINATIONS.filter(d => d.id in drafts)
  const toggle = (id: string) => {
    const next = { ...drafts }
    if (id in next) delete next[id]; else next[id] = { accountId: '', delivery: DESTINATIONS.find(d => d.id === id)?.kind === 'file' ? 'once' : 'monthly' } // a downloaded file is a snapshot by nature
    setDrafts(next)
  }
  const set = (id: string, patch: Partial<Draft>) => setDrafts({ ...drafts, [id]: { ...drafts[id], ...patch } })

  const problems = chosen.filter(d => !drafts[d.id].accountId.trim() && d.kind !== 'file')
  const belowMin = chosen.filter(d => reach < d.minReach)
  const credits = useMemo(() => chosen.reduce((a, d) => a + creditsFor(reach, 1), 0), [chosen, drafts, reach])
  const ready = chosen.length > 0 && problems.length === 0 && !codeProblem

  const kinds: DestinationKind[] = ['dsp', 'social', 'ctv', 'onboarding', 'file']
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="activation" style={{ flex: 1, overflow: 'auto', alignContent: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <Steps current={2} />
          <div>
            <h2>Where should this audience go?</h2>
            <p className="muted" style={{ marginTop: 4 }}>Pick one or more destinations. Each channel recognises only the devices that belong to its own users, so the number reachable on a channel usually lands at 60–90% of estimated reach. Segments are rebuilt once a month: choose per channel whether it keeps receiving the update or gets the audience once.</p>
          </div>
          <div className="card seg-id">
            <div className="field" style={{ flex: 1, minWidth: 0 }}>
              <label htmlFor="segment-code">Segment ID</label>
              <div className="seg-id-row">
                <input id="segment-code" className={`input mono ${codeProblem ? 'invalid' : ''}`} value={code} maxLength={SEGMENT_CODE_MAX + 8} disabled={codeLocked}
                  spellCheck={false} autoComplete="off" onChange={e => setCode(e.target.value.replace(/\s+/g, '_'))} />
                <button className="btn" onClick={copyCode} disabled={!!codeProblem}>{copied ? 'Copied' : 'Copy'}</button>
                {!codeLocked && code !== suggestedCode && <button className="btn ghost" onClick={() => setCode(suggestedCode)}>Reset</button>}
              </div>
              {codeProblem
                ? <span className="hint" style={{ color: 'var(--color-text-danger)' }}>{codeProblem}.</span>
                : <span className="hint">{codeLocked
                    ? 'This is the name to search for inside each destination. It is fixed because the audience has already been activated.'
                    : 'This is the name to search for inside each destination once the sync completes. It is fixed after the first activation.'}</span>}
            </div>
          </div>
          <div className="card planned">
            <div className="field">
              <label htmlFor="planned-imps">Planned impressions <span className="faint">optional</span></label>
              <input id="planned-imps" className="input num" type="number" min={0} step={10000} placeholder="e.g. 2000000" value={impressions ?? ''} onChange={e => setImpressions(e.target.value ? Math.max(0, Number(e.target.value)) : undefined)} />
              <span className="hint">Enter the impressions you plan to buy and I'll check them against the size of this audience.</span>
            </div>
            {sizing && <div className={`callout ${sizing.tone}`}>{sizing.text}</div>}
          </div>
          {kinds.map(k => (
            <div key={k}>
              <div className="faint" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>{KIND_LABEL[k]}</div>
              <div className="dest-grid">
                {DESTINATIONS.filter(d => d.kind === k).map(d => (
                  <button key={d.id} className={`dest ${d.id in drafts ? 'on' : ''}`} onClick={() => toggle(d.id)} aria-pressed={d.id in drafts}>
                    <DestLogo d={d} size={32} />
                    <span style={{ minWidth: 0 }}>
                      <div className="name">{d.name}</div>
                      <div className="sub">{d.kind === 'file' ? 'CSV file of device IDs' : `Min ${fmtCompact(d.minReach)} devices`}</div>
                    </span>
                    <span className="pick">{d.id in drafts && <Icon.Check />}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}

          {chosen.length > 0 && (
            <div>
              <h3 style={{ marginBottom: 8 }}>Configure destinations</h3>
              <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
                {chosen.map((d, i) => (
                  <div key={d.id} className="dest-config" style={i ? { borderTop: '1px solid var(--color-border-medium)' } : undefined}>
                    <div className="who"><DestLogo d={d} size={28} /><b>{d.name}</b></div>
                    <div className="field">
                      <label>{d.accountLabel}</label>
                      <input className="input" placeholder={d.accountPlaceholder} value={drafts[d.id].accountId} onChange={e => set(d.id, { accountId: e.target.value })} />
                    </div>
                    <div className="field">
                      <label>Delivery</label>
                      <div className="seg-toggle" role="group" aria-label={`Delivery for ${d.name}`}>
                        {(Object.keys(DELIVERY_LABEL) as Delivery[]).map(m => (
                          <button key={m} type="button" className={drafts[d.id].delivery === m ? 'on' : ''} aria-pressed={drafts[d.id].delivery === m} onClick={() => set(d.id, { delivery: m })}>{DELIVERY_LABEL[m]}</button>
                        ))}
                      </div>
                    </div>
                    <button className="btn sm ghost" style={{ marginBottom: 4 }} onClick={() => toggle(d.id)} title="Remove"><Icon.Trash /></button>
                    <div className="hint" style={{ gridColumn: '1 / -1' }}>{d.kind === 'file' ? 'File will be tagged with' : `Will appear in ${d.name} as`} <span className="mono">{code.trim() || '—'}</span>. {drafts[d.id].delivery === 'once' ? 'Sent once, as the audience stands today. It will not change afterwards.' : 'Updated each month when the segment is rebuilt, so people who stop qualifying drop out.'}</div>
                    {reach < d.minReach && <div className="callout warn" style={{ gridColumn: '1 / -1' }}>{d.name} needs at least {fmtInt(d.minReach)} devices. This audience is estimated at {fmtInt(reach)} and may be rejected after matching.</div>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <aside className="card" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 16, alignSelf: 'start', position: 'sticky', top: 0 }}>
          <div>
            <div className="muted" style={{ fontSize: 12 }}>Segment</div>
            <h3 style={{ marginTop: 4 }}>{def.name}</h3>
            <p className="summary" style={{ marginTop: 6 }}>{describeDefinition(tx, def)}</p>
          </div>
          <div className="review-list">
            <div className="review-row"><span className="k">Segment ID</span><b className="mono" style={{ overflowWrap: 'anywhere', textAlign: 'right' }}>{codeProblem ? '—' : code.trim()}</b></div>
            <div className="review-row"><span className="k">Estimated reach</span><b className="num">{fmtInt(reach)}</b></div>
            <div className="review-row"><span className="k">Destinations</span><b>{chosen.length || '—'}</b></div>
            <div className="review-row"><span className="k">ID type</span><b>MAID (IDFA / GAID)</b></div>
            <div className="review-row"><span className="k">Est. credits / month</span><b className="num">{chosen.length ? fmtInt(credits) : '—'}</b></div>
            <div className="review-row"><span className="k">Balance after first month</span><b className="num">{chosen.length ? fmtInt(12480 - credits) : '—'}</b></div>
          </div>
          <div className="hint">1 credit per 10,000 devices per sync, minimum 5 per sync. Credits are deducted when each sync completes. Illustrative rate card.</div>
          {belowMin.length > 0 && <Tag tone="yellow">{belowMin.length} destination{belowMin.length > 1 ? 's' : ''} below minimum size</Tag>}
        </aside>
      </div>

      <div className="footer-bar">
        <button className="btn ghost" onClick={onBack}><Icon.Back /> Back to definition</button>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {!ready && <span className="hint">{codeProblem ? 'Fix the segment ID to continue' : chosen.length ? 'Fill in the account IDs to continue' : 'Choose at least one destination'}</span>}
          <button className="btn primary lg" disabled={!ready} onClick={() => onActivate(chosen.map(d => ({
            destinationId: d.id, accountId: drafts[d.id].accountId.trim() || d.accountPlaceholder, delivery: drafts[d.id].delivery, status: 'queued' as const,
          })), code.trim(), impressions && impressions > 0 ? impressions : undefined)}>
            Activate to {chosen.length || ''} destination{chosen.length === 1 ? '' : 's'}
          </button>
        </div>
      </div>
    </div>
  )
}
