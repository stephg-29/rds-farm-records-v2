// Treatments, withholds and chemical stock for screens, from the phone's copy.
import { useMemo } from 'react'
import type { Row } from './db'
import { chemicalStock, type ProductView } from './chem'
import { todayLocal } from './stock'
import { useTable } from './useSync'
import { activeWithholds, addDays, mobWithholds, type ActiveWithhold, type Withhold } from './withholds'

export type Health = {
  ready: boolean
  products: Row[]
  batches: Row[]
  treatments: Row[]
  items: Row[]
  withholds: Withhold[]
  active: Map<string, ActiveWithhold>
  chem: ProductView[]
  // A mob's treatments, newest first, with their items. Includes treatments
  // that came with stock split or merged in (inheritedFrom = the mob treated).
  mobTreatments: (mobId: string) => { treatment: Row; items: Row[]; inheritedFrom?: string }[]
  productName: (id: string) => string
}

export function useHealth(mobName: (id: string) => string): Health {
  const products = useTable('products')
  const batches = useTable('product_batches')
  const ledger = useTable('chemical_ledger')
  const treatments = useTable('treatments')
  const items = useTable('treatment_items')
  const events = useTable('stock_events')
  const lines = useTable('stock_event_lines')
  const sprays = useTable('spray_records')
  const sprayItems = useTable('spray_record_items')
  const pastures = useTable('pasture_records')
  const pastureItems = useTable('pasture_record_items')
  const feedings = useTable('feeding_events')
  const feedLedger = useTable('feed_ledger')
  const feedLots = useTable('feed_lots')
  const feedItems = useTable('feed_items')

  return useMemo(() => {
    const today = todayLocal()
    // Chemicals used by spray and fertiliser records (deleted ones give it back).
    const sprayById = new Map((sprays ?? []).map((s) => [String(s.id), s]))
    const pastureById = new Map((pastures ?? []).map((p) => [String(p.id), p]))
    const otherUses = [
      ...(sprayItems ?? []).flatMap((i) => {
        const s = sprayById.get(String(i.spray_record_id))
        return s && i.batch_id && i.quantity_used != null ? [{ id: String(i.id), batchId: String(i.batch_id), quantity: Number(i.quantity_used), date: String(s.spray_date), text: `Sprayed${s.target ? `: ${s.target}` : ''}`, path: `/records/spray/${s.id}` }] : []
      }),
      ...(pastureItems ?? []).flatMap((i) => {
        const p = pastureById.get(String(i.pasture_record_id))
        return p && i.batch_id && i.quantity_used != null ? [{ id: String(i.id), batchId: String(i.batch_id), quantity: Number(i.quantity_used), date: String(p.record_date), text: 'Spread (fertiliser)', path: `/records/pasture/${p.id}` }] : []
      }),
    ]
    const d = { products: products ?? [], batches: batches ?? [], ledger: ledger ?? [], treatments: treatments ?? [], items: items ?? [], otherUses }
    const withholds = mobWithholds({ ...d, events: events ?? [], lines: lines ?? [], feedings: feedings ?? [], feedLedger: feedLedger ?? [], feedLots: feedLots ?? [], feedItems: feedItems ?? [] })
    const liveItems = d.items.filter((i) => !i.deleted_at)
    return {
      ready: [products, batches, ledger, treatments, items, events, lines].every((x) => x !== undefined),
      products: d.products,
      batches: d.batches,
      treatments: d.treatments,
      items: liveItems,
      withholds,
      active: activeWithholds(withholds, today),
      chem: chemicalStock(d, today, addDays(today, 30), mobName),
      mobTreatments: (mobId: string) => {
        const own = d.treatments.filter((t) => t.mob_id === mobId)
        const inheritedItems = new Set(withholds.filter((w) => w.mobId === mobId).map((w) => w.sourceId))
        const inherited = d.treatments.filter((t) => t.mob_id !== mobId && liveItems.some((i) => i.treatment_id === t.id && inheritedItems.has(String(i.id))))
        return [...own, ...inherited]
          .sort((a, b) => String(b.treatment_date).localeCompare(String(a.treatment_date)))
          .map((t) => ({
            treatment: t,
            items: liveItems.filter((i) => i.treatment_id === t.id && (t.mob_id === mobId || inheritedItems.has(String(i.id)))),
            inheritedFrom: t.mob_id !== mobId ? mobName(String(t.mob_id)) : undefined,
          }))
      },
      productName: (id: string) => String(d.products.find((p) => p.id === id)?.name ?? 'Unknown product'),
    }
  }, [products, batches, ledger, treatments, items, events, lines, sprays, sprayItems, pastures, pastureItems, feedings, feedLedger, feedLots, feedItems, mobName])
}
