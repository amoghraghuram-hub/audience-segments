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

export type RefreshCadence = 'once' | 'daily' | 'weekly'

export interface Activation {
  destinationId: string
  accountId: string
  cadence: RefreshCadence
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

const CADENCE_DAYS: Record<RefreshCadence, number | null> = { once: null, daily: 1, weekly: 7 }

/** When this destination is next due a refresh, or null if it will not sync again. */
export function nextSyncAt(a: Activation, campaign?: Campaign): Date | null {
  const days = CADENCE_DAYS[a.cadence]
  if (!days || !a.lastSyncAt || a.status !== 'active') return null
  const next = new Date(Date.parse(a.lastSyncAt) + days * 864e5)
  if (campaign?.end && next.toISOString().slice(0, 10) > campaign.end) return null
  return next
}

/** The sync history, falling back to the single last sync for activations saved before history was recorded. */
export function syncHistory(a: Activation, fallbackSent: number): SyncEvent[] {
  if (a.history?.length) return a.history
  return a.lastSyncAt && a.matchedReach !== undefined ? [{ at: a.lastSyncAt, sent: fallbackSent, matched: a.matchedReach }] : []
}

export type SegmentStatus = 'draft' | 'ready' | 'scheduled' | 'syncing' | 'active' | 'expired'

/** When the campaign runs. Syncing stops and the audience is removed from destinations after `end`. */
export interface Campaign {
  /** ISO dates, yyyy-mm-dd */
  start?: string
  end?: string
  /** planned impressions, used only for sizing advice */
  impressions?: number
}

/** Today's calendar day (yyyy-mm-dd) where the viewer is, so a campaign starts and ends on their local date. */
export const todayIso = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** A campaign whose start date is still ahead, so nothing is sent yet. */
export const startsLater = (c?: Campaign) => !!c?.start && c.start > todayIso()

/** A campaign whose end date has passed. */
export const hasEnded = (c?: Campaign) => !!c?.end && c.end < todayIso()

/** Whole days from start (or today, if it has started or has no start) to end, inclusive. Null without an end date. */
export function campaignDays(c?: Campaign): number | null {
  if (!c?.end) return null
  const from = c.start && c.start > todayIso() ? c.start : todayIso()
  return Math.max(0, Math.round((Date.parse(c.end) - Date.parse(from)) / 864e5) + 1)
}

export interface SavedSegment {
  id: string
  source: 'offline_behaviour'
  definition: AudienceDefinition
  /** The campaign brief conversation behind this segment, if it was drafted or adjusted that way. */
  brief?: BriefSession
  /** The ID a buyer searches for inside each destination. Set at first activation, then fixed. */
  segmentCode?: string
  campaign?: Campaign
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
