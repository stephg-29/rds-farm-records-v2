// Makes made-up records to test More, Import records with:
//   samples/import/*.csv     the five Farm Records v1 sheet tabs, as CSV
//   samples/import/data.js   a Fence Map data.js
// Names match Steph's test farm (The Block: Cows, Weaners, Front Pdk...).
// A few rows are wrong on purpose so the "skipped" list can be checked.
// Run: node scripts/make-import-samples.mjs
import { mkdirSync, writeFileSync } from 'node:fs'

const out = new URL('../samples/import/', import.meta.url)
mkdirSync(out, { recursive: true })
const csv = (rows) => rows.map((r) => r.map((c) => (/[",\n]/.test(String(c)) ? `"${String(c).replace(/"/g, '""')}"` : String(c))).join(',')).join('\r\n') + '\r\n'
const write = (name, rows) => writeFileSync(new URL(name, out), csv(rows))

write('v1 Mob Treatments.csv', [
  ['Date', 'Property / PIC', 'Mob / paddock', 'Head treated', 'Animal type / class', 'Product / chemical', 'Dose rate', 'Route', 'Batch number', 'WHP (days)', 'Meat withhold until', 'ESI (days)', 'Export (ESI) until', 'Reason', 'Operator', 'Notes', 'Attachment', 'Synced At'],
  ['3/3/2026', 'The Block 1', 'Cows', '60', 'Cows', 'Cydectin Pour-On', '1 mL/10 kg', 'Pour-on / topical', 'CY2291', '0', '', '42', '14/04/2026', 'Worms', 'Steph', 'Before joining', '', '3/3/2026 8:10'],
  ['3/3/2026', 'The Block 1', 'Cows', '60', 'Cows', 'Ultravac 7in1', '2 mL', 'Subcutaneous injection', 'UV7-118', '0', '', '0', '', 'Vaccination', 'Steph', '', '', '3/3/2026 8:12'],
  ['18/5/2026', 'The Block 1', 'Weaners', '22', 'Weaner steers', 'Dectomax Pour-On', '1 mL/10 kg', 'Pour-on / topical', 'DX0457', '35', '22/06/2026', '42', '29/06/2026', 'Lice', 'Steph', '', '', ''],
  ['2/9/2026', 'The Block 1', 'Old ewes', '40', 'Ewes', 'Cydectin Pour-On', '1 mL/10 kg', 'Pour-on / topical', 'CY2291', '0', '', '42', '14/10/2026', 'Worms', 'Steph', 'Mob not in the app: should still import, unlinked', '', ''],
  ['', 'The Block 1', 'Cows', '60', 'Cows', 'Ultravac 7in1', '2 mL', 'Subcutaneous injection', '', '0', '', '0', '', 'Vaccination', 'Steph', 'No date: should be skipped', '', ''],
  ['5/9/2026', 'The Block 1', 'Weaners', '22', 'Weaner steers', '', '', '', '', '', '', '', '', '', 'Steph', 'No product: should be skipped', '', ''],
])

write('v1 Stock Movements.csv', [
  ['Date', 'Movement', 'Type / class', 'Mob / description', 'No. of head', 'Property (from)', 'PIC (from)', 'Property (to)', 'PIC (to)', 'NVD / waybill no.', 'Reason', 'Carrier / transport', 'Truck rego', 'NLIS transfer', 'Notes', 'Attachment'],
  ['12/1/2026', 'On', 'Cows', 'PTIC cows', '30', 'Willow Creek', 'NC300123', 'The Block 1', '', '1234567', 'Purchase', 'Smith Livestock Transport', 'XYZ123', 'Lodged', 'Bought through the agent', ''],
  ['20/4/2026', 'Off', 'Steers', 'Heavy steers', '18', 'The Block 1', '', 'Tamworth saleyards', 'NE900001', '1234601', 'Saleyard', 'Smith Livestock Transport', 'XYZ123', 'Lodged', '', ''],
  ['7/7/2026', 'Off', 'Cows', 'Culls', '4', 'The Block 1', '', 'Teys Australia', 'NE900222', '1234655', 'Abattoir', 'Jones Haulage', 'ABC789', 'To do', '', ''],
  ['', 'On', 'Bulls', 'Angus bull', '1', 'Glen Innes Angus', 'NG400555', 'The Block 1', '', '', 'Purchase', '', '', '', 'No date: should be skipped', ''],
])

write('v1 Spray Records.csv', [
  ['Date', 'Start time', 'Property / address', 'Paddock / area sprayed', 'Situation / crop', 'Target weed / pest', 'Product (APVMA reg.)', 'Application rate', 'Water rate', 'Area covered', 'Wind speed & direction', 'Temperature (°C)', 'Humidity / delta T', 'Batch number', 'Expiry date', 'Grazing/harvest WHP (days)', 'Grazable/harvest from', 'Applicator name', 'Chemical licence no.', 'Notes / changes', 'Attachment'],
  ['14/8/2026', '07:30', 'The Block 1', 'Front Pdk', 'Improved pasture', 'Capeweed', 'Amicide Advance 700 (APVMA 59970)', '1 L/ha', '80 L/ha', '22', '8 km/h SW', '14', 'Delta T 4', 'AM-7731', '30/11/2027', '7', '21/08/2026', 'Steph', 'AQF3-1234', '', ''],
  ['2/9/2026', '08:00', 'The Block 1', 'Eastern Rye, Shed Rye', 'Ryegrass', 'Thistles', 'Lontrel Advanced (APVMA 64837)', '150 mL/ha', '100 L/ha', '15', '5 km/h E', '17', 'Delta T 5', 'LT-0042', '31/05/2028', '7', '9/09/2026', 'Steph', 'AQF3-1234', 'Spot sprayed along the creek', ''],
  ['10/9/2026', '09:15', 'The Block 1', 'Top Hill', 'Native pasture', 'Blackberry', 'Garlon 600 (APVMA 31523)', '170 mL/100 L', '', '2', 'Calm', '19', '', '', '', '0', '', 'Contract sprayer', '', 'Paddock not in the app: kept in the notes', ''],
])

write('v1 Pasture & Fertiliser.csv', [
  ['Date', 'Type', 'Property', 'Paddocks (fert)', 'Fertiliser products (fert)', 'Rate (fert)', 'Area (fert)', 'Contractor (fert)', 'Price (fert)', 'Notes (fert)', 'Paddocks (pasture)', 'Species', 'Sowing rate', 'Area (pasture)', 'Cost', 'Contractor (pasture)', 'Fertiliser products (pasture)', 'Fertiliser rate', 'Notes (pasture)', 'Attachment'],
  ['20/3/2026', 'Fertiliser', 'The Block 1', 'Front Pdk, Back Pdk', 'Single super (125 kg/ha), Urea (50 kg/ha)', '175 kg/ha', '48', 'North West Spreading', '6240', 'Autumn top-dress', '', '', '', '', '', '', '', '', '', ''],
  ['15/4/2026', 'Pasture improvement', 'The Block 1', '', '', '', '', '', '', '', 'Eastern Rye', 'Ryegrass (20 kg/ha), White clover (3 kg/ha)', '23 kg/ha', '12', '2900', 'Peel Valley Seeding', 'MAP (100 kg/ha)', '', 'Direct drilled', ''],
])

write('v1 Vehicle Maintenance.csv', [
  ['Date', 'Vehicle / machine', 'Hours / kms', 'Service type', 'Work done', 'Parts / oil used', 'Cost ($)', 'Done by', 'Next service due', 'Notes', 'Attachment'],
  ['8/2/2026', 'Hilux', '182400', 'Service', 'Oil change, Oil filter, Air filter', '7 L 15W-40, filter kit', '420', 'Tamworth Toyota', '192400', '', ''],
  ['30/6/2026', 'John Deere 6120M', '3150', 'Service', 'Oil change, Grease', '14 L 15W-40', '880', 'Steph', '30/12/2026', 'New machine: should be added to Vehicles', ''],
  ['', 'Quad bike', '', 'Repair', 'Tyre', '', '95', 'Steph', '', 'No date: should be skipped', ''],
])

// Fence Map data.js. The location is made up (farmland west of Tamworth NSW).
// Paddock names match The Block's, so their boundaries are filled in.
const lat0 = -31.06, lng0 = 150.72, dLat = 0.0045, dLng = 0.0055
const r = (n) => Math.round(n * 1e5) / 1e5
const box = (row, col, h = 1, w = 1) => [
  [r(lat0 - row * dLat), r(lng0 + col * dLng)], [r(lat0 - row * dLat), r(lng0 + (col + w) * dLng)],
  [r(lat0 - (row + h) * dLat), r(lng0 + (col + w) * dLng)], [r(lat0 - (row + h) * dLat), r(lng0 + col * dLng)],
]
const paddocks = [['Front Pdk', 0, 0], ['Back Pdk', 1, 0], ['Eastern Rye', 0, 1], ['Shed Rye', 1, 1], ['Around the Shed', 0, 2]]
const features = [
  ...paddocks.map(([name, row, col], i) => ({ id: `p${i + 1}`, type: 'paddock', name, note: '', coords: box(row, col) })),
  { id: 'f1', type: 'fence', name: 'Front lane', unit: 'u1', note: '', coords: [[r(lat0), r(lng0)], [r(lat0), r(lng0 + 3 * dLng)]] },
  { id: 'f2', type: 'fence', name: 'Middle fence', unit: 'u1', note: '', coords: [[r(lat0 - dLat), r(lng0)], [r(lat0 - dLat), r(lng0 + 2 * dLng)]] },
  { id: 'f3', type: 'fence', name: 'Back boundary', unit: 'u2', note: 'Hot wire on offset', coords: [[r(lat0 - 2 * dLat), r(lng0)], [r(lat0 - 2 * dLat), r(lng0 + 2 * dLng)]] },
  { id: 'f4', type: 'fence', name: 'Western boundary', note: 'Plain (not electric)', coords: [[r(lat0), r(lng0)], [r(lat0 - 2 * dLat), r(lng0)]] },
  { id: 'w1', type: 'pipe', name: 'Poly from the tank', note: '50 mm', coords: [[r(lat0 - 0.4 * dLat), r(lng0 + 2.5 * dLng)], [r(lat0 - 1.5 * dLat), r(lng0 + 1.5 * dLng)], [r(lat0 - 1.5 * dLat), r(lng0 + 0.5 * dLng)]] },
  { id: 'pt1', type: 'point', kind: 'tank', name: 'House tank', note: '22,000 L', latlng: [r(lat0 - 0.4 * dLat), r(lng0 + 2.5 * dLng)] },
  { id: 'pt2', type: 'point', kind: 'trough', name: 'Shed Rye trough', note: '', latlng: [r(lat0 - 1.5 * dLat), r(lng0 + 1.5 * dLng)] },
  { id: 'pt3', type: 'point', kind: 'trough', name: 'Back Pdk trough', note: '', latlng: [r(lat0 - 1.5 * dLat), r(lng0 + 0.5 * dLng)] },
  { id: 'pt4', type: 'point', kind: 'gate', name: 'Front gate', note: '', latlng: [r(lat0), r(lng0 + 0.5 * dLng)] },
  { id: 'pt5', type: 'point', kind: 'yards', name: 'Cattle yards', note: '', latlng: [r(lat0 - 0.6 * dLat), r(lng0 + 2.8 * dLng)] },
  { id: 'pt6', type: 'point', kind: 'dam', name: 'Back dam', note: '', latlng: [r(lat0 - 1.7 * dLat), r(lng0 + 0.2 * dLng)] },
]
const data = {
  version: 1,
  properties: [{
    id: 'block', name: 'The Block 1', center: [r(lat0 - dLat), r(lng0 + 1.5 * dLng)], zoom: 16,
    units: [
      { id: 'u1', name: 'Unit 1 - Front', note: 'Cutout at the front gate strainer', latlng: [r(lat0 - 0.05 * dLat), r(lng0 + 0.1 * dLng)] },
      { id: 'u2', name: 'Unit 2 - Back', note: 'Solar unit on the back fence', latlng: [r(lat0 - 1.95 * dLat), r(lng0 + 1.9 * dLng)] },
    ],
    features,
  }],
}
writeFileSync(new URL('data.js', out), `// ============================================================
// FENCE MAP DATA (made-up test data for Farm Records v2 import)
// Location is invented: farmland west of Tamworth NSW.
// ============================================================
window.FARM_DATA = ${JSON.stringify(data, null, 2)};
`)
console.log('Wrote samples/import/')
