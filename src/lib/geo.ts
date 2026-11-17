/**
 * Geography for the prototype. Factori's offline behaviour data covers the United States only,
 * so the audience geography is a State and City filter inside the USA.
 *
 * PLACEHOLDER DATA: populations are rounded 2020 census figures in thousands, and the city list is
 * the largest US cities only. They exist to drive the reach preview. Replace with the real
 * state/city device counts from the segment service.
 */
export const HOME_COUNTRY = 'USA'

export interface GeoFilter {
  /** two-letter state codes; empty means every state */
  states: string[]
  /** city ids in the form "Houston|TX"; a city narrows its own state */
  cities: string[]
}

export const EMPTY_GEO: GeoFilter = { states: [], cities: [] }

export interface UsState { code: string; name: string; pop: number }
export interface UsCity { id: string; name: string; state: string; pop: number }

const S = (code: string, name: string, pop: number): UsState => ({ code, name, pop })
export const US_STATES: UsState[] = [
  S('AL', 'Alabama', 5024), S('AK', 'Alaska', 733), S('AZ', 'Arizona', 7152), S('AR', 'Arkansas', 3012), S('CA', 'California', 39538),
  S('CO', 'Colorado', 5774), S('CT', 'Connecticut', 3606), S('DE', 'Delaware', 990), S('DC', 'District of Columbia', 690), S('FL', 'Florida', 21538),
  S('GA', 'Georgia', 10712), S('HI', 'Hawaii', 1455), S('ID', 'Idaho', 1839), S('IL', 'Illinois', 12813), S('IN', 'Indiana', 6786),
  S('IA', 'Iowa', 3190), S('KS', 'Kansas', 2938), S('KY', 'Kentucky', 4506), S('LA', 'Louisiana', 4658), S('ME', 'Maine', 1362),
  S('MD', 'Maryland', 6177), S('MA', 'Massachusetts', 7030), S('MI', 'Michigan', 10077), S('MN', 'Minnesota', 5706), S('MS', 'Mississippi', 2961),
  S('MO', 'Missouri', 6155), S('MT', 'Montana', 1084), S('NE', 'Nebraska', 1962), S('NV', 'Nevada', 3105), S('NH', 'New Hampshire', 1378),
  S('NJ', 'New Jersey', 9289), S('NM', 'New Mexico', 2118), S('NY', 'New York', 20201), S('NC', 'North Carolina', 10439), S('ND', 'North Dakota', 779),
  S('OH', 'Ohio', 11799), S('OK', 'Oklahoma', 3959), S('OR', 'Oregon', 4237), S('PA', 'Pennsylvania', 13003), S('RI', 'Rhode Island', 1097),
  S('SC', 'South Carolina', 5118), S('SD', 'South Dakota', 887), S('TN', 'Tennessee', 6911), S('TX', 'Texas', 29146), S('UT', 'Utah', 3272),
  S('VT', 'Vermont', 643), S('VA', 'Virginia', 8631), S('WA', 'Washington', 7705), S('WV', 'West Virginia', 1794), S('WI', 'Wisconsin', 5894),
  S('WY', 'Wyoming', 577),
]

const C = (name: string, state: string, pop: number): UsCity => ({ id: `${name}|${state}`, name, state, pop })
export const US_CITIES: UsCity[] = [
  C('New York City', 'NY', 8804), C('Los Angeles', 'CA', 3899), C('Chicago', 'IL', 2746), C('Houston', 'TX', 2305), C('Phoenix', 'AZ', 1608),
  C('Philadelphia', 'PA', 1604), C('San Antonio', 'TX', 1435), C('San Diego', 'CA', 1387), C('Dallas', 'TX', 1304), C('San Jose', 'CA', 1013),
  C('Austin', 'TX', 962), C('Jacksonville', 'FL', 950), C('Fort Worth', 'TX', 919), C('Columbus', 'OH', 906), C('Indianapolis', 'IN', 888),
  C('Charlotte', 'NC', 875), C('San Francisco', 'CA', 874), C('Seattle', 'WA', 737), C('Denver', 'CO', 716), C('Washington DC', 'DC', 690),
  C('Nashville', 'TN', 689), C('Oklahoma City', 'OK', 681), C('El Paso', 'TX', 679), C('Boston', 'MA', 676), C('Portland', 'OR', 652),
  C('Las Vegas', 'NV', 642), C('Detroit', 'MI', 639), C('Memphis', 'TN', 633), C('Louisville', 'KY', 633), C('Baltimore', 'MD', 586),
  C('Milwaukee', 'WI', 577), C('Albuquerque', 'NM', 565), C('Tucson', 'AZ', 543), C('Fresno', 'CA', 542), C('Sacramento', 'CA', 525),
  C('Kansas City', 'MO', 508), C('Mesa', 'AZ', 504), C('Atlanta', 'GA', 499), C('Omaha', 'NE', 486), C('Colorado Springs', 'CO', 479),
  C('Raleigh', 'NC', 468), C('Long Beach', 'CA', 467), C('Virginia Beach', 'VA', 459), C('Miami', 'FL', 442), C('Oakland', 'CA', 441),
  C('Minneapolis', 'MN', 430), C('Tulsa', 'OK', 413), C('Bakersfield', 'CA', 403), C('Tampa', 'FL', 385), C('Arlington', 'TX', 394),
  C('New Orleans', 'LA', 384), C('Wichita', 'KS', 398), C('Cleveland', 'OH', 373), C('Honolulu', 'HI', 351), C('Anaheim', 'CA', 347),
  C('Orlando', 'FL', 308), C('St. Louis', 'MO', 302), C('Pittsburgh', 'PA', 303), C('Cincinnati', 'OH', 309), C('Salt Lake City', 'UT', 200),
]

const US_POP = US_STATES.reduce((a, s) => a + s.pop, 0)
const stateBy = new Map(US_STATES.map(s => [s.code, s]))
const cityBy = new Map(US_CITIES.map(c => [c.id, c]))

export const stateName = (code: string) => stateBy.get(code)?.name ?? code
export const cityOf = (id: string) => cityBy.get(id)
export const hasGeo = (g?: GeoFilter) => !!g && (g.states.length > 0 || g.cities.length > 0)

/**
 * Share of US devices inside the filter, 0..1, using population as the proxy.
 * A state with no chosen cities counts in full; a state with chosen cities counts only those cities.
 */
export function geoShare(g?: GeoFilter): number {
  if (!hasGeo(g)) return 1
  const cities = g!.cities.map(cityOf).filter((c): c is UsCity => !!c)
  const narrowed = new Set(cities.map(c => c.state))
  let pop = cities.reduce((a, c) => a + c.pop, 0)
  for (const code of g!.states) if (!narrowed.has(code)) pop += stateBy.get(code)?.pop ?? 0
  return Math.min(1, pop / US_POP)
}

/** Keep the filter consistent: a chosen city always has its state chosen too. */
export function normalizeGeo(g: GeoFilter): GeoFilter {
  const cities = [...new Set(g.cities.filter(id => cityBy.has(id)))]
  const states = [...new Set([...g.states.filter(s => stateBy.has(s)), ...cities.map(id => cityBy.get(id)!.state)])]
  return { states, cities }
}

const list = (items: string[], max: number) =>
  items.length <= max
    ? items.length > 1 ? items.slice(0, -1).join(', ') + ' and ' + items[items.length - 1] : items[0] ?? ''
    : `${items.slice(0, max - 1).join(', ')} and ${items.length - max + 1} more`

/** Parts of the filter as readable places: whole states by name, narrowed states as "City, ST". */
function places(g: GeoFilter): string[] {
  const cities = g.cities.map(cityOf).filter((c): c is UsCity => !!c)
  const narrowed = new Set(cities.map(c => c.state))
  return [...cities.map(c => `${c.name}, ${c.state}`), ...g.states.filter(s => !narrowed.has(s)).map(stateName)]
}

/** "the United States", "Texas", "Houston, TX and Florida", "Texas, Ohio and 3 more". */
export function describeGeo(g?: GeoFilter, max = 3): string {
  return hasGeo(g) ? list(places(g!), max) : 'the United States'
}

/** Compact tag for names and IDs: "US", "TX", "Houston", "TX+2". */
export function geoTag(g?: GeoFilter): string {
  if (!hasGeo(g)) return 'US'
  const cities = g!.cities.map(cityOf).filter((c): c is UsCity => !!c)
  const narrowed = new Set(cities.map(c => c.state))
  const parts = [...cities.map(c => c.name), ...g!.states.filter(s => !narrowed.has(s))]
  return parts[0] + (parts.length > 1 ? `+${parts.length - 1}` : '')
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const CITY_ALIASES: Record<string, string[]> = {
  'New York City|NY': ['new york city', 'nyc', 'manhattan'], 'Los Angeles|CA': ['los angeles', 'la'], 'Washington DC|DC': ['washington dc', 'washington d.c.', 'd.c.'],
  'San Francisco|CA': ['san francisco', 'sf'], 'Las Vegas|NV': ['las vegas', 'vegas'], 'St. Louis|MO': ['st. louis', 'st louis', 'saint louis'],
}
const NAMES: { alias: string; state?: string; city?: string }[] = [
  ...US_CITIES.flatMap(c => (CITY_ALIASES[c.id] ?? [c.name.toLowerCase()]).map(alias => ({ alias, city: c.id }))),
  ...US_STATES.map(s => ({ alias: s.name.toLowerCase(), state: s.code })),
].sort((a, b) => b.alias.length - a.alias.length)
const NAME_ALT = NAMES.map(n => esc(n.alias)).join('|')
/** A place only counts after a preposition, so "Texas Roadhouse" stays a brand and "in Texas" becomes a filter. */
const PLACE_RE = new RegExp(`\\b(?:in|across|around|near|within|throughout)\\s+(?:the\\s+)?(?:state of\\s+|city of\\s+)?((?:${NAME_ALT})(?:\\s+area|\\s+metro)?(?:\\s*(?:,|,?\\s+and|,?\\s+or|&)\\s*(?:${NAME_ALT}))*)(?![a-z])`, 'gi')
const ONE_RE = new RegExp(`(?:${NAME_ALT})`, 'gi')

/** Read State and City filters out of free text, and return the text with those phrases removed. */
export function detectGeo(text: string): { geo: GeoFilter; rest: string } {
  const states: string[] = [], cities: string[] = []
  const rest = text.replace(PLACE_RE, (_m, group: string) => {
    for (const hit of group.match(ONE_RE) ?? []) {
      const n = NAMES.find(x => x.alias === hit.toLowerCase())
      if (n?.city) cities.push(n.city); else if (n?.state) states.push(n.state)
    }
    return ' '
  })
  return { geo: normalizeGeo({ states, cities }), rest }
}
