// The phone's live position while a screen wants it.
import { useEffect, useState } from 'react'

export type GpsFix = { lat: number; lng: number; accuracy: number; at: number }

export function useGps(on: boolean): { fix: GpsFix | null; error: string | null } {
  const [fix, setFix] = useState<GpsFix | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (!on) return
    if (!('geolocation' in navigator)) return
    const id = navigator.geolocation.watchPosition(
      (p) => { setFix({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: Math.round(p.coords.accuracy), at: p.timestamp }); setError(null) },
      (e) => setError(e.code === e.PERMISSION_DENIED ? 'Location is turned off for this app. Allow it in the phone settings.' : 'No GPS fix yet.'),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 30000 },
    )
    return () => navigator.geolocation.clearWatch(id)
  }, [on])
  return { fix, error: 'geolocation' in navigator ? error : 'This phone has no GPS.' }
}
