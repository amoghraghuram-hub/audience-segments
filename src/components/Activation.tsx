import { useMemo, useState } from 'react'
import type { Activation as ActivationT, AudienceDefinition, Campaign, RefreshCadence } from '../lib/model'
import { SEGMENT_CODE_MAX, campaignDays, segmentCodeProblem, startsLater, suggestSegmentCode, todayIso } from '../lib/model'
import type { Taxonomy } from '../lib/taxonomy'
import { DESTINATIONS, KIND_LABEL, creditsFor, type DestinationKind } from '../lib/destinations'
import { fmtCompact, fmtDate, fmtInt } from '../lib/format'
import { describeDefinition } from '../lib/summary'
import { Steps } from './Builder'
import { Icon, Tag } from './ui'

const CADENCE_LABEL: Record<RefreshCadence, string> = { once: 'One-time push', daily: 'Refresh daily', weekly: 'Refresh weekly' }
const SYNCS_PER_MONTH: Record<RefreshCadence, number> = { once: 1, daily: 30, weekly: 4 }

type Draft = { accountId: string; cadence: RefreshCadence }

export function Activation({ tx, def, reach, existing, segmentId, segmentCode, takenCodes, campaign: savedCampaign, onBack, onActivate }: {
  tx: Taxonomy; def: AudienceDefinition; reach: number; existing: ActivationT[]
  segmentId: string; segmentCode?: string; takenCodes: string[]; campaign?: Campaign
  onBack: () => void; onActivate: (acts: ActivationT[], segmentCode: string, campaign: Campaign | undefined) => void
}) {
  const suggestedCode = useMemo(() => suggestSegmentCode(def.name, def.country, segmentId), [def.name, def.country, segmentId])
  const [code, setCode] = useState(segmentCode ?? suggestedCode)
  const [copied, setCopied] = useState(false)
  const [campaign, setCampaign] = useState<Campaign>(() => savedCampaign ?? {})
  const today = todayIso()
  const dateProblem = campaign.end && campaign.end < today ? 'The end date is in the past'
    : campaign.start && campaign.end && campaign.end < campaign.start ? 'The end date is before the start date' : null
  const days = campaignDays(campaign)
  /** rough delivery check: destinations usually match 60 to 90% of devices, so plan on three quarters */
  const matched = Math.max(1, Math.round(reach * 0.75))
  const perDevice = campaign.impressions ? campaign.impressions / matched : null
  const sizing = perDevice === null ? null
    : perDevice > 30 ? { tone: 'warn', text: `That is about ${Math.round(perDevice)} impressions per device${days ? ` over ${days} days` : ''}. The audience is too small for this plan, so widen it or lower the target.` }
    : perDevice < 1 ? { tone: '', text: `That is under 1 impression per device, so only about ${fmtCompact(campaign.impressions!)} of ${fmtCompact(matched)} devices reachable on the channel will be reached. You could narrow the audience.` }
    : { tone: '', text: `That is about ${perDevice >= 10 ? Math.round(perDevice) : perDevice.toFixed(1)} impressions per device${days ? ` over ${days} days` : ''}, a workable frequency.` }
  const cleanCampaign = (): Campaign | undefined => {
    const c: Campaign = {}
    if (campaign.start) c.start = campaign.start
    if (campaign.end) c.end = campaign.end
    if (campaign.impressions && campaign.impressions > 0) c.impressions = campaign.impressions
    return Object.keys(c).length ? c : undefined
  }
  /** Destinations already hold the audience under this ID, so renaming it would orphan those copies. */
  // a scheduled segment has sent nothing yet, so its ID can still change
  const codeLocked = !!segmentCode && existing.some(a => a.status !== 'queued')
  const codeProblem = segmentCodeProblem(code, takenCodes)
  const copyCode = () => { navigator.clipboard?.writeText(code.trim()).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) }).catch(() => {}) }
  const [drafts, setDrafts] = useState<Record<string, Draft>>(() =>
    Object.fromEntries(existing.map(a => [a.destinationId, { accountId: a.accountId, cadence: a.cadence }])))
  const chosen = DESTINATIONS.filter(d => d.id in drafts)
  const toggle = (id: string) => {
    const next = { ...drafts }
    if (id in next) delete next[id]; else next[id] = { accountId: '', cadence: 'weekly' }
    setDrafts(next)
  }
  const set = (id: string, patch: Partial<Draft>) => setDrafts({ ...drafts, [id]: { ...drafts[id], ...patch } })

  const problems = chosen.filter(d => !drafts[d.id].accountId.trim() && d.kind !== 'file')
  const belowMin = chosen.filter(d => reach < d.minReach)
  const credits = useMemo(() => chosen.reduce((a, d) => a + creditsFor(reach, SYNCS_PER_MONTH[drafts[d.id].cadence]), 0), [chosen, drafts, reach])
  const ready = chosen.length > 0 && problems.length === 0 && !codeProblem && !dateProblem

  const kinds: DestinationKind[] = ['dsp', 'social', 'ctv', 'onboarding', 'file']
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="activation" style={{ flex: 1, overflow: 'auto', alignContent: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <Steps current={2} />
          <div>
            <h2>Where should this audience go?</h2>
            <p className="muted" style={{ marginTop: 4 }}>Pick one or more destinations. Each channel recognises only the devices that belong to its own users, so the number reachable on a channel usually lands at 60–90% of estimated reach.</p>
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
          <div className="card campaign">
            <div className="field">
              <label htmlFor="camp-start">Campaign start</label>
              <input id="camp-start" className="input" type="date" value={campaign.start ?? ''} onChange={e => setCampaign({ ...campaign, start: e.target.value || undefined })} />
            </div>
            <div className="field">
              <label htmlFor="camp-end">Campaign end</label>
              <input id="camp-end" className={`input ${dateProblem ? 'invalid' : ''}`} type="date" min={campaign.start && campaign.start > today ? campaign.start : today} value={campaign.end ?? ''} onChange={e => setCampaign({ ...campaign, end: e.target.value || undefined })} />
            </div>
            <div className="field">
              <label htmlFor="camp-imps">Planned impressions <span className="faint">optional</span></label>
              <input id="camp-imps" className="input num" type="number" min={0} step={10000} placeholder="e.g. 2000000" value={campaign.impressions ?? ''} onChange={e => setCampaign({ ...campaign, impressions: e.target.value ? Math.max(0, Number(e.target.value)) : undefined })} />
            </div>
            <div className="hint" style={{ gridColumn: '1 / -1' }}>
              {dateProblem
                ? <span style={{ color: 'var(--color-text-danger)' }}>{dateProblem}.</span>
                : campaign.end
                  ? <>Syncing stops after {fmtDate(campaign.end)} and the audience is removed from every destination{days !== null ? `, ${days} day${days === 1 ? '' : 's'} from ${campaign.start && campaign.start > today ? 'the start' : 'today'}` : ''}. The segment stays in your list as expired.</>
                  : <>Without an end date the audience keeps syncing, and using credits, until you stop it.</>}
              {!dateProblem && startsLater(campaign) && <> Nothing is sent before {fmtDate(campaign.start!)}. The segment waits as scheduled and the first sync runs that day.</>}
            </div>
            {sizing && <div className={`callout ${sizing.tone}`} style={{ gridColumn: '1 / -1' }}>{sizing.text}</div>}
          </div>
          {kinds.map(k => (
            <div key={k}>
              <div className="faint" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>{KIND_LABEL[k]}</div>
              <div className="dest-grid">
                {DESTINATIONS.filter(d => d.kind === k).map(d => (
                  <button key={d.id} className={`dest ${d.id in drafts ? 'on' : ''}`} onClick={() => toggle(d.id)}>
                    <span className="mark" style={{ background: d.color }}>{d.mark}</span>
                    <span style={{ minWidth: 0 }}>
                      <div className="name">{d.name}</div>
                      <div className="sub">{d.idType} · min {fmtCompact(d.minReach)}</div>
                    </span>
                    {d.id in drafts && <span style={{ marginLeft: 'auto', color: 'var(--color-accent-hover)' }}><Icon.Check /></span>}
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
                    <div className="who"><span className="mark" style={{ background: d.color }}>{d.mark}</span><b>{d.name}</b></div>
                    <div className="field">
                      <label>{d.accountLabel}</label>
                      <input className="input" placeholder={d.accountPlaceholder} value={drafts[d.id].accountId} onChange={e => set(d.id, { accountId: e.target.value })} />
                    </div>
                    <div className="field">
                      <label>Refresh</label>
                      <select className="select" value={drafts[d.id].cadence} onChange={e => set(d.id, { cadence: e.target.value as RefreshCadence })}>
                        {(Object.keys(CADENCE_LABEL) as RefreshCadence[]).map(c => <option key={c} value={c}>{CADENCE_LABEL[c]}</option>)}
                      </select>
                    </div>
                    <button className="btn sm ghost" style={{ marginBottom: 4 }} onClick={() => toggle(d.id)} title="Remove"><Icon.Trash /></button>
                    <div className="hint" style={{ gridColumn: '1 / -1' }}>{d.kind === 'file' ? 'File will be tagged with' : `Will appear in ${d.name} as`} <span className="mono">{code.trim() || '—'}</span></div>
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
            <div className="review-row"><span className="k">Campaign</span><b>{campaign.start || campaign.end ? `${campaign.start ? fmtDate(campaign.start) : 'Now'} to ${campaign.end ? fmtDate(campaign.end) : 'open-ended'}` : 'Open-ended'}</b></div>
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
          {!ready && <span className="hint">{dateProblem ? 'Fix the campaign dates to continue' : codeProblem ? 'Fix the segment ID to continue' : chosen.length ? 'Fill in the account IDs to continue' : 'Choose at least one destination'}</span>}
          <button className="btn primary lg" disabled={!ready} onClick={() => onActivate(chosen.map(d => ({
            destinationId: d.id, accountId: drafts[d.id].accountId.trim() || d.accountPlaceholder, cadence: drafts[d.id].cadence, status: 'queued' as const,
          })), code.trim(), cleanCampaign())}>
            {startsLater(campaign) && !dateProblem ? `Schedule for ${fmtDate(campaign.start!)}` : <>Activate to {chosen.length || ''} destination{chosen.length === 1 ? '' : 's'}</>}
          </button>
        </div>
      </div>
    </div>
  )
}
