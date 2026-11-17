import type { AudienceDefinition, Condition, Group } from './model'
import { indexFor, universeFor, type Taxonomy } from './taxonomy'
import { geoShare } from './geo'

export interface ReachEstimate {
  reach: number
  universe: number
  /** share of universe, 0..1 */
  share: number
  groups: { groupId: string; reach: number }[]
  excluded: number
  /** largest single selected segment, used to sanity-check the estimate */
  largestSegment: number
  /** one entry per requirement, in sentence order, with exclusions last */
  steps: FunnelStep[]
  bands: SizeBands
  status: SizeStatus
}

export type SizeStatus = 'empty' | 'too_small' | 'narrow' | 'healthy' | 'broad'

/** Device counts that separate the size zones for one country. */
export interface SizeBands {
  /** below this most destinations reject the audience */
  floor: number
  narrowBelow: number
  broadAbove: number
}

export interface FunnelStep {
  key: string
  kind: 'group' | 'exclude'
  /** fraction of the previous step's devices that this requirement keeps, 0..1 */
  kept: number
  /** devices left after this requirement and all the ones before it */
  remaining: number
  /** final reach if this requirement alone were removed */
  without: number
}

/** Placeholder thresholds. Replace with per-destination minimums once the segment service exposes them. */
export const MIN_ACTIVATION_DEVICES = 5_000
const NARROW_ABS = 25_000
const NARROW_SHARE = 0.003
const BROAD_SHARE = 0.35

export function sizeBands(universe: number): SizeBands {
  const broadAbove = Math.max(universe * BROAD_SHARE, MIN_ACTIVATION_DEVICES * 4)
  const narrowBelow = Math.min(Math.max(NARROW_ABS, universe * NARROW_SHARE), broadAbove / 2)
  return { floor: Math.min(MIN_ACTIVATION_DEVICES, narrowBelow / 2), narrowBelow, broadAbove }
}

export function sizeStatus(reach: number, bands: SizeBands, hasRules: boolean): SizeStatus {
  if (!hasRules) return 'empty'
  if (reach < bands.floor) return 'too_small'
  if (reach < bands.narrowBelow) return 'narrow'
  if (reach > bands.broadAbove) return 'broad'
  return 'healthy'
}

/** Position of a device count on a log scale from 1K to the universe, 0..1. Shared by the meter and the funnel. */
export function scalePos(n: number, universe: number): number {
  const lo = 1_000
  if (n <= lo) return 0
  if (universe <= lo) return 1
  return Math.min(1, Math.log(n / lo) / Math.log(universe / lo))
}

/**
 * Modelled reach. Each selected segment is a device count; we convert to a share of the
 * country's addressable universe and combine under an independence assumption:
 *   OR  → 1 − Π(1 − p)      AND → Π p      NOT → p × (1 − q)
 * This is a client-side preview only. The production number comes from the segment service
 * once a definition is saved (see docs/SPEC.md §6).
 */
export function estimateReach(tx: Taxonomy, def: AudienceDefinition): ReachEstimate {
  const idx = indexFor(tx, def.country)
  // Segment sizes are national. The State and City filter scales the pool by its population share,
  // which assumes each segment is spread across the country in proportion to population.
  const national = universeFor(tx, def.country)
  const U = Math.max(1, Math.round(national * geoShare(def.geo)))
  const p = (id: string) => Math.min(1, (idx.get(id)?.row[2] ?? 0) / national)

  let largest = 0
  const conditionShare = (c: Condition) => {
    let miss = 1
    for (const id of c.segmentIds) {
      const share = p(id)
      largest = Math.max(largest, share * U)
      miss *= 1 - share
    }
    if (!c.segmentIds.length) return 0
    return c.negate ? miss : 1 - miss
  }
  const groupShare = (g: Group) => {
    const active = g.conditions.filter(c => c.segmentIds.length)
    if (!active.length) return null
    let miss = 1
    for (const c of active) miss *= 1 - conditionShare(c)
    return 1 - miss
  }

  const groups: { groupId: string; reach: number }[] = []
  const kept: { key: string; kind: 'group' | 'exclude'; kept: number }[] = []
  let share: number | null = null
  for (const g of def.include) {
    const s = groupShare(g)
    if (s === null) continue
    groups.push({ groupId: g.id, reach: Math.round(s * U) })
    kept.push({ key: g.id, kind: 'group', kept: s })
    share = share === null ? s : share * s
  }
  const included = share ?? 0

  let excludeShare = 0
  const activeEx = def.exclude.filter(c => c.segmentIds.length)
  if (activeEx.length) {
    let miss = 1
    for (const c of activeEx) miss *= 1 - conditionShare(c)
    excludeShare = 1 - miss
  }
  const final = included * (1 - excludeShare)
  if (activeEx.length && kept.length) kept.push({ key: 'exclude', kind: 'exclude', kept: 1 - excludeShare })

  let running = 1
  const steps: FunnelStep[] = kept.map((k, i) => {
    running *= k.kept
    const others = kept.reduce((a, o, j) => (j === i ? a : a * o.kept), 1)
    return { ...k, remaining: Math.round(running * U), without: Math.round(others * U) }
  })
  const bands = sizeBands(U)
  return {
    steps,
    bands,
    status: sizeStatus(Math.round(final * U), bands, kept.length > 0),
    reach: Math.round(final * U),
    universe: U,
    share: final,
    groups,
    excluded: Math.round(included * excludeShare * U),
    largestSegment: Math.round(largest),
  }
}
