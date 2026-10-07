// The More menu: More's areas as tiles, then the farm's setup, this
// person's own settings and this phone.
import { useFarm } from '../lib/useFarm'
import { useOutbox } from '../lib/useSync'
import { supabase } from '../lib/supabase'
import { Card, Notice, Page, Row as ListRow, Section, go } from '../ui'
import { AreaTiles } from './Hubs'
import { useState } from 'react'

export function MoreMenu() {
  const { me, settings, isOwner } = useFarm()
  const outbox = useOutbox()
  const [blocked, setBlocked] = useState(false)
  const waiting = outbox?.waiting ?? 0
  return (
    <Page title="More" kicker={settings ? String(settings.farm_name) : undefined}>
      {me?.role !== 'contractor' && <div className="mt-5"><AreaTiles section="more" /></div>}
      {me?.role !== 'contractor' && <Section title="Farm">
        <Card>
          <ListRow onClick={() => go('/setup/lists')} label="Dropdown lists" detail="Treatment reasons, livestock classes and more" />
          <ListRow onClick={() => go('/setup/modules')} label="Modules" />
          <ListRow onClick={() => go('/setup/farm')} label="Farm details" />
          {isOwner && <ListRow onClick={() => go('/more/people')} label="People" detail="Staff, contractors and owners who can sign in" />}
          {isOwner && <ListRow onClick={() => go('/more/import')} label="Import records" detail="From Farm Records v1 or the Fence Map" />}
        </Card>
      </Section>}
      {me?.role !== 'contractor' && <Section title="Just for you">
        <Card>
          <ListRow onClick={() => go('/more/customise')} label="Customise" detail="Your Home screen and bottom bar" />
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
