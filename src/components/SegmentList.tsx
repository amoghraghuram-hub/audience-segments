import { useEffect, useMemo, useState } from 'react'
import type { SavedSegment } from '../lib/model'
import type { Taxonomy } from '../lib/taxonomy'
import { DESTINATIONS } from '../lib/destinations'
import { fmtCompact, timeAgo } from '../lib/format'
import { describeDefinition, placeLabel } from '../lib/summary'
import { Tag, Icon } from './ui'
import { DestLogo } from './DestLogo'

const STATUS_TONE: Record<SavedSegment['status'], string> = { draft: '', ready: 'teal', syncing: 'yellow', active: 'green' }

type Filter = 'all' | 'live' | 'draft'
const FILTERS: { id: Filter; label: string; match: (s: SavedSegment) => boolean }[] = [
  { id: 'all', label: 'All', match: () => true },
  { id: 'live', label: 'Active', match: s => s.status === 'active' || s.status === 'syncing' },
  { id: 'draft', label: 'Drafts', match: s => s.status === 'draft' || s.status === 'ready' },
]

const cap = (s: string) => s === 'the United States' ? 'United States' : s

export function SegmentList({ tx, segments, onNew, onOpen, onDelete, onDuplicate, onResults }: {
  tx: Taxonomy; segments: SavedSegment[]; onNew: () => void; onOpen: (s: SavedSegment) => void
  onDelete: (s: SavedSegment) => void; onDuplicate: (s: SavedSegment) => void; onResults: (s: SavedSegment) => void
}) {
  const [filter, setFilter] = useState<Filter>('all')
  const [q, setQ] = useState('')
  const [menu, setMenu] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<string | null>(null)

  // the row menu closes on a click anywhere else or on Escape
  useEffect(() => {
    if (!menu) return
    const close = () => { setMenu(null); setConfirming(null) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    window.addEventListener('click', close); window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('click', close); window.removeEventListener('keydown', onKey) }
  }, [menu])

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const match = FILTERS.find(f => f.id === filter)!.match
    return segments.filter(s => match(s) && (!needle || s.definition.name.toLowerCase().includes(needle) || (s.segmentCode ?? '').toLowerCase().includes(needle) || describeDefinition(tx, s.definition).toLowerCase().includes(needle)))
  }, [segments, filter, q, tx])

  const live = segments.filter(s => s.status === 'active' || s.status === 'syncing').length

  return (
    <div className="page list-page">
      <div className="page-head">
        <div>
          <h1>Segments</h1>
          <p>{segments.length} {segments.length === 1 ? 'segment' : 'segments'}{live > 0 && ` · ${live} active on channels`}</p>
        </div>
        <button className="btn primary" onClick={onNew}><Icon.Plus /> New Segment</button>
      </div>

      <div className="list-tools">
        <div className="tabs" role="tablist">
          {FILTERS.map(f => {
            const n = segments.filter(f.match).length
            if (f.id !== 'all' && n === 0 && filter !== f.id) return null
            return <button key={f.id} role="tab" aria-selected={filter === f.id} className={`tab ${filter === f.id ? 'on' : ''}`} onClick={() => setFilter(f.id)}>{f.label}</button>
          })}
        </div>
        <label className="search">
          <Icon.Search />
          <input className="input" placeholder="Search" value={q} onChange={e => setQ(e.target.value)} aria-label="Search segments" />
        </label>
      </div>

      <div className="table-wrap">
        {shown.length === 0 ? (
          <div className="empty">
            <h3>{segments.length === 0 ? 'No segments yet' : 'No segments match'}</h3>
            <p style={{ marginTop: 6 }}>{segments.length === 0 ? 'Create your first segment to get started.' : 'Try a different tab or search.'}</p>
          </div>
        ) : (
          <table className="list">
            <thead>
              <tr><th>Name</th><th>Geography</th><th>Reach</th><th>Status</th><th>Channels</th><th>Updated</th><th aria-label="Actions" /></tr>
            </thead>
            <tbody>
              {shown.map(s => (
                <tr key={s.id} className="row" onClick={() => onOpen(s)}>
                  <td>
                    <div className="seg-name">{s.definition.name}</div>
                    <div className="seg-desc">{describeDefinition(tx, s.definition)}</div>
                    {s.segmentCode && <div className="seg-code mono" title="Segment ID to search for in your channels">ID {s.segmentCode}</div>}
                  </td>
                  <td>{cap(placeLabel(tx, s.definition, 2))}</td>
                  <td className="num">~{fmtCompact(s.estimatedReach).toLowerCase()}</td>
                  <td>
                    <Tag tone={STATUS_TONE[s.status]}><span className={`status-dot ${s.status}`} />{s.status[0].toUpperCase() + s.status.slice(1)}</Tag>
                  </td>
                  <td>
                    <div className="dest-marks">
                      {s.activations.length === 0 && <span className="faint">—</span>}
                      {s.activations.map(a => {
                        const d = DESTINATIONS.find(x => x.id === a.destinationId)!
                        return <DestLogo key={a.destinationId} d={d} size={24} waiting={a.status === 'queued'} title={`${d.name} · ${a.status}`} />
                      })}
                    </div>
                  </td>
                  <td className="muted">{timeAgo(s.updatedAt)}</td>
                  <td className="row-actions" onClick={e => e.stopPropagation()}>
                    <button className="more" aria-label={`Actions for ${s.definition.name}`} aria-haspopup="menu" aria-expanded={menu === s.id}
                      onClick={() => { setConfirming(null); setMenu(menu === s.id ? null : s.id) }}><Icon.More /></button>
                    {menu === s.id && (
                      <div className="menu" role="menu">
                        {confirming === s.id ? (
                          <>
                            <div className="menu-note">{s.activations.length ? 'Delete and stop syncing?' : 'Delete this segment?'}</div>
                            <button role="menuitem" className="danger" onClick={() => { setMenu(null); setConfirming(null); onDelete(s) }}><Icon.Trash /> Delete</button>
                            <button role="menuitem" onClick={() => setConfirming(null)}>Keep</button>
                          </>
                        ) : (
                          <>
                            {s.activations.length > 0 && <button role="menuitem" onClick={() => { setMenu(null); onResults(s) }}><Icon.Chart /> Results</button>}
                            <button role="menuitem" onClick={() => { setMenu(null); onOpen(s) }}><Icon.Edit /> Edit</button>
                            <button role="menuitem" onClick={() => { setMenu(null); onDuplicate(s) }}><Icon.Copy /> Duplicate</button>
                            <button role="menuitem" className="danger" onClick={() => setConfirming(s.id)}><Icon.Trash /> Delete</button>
                          </>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
