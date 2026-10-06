import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { FarmDb, type Row } from './db'
import {
  addRecord, editRecord, prepareForUser, pull, push, removeRecord, syncNow,
  type Remote, type SyncContext, type WriteResult,
} from './sync'

// A pretend farm database that behaves like the real one where it matters:
// it stamps created_at/updated_at, flags edits from an out-of-date copy, can
// lose signal, and can turn a change down.
class FakeServer implements Remote {
  tables = new Map<string, Map<string, Row>>()
  offline = false
  reject: ((table: string, row: Row) => string | null) | null = null
  dropNextReply = false
  private clock = Date.parse('2026-10-06T00:00:00Z')

  private tick() { this.clock += 1000; return new Date(this.clock).toISOString() }
  table(name: string) {
    if (!this.tables.has(name)) this.tables.set(name, new Map())
    return this.tables.get(name)!
  }
  private down(): WriteResult { return { ok: false, offline: true, message: 'Failed to fetch' } }

  async pull(table: string, key: string, since: string | null, offset: number, limit: number) {
    if (this.offline) return { ok: false as const, offline: true, message: 'Failed to fetch' }
    const rows = [...this.table(table).values()]
      .filter((r) => !since || (r.created_at as string) > since || ((r.updated_at as string) ?? '') > since)
      .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)) || String(a[key]).localeCompare(String(b[key])))
    return { ok: true as const, rows: rows.slice(offset, offset + limit).map((r) => ({ ...r })) }
  }

  async insert(table: string, row: Row): Promise<WriteResult> {
    if (this.offline) return this.down()
    const t = this.table(table)
    const id = String(row.id ?? row.user_id)
    if (t.has(id)) return { ok: false, offline: false, code: '23505', message: 'duplicate key' }
    const why = this.reject?.(table, row)
    if (why) return { ok: false, offline: false, code: '23514', message: why }
    const saved = { ...row, created_at: this.tick(), updated_at: null, has_edit_conflict: false, deleted_at: row.deleted_at ?? null }
    t.set(id, saved)
    if (this.dropNextReply) { this.dropNextReply = false; return this.down() }
    return { ok: true, row: { ...saved } }
  }

  async update(table: string, key: string, id: string, patch: Row): Promise<WriteResult> {
    if (this.offline) return this.down()
    const t = this.table(table)
    const old = t.get(id)
    if (!old) return { ok: false, offline: false, code: 'NOT_ALLOWED', message: 'not found' }
    const why = this.reject?.(table, { ...old, ...patch })
    if (why) return { ok: false, offline: false, code: '23514', message: why }
    const { edit_base_updated_at: base, ...changes } = patch
    const conflict = !!base && !!old.updated_at && (base as string) < (old.updated_at as string)
    const saved = { ...old, ...changes, [key]: id, updated_at: this.tick(), has_edit_conflict: old.has_edit_conflict || conflict }
    t.set(id, saved)
    return { ok: true, row: { ...saved } }
  }

  async view() { return this.offline ? this.down() as never : { ok: true as const, rows: [] } }
}

let dbCount = 0
async function phone(server: FakeServer, userId = 'user-1'): Promise<SyncContext> {
  const db = new FarmDb(`test-${++dbCount}`)
  const deviceId = await prepareForUser(db, userId)
  return { db, remote: server, userId, deviceId }
}
const shown = async (ctx: SyncContext, table: string, id: string) => (await ctx.db.rows.get([table, id]))?.data
const waiting = (ctx: SyncContext) => ctx.db.outbox.count()

let server: FakeServer
beforeEach(() => { server = new FakeServer() })

describe('saving with no signal', () => {
  it('shows the new record straight away and sends it when signal returns', async () => {
    const a = await phone(server)
    server.offline = true
    const id = await addRecord(a, 'properties', { name: 'Kooringa' })
    expect((await shown(a, 'properties', id))?.name).toBe('Kooringa')
    expect((await syncNow(a)).offline).toBe(true)
    expect(await waiting(a)).toBe(1)

    server.offline = false
    const r = await syncNow(a)
    expect(r.sent).toBe(1)
    expect(await waiting(a)).toBe(0)
    expect(server.table('properties').get(id)?.name).toBe('Kooringa')
    expect(server.table('properties').get(id)?.device_id).toBe(a.deviceId)
  })

  it('keeps changes in the order they were made', async () => {
    const a = await phone(server)
    server.offline = true
    const prop = await addRecord(a, 'properties', { name: 'Kooringa' })
    const pdk = await addRecord(a, 'paddocks', { name: 'Creek', property_id: prop })
    server.offline = false
    await syncNow(a)
    expect(server.table('paddocks').get(pdk)?.property_id).toBe(prop)
  })

  it('folds an edit into a record that has not been sent yet', async () => {
    const a = await phone(server)
    server.offline = true
    const id = await addRecord(a, 'properties', { name: 'Koorinag' })
    await editRecord(a, 'properties', id, { name: 'Kooringa' })
    expect(await waiting(a)).toBe(1)
    server.offline = false
    await syncNow(a)
    expect(server.table('properties').get(id)?.name).toBe('Kooringa')
    expect(server.table('properties').get(id)?.has_edit_conflict).toBe(false)
  })

  it('does not double up when a sent record’s reply was lost', async () => {
    const a = await phone(server)
    const id = await addRecord(a, 'properties', { name: 'Kooringa' })
    server.dropNextReply = true
    expect((await push(a)).offline).toBe(true)
    expect(await waiting(a)).toBe(1)
    await syncNow(a)
    expect(await waiting(a)).toBe(0)
    expect(server.table('properties').size).toBe(1)
    expect((await shown(a, 'properties', id))?.name).toBe('Kooringa')
  })
})

describe('editing', () => {
  it('sends several edits in a row without flagging its own edits as conflicts', async () => {
    const a = await phone(server)
    const id = await addRecord(a, 'properties', { name: 'Kooringa' })
    await syncNow(a)
    server.offline = true
    await editRecord(a, 'properties', id, { pic: 'NA1' })
    await editRecord(a, 'properties', id, { pic: 'NA2' }, 'Typo')
    server.offline = false
    await syncNow(a)
    const row = server.table('properties').get(id)!
    expect(row.pic).toBe('NA2')
    expect(row.has_edit_conflict).toBe(false)
  })

  it('flags the second of two phones that edited the same copy offline', async () => {
    const a = await phone(server, 'owner')
    const b = await phone(server, 'staff')
    const id = await addRecord(a, 'properties', { name: 'Kooringa' })
    await syncNow(a)
    await syncNow(b)
    server.offline = true
    await editRecord(a, 'properties', id, { pic: 'FROM-A' })
    await editRecord(b, 'properties', id, { pic: 'FROM-B' })
    server.offline = false
    await syncNow(a)
    expect(server.table('properties').get(id)?.has_edit_conflict).toBe(false)
    await syncNow(b)
    const row = server.table('properties').get(id)!
    expect(row.pic).toBe('FROM-B')
    expect(row.has_edit_conflict).toBe(true)
    await syncNow(a)
    expect((await shown(a, 'properties', id))?.pic).toBe('FROM-B')
  })

  it('marks records deleted rather than removing them', async () => {
    const a = await phone(server)
    const id = await addRecord(a, 'properties', { name: 'Old lease' })
    await syncNow(a)
    await removeRecord(a, 'properties', id, 'Lease ended')
    await syncNow(a)
    const row = server.table('properties').get(id)!
    expect(row.deleted_at).toBeTruthy()
    expect(row.edit_reason).toBe('Lease ended')
  })

  it('keeps unsent edits on screen when newer server copies arrive', async () => {
    const a = await phone(server, 'owner')
    const b = await phone(server, 'staff')
    const id = await addRecord(a, 'properties', { name: 'Kooringa' })
    await syncNow(a)
    await syncNow(b)
    await editRecord(a, 'properties', id, { notes: 'Home block' })
    await syncNow(a)
    server.offline = true
    await editRecord(b, 'properties', id, { pic: 'NA9' })
    server.offline = false
    await pull(b)
    const data = await shown(b, 'properties', id)
    expect(data?.notes).toBe('Home block')
    expect(data?.pic).toBe('NA9')
  })
})

describe('changes the server turns down', () => {
  it('keeps them with the reason, holds later edits of the same record, and sends the rest', async () => {
    const a = await phone(server)
    server.reject = (table, row) => (table === 'properties' && row.name === '' ? 'A property needs a name' : null)
    const bad = await addRecord(a, 'properties', { name: '' })
    await editRecord(a, 'properties', bad, { pic: 'NA1' })
    const good = await addRecord(a, 'properties', { name: 'Kooringa' })
    const r = await syncNow(a)
    expect(r.sent).toBe(1)
    expect(r.rejected).toBe(1)
    const item = await a.db.outbox.toCollection().first()
    expect(item?.lastError).toBe('A property needs a name')
    expect(server.table('properties').has(good)).toBe(true)

    // Fixing it on the phone lets it through.
    await editRecord(a, 'properties', bad, { name: 'Glenvale' })
    expect((await syncNow(a)).rejected).toBe(0)
    expect(server.table('properties').get(bad)?.name).toBe('Glenvale')
  })
})

describe('signing in on a shared phone', () => {
  it('clears the previous person’s cached records but keeps the device id', async () => {
    const a = await phone(server, 'owner')
    await addRecord(a, 'properties', { name: 'Kooringa' })
    await syncNow(a)
    const deviceId = await prepareForUser(a.db, 'staff')
    expect(deviceId).toBe(a.deviceId)
    expect(await a.db.rows.count()).toBe(0)
  })
})
