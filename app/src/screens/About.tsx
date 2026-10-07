// About: the app and database versions, so RDS can see whether a farm is up
// to date. Warns when the farm's database is missing a migration this
// version of the app relies on.
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Card, Notice, Page, Row as ListRow } from '../ui'

// The newest database migration this version of the app needs.
export const REQUIRED_MIGRATION = '0021_contractor_map'
export const APP_VERSION = '2.0.0-beta'

export function AboutScreen() {
  const [db, setDb] = useState<{ latest: string | null; count: number } | 'offline' | null>(null)
  useEffect(() => {
    let live = true
    supabase!.from('schema_migrations').select('version').order('version', { ascending: false }).then(({ data, error }) => {
      if (!live) return
      setDb(error || !data ? 'offline' : { latest: data[0]?.version ?? null, count: data.length })
    })
    return () => { live = false }
  }, [])
  const behind = db && db !== 'offline' && (db.latest ?? '') < REQUIRED_MIGRATION
  return (
    <Page title="About" kicker="Farm Records" back="/more">
      <div className="mt-5">
        <Card>
          <ListRow label="App version" value={APP_VERSION} />
          <ListRow label="Database" value={db === null ? 'Checking…' : db === 'offline' ? "Can't check now (needs signal)" : `${db.latest} (${db.count} updates)`} />
          <ListRow label="Needs at least" value={REQUIRED_MIGRATION} />
        </Card>
      </div>
      {behind && <div className="mt-4"><Notice tone="alert">This farm's database is behind this version of the app. Some screens may not save. Contact Rural Data Services to update it.</Notice></div>}
      <p className="mt-6 text-sm text-muted">Farm Records by Rural Data Services. Records stay in the farm's own database. Base map © Geoscience Australia. Imagery © Spatial Services NSW, State of Queensland, or as credited on the map. Place search © OpenStreetMap contributors.</p>
    </Page>
  )
}
