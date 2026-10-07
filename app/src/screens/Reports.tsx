// Reports: the livestock reconciliation (for the accountant), and the LPA
// audit pack (treatment and movement registers, spray records, chemicals,
// documents) to print or download. Exports of what was recorded; they don't
// certify compliance.
import { useState } from 'react'
import { fmtQty } from '../lib/chem'
import { download, financialYear, movementRegister, reconciliation, toCsv, treatmentRegister } from '../lib/reports'
import { todayLocal } from '../lib/stock'
import { useFarm } from '../lib/useFarm'
import { useHealth } from '../lib/useHealth'
import { useStock } from '../lib/useStock'
import { useTable } from '../lib/useSync'
import { Button, Field, Page, Section, inputClass } from '../ui'
import { DOC_KINDS } from './RainDocs'
import { fmtDate } from './stockParts'

export function ReportsScreen() {
  const stock = useStock()
  const health = useHealth(stock.mobName)
  const { settings } = useFarm()
  const contacts = useTable('contacts') ?? []
  const sprays = useTable('spray_records') ?? []
  const sprayPaddocks = useTable('spray_record_paddocks') ?? []
  const sprayItems = useTable('spray_record_items') ?? []
  const documents = useTable('documents') ?? []
  const fy = financialYear(todayLocal())
  const [from, setFrom] = useState(fy.from)
  const [to, setTo] = useState(fy.to)
  const [printing, setPrinting] = useState(false)
  const farm = String(settings?.farm_name ?? 'Farm')
  const range = `${fmtDate(from, { day: 'numeric', month: 'short', year: 'numeric' })} to ${fmtDate(to, { day: 'numeric', month: 'short', year: 'numeric' })}`
  const file = (what: string) => `${farm.replace(/\W+/g, '-')}_${what}_${from}_to_${to}.csv`

  const recon = reconciliation(stock.data, stock.classes, from, to)
  const treatments = treatmentRegister({ treatments: health.treatments, items: health.items, products: health.products, batches: health.batches, paddocks: stock.paddocks, mobName: stock.mobName }, from, to)
  const movements = movementRegister(stock.data, { properties: stock.properties, contacts, classes: stock.classes }, from, to)
  const sprayRows = sprays.filter((s) => String(s.spray_date) >= from && String(s.spray_date) <= to).sort((a, b) => String(a.spray_date).localeCompare(String(b.spray_date))).map((s) => ({
    date: String(s.spray_date), time: [String(s.start_time ?? '').slice(0, 5), String(s.finish_time ?? '').slice(0, 5)].filter(Boolean).join('–'),
    paddocks: sprayPaddocks.filter((l) => l.spray_record_id === s.id).map((l) => String(stock.paddocks.find((d) => d.id === l.paddock_id)?.name ?? '')).join(', '),
    products: sprayItems.filter((i) => i.spray_record_id === s.id).map((i) => `${i.product_id ? health.productName(String(i.product_id)) : String(i.product_name ?? '')}${i.application_rate ? ` ${i.application_rate}` : ''}`).join('; '),
    target: String(s.target ?? ''), situation: String(s.situation ?? ''), weather: [s.wind_speed_direction, s.temperature_c != null ? `${s.temperature_c}°C` : null, s.humidity_delta_t].filter(Boolean).join(', '),
    equipment: String(s.equipment ?? ''), applicator: [s.applicator_name, s.licence_number ? `lic ${s.licence_number}` : null].filter(Boolean).join(' · '),
    grazing: String(s.grazing_withhold_until ?? ''),
  }))
  const chemRows = health.chem.flatMap((p) => p.batches.filter((b) => b.onHand !== 0).map((b) => ({ product: p.name, group: String(p.row.chemical_group ?? ''), batch: b.batchNumber ?? '', expiry: b.expiry ?? '', onHand: fmtQty(b.onHand, p.unit) })))

  const csvs = {
    reconciliation: () => download(file('livestock-reconciliation'), toCsv(['Species', 'Class', 'Opening', 'Births', 'Purchases', 'Sales', 'Deaths', 'Other', 'Closing'], recon.map((r) => [r.species, r.className, r.opening, r.births, r.purchases, r.sales, r.deaths, r.other, r.closing]))),
    treatments: () => download(file('treatment-register'), toCsv(['Date', 'Livestock', 'Location', 'Head', 'Product', 'Batch', 'Expiry', 'Dose and weight', 'Treated by', 'WHP days', 'ESI days', 'Safe for slaughter from', 'Adverse reactions', 'Edited'], treatments.map((t) => [t.date, t.livestock, t.location, t.head, t.product, t.batch, t.expiry, t.dose, t.treatedBy, t.whpDays, t.esiDays, t.safeForSlaughter, t.adverse, t.edited ? 'yes' : '']))),
    movements: () => download(file('movement-register'), toCsv(['Date', 'On/off', 'Head', 'Livestock', 'From', 'To', 'NVD', 'NLIS transfer', 'Reason', 'Needs review'], movements.map((m) => [m.date, m.direction, m.head, m.livestock, m.fromPic, m.toPic, m.nvd, m.nlis, m.reason, m.review ? 'yes' : '']))),
    sprays: () => download(file('spray-records'), toCsv(['Date', 'Time', 'Paddocks', 'Products and rates', 'Target', 'Situation', 'Weather', 'Equipment', 'Applicator', "Don't graze until"], sprayRows.map((s) => [s.date, s.time, s.paddocks, s.products, s.target, s.situation, s.weather, s.equipment, s.applicator, s.grazing]))),
  }

  if (printing) {
    return (
      <div className="mx-auto max-w-4xl bg-white px-6 py-6 text-[12px] text-black print:p-0">
        <div className="mb-4 flex justify-between print:hidden">
          <Button kind="secondary" onClick={() => setPrinting(false)}>Back</Button>
          <Button onClick={() => window.print()}>Print or save as PDF</Button>
        </div>
        <h1 className="text-2xl">{farm}: LPA audit pack</h1>
        <p className="mt-1">{range} · PICs: {stock.properties.map((p) => `${p.name} ${p.pic ?? ''}`).join(', ')} · printed {fmtDate(todayLocal(), { day: 'numeric', month: 'short', year: 'numeric' })}</p>
        <p className="mt-1 italic">A record of what was entered in Farm Records. It's the producer's responsibility to make sure records meet current LPA requirements.</p>
        <PrintTable title="Livestock treatment register" head={['Date', 'Livestock', 'Location', 'Head', 'Product', 'Batch', 'Expiry', 'Dose', 'Treated by', 'WHP', 'ESI', 'Safe from']}
          rows={treatments.map((t) => [fmtDate(t.date), t.livestock, t.location, t.head ?? '', t.product, t.batch, t.expiry, t.dose, t.treatedBy, t.whpDays, t.esiDays, t.safeForSlaughter ? fmtDate(t.safeForSlaughter) : ''])} />
        <PrintTable title="Livestock movements on and off the property" head={['Date', 'On/off', 'Head', 'Livestock', 'From', 'To', 'NVD', 'NLIS']}
          rows={movements.map((m) => [fmtDate(m.date), m.direction, m.head, m.livestock, m.fromPic, m.toPic, m.nvd, m.nlis])} />
        <PrintTable title="Spray records" head={['Date', 'Time', 'Paddocks', 'Products and rates', 'Target', 'Weather', 'Equipment', 'Applicator', "Don't graze until"]}
          rows={sprayRows.map((s) => [fmtDate(s.date), s.time, s.paddocks, s.products, s.target, s.weather, s.equipment, s.applicator, s.grazing ? fmtDate(s.grazing) : ''])} />
        <PrintTable title="Chemicals on hand" head={['Product', 'Group', 'Batch', 'Expiry', 'On hand']} rows={chemRows.map((c) => [c.product, c.group, c.batch, c.expiry, c.onHand])} />
        <PrintTable title="Documents" head={['Title', 'Kind', 'Date', 'Review by']} rows={documents.map((d) => [String(d.title), DOC_KINDS.find((k) => k.value === d.document_kind)?.label ?? '', d.document_date ? fmtDate(String(d.document_date)) : '', d.review_due ? fmtDate(String(d.review_due)) : ''])} />
      </div>
    )
  }

  return (
    <Page title="Reports" kicker="More" back="/more">
      <div className="mt-5 grid grid-cols-2 gap-3">
        <Field id="from" label="From"><input id="from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={inputClass} /></Field>
        <Field id="to" label="To"><input id="to" type="date" value={to} onChange={(e) => setTo(e.target.value)} className={inputClass} /></Field>
      </div>
      <p className="mt-2 text-xs text-muted">Starts as this financial year (1 July to 30 June).</p>

      <Section title="Livestock reconciliation" aside={<button className="text-sm font-semibold text-green underline" onClick={csvs.reconciliation}>Download</button>}>
        <p className="-mt-1 mb-3 text-sm text-muted">Opening + births + purchases − sales − deaths ± other = closing. For the accountant's livestock trading schedule.</p>
        <div className="overflow-x-auto rounded-2xl border border-line bg-card">
          <table className="w-full text-sm">
            <thead className="bg-paper text-left text-xs text-muted"><tr>{['Class', 'Open', 'Born', 'Bought', 'Sold', 'Died', 'Other', 'Close'].map((h) => <th key={h} className="px-2 py-2 font-semibold">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-line">
              {recon.length === 0 && <tr><td colSpan={8} className="px-3 py-4 text-center text-muted">No stock records.</td></tr>}
              {recon.map((r) => (
                <tr key={`${r.species}${r.className}`}>
                  <td className="px-2 py-2">{r.className}<span className="block text-xs text-muted">{r.species}</span></td>
                  {[r.opening, r.births, r.purchases, r.sales, r.deaths, r.other, r.closing].map((n, i) => <td key={i} className={`px-2 py-2 text-right ${i === 6 ? 'font-semibold' : ''}`}>{n}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="LPA audit pack">
        <p className="-mt-1 mb-3 text-sm text-muted">Everything an LPA auditor usually asks to see, for the dates above. Print it, save it as a PDF, or download each register as a spreadsheet.</p>
        <Button className="w-full" onClick={() => setPrinting(true)}>Open the audit pack (print or PDF)</Button>
        <div className="mt-3 grid grid-cols-1 gap-2">
          <Button kind="secondary" onClick={csvs.treatments}>Treatment register ({treatments.length}) · spreadsheet</Button>
          <Button kind="secondary" onClick={csvs.movements}>Movement register ({movements.length}) · spreadsheet</Button>
          <Button kind="secondary" onClick={csvs.sprays}>Spray records ({sprayRows.length}) · spreadsheet</Button>
        </div>
        <p className="mt-3 text-xs text-muted">A record of what was entered. It's the producer's responsibility to make sure records meet current LPA requirements.</p>
      </Section>
    </Page>
  )
}

function PrintTable({ title, head, rows }: { title: string; head: string[]; rows: (string | number)[][] }) {
  return (
    <section className="mt-6 break-inside-avoid-page">
      <h2 className="mb-1 text-base font-semibold">{title} ({rows.length})</h2>
      <div className="overflow-x-auto print:overflow-visible">
      <table className="w-full min-w-[36rem] border-collapse print:min-w-0">
        <thead><tr>{head.map((h) => <th key={h} className="border border-gray-400 bg-gray-100 px-1 py-0.5 text-left">{h}</th>)}</tr></thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan={head.length} className="border border-gray-400 px-1 py-1 italic">None in this period.</td></tr>}
          {rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className="border border-gray-400 px-1 py-0.5 align-top">{c}</td>)}</tr>)}
        </tbody>
      </table>
      </div>
    </section>
  )
}
