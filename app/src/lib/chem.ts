// Chemical stock on the phone. Mirrors public.chemical_on_hand: on hand =
// received - used - written off ± stocktake. The database writes a "used"
// ledger line for each treatment item that takes from a batch; on the phone
// we work that out from the items themselves, so it's right before syncing.
import type { Row } from './db'

export type ChemData = {
  products: Row[]
  batches: Row[]
  ledger: Row[]
  treatments: Row[]
  items: Row[]
}

export type LedgerEntry = {
  date: string
  kind: 'received' | 'used' | 'written_off' | 'stocktake_adjustment'
  quantity: number
  text: string
  ledgerId?: string
  itemId?: string
}

export type BatchView = {
  id: string
  row: Row
  productId: string
  batchNumber: string | null
  expiry: string | null
  onHand: number
  entries: LedgerEntry[]
  expired: boolean
  expiringSoon: boolean
}

export type ProductView = {
  id: string
  row: Row
  name: string
  kind: string
  unit: string
  onHand: number
  batches: BatchView[]
  needsStocktake: boolean
  expiringSoon: boolean
}

const WRITE_OFF: Record<string, string> = {
  expired: 'expired', leaked_spilled: 'leaked or spilled', damaged: 'damaged', disposed: 'disposed', returned: 'returned', other: 'other',
}

export function chemicalStock(d: ChemData, today: string, soon: string, mobName: (id: string) => string): ProductView[] {
  const treatments = new Map(d.treatments.filter((t) => !t.deleted_at).map((t) => [String(t.id), t]))
  const live = (r: Row) => !r.deleted_at

  const batches = d.batches.filter(live).map<BatchView>((b) => {
    const entries: LedgerEntry[] = []
    for (const l of d.ledger) {
      // "used" lines from records are worked out from the records below.
      if (!live(l) || l.batch_id !== b.id || l.source_id) continue
      const kind = String(l.entry_type) as LedgerEntry['kind']
      const text = kind === 'received' ? 'Received' : kind === 'written_off' ? `Written off: ${WRITE_OFF[String(l.write_off_reason)] ?? 'other'}`
        : kind === 'stocktake_adjustment' ? 'Stocktake' : 'Used'
      entries.push({ date: String(l.entry_date), kind, quantity: Number(l.quantity), text: l.notes ? `${text} · ${l.notes}` : text, ledgerId: String(l.id) })
    }
    for (const i of d.items) {
      const t = treatments.get(String(i.treatment_id))
      if (!live(i) || !t || i.batch_id !== b.id || i.quantity_used === null || i.quantity_used === undefined || i.quantity_used === '') continue
      entries.push({ date: String(t.treatment_date), kind: 'used', quantity: -Math.abs(Number(i.quantity_used)), text: `Used on ${t.mob_id ? mobName(String(t.mob_id)) : String(t.livestock_description ?? 'stock')}`, itemId: String(i.id) })
    }
    entries.sort((a, b2) => (a.date < b2.date ? 1 : a.date > b2.date ? -1 : 0))
    const expiry = b.expiry_date ? String(b.expiry_date) : null
    return {
      id: String(b.id), row: b, productId: String(b.product_id),
      batchNumber: b.batch_number ? String(b.batch_number) : null, expiry,
      onHand: round(entries.reduce((n, e) => n + e.quantity, 0)),
      entries,
      expired: !!expiry && expiry < today,
      expiringSoon: !!expiry && expiry <= soon,
    }
  })

  return d.products.filter((p) => live(p) && !p.archived_at).map((p) => {
    const mine = batches.filter((b) => b.productId === p.id)
    return {
      id: String(p.id), row: p, name: String(p.name), kind: String(p.product_kind), unit: String(p.stock_unit ?? 'mL'),
      onHand: round(mine.reduce((n, b) => n + b.onHand, 0)),
      batches: mine,
      needsStocktake: mine.some((b) => b.onHand < 0),
      expiringSoon: mine.some((b) => b.onHand > 0 && b.expiringSoon),
    }
  }).sort((a, b) => a.name.localeCompare(b.name, 'en-AU', { numeric: true }))
}

const round = (n: number) => Math.round(n * 1000) / 1000

export function fmtQty(n: number, unit: string): string {
  return `${n.toLocaleString('en-AU', { maximumFractionDigits: 3 })} ${unit}`
}
