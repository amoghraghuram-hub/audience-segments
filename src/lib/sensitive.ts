/**
 * Sensitive-place policy for audience building.
 *
 * `blocked` segments cannot be used at all, as an include, a "has not" or an exclusion, because a visit there can
 * reveal something a person has not chosen to share (health, faith, hardship, being a child).
 * `caution` segments can be used, but destinations restrict the ads they may carry (alcohol, tobacco, gambling)
 * or the visit can hint at a health condition (pharmacies).
 *
 * PLACEHOLDER POLICY. It is modelled on the sensitive-location lists in recent US regulator orders and industry
 * codes, matched on segment names. Legal and privacy should own the real list, ideally as a flag in the catalogue.
 */
export interface Sensitivity {
  level: 'blocked' | 'caution'
  /** short label for tags, e.g. "Medical care" */
  label: string
  /** one sentence a planner can act on */
  why: string
}

interface Rule extends Sensitivity { test: RegExp; except?: RegExp }

const RULES: Rule[] = [
  { level: 'blocked', label: 'Medical care', why: 'Visits to medical providers can reveal a health condition.',
    test: /\b(hospitals?|clinics?|medical|medicine|urgent care|dental|dentists?|oncology|cancer|fertility|reproductive|planned parenthood|mental health|psychiatr\w*|rehab|addiction|dialysis|hospice)\b|minuteclinic/i,
    except: /\b(pet|animal|veterinary|vet)\b|hospitality|\bjobs\b/i },
  { level: 'blocked', label: 'Elder care', why: 'Visits to care homes can reveal age, health or family circumstances.',
    test: /\b(elderly|nursing homes?|assisted living|senior living|retirement homes?)\b/i },
  { level: 'blocked', label: 'Places for children', why: 'Schools and childcare are places mainly for children.',
    test: /\b(preschool|kindercare|kindergarten|daycare|day care|childcare|child care|elementary|middle school|high school|schools?)\b|kids\s*['’]?r['’]?\s*kids/i,
    except: /\b(driving|language|private|adult|beauty|business|old)\s+schools?\b|back to school|parents of school|homeschool/i },
  { level: 'blocked', label: 'Worship and social services', why: 'Visits can reveal religious belief or personal hardship.',
    test: /\b(church|mosque|synagogue|temple|chapel|cathedral|ministry|ministries|worship|salvation army|shelters?|food bank)\b/i,
    except: /church['’]?s chicken/i },
  { level: 'blocked', label: 'Financial hardship', why: 'Visits can reveal that someone is in financial difficulty.',
    test: /\b(pawn|payday|bail bonds?|bankruptcy|credit repair|check cashing|title loans?)\b|ezpawn/i },
  { level: 'blocked', label: 'Justice, military and immigration', why: 'These places are protected locations.',
    test: /\b(prison|jail|correctional|detention|courthouse|immigration)\b|\b(military|army|naval|air force) base\b/i },
  { level: 'blocked', label: 'Sexual orientation or adult venues', why: 'Visits can reveal sexual orientation or private behaviour.',
    test: /\b(gay|lgbtq?\+?|strip club|adult (entertainment|stores?))\b/i },

  { level: 'caution', label: 'Alcohol', why: 'Most destinations only allow alcohol ads to adults and ban them in some states.',
    test: /\b(liquors?|wine|beer|brewery|distillery|spirits)\b/i },
  { level: 'caution', label: 'Tobacco and cannabis', why: 'Many destinations ban tobacco, vape and cannabis ads outright.',
    test: /\b(tobacco|vape|cigars?|smoke shop|cannabis|dispensar(y|ies)|marijuana)\b/i },
  { level: 'caution', label: 'Gambling', why: 'Gambling ads need destination approval and are illegal in some states.',
    test: /\b(casinos?|gambling|betting|lottery|sportsbook)\b/i },
  { level: 'caution', label: 'Pharmacy', why: 'Pharmacy visits can hint at a health condition, so do not pair them with health messaging.',
    test: /\b(pharmacy|pharmacies|drugs?|drugstore)\b/i },
]

const cache = new Map<string, Sensitivity | null>()

/** The policy verdict for a segment, by its catalogue name. Null means no restriction. */
export function sensitivityOf(segmentName: string): Sensitivity | null {
  let hit = cache.get(segmentName)
  if (hit === undefined) {
    const name = segmentName.replace(/ (Visitors|Shoppers)$/i, '')
    const rule = RULES.find(r => r.test.test(name) && !(r.except && r.except.test(name)))
    hit = rule ? { level: rule.level, label: rule.label, why: rule.why } : null
    cache.set(segmentName, hit)
  }
  return hit
}

export const isBlocked = (segmentName: string) => sensitivityOf(segmentName)?.level === 'blocked'
