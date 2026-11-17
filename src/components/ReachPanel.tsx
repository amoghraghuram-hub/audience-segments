import type { AudienceDefinition } from '../lib/model'
import type { Taxonomy } from '../lib/taxonomy'
import { estimateReach, scalePos, type FunnelStep, type ReachEstimate, type SizeStatus } from '../lib/reach'
import { describeCondition, placeLabel } from '../lib/summary'
import { fmtCompact, fmtInt } from '../lib/format'
import { hasGeo } from '../lib/geo'

const STATUS: Record<Exclude<SizeStatus, 'empty'>, { label: string; tone: string }> = {
  too_small: { label: 'Too small', tone: 'red' },
  narrow: { label: 'Narrow', tone: 'yellow' },
  healthy: { label: 'Healthy size', tone: 'green' },
  broad: { label: 'Very broad', tone: 'blue' },
}

const pct = (f: number) => {
  const v = f * 100
  return (v >= 10 ? v.toFixed(0) : v >= 1 ? v.toFixed(1) : v >= 0.01 ? v.toFixed(2) : '<0.01') + '%'
}

function stepLabel(tx: Taxonomy, def: AudienceDefinition, step: FunnelStep): string {
  if (step.kind === 'exclude') {
    return 'excluding those who ' + def.exclude.filter(c => c.segmentIds.length).map(c => describeCondition(tx, def.country, c)).join(' or ')
  }
  const g = def.include.find(x => x.id === step.key)
  return (g?.conditions ?? []).filter(c => c.segmentIds.length).map(c => describeCondition(tx, def.country, c)).join(', or ')
}

/** The requirement that removes the largest share of devices, when there is more than one to compare. */
function biggestCut(est: ReachEstimate): FunnelStep | null {
  if (est.steps.length < 2) return null
  return est.steps.reduce((a, b) => (b.kept < a.kept ? b : a))
}

function advice(est: ReachEstimate, country: string, cut: FunnelStep | null, cutLabel: string, hasPlace: boolean): string {
  const lift = cut && cut.without > est.reach ? ` Removing “${cutLabel}” would lift it to about ${fmtCompact(cut.without)}.` : ''
  const widen = hasPlace ? ' Add more segments to a requirement, or widen the State and City filter.' : ' Add more segments to a requirement to widen it.'
  switch (est.status) {
    case 'too_small':
      return `Below the ${fmtInt(Math.round(est.bands.floor))}-device minimum, so most destinations will reject it.` + (lift || widen)
    case 'narrow':
      return 'Usable for a tightly targeted test, but delivery will be limited.' + (lift || widen)
    case 'broad':
      return `This is ${pct(est.share)} of all devices in ${country}. Add an “and who” requirement to focus it.`
    default:
      return 'Large enough to deliver and still specific.'
  }
}

function SizeMeter({ est }: { est: ReachEstimate }) {
  const U = est.universe
  const at = (n: number) => scalePos(n, U) * 100
  const f = at(est.bands.floor), n = at(est.bands.narrowBelow), b = at(est.bands.broadAbove)
  const track = `linear-gradient(to right, var(--color-tag-bg-red) 0 ${f}%, var(--color-tag-bg-yellow) ${f}% ${n}%, var(--color-tag-bg-green) ${n}% ${b}%, var(--color-tag-bg-blue) ${b}% 100%)`
  return (
    <div className="size-meter" aria-hidden>
      <div className="track" style={{ background: track }}>
        <i className="marker" style={{ left: `${at(est.reach)}%` }} />
      </div>
      <div className="ticks">
        <span style={{ left: `${f}%` }}>{fmtCompact(Math.round(est.bands.floor))}</span>
        <span style={{ left: `${n}%` }}>{fmtCompact(Math.round(est.bands.narrowBelow))}</span>
        <span style={{ left: `${b}%` }}>{fmtCompact(Math.round(est.bands.broadAbove))}</span>
      </div>
    </div>
  )
}

export function ReachPanel({ tx, def }: { tx: Taxonomy; def: AudienceDefinition }) {
  const est = estimateReach(tx, def)
  const hasRules = est.status !== 'empty'
  const country = placeLabel(tx, def, 2)
  const cut = biggestCut(est)
  const cutLabel = cut ? stepLabel(tx, def, cut) : ''
  const status = hasRules ? STATUS[est.status as Exclude<SizeStatus, 'empty'>] : null

  return (
    <>
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span className="muted" style={{ fontSize: 12 }}>Estimated reach</span>
          {status && <span className={`tag ${status.tone}`} data-testid="size-status">{status.label}</span>}
        </div>
        <div className="reach-big num" style={{ marginTop: 6 }}>{hasRules ? fmtCompact(est.reach) : '—'}</div>
        <div className="faint" style={{ marginTop: 6, fontSize: 12 }}>
          {hasRules ? <>{fmtInt(est.reach)} devices · {pct(est.share)} of ~{fmtCompact(est.universe)} in {country}</> : 'Add a condition to see reach'}
        </div>
        {hasRules && <SizeMeter est={est} />}
        {hasRules && <div className={`size-advice ${est.status}`}>{advice(est, country, cut, cutLabel, hasGeo(def.geo))}</div>}
      </div>

      {hasRules && (
        <div>
          <h4 style={{ marginBottom: 2 }}>What each requirement costs</h4>
          <div className="hint" style={{ marginBottom: 10 }}>Devices left after each step of the sentence.</div>
          <ol className="funnel">
            <li>
              <div className="head"><span className="label muted">Everyone in {country}</span><span className="num">{fmtCompact(est.universe)}</span></div>
              <div className="bar"><i style={{ width: '100%' }} /></div>
            </li>
            {est.steps.map((s, i) => {
              const label = stepLabel(tx, def, s)
              const isCut = cut?.key === s.key
              return (
                <li key={s.key} className={isCut ? 'cut' : ''}>
                  <div className="head">
                    <span className="label" title={label}><b>{s.kind === 'exclude' ? '−' : i + 1}</b> {label}</span>
                    <span className="num">{fmtCompact(s.remaining)}</span>
                  </div>
                  <div className="bar"><i className={s.kind} style={{ width: `${Math.max(2, scalePos(s.remaining, est.universe) * 100)}%` }} /></div>
                  <div className="meta">
                    <span>{s.kind === 'exclude' ? `removes ${pct(1 - s.kept)}` : `keeps ${pct(s.kept)}`}</span>
                    {est.steps.length > 1 && <span>without it: {fmtCompact(s.without)}</span>}
                    {isCut && <span className="tag orange">Biggest cut</span>}
                  </div>
                </li>
              )
            })}
          </ol>
        </div>
      )}

      <div className="hint" style={{ marginTop: 'auto' }}>
        Reach is modelled from segment sizes in catalogue {tx.version} and assumes segments overlap independently. Bars and the size scale are logarithmic. The exact count is computed when you save, and the segment is rebuilt once a month.
      </div>
    </>
  )
}
