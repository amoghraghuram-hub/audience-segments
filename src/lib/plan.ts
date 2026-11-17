import type { AudienceDefinition, Condition } from './model'
import type { GeoFilter } from './geo'
import { uid } from './model'
import { indexFor, TYPE_ORDER, segmentsFor, type SegmentType, type Taxonomy } from './taxonomy'
import { isBlocked } from './sensitive'

/** One proposed condition: "<type> is any of <segmentIds>", with the planner's reasoning. */
export interface PlanCondition {
  type: SegmentType
  segmentIds: string[]
  reason: string
}

/** What the planner proposes for a brief. Groups are AND'd, conditions inside a group OR'd. */
export interface Plan {
  name: string
  summary: string
  include: PlanCondition[][]
  exclude: PlanCondition[]
  questions: string[]
}

export interface PlannerReply {
  message: string
  plan: Plan | null
}

export type ChatRole = 'user' | 'assistant'
export interface ChatTurn { role: ChatRole; text: string; reply?: PlannerReply }

export const EMPTY_PLAN: Plan = { name: '', summary: '', include: [], exclude: [], questions: [] }

/** Drop segment ids that are not in the country's catalogue or are restricted by the sensitive-place policy, and prune empty conditions/groups. */
export function sanitizePlan(tx: Taxonomy, country: string, plan: Plan): Plan {
  const idx = indexFor(tx, country)
  const clean = (c: PlanCondition): PlanCondition | null => {
    const ids = [...new Set(c.segmentIds)].filter(id => idx.get(id)?.type === c.type && !isBlocked(idx.get(id)!.row[1]))
    return ids.length ? { ...c, segmentIds: ids } : null
  }
  const include = plan.include.map(g => g.map(clean).filter((c): c is PlanCondition => !!c)).filter(g => g.length)
  const exclude = plan.exclude.map(clean).filter((c): c is PlanCondition => !!c)
  return { ...plan, include, exclude, questions: plan.questions ?? [] }
}

export function planHasRules(plan: Plan | null): boolean {
  return !!plan && plan.include.some(g => g.some(c => c.segmentIds.length))
}

/** Convert a plan into a builder definition, skipping any segment the user switched off. */
export function planToDefinition(plan: Plan, country: string, disabled: Set<string>, geo: GeoFilter = { states: [], cities: [] }): AudienceDefinition {
  const cond = (c: PlanCondition): Condition | null => {
    const ids = c.segmentIds.filter(id => !disabled.has(id))
    return ids.length ? { id: uid(), type: c.type, segmentIds: ids } : null
  }
  const include = plan.include
    .map(g => g.map(cond).filter((c): c is Condition => !!c))
    .filter(g => g.length)
    .map(conditions => ({ id: uid(), conditions }))
  return {
    name: plan.name,
    country,
    geo,
    include: include.length ? include : [{ id: uid(), conditions: [] }],
    exclude: plan.exclude.map(cond).filter((c): c is Condition => !!c),
  }
}

/** Compact catalogue listing for a country, one line per segment, for the model's context. */
export function catalogueText(tx: Taxonomy, country: string): string {
  const lines: string[] = []
  for (const t of TYPE_ORDER) {
    const rows = segmentsFor(tx, country, t)
    if (!rows.length) continue
    lines.push(`## ${t} — ${tx.types[t].label}: ${tx.types[t].hint}`)
    // restricted segments are left out, so the planner cannot pick them
    for (const r of rows) if (!isBlocked(r[1])) lines.push(`${r[0]}|${r[1]}|${r[2]}`)
  }
  return lines.join('\n')
}

/** A brief conversation and what it last wrote into the sentence, kept with the segment so it can be picked up later. */
export interface BriefSession {
  turns: ChatTurn[]
  /** the last plan written into the sentence */
  lastPlan: Plan | null
  /** signature of the sentence as the assistant last wrote it, to detect hand edits */
  lastWritten: string
  /** true once the sentence has been changed by hand since a full draft */
  edited: boolean
  /** the name the last draft gave the segment */
  draftedName: string
  /** the sentence as it was before the assistant's latest change, while that change can still be undone */
  undo?: BriefUndo | null
}

export interface BriefUndo {
  def: AudienceDefinition
  /** the change rewrote the sentence rather than adding to it */
  replaced: boolean
  /** the rewrite discarded changes made by hand */
  lostEdits: boolean
}
