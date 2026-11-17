import type { Taxonomy } from './taxonomy'
import type { ChatTurn, PlannerReply } from './plan'
import { HOME_COUNTRY, describeGeo, detectGeo, hasGeo, type GeoFilter } from './geo'
import { planLocally } from './brief'
import { hasPlannerKey, planWithClaude } from './claude'

/**
 * The audience planner: turns a brief conversation into a plan.
 *
 * In the product this is one internal Factori service, and the app neither knows nor shows how it works.
 * This function is the single place the prototype stands in for that service. It uses the Claude planner when a
 * developer has set VITE_ANTHROPIC_API_KEY, and otherwise a built-in stand-in (brief.ts) so the flow can be
 * demonstrated. Replace the body with a call to the internal service; nothing else needs to change.
 */
export async function planBrief(tx: Taxonomy, history: ChatTurn[], geo: GeoFilter, signal?: AbortSignal): Promise<PlannerReply> {
  if (hasPlannerKey()) return planWithClaude(tx, HOME_COUNTRY, history, signal)
  // place names belong to the geography filter, not to segment matching
  const said = history.filter(t => t.role === 'user').map(t => detectGeo(t.text).rest)
  await new Promise(r => setTimeout(r, 450)) // let the typing indicator read as "thinking"
  return planLocally(tx, HOME_COUNTRY, said[0], said.slice(1), hasGeo(geo) ? describeGeo(geo, 2) : 'United States')
}
