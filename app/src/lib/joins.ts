// Paddocks joined by an open gate (paddock_joins): a mob in any of them
// counts as grazing all of them while the gate is open.
import type { Row } from './db'
import { paddockRest, type StockData } from './stock'

export const openJoins = (joins: Row[]) => joins.filter((j) => !j.deleted_at && !j.closed_on && Array.isArray(j.paddock_ids))

// The open join a paddock is part of, if any.
export function joinOf(joins: Row[], paddockId: string): Row | null {
  return openJoins(joins).find((j) => (j.paddock_ids as string[]).includes(paddockId)) ?? null
}

// The paddocks a paddock is joined with (not counting itself).
export function joinedWith(joins: Row[], paddockId: string): string[] {
  const j = joinOf(joins, paddockId)
  return j ? (j.paddock_ids as string[]).filter((p) => p !== paddockId) : []
}

// A paddock and everything joined to it.
export const groupOf = (joins: Row[], paddockId: string) => [paddockId, ...joinedWith(joins, paddockId)]

// Grazing and rest across joined paddocks: grazed if any mob is in any of
// them; rested for the shortest rest among them.
export function paddockRestJoined(s: StockData, joins: Row[], paddockId: string, today: string, heads: Map<string, number>): { grazing: string[]; restedDays: number | null } {
  const each = groupOf(joins, paddockId).map((p) => paddockRest(s, p, today, heads))
  const grazing = [...new Set(each.flatMap((r) => r.grazing))]
  const rested = each.map((r) => r.restedDays).filter((d): d is number => d !== null)
  return { grazing, restedDays: grazing.length > 0 || rested.length === 0 ? null : Math.min(...rested) }
}

// Open a gate from a paddock to others: joins them all (adding to an open
// join the paddock is already in).
export function openGatePlan(joins: Row[], propertyId: string, paddockId: string, others: string[], date: string):
  { adds: { table: string; values: Row }[]; edits: { table: string; id: string; changes: Row }[] } {
  const existing = joinOf(joins, paddockId)
  const touched = others.map((o) => joinOf(joins, o)).filter((j): j is Row => !!j && j.id !== existing?.id)
  const ids = [...new Set([paddockId, ...others, ...((existing?.paddock_ids as string[]) ?? []), ...touched.flatMap((j) => j.paddock_ids as string[])])]
  const close = touched.map((j) => ({ table: 'paddock_joins', id: String(j.id), changes: { closed_on: date } }))
  if (existing) return { adds: [], edits: [{ table: 'paddock_joins', id: String(existing.id), changes: { paddock_ids: ids } }, ...close] }
  return { adds: [{ table: 'paddock_joins', values: { property_id: propertyId, paddock_ids: ids, opened_on: date } }], edits: close }
}

// Close the gate: the paddock leaves the join (the join closes if fewer than
// two would be left).
export function closeGatePlan(joins: Row[], paddockId: string, date: string): { table: string; id: string; changes: Row }[] {
  const j = joinOf(joins, paddockId)
  if (!j) return []
  const rest = (j.paddock_ids as string[]).filter((p) => p !== paddockId)
  if (rest.length >= 2) return [{ table: 'paddock_joins', id: String(j.id), changes: { paddock_ids: rest } }]
  return [{ table: 'paddock_joins', id: String(j.id), changes: { closed_on: date } }]
}
