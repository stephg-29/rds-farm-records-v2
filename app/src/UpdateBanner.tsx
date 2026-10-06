// A new version of the app has been put up: offer to switch to it. Nothing
// changes until the person taps Update, so a record half-entered isn't lost.
import { useRegisterSW } from 'virtual:pwa-register/react'

export function UpdateBanner() {
  const { needRefresh: [needRefresh, setNeedRefresh], updateServiceWorker } = useRegisterSW({
    // Check for a new version every hour while the app is open.
    onRegisteredSW(_url, reg) { if (reg) setInterval(() => { reg.update().catch(() => undefined) }, 60 * 60 * 1000) },
  })
  if (!needRefresh) return null
  return (
    <div className="fixed inset-x-3 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-[2000] flex items-center gap-3 rounded-2xl bg-green-deep px-4 py-3 text-paper shadow-lg print:hidden">
      <span className="flex-1 text-sm">A new version of Farm Records is ready.</span>
      <button onClick={() => setNeedRefresh(false)} className="text-sm opacity-80">Later</button>
      <button onClick={() => updateServiceWorker(true)} className="rounded-full bg-butter px-4 py-2 text-sm font-semibold text-ink">Update</button>
    </div>
  )
}
