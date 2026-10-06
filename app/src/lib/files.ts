// Photos and files attached to records (issues, NVDs, reports). Saved on the
// phone first, uploaded before their record syncs (see push in sync.ts).
import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import type { FarmDb, Row } from './db'
import type { NewRecord } from './sync'
import { supabase } from './supabase'
import { useSync, useTable } from './useSync'

const MAX_PX = 1600

// Shrink a camera photo to at most 1600 px (JPEG). Other files pass through.
export async function prepareFile(file: File): Promise<{ blob: Blob; mimeType: string; name: string }> {
  if (!file.type.startsWith('image/') || file.type === 'image/heic') return { blob: file, mimeType: file.type || 'application/octet-stream', name: file.name }
  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, MAX_PX / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('No image'))), 'image/jpeg', 0.82))
    return { blob, mimeType: 'image/jpeg', name: file.name.replace(/\.[^.]+$/, '') + '.jpg' }
  } catch {
    return { blob: file, mimeType: file.type, name: file.name }
  }
}

const safe = (s: string) => s.replace(/[^A-Za-z0-9._-]+/g, '-').slice(-60) || 'file'

// Keep the files on the phone and return the records that list them.
export async function attachFiles(db: FarmDb, recordTable: string, recordId: string, files: File[]): Promise<NewRecord[]> {
  const adds: NewRecord[] = []
  for (const f of files) {
    const { blob, mimeType, name } = await prepareFile(f)
    const id = crypto.randomUUID()
    const path = `${recordTable}/${recordId}/${id}-${safe(name)}`
    await db.files.put({ id, path, blob, mimeType, uploaded: false })
    adds.push({ table: 'attachments', values: { id, storage_path: path, file_name: name, mime_type: mimeType, size_bytes: blob.size } })
    adds.push({ table: 'attachment_links', values: { attachment_id: id, record_table: recordTable, record_id: recordId } })
  }
  return adds
}

// The files attached to a record.
export function useAttachments(recordTable: string, recordId: string | undefined): Row[] {
  const links = useTable('attachment_links')
  const attachments = useTable('attachments')
  if (!recordId) return []
  const ids = new Set((links ?? []).filter((l) => l.record_table === recordTable && l.record_id === recordId).map((l) => String(l.attachment_id)))
  return (attachments ?? []).filter((a) => ids.has(String(a.id)))
}

// A URL to show a file: from the phone if it's here, otherwise a short-lived
// link from the farm's storage (needs signal).
export function useFileUrl(attachment: Row | undefined): string | null {
  const { ctx } = useSync()
  // undefined while looking; null when this phone doesn't have the file.
  const local = useLiveQuery(async () => (attachment ? (await ctx.db.files.get(String(attachment.id))) ?? null : null), [ctx, attachment?.id])
  const localUrl = useMemo(() => (local ? URL.createObjectURL(local.blob) : null), [local])
  useEffect(() => () => { if (localUrl) URL.revokeObjectURL(localUrl) }, [localUrl])
  const [remote, setRemote] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    if (attachment && local === null && supabase) {
      supabase.storage.from('attachments').createSignedUrl(String(attachment.storage_path), 3600)
        .then(({ data }) => { if (live) setRemote(data?.signedUrl ?? null) })
    }
    return () => { live = false }
  }, [local, attachment])
  return localUrl ?? remote
}
