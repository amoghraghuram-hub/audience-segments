import type { Plan, PlanCondition } from './plan'
import { segmentsFor, typesAvailable, type SegmentRow, type SegmentType, type Taxonomy } from './taxonomy'
import { sensitivityOf } from './sensitive'

/**
 * Offline fallback planner. Keyword-matches a brief against the catalogue so the flow works
 * before the internal planner service exists. Not a product feature: it is only reached through planner.ts and is never named in the UI.
 */

const COUNTRY_ALIASES: Record<string, string[]> = {
  SGP: ['singapore', 'sg', 'sgp'], MYS: ['malaysia', 'my', 'kl', 'kuala lumpur', 'penang', 'johor'],
  IDN: ['indonesia', 'jakarta', 'bali', 'surabaya'], THA: ['thailand', 'bangkok', 'phuket'],
  PHL: ['philippines', 'manila', 'cebu'], VNM: ['vietnam', 'hanoi', 'saigon', 'ho chi minh'],
  IND: ['india', 'mumbai', 'delhi', 'bangalore', 'bengaluru', 'chennai', 'hyderabad'],
  AUS: ['australia', 'sydney', 'melbourne', 'brisbane', 'perth'], NZL: ['new zealand', 'auckland'],
  // states and cities are handled by the geography filter (geo.ts), so only country words are stripped here
  USA: ['usa', 'united states', 'america'],
  CAN: ['canada', 'toronto', 'vancouver'], GBR: ['uk', 'united kingdom', 'britain', 'london', 'england'],
  ARE: ['uae', 'dubai', 'abu dhabi', 'emirates'], SAU: ['saudi', 'riyadh', 'jeddah'], QAT: ['qatar', 'doha'],
  HKG: ['hong kong', 'hk'], TWN: ['taiwan', 'taipei'], KOR: ['korea', 'seoul'], JPN: ['japan', 'tokyo', 'osaka'],
  DEU: ['germany', 'berlin', 'munich'], FRA: ['france', 'paris'], ESP: ['spain', 'madrid', 'barcelona'],
  ITA: ['italy', 'milan', 'rome'], NLD: ['netherlands', 'amsterdam'], BEL: ['belgium', 'brussels'],
  BRA: ['brazil', 'sao paulo', 'rio'], MEX: ['mexico'], ARG: ['argentina', 'buenos aires'],
  ZAF: ['south africa', 'johannesburg', 'cape town'],
}

/** Concept → extra search terms, so "gym-goers" also finds fitness studios and yoga. */
const SYNONYMS: Record<string, string[]> = {
  gym: ['fitness', 'gyms', 'yoga', 'pilates', 'crossfit', 'sports'], fitness: ['gym', 'gyms', 'yoga', 'sports'],
  coffee: ['cafe', 'cafes', 'coffee', 'starbucks'], cafe: ['coffee', 'cafes'],
  luxury: ['luxury', 'premium', 'designer', 'jewelry', 'jewellery', 'watch', 'boutique'], premium: ['luxury', 'designer'],
  affluent: ['luxury', 'premium', 'golf', 'country', 'club', 'fine', 'dining'], wealthy: ['luxury', 'golf', 'fine', 'dining'],
  travel: ['airport', 'airports', 'hotel', 'hotels', 'tour', 'travel', 'tourist'], travellers: ['airport', 'hotel', 'tour'], travelers: ['airport', 'hotel', 'tour'],
  family: ['kids', 'toys', 'playground', 'school', 'family', 'children'], families: ['kids', 'toys', 'playground', 'school', 'family', 'children'], parents: ['kids', 'toys', 'school', 'children', 'baby'],
  foodie: ['restaurant', 'restaurants', 'dining', 'food'], foodies: ['restaurant', 'restaurants', 'dining'], diners: ['restaurant', 'restaurants'],
  commuter: ['bus', 'mrt', 'train', 'commuters', 'stations'], commuters: ['bus', 'mrt', 'train', 'stations'],
  shopper: ['mall', 'malls', 'shopping', 'retail'], shoppers: ['mall', 'malls', 'shopping', 'retail'], mall: ['malls', 'shopping'],
  car: ['automotive', 'automobile', 'car', 'cars', 'petrol', 'dealership'], auto: ['automotive', 'car', 'dealership'], drivers: ['petrol', 'automotive', 'car'],
  tech: ['technology', 'electronics', 'computing', 'gadgets'], gamer: ['games', 'gaming', 'esports'], gamers: ['games', 'gaming', 'esports'],
  beauty: ['cosmetics', 'beauty', 'salon', 'skincare', 'spa'], skincare: ['cosmetics', 'beauty', 'pharmacy'],
  health: ['pharmacy', 'pharmacies', 'clinic', 'hospital', 'health', 'wellness'], wellness: ['spa', 'yoga', 'health', 'pharmacy'],
  student: ['university', 'college', 'campus', 'students'], students: ['university', 'college', 'campus'],
  nightlife: ['bar', 'bars', 'club', 'clubs', 'night', 'pub', 'pubs', 'nightlife'],
  pet: ['pet', 'pets', 'vet', 'veterinary'], pets: ['pet', 'vet', 'veterinary'],
  home: ['furniture', 'home', 'hardware', 'diy', 'decor'], furniture: ['furniture', 'ikea', 'home'],
  sport: ['sports', 'stadium', 'football', 'basketball'], sports: ['stadium', 'football', 'basketball', 'sports'],
  movie: ['cinema', 'cinemas', 'movie', 'theatre'], movies: ['cinema', 'cinemas'],
  grocery: ['supermarket', 'supermarkets', 'grocery', 'ntuc', 'fairprice'], groceries: ['supermarket', 'supermarkets', 'grocery'],
}

const STOP = new Set(['the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'for', 'with', 'who', 'that', 'are', 'is', 'at', 'on', 'we', 'our', 'their', 'they', 'them',
  'people', 'users', 'devices', 'audience', 'audiences', 'campaign', 'target', 'targeting', 'reach', 'want', 'wants', 'need', 'looking', 'brief', 'launch', 'launching',
  'visitors', 'visitor', 'shoppers', 'shopper', 'shop', 'shops', 'store', 'stores', 'outlet', 'outlets', 'frequent', 'regular', 'regulars', 'already', 'anyone', 'everyone', 'someone', 'nearby', 'near', 'around', 'local', 'area', 'city', 'town', 'market', 'markets', 'who', 'whose', 'visit', 'visits', 'visiting', 'go', 'goes', 'going', 'get', 'buy', 'buying', 'shopping', 'seen', 'related', 'content', 'last', 'days', 'last', 'ads', 'ad', 'brand', 'brands', 'new', 'from', 'by', 'as', 'be', 'this', 'it', 'its',
  'high', 'low', 'more', 'most', 'very', 'all', 'any', 'some', 'into', 'about', 'over', 'under', 'between', 'than', 'also', 'but', 'not', 'no', 'yes', 'please'])

/** Generic place nouns. They support a match but can't carry one alone ("coworking space" must not pull in "Office Space"). */
const WEAK = new Set(['space', 'spaces', 'centre', 'centres', 'center', 'centers', 'venue', 'venues', 'studio', 'studios', 'station', 'stations',
  'service', 'services', 'place', 'places', 'house', 'hall', 'room', 'rooms', 'point', 'zone', 'world', 'group', 'international', 'company', 'co',
  // nouns for the people, not the place: "pet owners" must not pull in "Automobile Owners"
  'owner', 'owners', 'buyer', 'buyers', 'mover', 'movers', 'enthusiast', 'enthusiasts', 'lover', 'lovers', 'traveller', 'travellers', 'traveler', 'travelers',
  'goer', 'goers', 'diner', 'diners', 'professional', 'professionals', 'fan', 'fans', 'customer', 'customers', 'member', 'members'])
const WEAK_WEIGHT = 0.2

/** Words that describe the campaign or the person. They widen the search through synonyms but never match a segment name themselves. */
const DESCRIPTOR = new Set(['family', 'families', 'weekend', 'weekday', 'promo', 'promotion', 'new', 'young', 'old', 'independent', 'big', 'small', 'best', 'top', 'great', 'fresh', 'daily'])
/** One-word kinds that are also ordinary naming words. They can pick a place category but cannot suggest brands ("parks" is not Park Hyatt). */
const AMBIGUOUS_KIND = new Set(['park', 'home', 'city', 'food', 'market', 'garden', 'club', 'house', 'star', 'world', 'family', 'bar', 'express', 'general'])

// "exclude X", and the same thing said as a negative: "who haven't been to X", "who never visit X"
const EXCLUDE_RE = /\b(?:exclud(?:e|ing)|except|without|but not|not including|avoid|suppress|remove|(?:(?:and|but)\s+)?(?:who\s+)?(?:have\s*n[o'’]?t|never|do\s*n[o'’]?t)\s+(?:yet\s+)?(?:visit(?:ed)?|been\s+to|gone?\s+to|go\s+to|shop(?:ped)?\s+at))\b\s+([^.;\n]+)/gi

function tokens(text: string): string[] {
  return text.toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9+&\-\s]/g, ' ').split(/\s+/).filter(t => t && !STOP.has(t))
}
function expand(ts: string[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const t of ts) {
    const base = t.replace(/[-']/g, '').replace(/(goers|ers|s)$/, '')
    if (!DESCRIPTOR.has(t)) {
      m.set(t, Math.max(m.get(t) ?? 0, 1))
      if (base !== t) m.set(base, Math.max(m.get(base) ?? 0, 0.9))
    }
    for (const s of SYNONYMS[t] ?? SYNONYMS[base] ?? []) m.set(s, Math.max(m.get(s) ?? 0, 0.7))
  }
  return m
}

/** Remove the aliases of a country from the text so place names don't pollute matching. */
export function stripCountry(text: string, code: string): string {
  let t = text
  for (const a of COUNTRY_ALIASES[code] ?? []) t = t.replace(new RegExp(`\\b${a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi'), ' ')
  return t
}

export function detectCountry(text: string, fallback: string): string {
  const t = ' ' + text.toLowerCase().replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ') + ' '
  for (const [code, aliases] of Object.entries(COUNTRY_ALIASES)) {
    if (aliases.some(a => t.includes(' ' + a + ' '))) return code
  }
  return fallback
}

const singular = (w: string) => (w.length > 3 ? w.replace(/s$/, '') : w)
/** Words too generic to define a kind of place on their own ("pizza restaurant" is about pizza). */
const KIND_GENERIC = new Set(['restaurant', 'restaurants', 'new', 'showroom', 'in-market', 'frequent'])

/** The kinds a segment name stands for: "Gym And Fitness Centre" gives [gym] and [fitness], "Sporting Goods Shoppers" gives [good, sporting]. */
function kindParts(name: string): string[][] {
  return name.split(/\band\b|&|,/i)
    .map(part => [...new Set(tokens(part).filter(w => !WEAK.has(w) && !KIND_GENERIC.has(w)).map(singular))].sort())
    .filter(words => words.length)
}

/** Every kind of place or behaviour in this country's catalogue, read from the place categories and behaviour segments. */
const kindCache = new Map<string, string[][]>()
function placeKinds(tx: Taxonomy, country: string): string[][] {
  let kinds = kindCache.get(country)
  if (!kinds) {
    const seen = new Map<string, string[]>()
    for (const type of ['CATEGORY', 'GEO_BEHAVIOUR'] as const) for (const row of segmentsFor(tx, country, type)) for (const k of kindParts(row[1])) seen.set(k.join(' '), k)
    kinds = [...seen.values()]
    kindCache.set(country, kinds)
  }
  return kinds
}

const inBrief = (q: Map<string, number>, w: string) => q.get(w) ?? q.get(singular(w)) ?? 0

/** The brief text behind a query, normalised to " words separated by single spaces ", for whole-phrase checks. */
const briefText = new WeakMap<Map<string, number>, string>()
const norm = (t: string) => ' ' + t.toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, ' ').trim() + ' '
function query(text: string): Map<string, number> {
  const q = expand(tokens(text))
  briefText.set(q, norm(text))
  return q
}

/** The same query with some words removed, still tied to its brief text. */
function queryWithout(q: Map<string, number>, drop: Set<string>): Map<string, number> {
  const next = new Map([...q].filter(([k]) => !drop.has(k)))
  briefText.set(next, briefText.get(q) ?? '')
  return next
}

/** True when the brief spells out the brand's name, e.g. "The Home Depot", "Home Depot" or "McDonalds". */
function namesBrand(row: SegmentRow, text: string): boolean {
  const phrase = norm(row[1].replace(/ (Visitors|Shoppers)$/i, '')).replace(/^ the /, ' ')
  if (!tokens(row[1]).length) {
    // a name made only of filler words ("Target") counts only where the brief clearly means a place
    const name = phrase.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return new RegExp(` (?:at|visit|visits|visited|visiting|go to|goes to|going to|been to) (?:the )?${name} | ${name} (?:shoppers|visitors|customers|stores|regulars) `).test(text)
  }
  if (text.includes(phrase) || text.includes(phrase.trimEnd() + 's ')) return true
  // the usual short form also counts: "Academy Sports" for "Academy Sports + Outdoors"
  const words = phrase.trim().split(' ')
  for (let n = words.length - 1; n >= 2; n--) {
    const lead = words.slice(0, n).join(' ')
    if (tokens(lead).length >= 2 && text.includes(` ${lead} `)) return true
  }
  return false
}

interface MatchRule {
  text: string
  /** every kind whose words are all in the brief */
  named: string[][]
  /** named kinds that may suggest brands: said in the brief's own words, not swallowed by a longer kind, not an ordinary naming word */
  brandKinds: string[][]
  /** every word that is part of some kind in the catalogue */
  kindWords: Set<string>
  /** words that carry no weight: they belong to a brand the brief names outright, or were only suggested by one */
  dead: Set<string>
}

/**
 * Works out what a brief may match on. Words inside a brand the brief names outright are spoken for: they cannot
 * name a kind of place or bring in look-alikes ("The Home Depot" is not about homes).
 */
function matchRule(tx: Taxonomy, country: string, q: Map<string, number>): MatchRule {
  const text = briefText.get(q) ?? ''
  const dead = new Set<string>()
  for (const row of segmentsFor(tx, country, 'BRAND')) if (namesBrand(row, text)) for (const w of tokens(row[1])) dead.add(singular(w))
  for (const w of [...dead]) for (const syn of SYNONYMS[w] ?? []) if ((q.get(syn) ?? 0) < 0.9) dead.add(syn)
  const live = (w: string) => (dead.has(w) || dead.has(singular(w)) ? 0 : inBrief(q, w))
  const named = placeKinds(tx, country).filter(k => k.every(w => live(w) > 0))
  const brandKinds = named
    .filter(k => k.every(w => live(w) >= 0.9))
    .filter(k => !named.some(o => o.length > k.length && k.every(w => o.includes(w))))
    .filter(k => !(k.length === 1 && AMBIGUOUS_KIND.has(k[0])))
  return { text, named, brandKinds, dead, kindWords: new Set(placeKinds(tx, country).flat()) }
}

/**
 * Scores one segment against the brief.
 *
 * Brands match in full when the brief spells out the name, or when a one-word brand is on the synonym list
 * ("coffee" suggests Starbucks). Otherwise only the words of a named kind that the brand's name fully contains
 * count: "sporting goods" suggests Dick's Sporting Goods, not Home Goods.
 *
 * Categories and behaviours match on their own kind. A word shared with a narrower kind does not count when the
 * brief already names a kind for that word: "cafes" is Cafe And Lounge, not Internet Cafe.
 */
function scoreRow(row: SegmentRow, q: Map<string, number>, rule: MatchRule, type: SegmentType): [number, string[]] {
  const nameT = tokens(row[1]); const descT = tokens(row[3])
  const distinct = [...new Set(nameT)]
  const spelled = type === 'BRAND' && namesBrand(row, rule.text)
  // a brand the brief spells out keeps its own words; for everything else those words are spoken for
  const weight = (w: string) => (!spelled && (rule.dead.has(w) || rule.dead.has(singular(w))) ? 0 : inBrief(q, w))
  let allowed: Set<string> | null = null
  if (type === 'BRAND') {
    // the synonym list may suggest a one-word brand ("coffee" suggests Starbucks) but not a brand named after a kind of place
    const suggested = distinct.length === 1 && weight(distinct[0]) > 0 && weight(distinct[0]) < 0.9 && !rule.kindWords.has(singular(distinct[0]))
    if (!spelled && !suggested) {
      const own = new Set(distinct.map(singular))
      allowed = new Set(rule.brandKinds.filter(k => k.every(w => own.has(w))).flat())
    }
  } else if (type === 'CATEGORY' || type === 'GEO_BEHAVIOUR') {
    allowed = new Set()
    for (const part of kindParts(row[1])) {
      const whole = part.every(w => weight(w) > 0)
      for (const w of part) {
        // a partly matched kind only counts on words the brief has no fuller kind for
        if (whole || !rule.named.some(k => k.includes(w))) allowed.add(w)
      }
    }
    for (const w of distinct) if (WEAK.has(w) || KIND_GENERIC.has(w)) allowed.add(singular(w))
  }
  const counts = (w: string) => !allowed || allowed.has(singular(w))
  let score = 0; const hits: string[] = []
  for (const w of distinct) { const s = weight(w); if (!s || !counts(w)) continue; if (WEAK.has(w)) score += s * 2 * WEAK_WEIGHT; else { score += s * 2; hits.push(w) } }
  for (const w of new Set(descT)) { const s = weight(w); if (s && counts(w) && !WEAK.has(w) && !hits.includes(w)) { score += s * 0.5; hits.push(w) } }
  // a spelled-out brand always qualifies and ranks first, even when its name is all filler words ("Target")
  if (spelled) return [3 + score / Math.sqrt(Math.max(1, nameT.length)), hits.length ? hits : [row[1].replace(/ (Visitors|Shoppers)$/i, '').toLowerCase()]]
  return [score / Math.sqrt(Math.max(1, nameT.length)), hits]
}

/** Restricted segments a brief asked for, collected while matching so the reply can say they were left out. */
let withheld: SegmentRow[] = []

function topMatches(tx: Taxonomy, country: string, type: SegmentType, q: Map<string, number>, limit: number, min = 0.9): { row: SegmentRow; hits: string[] }[] {
  const rule = matchRule(tx, country, q)
  const scored = segmentsFor(tx, country, type)
    .map(row => { const [s, hits] = scoreRow(row, q, rule, type); return { row, s, hits } })
    .filter(x => x.s >= min)
    .sort((a, b) => b.s - a.s || b.row[2] - a.row[2])
  // the sensitive-place policy applies before ranking, so a restricted segment never takes a slot or gets suggested
  const allowed = scored.filter(x => sensitivityOf(x.row[1])?.level !== 'blocked')
  withheld.push(...scored.filter(x => sensitivityOf(x.row[1])?.level === 'blocked').slice(0, 3).map(x => x.row))
  return allowed.slice(0, limit)
}

/** True when the brief spells out this brand, as opposed to the matcher suggesting it. */
function isNamed(row: SegmentRow, text: string): boolean { return namesBrand(row, norm(text)) }

function ageIds(tx: Taxonomy, country: string, text: string): string[] {
  const rows = segmentsFor(tx, country, 'AGE')
  const parse = (n: string) => n.replace('+', '-99').split('-').map(Number) as [number, number]
  let lo = -1, hi = -1
  const m = text.match(/(\d{2})\s*(?:-|–|to)\s*(\d{2})/)
  if (m) { lo = +m[1]; hi = +m[2] }
  else if (/\b(\d{2})\s*\+|\bover\s+(\d{2})|\baged?\s+(\d{2})\s*(?:and|or)\s+(?:above|older|up)/.test(text)) { const n = +(RegExp.$1 || RegExp.$2 || RegExp.$3); lo = n; hi = 99 }
  else if (/\bunder\s+(\d{2})/.test(text)) { lo = 18; hi = +RegExp.$1 - 1 }
  else {
    const t = text.toLowerCase()
    if (/\bgen\s*z\b|\bstudents?\b|\byoung adults?\b|\bteens?\b/.test(t)) { lo = 18; hi = 24 }
    else if (/\bmillennials?\b|\byoung professionals?\b|\byoung (?:families|parents|people)\b/.test(t)) { lo = 25; hi = 34 }
    else if (/\bseniors?\b|\bretire|\belderly\b|\bboomers?\b/.test(t)) { lo = 55; hi = 99 }
    else if (/\bmiddle[- ]aged\b|\bgen\s*x\b/.test(t)) { lo = 40; hi = 54 }
  }
  if (lo < 0) return []
  return rows.filter(r => { const [a, b] = parse(r[1]); return b >= lo && a <= hi }).map(r => r[0])
}

function genderIds(tx: Taxonomy, country: string, text: string): string[] {
  const t = text.toLowerCase()
  const f = /\b(women|woman|female|females|ladies|mums|moms|mothers|her)\b/.test(t)
  const m = /\b(men|man|male|males|dads|fathers|guys)\b/.test(t)
  if (f === m) return []
  return segmentsFor(tx, country, 'GENDER').filter(r => f ? /female/i.test(r[1]) : /^male/i.test(r[1])).map(r => r[0])
}

/**
 * Split a brief into parts that must all hold. Sentences and "and" separate parts; "or" does not.
 * An "and" that closes a comma list ("gyms, yoga studios and pools") is an enumeration, so it stays together.
 */
export function splitClauses(text: string): string[] {
  const out: string[] = []
  for (const sentence of text.split(/[.;!?\n]+/)) {
    let current = ''
    // "and" joins requirements, and so does a "who" clause: "gym-goers who shop at Target" must do both
    for (const piece of sentence.split(/\s+(?:and|&|plus|as well as)\s+(?:who\s+)?(?:also\s+)?|\s+(?:who|that)\s+(?:also\s+)?(?=(?:shop|visit|go|stay|play|eat|buy|drive|work|live|travel|frequent|attend|use|dine|drink)\w*\b)/i)) {
      if (current && current.includes(',')) current += ' or ' + piece
      else { if (current.trim()) out.push(current); current = piece }
    }
    if (current.trim()) out.push(current)
  }
  return out
}

function shortName(row: SegmentRow) { return row[1].replace(/ Visitors$| Shoppers$/, '') }

const stem = (w: string) => (w.length > 5 && w.endsWith('ing') ? w.slice(0, -3) : w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w)

/**
 * What kind of place a well-known chain is, for chains whose name does not say. Used only to decide which
 * requirement an added brand belongs to. PLACEHOLDER: replace with a brand-to-category field once the catalogue has one.
 */
const BRAND_KIND: Record<string, string[]> = {
  walmart: ['supermarket', 'grocery', 'department', 'discount'], target: ['department', 'discount', 'supermarket', 'grocery'], costco: ['supermarket', 'grocery', 'wholesale', 'warehouse'],
  kroger: ['supermarket', 'grocery'], safeway: ['supermarket', 'grocery'], publix: ['supermarket', 'grocery'], aldi: ['supermarket', 'grocery'], 'trader joes': ['supermarket', 'grocery'], 'whole foods market': ['supermarket', 'grocery', 'organic'],
  ikea: ['furniture', 'home'], wayfair: ['furniture', 'home'], 'ashley homestore': ['furniture', 'home'], 'home depot': ['home', 'improvement', 'hardware', 'diy'], lowes: ['home', 'improvement', 'hardware', 'diy'], 'ace hardware': ['hardware', 'improvement', 'diy'],
  starbucks: ['coffee', 'cafe'], 'dunkin donuts': ['coffee', 'cafe', 'donut'], 'tim hortons': ['coffee', 'cafe'], 'dutch bros': ['coffee', 'cafe'],
  mcdonalds: ['fast', 'food', 'burger'], wendys: ['fast', 'food', 'burger'], 'five guys': ['burger', 'fast', 'food'], 'shake shack': ['burger', 'fast', 'food'], 'in n out burger': ['burger', 'fast', 'food'], 'taco bell': ['fast', 'food', 'mexican'], chipotle: ['fast', 'food', 'mexican'],
  'chick fil a': ['fast', 'food', 'chicken'], kfc: ['fast', 'food', 'chicken'], subway: ['fast', 'food', 'sandwich'], dominos: ['pizza'], 'papa johns': ['pizza'], 'little caesars': ['pizza'],
  'planet fitness': ['gym', 'fitness'], 'la fitness': ['gym', 'fitness'], equinox: ['gym', 'fitness'], 'orangetheory fitness': ['gym', 'fitness'], crossfit: ['gym', 'fitness'], ymca: ['gym', 'fitness'],
  nike: ['sporting', 'goods', 'sports', 'shoe'], adidas: ['sporting', 'goods', 'sports', 'shoe'], rei: ['sporting', 'goods', 'outdoor'], 'bass pro shops': ['sporting', 'goods', 'outdoor'], cabelas: ['sporting', 'goods', 'outdoor'], 'foot locker': ['shoe', 'sporting', 'goods'],
  cvs: ['pharmacy', 'drugstore'], walgreens: ['pharmacy', 'drugstore'], 'rite aid': ['pharmacy', 'drugstore'], gnc: ['vitamin', 'supplement', 'health'], sephora: ['beauty', 'cosmetics'], 'ulta beauty': ['beauty', 'cosmetics'],
  'best buy': ['electronics', 'technology'], apple: ['electronics', 'technology'], gamestop: ['games', 'gaming', 'electronics'], petsmart: ['pet'], petco: ['pet'],
  marriott: ['hotel'], hilton: ['hotel'], hyatt: ['hotel'], 'holiday inn': ['hotel'], amc: ['cinema', 'movie'], regal: ['cinema', 'movie'], cinemark: ['cinema', 'movie'],
  macys: ['department', 'mall', 'fashion'], nordstrom: ['department', 'mall', 'fashion', 'luxury'], kohls: ['department', 'fashion'], 'tj maxx': ['department', 'discount', 'fashion'],
}

/** True when the text contains a capitalised name, so the writer means a specific brand rather than a kind of place. */
function hasProperName(text: string): boolean {
  return /(?:^|\s)(?!Anyone|Everyone|People|Visitors|Existing|Current|Customers|Regulars|Staff|Shoppers|Add|Also|Include|Plus|And|Please|The|Any|All|Some|Exclude)[A-Z][\w'’&-]+/.test(text.trim())
}

/** A follow-up that offers another option ("add IKEA", "also include Target") rather than a new requirement. */
const ADD_RE = /^\s*(?:please\s+)?(?:and\s+)?(?:also\s+)?(?:add|include|throw in|plus)\s+(?!an?\s+exclusion)(?:in\s+)?/i

/**
 * `brief` is the first message; `followUps` are the later ones in order. `place` is how the geography reads in
 * the name and message, e.g. "Texas and Florida".
 */
export function planLocally(tx: Taxonomy, country: string, brief: string, followUps: string[] = [], place?: string): { message: string; plan: Plan } {
  withheld = []
  const additions = followUps.filter(f => ADD_RE.test(f))
  const briefText = [brief, ...followUps.filter(f => !ADD_RE.test(f))].join('\n')
  const types = typesAvailable(tx, country)
  const has = (t: SegmentType) => types.includes(t)

  // split "exclude ..." clauses out of the main brief
  const exclusionTexts: string[] = []
  const mainText = stripCountry(briefText, country).replace(EXCLUDE_RE, (_, clause: string) => { exclusionTexts.push(clause); return ' ' })
  const groups: PlanCondition[][] = []
  const notes: string[] = []
  const reasonFor = (hits: string[]) => { const u = [...new Set(hits)]; return u.length ? `matches “${u.slice(0, 2).join('”, “')}” in your brief` : 'close match to your brief' }

  // Behaviour: every "and"-joined part of the brief is its own group, so "and" narrows.
  // Inside a part, everything that matches is ORed. Parts that hit the same segments merge.
  const brands: SegmentRow[] = [], cats: SegmentRow[] = [], geo: SegmentRow[] = []
  const labels: string[] = []
  const pick = (type: SegmentType, q: Map<string, number>, limit: number, min?: number) => has(type) ? topMatches(tx, country, type, q, limit, min) : []
  /** what each requirement is about, as word stems, in step with `groups`; used to place "add X" follow-ups */
  const about: Map<string, number>[] = []
  const note = (gi: number, words: Iterable<string>, weight: number) => {
    const m = (about[gi] ??= new Map())
    for (const w of words) if (!WEAK.has(w) && !DESCRIPTOR.has(w)) m.set(stem(w), Math.max(m.get(stem(w)) ?? 0, weight))
  }
  /** the picked segments' own names count double; looser words from the brief and its synonyms count once */
  const noteMatch = (gi: number, q: Map<string, number>, rows: SegmentRow[]) => {
    note(gi, q.keys(), 1)
    note(gi, rows.flatMap(r => [...tokens(r[1]), ...(BRAND_KIND[norm(shortName(r)).trim()] ?? [])]), 2)
  }
  for (const clause of splitClauses(mainText)) {
    let q = query(clause) // may hold no keywords and still name a brand made of filler words ("shop at Target")
    const before = withheld.length
    let b = pick('BRAND', q, 4, 1.2), c = pick('CATEGORY', q, 2), g = pick('GEO_BEHAVIOUR', q, 1)
    if (withheld.length > before) {
      // the clause asked for something restricted: drop its words and what they suggest, so leftovers do not match unrelated places
      const drop = new Set(withheld.slice(before).flatMap(row => tokens(row[1]).flatMap(t => [t, singular(t), ...(SYNONYMS[t] ?? [])])))
      q = queryWithout(q, drop)
      const kept = withheld.length
      b = pick('BRAND', q, 4, 1.2); c = pick('CATEGORY', q, 2); g = pick('GEO_BEHAVIOUR', q, 1)
      withheld.length = kept
    }
    const conds: PlanCondition[] = []
    if (b.length) conds.push({ type: 'BRAND', segmentIds: b.map(x => x.row[0]), reason: reasonFor(b.flatMap(x => x.hits)) })
    if (c.length) conds.push({ type: 'CATEGORY', segmentIds: c.map(x => x.row[0]), reason: reasonFor(c.flatMap(x => x.hits)) })
    if (g.length) conds.push({ type: 'GEO_BEHAVIOUR', segmentIds: g.map(x => x.row[0]), reason: reasonFor(g.flatMap(x => x.hits)) })
    if (!conds.length) continue
    const ids = new Set(conds.flatMap(x => x.segmentIds))
    const gi = groups.findIndex(gr => gr.some(x => x.segmentIds.some(id => ids.has(id))))
    if (gi >= 0) {
      // same idea said twice (e.g. "coffee subscription" and "visit cafes"): widen that group instead of ANDing it with itself
      for (const cond of conds) {
        const ex = groups[gi].find(x => x.type === cond.type)
        if (ex) ex.segmentIds = [...new Set([...ex.segmentIds, ...cond.segmentIds])]
        else groups[gi].push(cond)
      }
      noteMatch(gi, q, [...b, ...c, ...g].map(x => x.row))
    } else {
      groups.push(conds)
      noteMatch(groups.length - 1, q, [...b, ...c, ...g].map(x => x.row))
      const first = (b[0] ?? c[0] ?? g[0]).row
      labels.push(b.length ? `visit ${b.slice(0, 2).map(x => shortName(x.row)).join(' or ')}` : c.length ? `go to ${shortName(first).toLowerCase()} places` : `are ${shortName(first).toLowerCase()}`)
    }
    brands.push(...b.map(x => x.row)); cats.push(...c.map(x => x.row)); geo.push(...g.map(x => x.row))
  }
  // "add X" follow-ups widen an existing requirement instead of creating a new one
  const added: { name: string; gi: number; sure: boolean }[] = []
  const groupName = (gi: number) => {
    const row = cats.find(r => groups[gi].some(x => x.segmentIds.includes(r[0]))) ?? brands.find(r => groups[gi].some(x => x.segmentIds.includes(r[0]))) ?? geo.find(r => groups[gi].some(x => x.segmentIds.includes(r[0])))
    return row ? (brands.includes(row) ? shortName(row) : shortName(row).toLowerCase()) : `requirement ${gi + 1}`
  }
  /** how strongly a set of words points at each requirement */
  const fit = (words: Iterable<string>) => { const ws = [...new Set([...words].map(stem))]; return groups.map((_, gi) => ws.reduce((a, w) => a + (about[gi]?.get(w) ?? 0), 0)) }
  const best = (scores: number[]) => { const top = Math.max(0, ...scores); return top > 0 && scores.filter(x => x === top).length === 1 ? scores.indexOf(top) : -1 }
  for (const f of additions) {
    let text = stripCountry(f.replace(ADD_RE, ''), country)
    // 1. the planner says where it goes: "add IKEA to the furniture requirement", "add Costco next to Target"
    let gi = -1
    let sure = false
    const dest = [...text.matchAll(/\s+(?:to|with|next to|alongside|into|beside)\s+(?:the\s+)?/gi)].pop()
    if (dest && dest.index !== undefined && groups.length > 1) {
      const where = best(fit(tokens(text.slice(dest.index + dest[0].length))))
      if (where >= 0) { gi = where; sure = true; text = text.slice(0, dest.index) }
    }
    const q = query(text)
    // a named brand is added only if the catalogue has it; look-alikes are offered only for a kind of place ("add coffee shops")
    const named = pick('BRAND', q, 4, 3)
    const proper = hasProperName(text)
    const b = named.length ? named : proper ? [] : pick('BRAND', q, 4, 1.2), c = b.length || proper ? [] : pick('CATEGORY', q, 2)
    const type: SegmentType = b.length ? 'BRAND' : 'CATEGORY'
    const found = b.length ? b : c
    if (!found.length) { notes.push(`I couldn't find anything in the catalogue for “${text.trim()}”.`); continue }
    const ids = found.map(x => x.row[0])
    if (gi < 0 && groups.length === 1) { gi = 0; sure = true }
    // 2. the name says what it is ("Academy Sports" belongs with sporting goods); 3. a well-known chain whose name does not
    if (gi < 0) {
      const words = found.flatMap(x => [...tokens(x.row[1]), ...(BRAND_KIND[norm(shortName(x.row)).trim()] ?? [])])
      const where = best(fit([...words, ...q.keys()]))
      if (where >= 0) { gi = where; sure = true }
    }
    // 4. no evidence: next to the brands the brief named, else the first rule of the same type, and say it was a guess
    if (gi < 0 && groups.length) {
      const spelledIds = new Set(brands.filter(r => isNamed(r, briefText)).map(r => r[0]))
      gi = type === 'BRAND' ? groups.findIndex(g => g.some(x => x.type === 'BRAND' && x.segmentIds.some(id => spelledIds.has(id)))) : -1
      if (gi < 0) gi = groups.findIndex(g => g.some(x => x.type === type))
      if (gi < 0) gi = 0
    }
    if (gi < 0) { groups.push([]); gi = groups.length - 1; labels.push(`visit ${shortName(found[0].row)}`); sure = true }
    // asking again with a destination moves it rather than duplicating it
    for (const g of groups) for (const x of g) x.segmentIds = x.segmentIds.filter(id => !ids.includes(id))
    for (let i = 0; i < groups.length; i++) groups[i] = groups[i].filter(x => x.segmentIds.length)
    for (const prior of added) if (found.some(x => shortName(x.row) === prior.name)) prior.gi = -1
    const target = groups[gi]
    const ex = target.find(x => x.type === type)
    if (ex) ex.segmentIds = [...new Set([...ex.segmentIds, ...ids])]
    else target.push({ type, segmentIds: ids, reason: 'you asked to add this' })
    ;(b.length ? brands : cats).push(...found.map(x => x.row))
    note(gi, found.flatMap(x => [...tokens(x.row[1]), ...(BRAND_KIND[norm(shortName(x.row)).trim()] ?? [])]), 2)
    added.push(...found.map(x => ({ name: shortName(x.row), gi, sure })))
  }
  const offlineCount = groups.length

  // Demographic narrowing (AND)
  const ages = has('AGE') ? ageIds(tx, country, mainText) : []
  if (ages.length) groups.push([{ type: 'AGE', segmentIds: ages, reason: 'age range mentioned in your brief' }])
  const genders = has('GENDER') ? genderIds(tx, country, mainText) : []
  if (genders.length) groups.push([{ type: 'GENDER', segmentIds: genders, reason: 'gender mentioned in your brief' }])

  // Exclusions
  const exclude: PlanCondition[] = []
  for (const clause of exclusionTexts) {
    const eq = query(clause)
    const heldBefore = withheld.length
    // only exclude brands the brief spells out; a look-alike would silently remove the wrong people
    const eb = has('BRAND') ? topMatches(tx, country, 'BRAND', eq, 3, 3) : []
    const namesSomething = hasProperName(clause)
    if (eb.length) exclude.push({ type: 'BRAND', segmentIds: eb.map(b => b.row[0]), reason: `you asked to exclude “${clause.trim()}”` })
    else if (withheld.length > heldBefore) { /* restricted: explained once, below */ }
    else if (namesSomething) notes.push(`I couldn't find “${clause.trim()}” in the catalogue, so it is not excluded.`)
    else {
      const ec = has('CATEGORY') ? topMatches(tx, country, 'CATEGORY', eq, 2) : []
      if (ec.length) exclude.push({ type: 'CATEGORY', segmentIds: ec.map(c => c.row[0]), reason: `you asked to exclude “${clause.trim()}”` })
    }
  }

  if (withheld.length) {
    const unique = [...new Map(withheld.map(r => [r[0], r])).values()]
    const kinds = [...new Set(unique.map(r => sensitivityOf(r[1])!.label.toLowerCase()))]
    notes.push(`I left out ${unique.slice(0, 3).map(shortName).join(', ')}${unique.length > 3 ? ' and similar' : ''}. ${unique.length > 1 ? 'They fall' : 'It falls'} under ${kinds.join(' and ')}, which is restricted and cannot be used for targeting or exclusion.`)
  }
  const questions: string[] = []
  if (!groups.length) {
    return {
      message: withheld.length
        ? `${notes[notes.length - 1]} Try a behaviour that is not sensitive, such as gyms, grocery stores or health food shops.`
        : "I couldn't match that brief to anything in the catalogue yet. Try naming the brands, kinds of places, or behaviours you care about, for example “people who visit gyms and shop at Target”.",
      plan: { ...plan0(), questions: ['Which brands or kinds of places does your customer visit?'] },
    }
  }
  if (!brands.length && !cats.length) questions.push('Any specific brands or places you want to anchor on?')
  if (!ages.length && has('AGE')) questions.push('Should I narrow by age?')
  if (exclusionTexts.length && !exclude.length && !withheld.length && !notes.some(n => n.includes('not excluded'))) notes.push("I couldn't find segments for your exclusion, so I left it out.")

  const parts = labels
  const countryName = tx.countries.find(c => c.code === country)?.name ?? country
  const placeName = place ?? countryName
  const nameFor = (gs: PlanCondition[][]) => {
    // lead with a brand only when the brief asked for it by name; otherwise the kind of place says more
    const spelled = brands.find(b => isNamed(b, briefText))
    const anchor = shortName(spelled ?? cats[0] ?? geo[0] ?? brands[0])
    const narrowed = gs.some(g => g.some(c => c.type === 'AGE' || c.type === 'GENDER'))
    return [anchor, narrowed ? 'narrowed' : '', placeName].filter(Boolean).join(' · ').slice(0, 56)
  }

  const mods = applyFollowUps(groups, followUps)
  if (mods.message) {
    return { message: mods.message, plan: { name: nameFor(mods.groups), summary: parts.join(' AND '), include: mods.groups, exclude, questions: [] } }
  }
  const name = nameFor(groups)

  const lastWasAddition = followUps.length > 0 && ADD_RE.test(followUps[followUps.length - 1])
  if (lastWasAddition) {
    // report only what the latest follow-up placed
    const lastText = norm(followUps[followUps.length - 1])
    const placed = added.filter(a => a.gi >= 0 && lastText.includes(norm(a.name).trim().split(' ')[0]))
    const now = placed.length ? placed : added.filter(a => a.gi >= 0).slice(-1)
    if (!now.length) return { message: notes[notes.length - 1] ?? "I couldn't find that in the catalogue.", plan: { name, summary: parts.join(' AND '), include: groups, exclude, questions: [] } }
    const gi = now[0].gi
    const names = [...new Set(now.map(a => a.name))].slice(0, 4).join(', ')
    const others = groups.map((_, i) => i).filter(i => i !== gi && i < offlineCount)
    const guess = !now[0].sure && others.length > 0
    const message = [
      `Added ${names} to the ${groupName(gi)} requirement as another option, so it widens that requirement.`,
      guess ? `I couldn't tell from the name which requirement it belongs to, so that is a guess. Pick another below to move it.` : '',
      'Say “must also visit …” if it should be a requirement of its own.',
    ].filter(Boolean).join(' ')
    const moves = guess ? others.map(i => `Add ${now[0].name} to the ${groupName(i)} requirement`) : []
    return { message, plan: { name, summary: parts.join(' AND '), include: groups, exclude, questions: moves } }
  }

  const message = [
    `Here's a starting point for ${placeName}: people who ${parts.join(', and ')}${ages.length || genders.length ? ', narrowed by demographics' : ''}.`,
    parts.length > 1 ? `I read each “and” in your brief as a requirement, so ${parts.length === 2 ? 'both' : `all ${parts.length}`} must match. Say “make it broader” if that is too tight.` : '',
    'Change anything in the sentence, or tell me how to adjust it.',
    ...notes,
  ].filter(Boolean).join(' ')

  return { message, plan: { name, summary: parts.join(' AND '), include: groups, exclude, questions } }
}

/** Crude intent handling for follow-up chips, so the offline planner reacts to them. */
function applyFollowUps(groups: PlanCondition[][], followUps: string[]): { groups: PlanCondition[][]; message: string } {
  let out = groups.map(g => g.map(c => ({ ...c, segmentIds: [...c.segmentIds] })))
  let message = ''
  for (const raw of followUps) {
    const f = raw.toLowerCase()
    if (/drop|remove|without|no\b/.test(f) && /demograph|age|gender|women|men/.test(f)) {
      out = out.filter(g => !g.every(c => c.type === 'AGE' || c.type === 'GENDER'))
      message = 'Dropped the demographic narrowing. The audience is now behaviour only.'
    } else if (/broad|wider|bigger|more reach|expand/.test(f)) {
      const merged: PlanCondition[] = []
      for (const c of out.flat()) {
        if (c.type === 'AGE' || c.type === 'GENDER') continue
        const ex = merged.find(x => x.type === c.type)
        if (ex) ex.segmentIds = [...new Set([...ex.segmentIds, ...c.segmentIds])]
        else merged.push(c)
      }
      out = merged.length ? [merged] : out
      message = 'Broadened it: matching any one of the behaviours is now enough, and I removed the demographic narrowing.'
    } else if (/narrow|tighter|smaller|specific|focus/.test(f)) {
      out = out.map(g => g.map(c => c.type === 'AGE' || c.type === 'GENDER' ? c : ({ ...c, segmentIds: c.segmentIds.slice(0, 2) })))
      message = 'Narrowed it: I kept the two strongest segments in each behaviour and left the narrowing in place.'
    } else if (/swap|different brands|other brands|change the brands/.test(f)) {
      message = 'Tell me which brands to use instead and I will swap them in.'
    } else if (/add an exclusion|exclude/.test(f) && !/exclud(?:e|ing)\s+\w/.test(f)) {
      message = 'Who should be excluded? Name a brand or kind of place, for example “exclude Decathlon visitors”.'
    }
  }
  return { groups: out, message }
}

function plan0(): Plan { return { name: '', summary: '', include: [], exclude: [], questions: [] } }
