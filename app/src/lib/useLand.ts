// Paddock-level records worked out on the phone: spray grazing withholds.
// Mirrors public.paddock_grazing_withholds.
import { useMemo } from 'react'
import { todayLocal } from './stock'
import { useTable } from './useSync'

// Paddock id -> last day stock mustn't graze it (grazable the day after).
export function useSprayWithholds(): Map<string, string> {
  const sprays = useTable('spray_records')
  const links = useTable('spray_record_paddocks')
  return useMemo(() => {
    const today = todayLocal()
    const live = new Map((sprays ?? []).filter((s) => s.grazing_withhold_until && String(s.grazing_withhold_until) >= today).map((s) => [String(s.id), String(s.grazing_withhold_until)]))
    const out = new Map<string, string>()
    for (const l of links ?? []) {
      const until = live.get(String(l.spray_record_id))
      if (!until) continue
      const pid = String(l.paddock_id)
      if (!out.has(pid) || until > out.get(pid)!) out.set(pid, until)
    }
    return out
  }, [sprays, links])
}
