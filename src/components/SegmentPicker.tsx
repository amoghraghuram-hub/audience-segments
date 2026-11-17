import { useEffect, useMemo, useRef, useState } from 'react'
import { GROUP_META, segmentsFor, typesAvailable, type SegmentType, type Taxonomy, type TypeGroup } from '../lib/taxonomy'
import { fmtCompact } from '../lib/format'
import { isBlocked, sensitivityOf } from '../lib/sensitive'
import { Modal, Icon } from './ui'

export type Selections = Partial<Record<SegmentType, string[]>>

const MAX_ROWS = 300

export function SegmentPicker({ tx, country, initialType, initial, onApply, onClose }: {
  tx: Taxonomy; country: string; initialType?: SegmentType; initial: Selections
  onApply: (sel: Selections) => void; onClose: () => void
}) {
  const types = typesAvailable(tx, country)
  const [type, setType] = useState<SegmentType>(initialType ?? types[0])
  const [sel, setSel] = useState<Selections>(initial)
  const [q, setQ] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)
  useEffect(() => { setQ(''); searchRef.current?.focus() }, [type])

  const rows = segmentsFor(tx, country, type)
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return rows
    return rows.filter(r => r[1].toLowerCase().includes(needle) || r[3].toLowerCase().includes(needle))
  }, [rows, q])
  const visible = filtered.slice(0, MAX_ROWS)
  const chosen = new Set(sel[type] ?? [])
  const total = Object.values(sel).reduce((a, v) => a + (v?.length ?? 0), 0)

  const toggle = (id: string) => {
    const next = new Set(chosen)
    next.has(id) ? next.delete(id) : next.add(id)
    setSel({ ...sel, [type]: [...next] })
  }
  // restricted segments are never swept up by "select all"
  const selectVisible = () => setSel({ ...sel, [type]: [...new Set([...chosen, ...visible.filter(r => !isBlocked(r[1])).map(r => r[0])])] })
  const clearType = () => setSel({ ...sel, [type]: [] })

  const groups: TypeGroup[] = ['offline', 'demographic']
  return (
    <Modal title={<span>Select segments <span className="faint" style={{ fontWeight: 400, fontSize: 13 }}>· {tx.countries.find(c => c.code === country)?.name}</span></span>} onClose={onClose} wide
      footer={<>
        <span className="muted" style={{ marginRight: 'auto', alignSelf: 'center' }}>{total} selected across {Object.values(sel).filter(v => v?.length).length} dimension{Object.values(sel).filter(v => v?.length).length === 1 ? '' : 's'}</span>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={!total} onClick={() => onApply(sel)}>Apply</button>
      </>}>
      <div className="picker">
        <div className="picker-types">
          {groups.map(g => {
            const ts = types.filter(t => tx.types[t].group === g)
            if (!ts.length) return null
            return (
              <div key={g}>
                <div className="group-label">{GROUP_META[g].label}</div>
                {ts.map(t => (
                  <button key={t} className={`type ${t === type ? 'on' : ''}`} onClick={() => setType(t)} title={tx.types[t].hint}>
                    <span>{tx.types[t].label}</span>
                    {sel[t]?.length ? <span className="count">{sel[t]!.length}</span> : <small>{segmentsFor(tx, country, t).length}</small>}
                  </button>
                ))}
              </div>
            )
          })}
        </div>
        <div className="picker-main">
          <div className="picker-search">
            <Icon.Search />
            <input ref={searchRef} className="input" placeholder={`Search ${tx.types[type].label.toLowerCase()}…`} value={q} onChange={e => setQ(e.target.value)} style={{ border: 0, boxShadow: 'none', padding: '4px 6px' }} />
            <button className="btn sm ghost" onClick={selectVisible} disabled={!visible.length}>Select {visible.length < filtered.length ? `first ${MAX_ROWS}` : 'all'}</button>
            <button className="btn sm ghost" onClick={clearType} disabled={!chosen.size}>Clear</button>
          </div>
          <div className="hint" style={{ padding: '8px 16px 0' }}>{tx.types[type].hint}.</div>
          <div className="picker-list" style={{ marginTop: 6 }}>
            {visible.map(r => {
              const flag = sensitivityOf(r[1])
              const blocked = flag?.level === 'blocked'
              return (
                <div key={r[0]} className={`picker-row ${chosen.has(r[0]) ? 'on' : ''} ${blocked ? 'blocked' : ''}`} aria-disabled={blocked}
                  title={flag ? flag.why : undefined} onClick={() => { if (!blocked || chosen.has(r[0])) toggle(r[0]) }}>
                  <span className={`checkbox ${chosen.has(r[0]) ? 'on' : ''}`}>{chosen.has(r[0]) && <Icon.Check />}</span>
                  <div style={{ minWidth: 0 }}>
                    <div className="name">{r[1]} {flag && <span className={`tag ${blocked ? 'red' : 'yellow'}`}>{blocked ? `Restricted · ${flag.label}` : `Use with care · ${flag.label}`}</span>}</div>
                    <div className="desc">{flag ? flag.why : r[3]}</div>
                  </div>
                  <div className="reach num">{fmtCompact(r[2])}</div>
                </div>
              )
            })}
            {!visible.length && <div className="empty">No {tx.types[type].label.toLowerCase()} match “{q}”.</div>}
          </div>
          <div className="picker-foot">
            <span className="muted">
              {filtered.length < rows.length ? `${filtered.length} of ${rows.length}` : rows.length} segments
              {filtered.length > MAX_ROWS && <> · showing first {MAX_ROWS}, refine your search</>}
            </span>
            <span className="faint">Reach = devices seen in the last {tx.lookbackDays} days</span>
          </div>
        </div>
      </div>
    </Modal>
  )
}
