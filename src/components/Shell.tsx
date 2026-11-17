import { useEffect, useState, type ReactNode } from 'react'

const LOGO = 'https://cdn.factori.ai/factori_icon.svg'
const PIN_KEY = 'factori.audienceStudio.navPinned'
const THEME_KEY = 'factori.audienceStudio.theme'
type Theme = 'dark' | 'light'

const read = (key: string) => { try { return localStorage.getItem(key) } catch { return null } }
const write = (key: string, value: string) => { try { localStorage.setItem(key, value) } catch { /* ignore */ } }

/**
 * The console frame. The sidebar is a 56px icon rail that opens to 240px over the page on hover or keyboard focus,
 * and stays open, pushing the page across, when pinned. It also holds the Light / Dark switch.
 */
export function Shell({ crumbs, actions, children, onSegments }: { crumbs: ReactNode[]; actions?: ReactNode; children: ReactNode; onSegments?: () => void }) {
  const [pinned, setPinned] = useState(() => read(PIN_KEY) === '1')
  const [theme, setTheme] = useState<Theme>(() => {
    const t: Theme = read(THEME_KEY) === 'light' ? 'light' : 'dark'
    document.documentElement.dataset.theme = t // set before first paint, so the page never flashes the other theme
    return t
  })
  useEffect(() => { write(PIN_KEY, pinned ? '1' : '0') }, [pinned])
  useEffect(() => { document.documentElement.dataset.theme = theme; write(THEME_KEY, theme) }, [theme])

  return (
    <div className={`shell ${pinned ? 'pinned' : ''}`}>
      <div className="rail-slot">
        <aside className="rail" aria-label="Main navigation">
          <div className="rail-head">
            <img className="rail-logo-icon" src={LOGO} alt="" width={32} height={32} onError={e => { e.currentTarget.style.display = 'none' }} />
            <div className="rail-brand"><b>factori</b><span>Audience Studio</span></div>
            <button className="rail-pin" onClick={() => setPinned(p => !p)} aria-pressed={pinned} title={pinned ? 'Unpin sidebar' : 'Pin sidebar'} aria-label={pinned ? 'Unpin sidebar' : 'Pin sidebar'}><PinIcon /></button>
          </div>
          <nav className="rail-nav">
            <button className="rail-item active" onClick={onSegments} title="Segments"><SegmentsIcon /><span className="label">Segments</span></button>
          </nav>
          <div className="rail-foot">
            <div className="rail-theme" role="group" aria-label="Theme">
              <button className={theme === 'light' ? 'on' : ''} onClick={() => setTheme('light')} aria-pressed={theme === 'light'}><SunIcon /> Light</button>
              <button className={theme === 'dark' ? 'on' : ''} onClick={() => setTheme('dark')} aria-pressed={theme === 'dark'}><MoonIcon /> Dark</button>
            </div>
            <span className="rail-item" title="View Documentation"><DocIcon /><span className="label">View Documentation</span></span>
            <span className="rail-item" title="Sign Out"><SignOutIcon /><span className="label">Sign Out</span></span>
          </div>
        </aside>
      </div>
      <div className="main">
        <header className="topbar">
          <div className="crumbs">
            <SegmentsIcon />
            {crumbs.map((c, i) => (
              <span key={i} className={i === crumbs.length - 1 ? 'current' : ''}>
                {i > 0 && <span className="sep">/</span>}{c}
              </span>
            ))}
          </div>
          <div className="topbar-actions">{actions}</div>
        </header>
        <div className="content">{children}</div>
      </div>
    </div>
  )
}

const stroke = { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
const SegmentsIcon = () => <svg {...stroke}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></svg>
const DocIcon = () => <svg {...stroke}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6M8 13h8M8 17h6" /></svg>
const SignOutIcon = () => <svg {...stroke}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" /></svg>
const PinIcon = () => <svg {...stroke}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16" /></svg>
const SunIcon = () => <svg {...stroke} width={14} height={14}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
const MoonIcon = () => <svg {...stroke} width={14} height={14}><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></svg>
