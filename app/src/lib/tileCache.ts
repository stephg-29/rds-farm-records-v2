// Saved map tiles (Cache Storage), shared by the map, the terrain heights and
// the offline download (offlineMap.ts). No imports, so anything can use it.
export const OFFLINE_CACHE = 'fr-offline-map'

let cachePromise: Promise<Cache> | null = null
// A saved copy of a tile, as a local address, or null.
export async function savedTile(url: string): Promise<string | null> {
  if (typeof caches === 'undefined') return null
  try {
    cachePromise ??= caches.open(OFFLINE_CACHE)
    const hit = await (await cachePromise).match(url)
    return hit ? URL.createObjectURL(await hit.blob()) : null
  } catch { return null }
}

// fetch(), but from the saved copy when there is one (terrain heights offline).
export async function fetchSaved(url: string): Promise<Response> {
  if (typeof caches !== 'undefined') {
    try {
      cachePromise ??= caches.open(OFFLINE_CACHE)
      const hit = await (await cachePromise).match(url)
      if (hit) return hit
    } catch { /* fall through to the network */ }
  }
  return fetch(url)
}
