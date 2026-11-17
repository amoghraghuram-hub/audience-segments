import Anthropic from '@anthropic-ai/sdk'
import type { Taxonomy } from './taxonomy'
import { catalogueText, sanitizePlan, type ChatTurn, type PlannerReply } from './plan'

export const MODEL = 'claude-opus-5-5'

/** Developer-only: the key comes from the environment at build time. Users never see or enter one. */
function getApiKey(): string { return (import.meta.env.VITE_ANTHROPIC_API_KEY as string | undefined) ?? '' }
export function hasPlannerKey(): boolean { return !!getApiKey() }

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['message', 'plan'],
  properties: {
    message: { type: 'string', description: 'Short reply to the planner, 1-3 sentences, plain prose. No markdown, no segment IDs.' },
    plan: {
      type: 'object',
      additionalProperties: false,
      required: ['name', 'summary', 'include', 'exclude', 'questions'],
      properties: {
        name: { type: 'string', description: 'Segment name, max 40 characters.' },
        summary: { type: 'string', description: 'One line describing who is in the audience.' },
        include: {
          type: 'array',
          description: 'Groups are ANDed. Conditions inside a group are ORed. Group 1 is usually the core offline behaviour; later groups narrow it.',
          items: { type: 'array', items: { $ref: '#/$defs/condition' } },
        },
        exclude: { type: 'array', items: { $ref: '#/$defs/condition' } },
        questions: { type: 'array', items: { type: 'string' }, description: 'At most 2 short clarifying questions, only if they would change the audience.' },
      },
    },
  },
  $defs: {
    condition: {
      type: 'object',
      additionalProperties: false,
      required: ['type', 'segmentIds', 'reason'],
      properties: {
        type: { type: 'string', enum: ['BRAND', 'CATEGORY', 'GEO_BEHAVIOUR', 'AGE', 'GENDER', 'DEVICE_CARRIER'] },
        segmentIds: { type: 'array', items: { type: 'string' }, description: 'IDs copied exactly from the catalogue.' },
        reason: { type: 'string', description: 'Why this condition fits the brief, under 12 words.' },
      },
    },
  },
} as const

function systemPrompt(tx: Taxonomy, country: string): Anthropic.TextBlockParam[] {
  const countryName = tx.countries.find(c => c.code === country)?.name ?? country
  const rules = `You are the audience planner inside Factori Audience Studio. A media planner pastes a campaign brief; you translate it into an audience built from Factori's offline-behaviour segment catalogue for ${countryName}.

How segments combine: the plan has include groups and exclusions. Conditions inside a group are ORed (any match), groups are ANDed (all must match), exclusions are removed last. Every segment is a count of devices observed in the last ${tx.lookbackDays} days.

Rules:
- Use only segment IDs that appear in the catalogue below, copied exactly. Never invent IDs or names.
- Audiences are built only from real-world behaviour: BRAND, CATEGORY and GEO_BEHAVIOUR. There are no online, browsing, app or purchase-intent segments. If the brief asks for online interest, say it is not available and offer the nearest real-world behaviour.
- Keep it tight: 3 to 10 segments in total. Prefer specific brands and place categories over broad ones. One condition per type per group.
- Put the core behaviour in group 1 as ORed conditions. Add AGE or GENDER as their own groups only when the brief states them. Don't add DEVICE_CARRIER unless asked.
- Translate exclusions the brief asks for (competitors, existing customers, staff) into the exclude list when a matching segment exists.
- Reach matters: if everything you picked is tiny, broaden; if it's the whole country, narrow.
- Some kinds of place are restricted and are not in the catalogue: medical providers, care homes, schools and childcare, places of worship, shelters, pawn and payday lenders. If the brief asks for one, say plainly that it cannot be targeted and offer a nearby non-sensitive behaviour instead. Never work around it.
- Geography is handled outside the plan. Coverage is the United States only, and the app turns any state or city in the brief into a State and City filter. Never pick a segment because its name contains a place name, and do not ask which country.
- A named brand means that brand. Do not add look-alike brands that merely share a word with it or with the product being advertised.
- "Who have not visited X" and "never go to X" are exclusions.
- When the planner says "add X", put X in an existing group as another option. Add a new group only when they say it is a requirement.
- When the planner follows up (narrow, broaden, swap, exclude), return the full updated plan, not a diff.
- Ask at most 2 questions, and only when the answer would change the audience. Otherwise return an empty questions list.
- The message is short, friendly and concrete: what you picked and why in one or two sentences. No markdown, no IDs.`
  const catalogue = `# Segment catalogue — ${countryName} (${tx.version})\nFormat: ID|Name|devices\n\n${catalogueText(tx, country)}`
  return [
    { type: 'text', text: rules },
    { type: 'text', text: catalogue, cache_control: { type: 'ephemeral' } },
  ]
}

export async function planWithClaude(tx: Taxonomy, country: string, turns: ChatTurn[], signal?: AbortSignal): Promise<PlannerReply> {
  const client = new Anthropic({ apiKey: getApiKey(), dangerouslyAllowBrowser: true })
  const messages: Anthropic.Beta.BetaMessageParam[] = turns.map(t => ({
    role: t.role,
    content: t.role === 'assistant' && t.reply ? JSON.stringify(t.reply) : t.text,
  }))
  const res = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 4000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system: systemPrompt(tx, country),
    output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA as unknown as Record<string, unknown> } },
    messages,
  }, { signal })

  if (res.stop_reason === 'refusal') throw new Error('The planner declined this brief. Try rephrasing it.')
  const text = res.content.filter(b => b.type === 'text').map(b => b.text).join('')
  let parsed: PlannerReply
  try { parsed = JSON.parse(text) as PlannerReply } catch { throw new Error('The planner returned something I could not read. Try again.') }
  return { message: parsed.message, plan: parsed.plan ? sanitizePlan(tx, country, parsed.plan) : null }
}

/** What the user is told when planning fails. The cause goes to the console for whoever runs the service. */
export function describeError(e: unknown): string {
  console.error('[planner]', e)
  if (e instanceof Anthropic.RateLimitError) return 'The planner is busy right now. Wait a moment and try again.'
  if (e instanceof Anthropic.APIConnectionError) return 'Could not reach the planner. Check your connection and try again.'
  return 'The planner could not draft that just now. Try again, or build the sentence by hand below.'
}
