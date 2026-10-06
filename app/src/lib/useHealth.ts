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

  return useMemo(() => {
    const today = todayLocal()
    const d = { products: products ?? [], batches: batches ?? [], ledger: ledger ?? [], treatments: treatments ?? [], items: items ?? [] }
    const withholds = mobWithholds({ ...d, events: events ?? [], lines: lines ?? [] })
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
  }, [products, batches, ledger, treatments, items, events, lines, mobName])
}
