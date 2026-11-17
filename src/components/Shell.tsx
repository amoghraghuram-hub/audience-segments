import type { ReactNode } from 'react'

export function Shell({ crumbs, actions, children, onSegments }: { crumbs: ReactNode[]; actions?: ReactNode; children: ReactNode; onSegments?: () => void }) {
  return (
    <div className="shell">
      <aside className="sidenav">
        <div className="brand">factor<i>i</i></div>
        <div className="nav-section">Audience Studio</div>
        <button className="nav-item active" onClick={onSegments}><span className="dot" />Segments</button>
        <div className="spacer" />
        <div className="credits">Credits<b className="num">12,480</b>Renews Nov 2</div>
      </aside>
      <div className="main">
        <header className="topbar">
          <div className="crumbs">
            {crumbs.map((c, i) => (
              <span key={i} className={i === crumbs.length - 1 ? 'current' : ''}>
                {i > 0 && <span className="sep">/&nbsp;&nbsp;</span>}{c}
              </span>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>{actions}</div>
        </header>
        <div className="content">{children}</div>
      </div>
    </div>
  )
}
