import type { AudienceDefinition, Condition } from './model'
import { indexFor, type SegmentType, type Taxonomy } from './taxonomy'
import { HOME_COUNTRY, describeGeo, geoTag } from './geo'

/** [verb before the segment names, words after] e.g. "visited <names> places". */
const TYPE_VERB: Record<SegmentType, [string, string]> = {
  BRAND: ['visited', ''],
  CATEGORY: ['visited', 'places'],
  GEO_BEHAVIOUR: ['are', ''],
  AGE: ['are aged', ''],
  GENDER: ['are', ''],
  DEVICE_CARRIER: ['use', 'as their carrier'],
  INTENT: ['show purchase intent for', ''],
  IAB_CATEGORY: ['browse', 'content'],
  ONLINE_BRAND: ['browse', 'online'],
  EVENTS: ['follow', ''],
  APP_CATEGORY: ['use', 'apps'],
}

/** The same phrases for a "has not" rule. */
const TYPE_VERB_NOT: Record<SegmentType, [string, string]> = {
  BRAND: ['have not visited', ''],
  CATEGORY: ['have not visited', 'places'],
  GEO_BEHAVIOUR: ['are not', ''],
  AGE: ['are not aged', ''],
  GENDER: ['are not', ''],
  DEVICE_CARRIER: ['do not use', 'as their carrier'],
  INTENT: ['show no purchase intent for', ''],
  IAB_CATEGORY: ['do not browse', 'content'],
  ONLINE_BRAND: ['do not browse', 'online'],
  EVENTS: ['do not follow', ''],
  APP_CATEGORY: ['do not use', 'apps'],
}

export function conditionVerb(type: SegmentType, negate = false): [string, string] {
  return (negate ? TYPE_VERB_NOT : TYPE_VERB)[type] ?? ['', '']
}

/** Human names for a condition's segments, trimmed to read naturally after the verb. */
export function conditionNames(tx: Taxonomy, country: string, c: Condition): string[] {
  const idx = indexFor(tx, country)
  return c.segmentIds.map(id => {
    const n = idx.get(id)?.row[1] ?? id
    switch (c.type) {
      case 'BRAND': return n.replace(/ Visitors$/, '')
      case 'CATEGORY': return n.replace(/ Visitors| Shoppers/g, '')
      case 'GENDER': case 'APP_CATEGORY': return n.toLowerCase()
      default: return n
    }
  })
}

function joinOr(items: string[]) {
  if (items.length <= 1) return items[0] ?? ''
  if (items.length <= 3) return items.slice(0, -1).join(', ') + ' or ' + items[items.length - 1]
  return `${items[0]}, ${items[1]} or ${items.length - 2} other${items.length - 2 > 1 ? 's' : ''}`
}

export function describeCondition(tx: Taxonomy, country: string, c: Condition): string {
  const [pre, suf] = conditionVerb(c.type, c.negate)
  return [pre, joinOr(conditionNames(tx, country, c)), suf].filter(Boolean).join(' ')
}

export function describeDefinition(tx: Taxonomy, def: AudienceDefinition): string {
  const groups = def.include
    .map(g => g.conditions.filter(c => c.segmentIds.length))
    .filter(g => g.length)
  if (!groups.length) return 'Add a condition to describe this audience.'
  const country = placeLabel(tx, def)
  const parts = groups.map(g => g.map(c => describeCondition(tx, def.country, c)).join(', or '))
  let s = `Devices in ${country} that ${parts.join('; and that ')}`
  const ex = def.exclude.filter(c => c.segmentIds.length)
  if (ex.length) s += `; excluding devices that ${ex.map(c => describeCondition(tx, def.country, c)).join(' or ')}`
  return s + ` (last ${tx.lookbackDays} days).`
}

/** Where the audience lives, as it reads after "in": a State and City filter for the USA, else the country name. */
export function placeLabel(tx: Taxonomy, def: AudienceDefinition, max = 3): string {
  if (def.country === HOME_COUNTRY) return describeGeo(def.geo, max)
  return tx.countries.find(c => c.code === def.country)?.name ?? def.country
}

const MAX_NAME_PARTS = 4

/** Default name read off the sentence, e.g. "Adidas +2 · Gyms · 25-34 · excl. Decathlon · SG". */
export function suggestName(tx: Taxonomy, def: AudienceDefinition): string {
  const short = (c: Condition) => {
    const names = conditionNames(tx, def.country, c)
    return (c.negate ? 'not ' : '') + names[0] + (names.length > 1 ? ` +${names.length - 1}` : '')
  }
  const inc = def.include.flatMap(g => g.conditions).filter(c => c.segmentIds.length).map(short)
  if (!inc.length) return ''
  const ex = def.exclude.filter(c => c.segmentIds.length).map(c => `excl. ${short(c)}`)
  const parts = [...inc, ...ex]
  const shown = parts.slice(0, MAX_NAME_PARTS)
  if (parts.length > MAX_NAME_PARTS) shown.push(`+${parts.length - MAX_NAME_PARTS}`)
  return [...shown, def.country === HOME_COUNTRY ? geoTag(def.geo) : def.country].join(' · ')
}
