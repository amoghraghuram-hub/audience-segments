import type { SegmentType } from './taxonomy'
import type { GeoFilter } from './geo'
import type { BriefSession } from './plan'

/** One row in the rule builder: "<type> is any of <segmentIds>". */
export interface Condition {
  id: string
  type: SegmentType
  segmentIds: string[]
  /** "has not": matches devices in none of the segments. Only used on include rules. */
  negate?: boolean
}

/** Conditions inside a group are OR'd. Groups inside `include` are AND'd. */
export interface Group {
  id: string
  conditions: Condition[]
}

export interface AudienceDefinition {
  name: string
  country: string
  /** State and City filter inside the country. Absent or empty means the whole country. */
  geo?: GeoFilter
  include: Group[]
  exclude: Condition[]
}


export interface Activation {
  destinationId: string
  accountId: string
  /** monthly refresh unless set; older saved activations have none and count as monthly */
  delivery?: Delivery
  status: 'queued' | 'syncing' | 'active' | 'failed'
  lastSyncAt?: string
  matchedReach?: number
  /** every completed sync to this destination, oldest first */
  history?: SyncEvent[]
}

/** One completed sync: what we sent and what the destination matched. */
export interface SyncEvent {
  at: string
  /** devices in the audience when it was sent */
  sent: number
  /** devices the destination recognised */
  matched: number
}

/**
 * How a channel is kept up to date. Segments are rebuilt once a month over a rolling 90-day lookback, and that
 * schedule is fixed. The only choice is whether a channel keeps receiving each rebuild or gets the audience once.
 */
export type Delivery = 'monthly' | 'once'
export const DELIVERY_LABEL: Record<Delivery, string> = { monthly: 'Monthly refresh', once: 'One-time push' }
export const deliveryOf = (a: Activation): Delivery => a.delivery ?? 'monthly'

/** When this channel is next due its monthly refresh, or null if it is not live or was a one-time push. */
export function nextSyncAt(a: Activation): Date | null {
  if (!a.lastSyncAt || a.status !== 'active' || deliveryOf(a) === 'once') return null
  const next = new Date(a.lastSyncAt)
  next.setMonth(next.getMonth() + 1)
  return next
}

/** The sync history, falling back to the single last sync for activations saved before history was recorded. */
export function syncHistory(a: Activation, fallbackSent: number): SyncEvent[] {
  if (a.history?.length) return a.history
  return a.lastSyncAt && a.matchedReach !== undefined ? [{ at: a.lastSyncAt, sent: fallbackSent, matched: a.matchedReach }] : []
}

export type SegmentStatus = 'draft' | 'ready' | 'syncing' | 'active'

export interface SavedSegment {
  id: string
  source: 'offline_behaviour'
  definition: AudienceDefinition
  /** The campaign brief conversation behind this segment, if it was drafted or adjusted that way. */
  brief?: BriefSession
  /** The ID a buyer searches for inside each destination. Set at first activation, then fixed. */
  segmentCode?: string
  /** planned impressions for the campaign, used only for a sizing check at activation */
  plannedImpressions?: number
  estimatedReach: number
  status: SegmentStatus
  activations: Activation[]
  createdAt: string
  updatedAt: string
}

export const SEGMENT_CODE_MAX = 64
const SEGMENT_CODE_RE = /^[A-Za-z0-9][A-Za-z0-9_-]*$/

/** Default segment ID: FCT_<country>_<name words>_<4 chars of the internal id>, safe for every destination's naming rules. */
export function suggestSegmentCode(name: string, country: string, id: string): string {
  const slug = name.normalize('NFKD').replace(/[^\x20-\x7E]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 36).replace(/_+$/, '')
  const tail = id.replace(/[^A-Za-z0-9]/g, '').slice(-4).toUpperCase()
  return ['FCT', country, slug, tail].filter(Boolean).join('_')
}

/** Returns a message when the ID cannot be used, or null when it is fine. */
export function segmentCodeProblem(code: string, taken: string[]): string | null {
  const c = code.trim()
  if (!c) return 'Enter a segment ID'
  if (c.length < 3) return 'Use at least 3 characters'
  if (c.length > SEGMENT_CODE_MAX) return `Keep it to ${SEGMENT_CODE_MAX} characters or fewer`
  if (!SEGMENT_CODE_RE.test(c)) return 'Use only letters, numbers, underscores and hyphens, starting with a letter or number'
  if (taken.some(t => t.toLowerCase() === c.toLowerCase())) return 'Another segment already uses this ID'
  return null
}

export const uid = () => Math.random().toString(36).slice(2, 10)

export function emptyDefinition(country: string): AudienceDefinition {
  return { name: '', country, geo: { states: [], cities: [] }, include: [{ id: uid(), conditions: [] }], exclude: [] }
}

export function hasRules(d: AudienceDefinition): boolean {
  return d.include.some(g => g.conditions.some(c => c.segmentIds.length > 0))
}

/** A definition can be saved once it has rules; a blank name falls back to a suggested one. */
export function isDefinitionComplete(d: AudienceDefinition): boolean {
  return hasRules(d)
}

/** Remove empty conditions/groups so the saved definition is tidy; keep at least one group. */
export function normalize(d: AudienceDefinition): AudienceDefinition {
  const include = d.include
    .map(g => ({ ...g, conditions: g.conditions.filter(c => c.segmentIds.length) }))
    .filter(g => g.conditions.length)
  return {
    ...d,
    include: include.length ? include : [{ id: uid(), conditions: [] }],
    exclude: d.exclude.filter(c => c.segmentIds.length),
  }
}
