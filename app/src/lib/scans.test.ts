import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { fmtTag, parseScan, withScan } from './scans'

describe('wand scan files', () => {
  it('reads a Gallagher-style export by its heading, ignoring repeat scans', () => {
    const csv = 'Date,Time,Electronic ID,Visual ID\r\n08/10/2026,08:01,982 000123456781,101\r\n08/10/2026,08:01,982 000123456782,102\r\n08/10/2026,08:02,982 000123456781,101\r\n08/10/2026,08:02,982000123456783,\r\n'
    const r = parseScan(csv)
    expect(r.tags).toEqual(['982000123456781', '982000123456782', '982000123456783'])
    expect(r.repeats).toBe(1)
    expect(r.column).toBe('Electronic ID')
    expect(r.kind).toBe('eid')
  })

  it('reads a Tru-Test style file with EID and weight columns', () => {
    const r = parseScan('EID,VID,Weight\n982091012345678,A12,412\n982091012345679,A13,398\nbad line,,\n')
    expect(r.tags.length).toBe(2)
    expect(r.unreadable).toBe(1)
  })

  it('reads a bare list (one tag per line, no heading) and NLIS IDs', () => {
    expect(parseScan('982000123456781\n982000123456782\n').tags.length).toBe(2)
    const n = parseScan('NLIS ID;Date\n3ABCD123XBC01234;8/10/2026\n3ABCD123XBC01235;8/10/2026\n')
    expect(n.tags).toEqual(['3ABCD123XBC01234', '3ABCD123XBC01235'])
    expect(n.kind).toBe('nlis')
  })

  it('finds the tag column by its contents when the heading is unusual', () => {
    const r = parseScan('Session,Reading,Notes\n1,982 000111222333,\n1,982 000111222334,lame\n')
    expect(r.tags.length).toBe(2)
  })

  it('reads the sample wand file: 24 head', () => {
    const r = parseScan(readFileSync(new URL('../../../samples/import/wand-scan-24-head.csv', import.meta.url), 'utf8'))
    expect([r.tags.length, r.repeats, r.unreadable]).toEqual([24, 2, 1])
  })

  it('shows EIDs in the usual way', () => {
    expect(fmtTag('982000123456781')).toBe('982 000123456781')
  })

  it('puts the tags on the movement and attaches the file', async () => {
    const adds = [{ table: 'stock_events', values: { id: 'e1', event_type: 'movement' } }, { table: 'stock_event_lines', values: {} }]
    const file = new File(['EID\n982000123456781\n'], 'scan.csv', { type: 'application/vnd.ms-excel' })
    let attached: File[] = []
    const out = await withScan(adds, { tags: ['982000123456781'], file }, async (_id, files) => { attached = files; return [{ table: 'attachments', values: { id: 'a1' } }] })
    expect(out[0].values.scanned_eids).toEqual(['982000123456781'])
    expect(out.at(-1)!.table).toBe('attachments')
    expect(attached[0].type).toBe('text/csv')
  })
})
