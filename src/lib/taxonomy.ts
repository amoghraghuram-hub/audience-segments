export type SegmentType =
  | 'BRAND' | 'CATEGORY' | 'GEO_BEHAVIOUR'
  | 'AGE' | 'GENDER' | 'DEVICE_CARRIER'
  | 'INTENT' | 'IAB_CATEGORY' | 'ONLINE_BRAND' | 'EVENTS' | 'APP_CATEGORY'

export type TypeGroup = 'offline' | 'demographic' | 'online'

export interface TypeMeta { label: string; group: TypeGroup; hint: string }

/** [segmentId, name, deviceReach, description] — compact tuple from scripts/build_taxonomy.py */
export type SegmentRow = [string, string, number, string]

export interface Taxonomy {
  version: string
  generatedAt: string
  lookbackDays: number
  countries: { code: string; name: string; segments: number }[]
  types: Record<SegmentType, TypeMeta>
  segments: Record<string, Partial<Record<SegmentType, SegmentRow[]>>>
}

/**
 * The segment types Audience Studio offers. Offline behaviour only: the catalogue file also carries digital
 * behaviour types (intent, content interest, online brands, interest events, app categories), but they are not
 * part of this product, so they are left out everywhere: the picker, briefs, reach and the planner.
 */
export const TYPE_ORDER: SegmentType[] = [
  'BRAND', 'CATEGORY', 'GEO_BEHAVIOUR',
  'AGE', 'GENDER', 'DEVICE_CARRIER',
]

export const GROUP_META: Record<TypeGroup, { label: string; blurb: string }> = {
  offline: { label: 'Offline behaviour', blurb: 'Real-world visits and movement, observed from device location signals' },
  demographic: { label: 'Demographics & device', blurb: 'Who the device belongs to and the network it runs on' },
  online: { label: 'Digital behaviour', blurb: 'Browsing, purchase intent and app usage' },
}

let cache: Promise<Taxonomy> | null = null
export function loadTaxonomy(): Promise<Taxonomy> {
  if (!cache) {
    cache = fetch('/data/taxonomy.json').then(r => {
      if (!r.ok) throw new Error(`Failed to load taxonomy (${r.status})`)
      return r.json() as Promise<Taxonomy>
    }).then(tx => {
      // drop the types we do not offer, so nothing downstream can reach them
      const offered = new Set<string>(TYPE_ORDER)
      for (const code of Object.keys(tx.segments)) {
        const kept = Object.fromEntries(Object.entries(tx.segments[code]).filter(([type]) => offered.has(type)))
        tx.segments[code] = kept
        const country = tx.countries.find(c => c.code === code)
        if (country) country.segments = Object.values(kept).reduce((a, rows) => a + (rows?.length ?? 0), 0)
      }
      return tx
    })
  }
  return cache
}

export function segmentsFor(tx: Taxonomy, country: string, type: SegmentType): SegmentRow[] {
  return tx.segments[country]?.[type] ?? []
}

/** True when the country has at least one offline (location-derived) dimension. */
export function hasOffline(tx: Taxonomy, country: string): boolean {
  return typesAvailable(tx, country).some(t => tx.types[t].group === 'offline')
}

export function typesAvailable(tx: Taxonomy, country: string): SegmentType[] {
  const present = tx.segments[country] ?? {}
  return TYPE_ORDER.filter(t => (present[t]?.length ?? 0) > 0)
}

/** Lookup table id -> row for a country, built once per country. */
const indexCache = new Map<string, Map<string, { row: SegmentRow; type: SegmentType }>>()
export function indexFor(tx: Taxonomy, country: string) {
  let idx = indexCache.get(country)
  if (!idx) {
    idx = new Map()
    for (const t of TYPE_ORDER) for (const row of segmentsFor(tx, country, t)) idx.set(row[0], { row, type: t })
    indexCache.set(country, idx)
  }
  return idx
}

/**
 * Modelled addressable universe for a country, used only for the client-side reach preview.
 * Reach figures are per-segment device counts, so the best lower bound for the pool is the
 * largest single segment (or the sum of a mutually exclusive dimension such as age or gender).
 * Single segments regularly cover 30-40% of a country's observed devices, so the bound is
 * widened by UNIVERSE_FACTOR; the real count comes from the segment service on save.
 */
export const UNIVERSE_FACTOR = 2.5
export function universeFor(tx: Taxonomy, country: string): number {
  const present = tx.segments[country] ?? {}
  let max = 0
  for (const t of TYPE_ORDER) for (const row of present[t] ?? []) max = Math.max(max, row[2])
  const sum = (t: SegmentType) => (present[t] ?? []).reduce((a, r) => a + r[2], 0)
  return Math.max(max, sum('AGE'), sum('GENDER'), 1) * UNIVERSE_FACTOR
}
