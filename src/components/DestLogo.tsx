import { useState } from 'react'
import type { Destination } from '../lib/destinations'

/**
 * A channel's logo on a small white tile. Logos come from Google's favicon service by the channel's domain.
 * If one fails to load, or the channel has no domain (the file export), the lettered colour tile shows instead.
 */
export function DestLogo({ d, size = 24, waiting, title }: { d: Destination; size?: number; waiting?: boolean; title?: string }) {
  const [failed, setFailed] = useState(false)
  const box = { width: size, height: size }
  if (!d.domain || failed) {
    return <span className={`mark ${waiting ? 'waiting' : ''}`} title={title ?? d.name} style={{ ...box, background: d.color, fontSize: Math.max(8, Math.round(size * 0.36)) }}>{d.mark}</span>
  }
  return (
    <span className={`logo ${waiting ? 'waiting' : ''}`} title={title ?? d.name} style={box}>
      <img src={`https://www.google.com/s2/favicons?domain=${d.domain}&sz=64`} alt="" width={size} height={size} loading="lazy" onError={() => setFailed(true)} />
    </span>
  )
}
