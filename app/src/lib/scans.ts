// Reading a wand's scan file (CSV or text exported from a Gallagher,
// Tru-Test/Datamars, Allflex or Agrident reader, or its app). Finds the tag
// column by its heading (EID, RFID, Electronic ID, Tag...) or, failing
// that, by what's in it; keeps each tag once.
//   EID:     15 digits, e.g. 982 000123456789 (ISO 11784; spaces or dashes allowed)
//   NLIS ID: 16 letters and digits, e.g. 3ABCD123XBC01234
import { parseCsv } from './importers'
import type { NewRecord } from './sync'

export type ScanResult = {
  tags: string[]
  repeats: number
  unreadable: number
  kind: 'eid' | 'nlis' | 'mixed'
  column: string | null
}

const clean = (v: string) => v.trim().replace(/^"|"$/g, '').replace(/[\s-]/g, '').toUpperCase()
const isEid = (v: string) => /^\d{15}$/.test(v)
const isNlis = (v: string) => /^[0-9A-Z]{16}$/.test(v) && /[A-Z]/.test(v)
const isTag = (v: string) => isEid(v) || isNlis(v)
const HEADINGS = /^(eid|rfid|electronic ?id|electronic tag|e ?id number|tag( ?(number|no\.?|id))?|nlis( ?id| ?device)?|transponder|animal ?id|id)$/i

export function parseScan(text: string): ScanResult {
  // Some readers write one tag per line with no commas, or use semicolons/tabs.
  const normal = text.replace(/\t|;/g, ',')
  const rows = parseCsv(normal)
  if (rows.length === 0) return { tags: [], repeats: 0, unreadable: 0, kind: 'eid', column: null }

  let col = -1
  let start = 0
  let column: string | null = null
  // A heading row: find the tag column by name (prefer an exact EID/RFID name).
  const head = rows[0].map((h) => h.trim())
  const named = head.findIndex((h) => HEADINGS.test(h))
  if (named >= 0 && !isTag(clean(head[named]))) { col = named; start = 1; column = head[named] }
  // Otherwise the column whose values look most like tags.
  if (col < 0) {
    const width = Math.max(...rows.map((r) => r.length))
    let best = 0
    for (let c = 0; c < width; c++) {
      const hits = rows.filter((r) => isTag(clean(r[c] ?? ''))).length
      if (hits > best) { best = hits; col = c }
    }
    start = rows[0] && !isTag(clean(rows[0][col] ?? '')) ? 1 : 0
  }
  if (col < 0) return { tags: [], repeats: 0, unreadable: rows.length - 1, kind: 'eid', column: null }

  const seen = new Set<string>()
  let repeats = 0, unreadable = 0, eids = 0, nlis = 0
  for (const r of rows.slice(start)) {
    const v = clean(r[col] ?? '')
    if (!v) continue
    if (!isTag(v)) { unreadable++; continue }
    if (seen.has(v)) { repeats++; continue }
    seen.add(v)
    if (isEid(v)) eids++; else nlis++
  }
  return { tags: [...seen], repeats, unreadable, kind: eids && nlis ? 'mixed' : nlis ? 'nlis' : 'eid', column }
}

// "982 000123456789" for EIDs; NLIS IDs as they are.
export const fmtTag = (t: string) => (isEid(t) ? `${t.slice(0, 3)} ${t.slice(3)}` : t)

// Put a scan on a movement or count: the tags on its stock record, the
// wand's file attached to it.
export async function withScan(adds: NewRecord[], scan: { tags: string[]; file: File } | null,
  attach: (eventId: string, files: File[]) => Promise<NewRecord[]>): Promise<NewRecord[]> {
  if (!scan) return adds
  const event = adds.find((a) => a.table === 'stock_events')
  if (!event) return adds
  event.values.scanned_eids = scan.tags
  // Readers save CSV under various types; the farm's store takes text/csv.
  const file = new File([scan.file], scan.file.name, { type: /\.txt$/i.test(scan.file.name) ? 'text/plain' : 'text/csv' })
  return [...adds, ...(await attach(String(event.values.id), [file]))]
}
