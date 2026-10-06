// Breeding at mob level (Tier 1): joining, pregnancy testing, marking and
// weaning. Expected birth dates = joining start/end + gestation days for the
// species (farm settings), as the database works them out.
import type { Row } from './db'
import type { NewRecord } from './sync'
import { addDays } from './withholds'

export const DEFAULT_GESTATION: Record<string, number> = { cattle: 283, sheep: 150, goat: 150 }

export function expectedBirths(start: string, end: string | null, species: string, gestation: Record<string, number> | null | undefined): { from: string; to: string } | null {
  const days = (gestation ?? DEFAULT_GESTATION)[species]
  if (!days) return null
  return { from: addDays(start, days), to: addDays(end || start, days) }
}

export function joiningValues(j: { mobId: string; species: string; sireMobId: string | null; sireDescription: string; paddockId: string | null; start: string; end: string | null; notes: string }, gestation?: Record<string, number> | null): Row {
  const due = expectedBirths(j.start, j.end, j.species, gestation)
  return {
    mob_id: j.mobId, sire_mob_id: j.sireMobId, sire_description: j.sireDescription.trim() || null, paddock_id: j.paddockId,
    start_date: j.start, end_date: j.end || null, expected_birth_start: due?.from ?? null, expected_birth_end: due?.to ?? null, notes: j.notes.trim() || null,
  }
}

// Marking adds the young to the mob they're with, through a birth_marking
// stock event, and keeps the male/female counts.
export function markingPlan(m: { mobId: string; date: string; joiningId: string | null; males: number; females: number; maleClassId: string | null; femaleClassId: string | null; notes: string }): NewRecord[] {
  const eventId = crypto.randomUUID()
  const lines: NewRecord[] = []
  if (m.males > 0) lines.push({ table: 'stock_event_lines', values: { stock_event_id: eventId, mob_id: m.mobId, livestock_class_id: m.maleClassId, head_change: m.males } })
  if (m.females > 0) lines.push({ table: 'stock_event_lines', values: { stock_event_id: eventId, mob_id: m.mobId, livestock_class_id: m.femaleClassId, head_change: m.females } })
  return [
    { table: 'stock_events', values: { id: eventId, event_date: m.date, event_type: 'birth_marking', notes: m.notes.trim() || null } },
    ...lines,
    { table: 'birth_markings', values: { stock_event_id: eventId, joining_id: m.joiningId, marking_date: m.date, males: m.males, females: m.females, notes: m.notes.trim() || null } },
  ]
}

// The latest joining for a mob, and when they're due.
export function latestJoining(joinings: Row[], mobId: string): Row | null {
  return joinings.filter((j) => j.mob_id === mobId).sort((a, b) => String(b.start_date).localeCompare(String(a.start_date)))[0] ?? null
}
