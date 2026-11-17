import { useState } from 'react'
import type { Activation, SavedSegment, SyncEvent } from '../lib/model'
import { DELIVERY_LABEL, deliveryOf, nextSyncAt, syncHistory } from '../lib/model'
import type { Taxonomy } from '../lib/taxonomy'
import { DESTINATIONS, type Destination } from '../lib/destinations'
import { fmtCompact, fmtDateTime, fmtInt, timeAgo } from '../lib/format'
import { describeDefinition } from '../lib/summary'
import { Icon, Tag } from './ui'
import { DestLogo } from './DestLogo'

const STATUS_TONE: Record<SavedSegment['status'], string> = { draft: '', ready: 'teal', syncing: 'yellow', active: 'green' }
const pct = (f: number) => (f * 100).toFixed(f >= 0.1 ? 0 : 1) + '%'
const cap = (s: string) => s[0].toUpperCase() + s.slice(1)

interface Row { a: Activation; d: Destination; history: SyncEvent[]; last?: SyncEvent; prev?: SyncEvent; rate: number | null; next: Date | null; issue: string | null }

/** Delivery results for an activated segment: what was sent where, how well it matched, and every sync so far. */
export function Results({ tx, segment, onBack, onEdit, onManage }: {
  tx: Taxonomy; segment: SavedSegment; onBack: () => void; onEdit: () => void; onManage: () => void
}) {
  const [copied, setCopied] = useState(false)
  const s = segment
  const live = s.status === 'active'
  const rows: Row[] = s.activations.map(a => {
    const d = DESTINATIONS.find(x => x.id === a.destinationId)!
    const history = syncHistory(a, s.estimatedReach)
    const last = history[history.length - 1], prev = history[history.length - 2]
    const rate = last && last.sent > 0 ? last.matched / last.sent : null
    const issue = !last ? null
      : last.matched < d.minReach ? `Devices reachable on ${d.name} are below its minimum of ${fmtInt(d.minReach)}, so it may not deliver.`
      : rate !== null && rate < 0.5 ? 'Fewer than half the devices are reachable on this channel. Check the account ID and that the channel accepts mobile ad IDs.'
      : null
    return { a, d, history, last, prev, rate, next: live ? nextSyncAt(a) : null, issue }
  })
  const synced = rows.filter(r => r.last)
  // file exports are not matched against anyone's users, so they are left out of the average
  const matchable = synced.filter(r => r.d.kind !== 'file')
  const avgRate = matchable.length ? matchable.reduce((a, r) => a + (r.rate ?? 0), 0) / matchable.length : null
  const lastSync = synced.map(r => r.last!.at).sort().pop()
  const nextSync = rows.map(r => r.next).filter((d): d is Date => !!d).sort((a, b) => a.getTime() - b.getTime())[0]
  const best = matchable.reduce<Row | null>((b, r) => (!b || r.last!.matched > b.last!.matched ? r : b), null)
  const issues = rows.filter(r => r.issue)

  // every sync across destinations, newest first, for the log
  const log = rows.flatMap(r => r.history.map((e, i) => ({ ...e, d: r.d, first: i === 0, change: i > 0 ? e.matched - r.history[i - 1].matched : null })))
    .sort((a, b) => b.at.localeCompare(a.at))
  const peak = Math.max(1, ...rows.flatMap(r => r.history.map(e => e.sent)))

  const copy = () => { if (s.segmentCode) navigator.clipboard?.writeText(s.segmentCode).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) }).catch(() => {}) }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="page results" style={{ flex: 1, overflow: 'auto', width: '100%' }}>
        <div className="page-head">
          <div style={{ minWidth: 0 }}>
            <h1>{s.definition.name} <Tag tone={STATUS_TONE[s.status]}><span className={`status-dot ${s.status}`} />{cap(s.status)}</Tag></h1>
            <p>{describeDefinition(tx, s.definition)}</p>
            <div className="results-meta">
              <span>Rebuilt monthly, over a 90-day lookback</span>
              {s.segmentCode && <span>Segment ID <span className="mono">{s.segmentCode}</span> <button className="btn sm ghost" onClick={copy}>{copied ? 'Copied' : 'Copy'}</button></span>}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <button className="btn" onClick={onEdit}>Edit definition</button>
            <button className="btn" onClick={onManage}>Manage activation</button>
          </div>
        </div>

        {s.status === 'syncing' && <div className="callout" style={{ marginBottom: 16 }}>The first sync is running. Results appear here as each destination finishes.</div>}
        {issues.map(r => <div key={r.d.id} className="callout warn" style={{ marginBottom: 12 }}><b>{r.d.name}.</b> {r.issue}</div>)}

        <div className="stats">
          <div className="card stat"><div className="label">Devices sent</div><div className="value num">{fmtCompact(s.estimatedReach)}</div><div className="sub">estimated audience size</div></div>
          <div className="card stat"><div className="label">Most reachable</div><div className="value num">{best ? fmtCompact(best.last!.matched) : '—'}</div><div className="sub">{best ? `on ${best.d.name}` : synced.length ? 'file exports hand over every device' : 'no sync yet'}</div></div>
          <div className="card stat"><div className="label">Average share reachable</div><div className="value num">{avgRate !== null ? pct(avgRate) : '—'}</div><div className="sub">{matchable.length ? `across ${matchable.length} destination${matchable.length === 1 ? '' : 's'}` : synced.length ? 'file exports hand over every device' : 'no sync yet'}</div></div>
          <div className="card stat"><div className="label">Last sync</div><div className="value">{lastSync ? timeAgo(lastSync) : '—'}</div><div className="sub">{nextSync ? `next ${fmtDateTime(nextSync.toISOString())}` : live ? 'sent once, no refresh due' : 'not syncing'}</div></div>
        </div>

        <h3 style={{ margin: '4px 0 8px' }}>By destination</h3>
        <div className="card table-wrap" style={{ marginBottom: 20 }}>
          <table className="list results-table">
            <thead><tr><th>Destination</th><th>Status</th><th>Reachable on channel</th><th>Share reachable</th><th>Trend</th><th>Delivery</th><th>Last sync</th><th>Next sync</th></tr></thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.d.id}>
                  <td><div className="who"><DestLogo d={r.d} size={28} /><div><div className="seg-name">{r.d.name}</div><div className="seg-code">{r.d.accountLabel} {r.a.accountId}</div></div></div></td>
                  <td><Tag tone={r.a.status === 'active' ? 'green' : r.a.status === 'failed' ? 'red' : 'yellow'}>{cap(r.a.status)}</Tag></td>
                  <td className="num">{r.last ? fmtInt(r.last.matched) : '—'}{r.d.kind === 'file' && r.last && <div className="delta">exported in full</div>}{r.d.kind !== 'file' && r.last && r.prev && <div className={`delta ${r.last.matched >= r.prev.matched ? 'up' : 'down'}`}>{r.last.matched >= r.prev.matched ? '+' : '−'}{fmtInt(Math.abs(r.last.matched - r.prev.matched))} since last sync</div>}</td>
                  <td>{r.d.kind === 'file' ? <span className="faint">Not applicable</span> : r.rate !== null ? <div className="rate"><span className="num">{pct(r.rate)}</span><div className="bar"><i className={r.rate < 0.5 ? 'low' : ''} style={{ width: `${Math.min(100, r.rate * 100)}%` }} /></div></div> : '—'}</td>
                  <td><Spark history={r.history} peak={peak} /></td>
                  <td className="muted">{DELIVERY_LABEL[deliveryOf(r.a)]}</td>
                  <td className="muted">{r.last ? fmtDateTime(r.last.at) : '—'}</td>
                  <td className="muted">{r.next ? fmtDateTime(r.next.toISOString()) : deliveryOf(r.a) === 'once' && r.last ? 'None, sent once' : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h3 style={{ margin: '4px 0 8px' }}>Sync history</h3>
        <div className="card table-wrap">
          {log.length === 0 ? <div className="empty" style={{ padding: 28 }}>No sync has completed yet.</div> : (
            <table className="list results-table">
              <thead><tr><th>When</th><th>Destination</th><th>Event</th><th>Devices sent</th><th>Reachable on channel</th><th>Share reachable</th><th>Change in reachable</th></tr></thead>
              <tbody>
                {log.slice(0, 40).map((e, i) => (
                  <tr key={i}>
                    <td className="muted">{fmtDateTime(e.at)}</td>
                    <td>{e.d.name}</td>
                    <td>{e.first ? 'First sync' : 'Refresh'}</td>
                    <td className="num">{fmtInt(e.sent)}</td>
                    <td className="num">{fmtInt(e.matched)}</td>
                    <td className="num">{e.d.kind === 'file' ? '—' : e.sent > 0 ? pct(e.matched / e.sent) : '—'}</td>
                    <td className="num">{e.change === null ? '—' : <span className={`delta ${e.change >= 0 ? 'up' : 'down'}`}>{e.change >= 0 ? '+' : '−'}{fmtInt(Math.abs(e.change))}</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        {log.length > 40 && <div className="hint" style={{ marginTop: 8 }}>Showing the latest 40 of {log.length} syncs.</div>}

        <div className="hint" style={{ marginTop: 16 }}>
          “Reachable on channel” is how many of the devices we sent the channel recognised as its own users, and so can show an ad to. It is not the number of people who saw an ad. Share reachable is that number divided by devices sent. Channels do not share users, so the counts are per channel and should not be added together. Prototype note: sync results are simulated here and will come from the activation service.
        </div>
      </div>

      <div className="footer-bar">
        <button className="btn ghost" onClick={onBack}><Icon.Back /> Back to segments</button>
      </div>
    </div>
  )
}

/** Matched devices at each sync as bars, on a scale shared by all destinations so their sizes compare. */
function Spark({ history, peak }: { history: SyncEvent[]; peak: number }) {
  if (!history.length) return <span className="faint">—</span>
  const shown = history.slice(-14)
  return (
    <div className="spark" title={shown.map(e => `${fmtDateTime(e.at)}: ${fmtInt(e.matched)} reachable`).join('\n')}>
      {shown.map((e, i) => <i key={i} style={{ height: `${Math.max(8, (e.matched / peak) * 100)}%` }} />)}
    </div>
  )
}
