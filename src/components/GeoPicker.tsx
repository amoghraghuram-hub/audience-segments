import { useMemo, useState } from 'react'
import { US_CITIES, US_STATES, describeGeo, geoShare, normalizeGeo, stateName, type GeoFilter } from '../lib/geo'
import { Icon, Modal } from './ui'

type Tab = 'state' | 'city'
const pct = (f: number) => (f * 100 >= 10 ? (f * 100).toFixed(0) : (f * 100).toFixed(1)) + '%'
const US_POP = US_STATES.reduce((a, s) => a + s.pop, 0)

/** State and City filter for the United States. Picking a city narrows its state to that city. */
export function GeoPicker({ initial, onApply, onClose }: { initial: GeoFilter; onApply: (g: GeoFilter) => void; onClose: () => void }) {
  const [geo, setGeo] = useState<GeoFilter>(() => normalizeGeo(initial))
  const [tab, setTab] = useState<Tab>('state')
  const [q, setQ] = useState('')
  const states = new Set(geo.states), cities = new Set(geo.cities)
  const narrowed = new Set(geo.cities.map(id => id.split('|')[1]))

  const toggleState = (code: string) => {
    if (states.has(code)) setGeo({ states: geo.states.filter(s => s !== code), cities: geo.cities.filter(id => id.split('|')[1] !== code) })
    else setGeo({ ...geo, states: [...geo.states, code] })
  }
  const toggleCity = (id: string) =>
    setGeo(normalizeGeo(cities.has(id) ? { ...geo, cities: geo.cities.filter(c => c !== id) } : { ...geo, cities: [...geo.cities, id] }))

  const needle = q.trim().toLowerCase()
  const stateRows = useMemo(() => US_STATES.filter(s => !needle || s.name.toLowerCase().includes(needle) || s.code.toLowerCase() === needle), [needle])
  // With states chosen, offer only their cities; with none chosen, offer every city.
  const cityRows = useMemo(() => US_CITIES
    .filter(c => !geo.states.length || states.has(c.state))
    .filter(c => !needle || c.name.toLowerCase().includes(needle) || stateName(c.state).toLowerCase().includes(needle))
    .sort((a, b) => b.pop - a.pop), [needle, geo.states.join(',')]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Modal title={<span>Where is this audience? <span className="faint" style={{ fontWeight: 400, fontSize: 13 }}>· United States</span></span>} onClose={onClose} wide
      footer={<>
        <span className="muted" style={{ marginRight: 'auto', alignSelf: 'center' }}>In {describeGeo(geo, 4)} · about {pct(geoShare(geo))} of US devices</span>
        <button className="btn ghost" onClick={() => setGeo({ states: [], cities: [] })} disabled={!geo.states.length}>Whole country</button>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" onClick={() => onApply(normalizeGeo(geo))}>Apply</button>
      </>}>
      <div className="picker">
        <div className="picker-types">
          <div className="group-label">Filter by</div>
          <button className={`type ${tab === 'state' ? 'on' : ''}`} onClick={() => { setTab('state'); setQ('') }}>
            <span>State</span>{geo.states.length ? <span className="count">{geo.states.length}</span> : <small>{US_STATES.length}</small>}
          </button>
          <button className={`type ${tab === 'city' ? 'on' : ''}`} onClick={() => { setTab('city'); setQ('') }}>
            <span>City</span>{geo.cities.length ? <span className="count">{geo.cities.length}</span> : <small>{cityRows.length}</small>}
          </button>
          <div className="hint" style={{ padding: '14px 10px' }}>
            Leave both empty for the whole country. Choosing a city narrows its state to that city.
          </div>
        </div>
        <div className="picker-main">
          <div className="picker-search">
            <Icon.Search />
            <input autoFocus className="input" placeholder={tab === 'state' ? 'Search states…' : 'Search cities…'} value={q} onChange={e => setQ(e.target.value)} style={{ border: 0, boxShadow: 'none', padding: '4px 6px' }} />
          </div>
          <div className="hint" style={{ padding: '8px 16px 0' }}>
            {tab === 'state' ? 'People whose devices are seen mostly in the state.' : geo.states.length ? `Largest cities in ${describeGeo({ states: geo.states, cities: [] }, 3)}.` : 'Largest US cities. Pick states first to shorten this list.'}
          </div>
          <div className="picker-list" style={{ marginTop: 6 }}>
            {tab === 'state' && stateRows.map(s => (
              <div key={s.code} className={`picker-row ${states.has(s.code) ? 'on' : ''}`} onClick={() => toggleState(s.code)}>
                <span className={`checkbox ${states.has(s.code) ? 'on' : ''}`}>{states.has(s.code) && <Icon.Check />}</span>
                <div style={{ minWidth: 0 }}>
                  <div className="name">{s.name}</div>
                  <div className="desc">{s.code}{narrowed.has(s.code) ? ` · narrowed to ${geo.cities.filter(id => id.endsWith('|' + s.code)).map(id => id.split('|')[0]).join(', ')}` : ''}</div>
                </div>
                <div className="reach num">{pct(s.pop / US_POP)}</div>
              </div>
            ))}
            {tab === 'city' && cityRows.map(c => (
              <div key={c.id} className={`picker-row ${cities.has(c.id) ? 'on' : ''}`} onClick={() => toggleCity(c.id)}>
                <span className={`checkbox ${cities.has(c.id) ? 'on' : ''}`}>{cities.has(c.id) && <Icon.Check />}</span>
                <div style={{ minWidth: 0 }}>
                  <div className="name">{c.name}</div>
                  <div className="desc">{stateName(c.state)}</div>
                </div>
                <div className="reach num">{pct(c.pop / US_POP)}</div>
              </div>
            ))}
            {((tab === 'state' && !stateRows.length) || (tab === 'city' && !cityRows.length)) && <div className="empty">Nothing matches “{q}”.</div>}
          </div>
          <div className="picker-foot">
            <span className="muted">{tab === 'state' ? `${stateRows.length} states` : `${cityRows.length} cities`}</span>
            <span className="faint">Share = estimated share of US devices</span>
          </div>
        </div>
      </div>
    </Modal>
  )
}
