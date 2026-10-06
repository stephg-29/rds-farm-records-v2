// The Records and More menus. Records lists the record areas for the
// modules the farm has switched on.
import { useFarm } from '../lib/useFarm'
import { useOutbox } from '../lib/useSync'
import { supabase } from '../lib/supabase'
import { Card, Notice, Page, Row as ListRow, Section, go } from '../ui'
import { useState } from 'react'

// Record areas, in menu order, with the module that switches each on.
export const RECORD_AREAS: { module: string; label: string; detail: string; path: string; ready: boolean }[] = [
  { module: 'treatments', label: 'Treatments', detail: 'Animal treatments, WHP and ESI', path: '/records/treatments', ready: true },
  { module: 'chemical_inventory', label: 'Chemicals', detail: 'Stock on hand, batches, expiry, write-offs', path: '/records/chemicals', ready: true },
  { module: 'issues', label: 'Issues', detail: 'Problems reported in the paddock', path: '/issues', ready: true },
  { module: 'contractor_jobs', label: 'Contractor jobs', detail: 'Jobs for spray and fertiliser contractors', path: '/jobs', ready: true },
  { module: 'spray', label: 'Spray records', detail: 'Spraying and grazing withholds', path: '/records/spray', ready: true },
  { module: 'pasture', label: 'Pasture and fertiliser', detail: 'Fertiliser and pasture improvement', path: '/records/pasture', ready: true },
  { module: 'feed', label: 'Feed', detail: 'Hay sheds, silos, rations and feeding', path: '/records/feed', ready: true },
  { module: 'breeding', label: 'Breeding', detail: 'Joining, pregnancy testing, marking', path: '/records/breeding', ready: true },
  { module: 'vehicles', label: 'Vehicle maintenance', detail: 'Services and repairs', path: '/records/vehicles', ready: true },
  { module: 'rainfall', label: 'Rainfall', detail: 'Rain gauge readings', path: '/records/rainfall', ready: true },
  { module: 'documents', label: 'Documents', detail: 'Plans, reports and reviews', path: '/records/documents', ready: true },
]

export function RecordsMenu() {
  const { modules } = useFarm()
  const on = (key: string) => modules.find((m) => m.key === key)?.visible
  const areas = RECORD_AREAS.filter((a) => on(a.module))
  return (
    <Page title="Records">
      <div className="mt-6">
        <Card>
          {areas.map((a) => (
            <ListRow key={a.path} label={a.label} detail={a.ready ? a.detail : 'Coming in a later phase'} muted={!a.ready}
              onClick={a.ready ? () => go(a.path) : undefined} />
          ))}
        </Card>
      </div>
      <Section title="Reports">
        <Card><ListRow onClick={() => go('/records/reports')} label="Reports" detail="Livestock reconciliation, LPA audit pack" /></Card>
      </Section>
      {areas.length < RECORD_AREAS.length && <p className="mt-4 text-sm text-muted">Modules that are switched off aren't shown. Change them in More, Modules.</p>}
    </Page>
  )
}

export function MoreMenu() {
  const { me, settings, isOwner } = useFarm()
  const outbox = useOutbox()
  const [blocked, setBlocked] = useState(false)
  const waiting = outbox?.waiting ?? 0
  return (
    <Page title="More" kicker={settings ? String(settings.farm_name) : undefined}>
      {me?.role !== 'contractor' && <Section title="Farm">
        <Card>
          <ListRow onClick={() => go('/setup/properties')} label="Properties and paddocks" />
          <ListRow onClick={() => go('/setup/lists')} label="Dropdown lists" detail="Treatment reasons, livestock classes and more" />
          <ListRow onClick={() => go('/setup/modules')} label="Modules" />
          <ListRow onClick={() => go('/setup/farm')} label="Farm details" />
          {isOwner && <ListRow onClick={() => go('/more/people')} label="People" detail="Staff, contractors and owners who can sign in" />}
          {isOwner && <ListRow onClick={() => go('/more/import')} label="Import records" detail="From Farm Records v1 or the Fence Map" />}
        </Card>
      </Section>}
      <Section title="This phone">
        <Card>
          <ListRow onClick={() => go('/sync')} label="Sync" detail={waiting > 0 ? `${waiting} waiting to send` : 'Everything has been sent'} />
          <ListRow label="Signed in as" value={me ? `${String(me.full_name)} (${String(me.role)})` : ''} />
          <ListRow onClick={() => go('/more/about')} label="About" detail="App and database versions" />
          <ListRow onClick={() => (waiting > 0 ? setBlocked(true) : supabase!.auth.signOut())} label="Sign out" />
        </Card>
        {blocked && waiting > 0 && <div className="mt-3"><Notice tone="warn">{waiting} {waiting === 1 ? "change hasn't" : "changes haven't"} sent yet. Sign out once they have, so nothing is lost.</Notice></div>}
      </Section>
    </Page>
  )
}
