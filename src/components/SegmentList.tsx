import { useState } from 'react'
import type { SavedSegment } from '../lib/model'
import type { Taxonomy } from '../lib/taxonomy'
import { DESTINATIONS } from '../lib/destinations'
import { fmtCompact, fmtDate, timeAgo } from '../lib/format'
import { describeDefinition, placeLabel } from '../lib/summary'
import { Tag, Icon } from './ui'

const STATUS_TONE: Record<SavedSegment['status'], string> = { draft: '', ready: 'teal', scheduled: 'blue', syncing: 'yellow', active: 'green', expired: 'gray' }

const cap = (s: string) => s === 'the United States' ? 'United States' : s

export function SegmentList({ tx, segments, onNew, onOpen, onDelete, onDuplicate, onResults }: { tx: Taxonomy; segments: SavedSegment[]; onNew: () => void; onOpen: (s: SavedSegment) => void; onDelete: (s: SavedSegment) => void; onDuplicate: (s: SavedSegment) => void; onResults: (s: SavedSegment) => void }) {
  const [confirming, setConfirming] = useState<string | null>(null)
  const active = segments.filter(s => s.status === 'active').length
  const scheduled = segments.filter(s => s.status === 'scheduled').length
  const reach = segments.reduce((a, s) => a + s.estimatedReach, 0)
  const dests = new Set(segments.flatMap(s => s.activations.map(a => a.destinationId))).size
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Segments</h1>
          <p>Build real-world audiences from places, movement and demographics, then push them to your ad platforms.</p>
        </div>
        <button className="btn primary" onClick={onNew}><Icon.Plus /> New segment</button>
      </div>
      <div className="stats">
        <div className="card stat"><div className="label">Segments</div><div className="value num">{segments.length}</div></div>
        <div className="card stat"><div className="label">Active on channels</div><div className="value num">{active}{scheduled > 0 && <small className="faint" style={{ fontSize: 12, fontWeight: 400, marginLeft: 8 }}>+{scheduled} scheduled</small>}</div></div>
        <div className="card stat"><div className="label">Est. devices across segments</div><div className="value num">{fmtCompact(reach)}</div></div>
        <div className="card stat"><div className="label">Connected destinations</div><div className="value num">{dests}</div></div>
      </div>
      <div className="card table-wrap">
        {segments.length === 0 ? (
          <div className="empty">
            <h3>No segments yet</h3>
            <p style={{ marginTop: 6 }}>Create your first offline-behaviour segment to get started.</p>
          </div>
        ) : (
          <table className="list">
            <thead>
              <tr><th>Segment</th><th>Source</th><th>Geography</th><th>Est. reach</th><th>Status</th><th>Destinations</th><th>Updated</th><th aria-label="Actions" /></tr>
            </thead>
            <tbody>
              {segments.map(s => {
                return (
                  <tr key={s.id} className="row" onClick={() => onOpen(s)}>
                    <td>
                      <div className="seg-name">{s.definition.name}</div>
                      <div className="seg-desc">{describeDefinition(tx, s.definition)}</div>
                      {s.segmentCode && <div className="seg-code mono" title="Segment ID to search for in your destinations">ID {s.segmentCode}</div>}
                    </td>
                    <td><Tag tone="teal">Offline behaviour</Tag></td>
                    <td>{cap(placeLabel(tx, s.definition, 2))}</td>
                    <td className="num">{fmtCompact(s.estimatedReach)}</td>
                    <td>
                      <Tag tone={STATUS_TONE[s.status]}><span className={`status-dot ${s.status}`} />{s.status[0].toUpperCase() + s.status.slice(1)}</Tag>
                      {s.status === 'scheduled' && s.campaign?.start
                        ? <div className="seg-code">Starts {fmtDate(s.campaign.start)}</div>
                        : s.campaign?.end && <div className="seg-code">{s.status === 'expired' ? 'Ended' : 'Ends'} {fmtDate(s.campaign.end)}</div>}
                    </td>
                    <td>
                      <div className="dest-marks">
                        {s.activations.length === 0 && <span className="faint">—</span>}
                        {s.activations.map(a => {
                          const d = DESTINATIONS.find(x => x.id === a.destinationId)!
                          return <span key={a.destinationId} className={`mark ${a.status === 'queued' ? 'waiting' : ''}`} title={`${d.name} · ${a.status === 'queued' && s.status === 'scheduled' ? 'scheduled' : a.status}`} style={{ background: d.color }}>{d.mark}</span>
                        })}
                      </div>
                    </td>
                    <td className="muted">{timeAgo(s.updatedAt)}</td>
                    <td className="row-actions" onClick={e => e.stopPropagation()}>
                      {confirming === s.id ? (
                        <span className="confirm">
                          <span className="hint">{s.activations.length ? 'Delete and stop syncing?' : 'Delete?'}</span>
                          <button className="btn sm danger" onClick={() => { setConfirming(null); onDelete(s) }}>Delete</button>
                          <button className="btn sm ghost" onClick={() => setConfirming(null)}>Keep</button>
                        </span>
                      ) : (
                        <>
                          {s.activations.length > 0 && <button className="btn sm ghost" onClick={() => onResults(s)} aria-label={`Results for ${s.definition.name}`} title="Delivery results"><Icon.Chart /></button>}
                          <button className="btn sm ghost" onClick={() => onDuplicate(s)} aria-label={`Duplicate ${s.definition.name}`} title="Duplicate segment"><Icon.Copy /></button>
                          <button className="btn sm ghost" onClick={() => setConfirming(s.id)} aria-label={`Delete ${s.definition.name}`} title="Delete segment"><Icon.Trash /></button>
                        </>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
