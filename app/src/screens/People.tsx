// People (owners only): who can sign in, and as what. Adding someone emails
// them an invite (the invite-user function); they set their own password.
import { useState, type FormEvent } from 'react'
import type { Row } from '../lib/db'
import { supabase } from '../lib/supabase'
import { useFarm } from '../lib/useFarm'
import { useSync, useTable } from '../lib/useSync'
import { Button, Card, Choice, Field, Notice, Page, Row as ListRow, Section, go, inputClass } from '../ui'

const ROLES = [
  { value: 'staff', label: 'Staff' },
  { value: 'contractor', label: 'Contractor' },
  { value: 'owner', label: 'Owner' },
] as const
type Role = (typeof ROLES)[number]['value']
const ROLE_HELP: Record<Role, string> = {
  owner: 'Everything, including prices, modules and people.',
  staff: 'All records and the map. No prices, modules or people.',
  contractor: 'Only their open jobs: the job paddocks on the map, and their spray or fertiliser records.',
}

export function PeopleScreen() {
  const { isOwner } = useFarm()
  const profiles = useTable('profiles')
  if (!isOwner) return <Page title="People" back="/more"><p className="mt-4 text-muted">Only an owner can manage people.</p></Page>
  const list = [...(profiles ?? [])].sort((a, b) => Number(b.active) - Number(a.active) || String(a.full_name).localeCompare(String(b.full_name)))
  return (
    <Page title="People" kicker="Farm" back="/more" action={<Button className="shrink-0" onClick={() => go('/more/people/new')}>Add</Button>}>
      <p className="mt-3 text-muted">Everyone who can sign in to this farm's records.</p>
      <div className="mt-5">
        <Card>
          {list.map((p) => (
            <ListRow key={String(p.user_id)} onClick={() => go(`/more/people/${p.user_id}`)} muted={!p.active}
              label={String(p.full_name)} detail={[ROLES.find((r) => r.value === p.role)?.label, p.phone, p.active ? null : 'No access'].filter(Boolean).join(' · ')} />
          ))}
        </Card>
      </div>
    </Page>
  )
}

export function AddPerson() {
  const { isOwner } = useFarm()
  const { syncNow } = useSync()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [role, setRole] = useState<Role>('staff')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  async function save(e: FormEvent) {
    e.preventDefault()
    if (!navigator.onLine) return setError('Adding a person needs signal (it sends them an email).')
    setBusy(true)
    setError(null)
    const { data, error } = await supabase!.functions.invoke('invite-user', {
      body: { email, full_name: name, phone, role, redirect_to: `${location.origin}${location.pathname}` },
    })
    setBusy(false)
    if (error) {
      let msg = error.message
      try { msg = (await (error as { context?: Response }).context?.json())?.error ?? msg } catch { /* keep message */ }
      return setError(msg)
    }
    syncNow()
    setDone(data?.invited ? `An invite has gone to ${email}. They tap the link in it and choose a password.` : `${name} already had a login, so they've been added to this farm. They sign in as usual.`)
  }

  if (!isOwner) return null
  if (done) return (
    <Page title="Added" back="/more/people">
      <div className="mt-5"><Notice tone="ok">{done}</Notice></div>
      <p className="mt-3 text-sm text-muted">No email? Check their spam folder. The invite link works once; add them again to send a new one.</p>
      <Button className="mt-5 w-full" onClick={() => go('/more/people')}>Back to people</Button>
    </Page>
  )
  return (
    <Page title="Add a person" kicker="People" back="/more/people">
      <form onSubmit={save} className="mt-6 flex flex-col gap-4">
        <Field id="name" label="Name"><input id="name" required value={name} onChange={(e) => setName(e.target.value)} className={inputClass} /></Field>
        <Field id="email" label="Email"><input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} /></Field>
        <Field id="phone" label="Mobile" hint="Shown as 'treated by' on LPA treatment records."><input id="phone" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className={inputClass} /></Field>
        <Field id="role" label="Role" hint={ROLE_HELP[role]}><Choice value={role} onChange={setRole} options={[...ROLES]} /></Field>
        {error && <Notice tone="alert">{error}</Notice>}
        <Button type="submit" disabled={busy}>{busy ? 'Sending…' : 'Send invite'}</Button>
      </form>
    </Page>
  )
}

export function PersonScreen({ id }: { id: string }) {
  const profiles = useTable('profiles')
  const { ctx } = useSync()
  const { isOwner } = useFarm()
  if (!profiles || !isOwner) return null
  const p = profiles.find((x) => x.user_id === id)
  if (!p) return <Page title="Not found" back="/more/people"><p className="mt-4 text-muted">That person isn't on this phone.</p></Page>
  return <PersonForm key={id} p={p} self={id === ctx.userId} />
}

function PersonForm({ p, self }: { p: Row; self: boolean }) {
  const { edit } = useSync()
  const [name, setName] = useState(String(p.full_name))
  const [phone, setPhone] = useState(String(p.phone ?? ''))
  const [role, setRole] = useState<Role>(p.role as Role)
  const [saved, setSaved] = useState(false)
  const id = String(p.user_id)

  return (
    <Page title={String(p.full_name)} kicker="People" back="/more/people">
      <form onSubmit={async (e) => { e.preventDefault(); await edit('profiles', id, { full_name: name.trim(), phone: phone.trim() || null, role }); setSaved(true) }} className="mt-6 flex flex-col gap-4">
        <Field id="name" label="Name"><input id="name" value={name} onChange={(e) => setName(e.target.value)} className={inputClass} /></Field>
        <Field id="phone" label="Mobile"><input id="phone" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className={inputClass} /></Field>
        <Field id="role" label="Role" hint={self ? "You can't change your own role." : ROLE_HELP[role]}><Choice value={role} onChange={setRole} options={[...ROLES]} disabled={self} /></Field>
        {saved && <Notice tone="ok">Saved.</Notice>}
        <Button type="submit">Save</Button>
      </form>
      {!self && (
        <Section title="Access">
          {p.active
            ? <Button kind="danger" className="w-full" onClick={() => edit('profiles', id, { active: false })}>Stop their access</Button>
            : <Button kind="secondary" className="w-full" onClick={() => edit('profiles', id, { active: true })}>Give access back</Button>}
          <p className="mt-2 text-xs text-muted">Their records stay, with their name on them. They just can't sign in to this farm.</p>
        </Section>
      )}
    </Page>
  )
}
