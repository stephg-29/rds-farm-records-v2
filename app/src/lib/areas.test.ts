import { describe, expect, it } from 'vitest'
import { AREAS, areaByKey, isInArea, sectionOf } from './areas'

const r = (p: string) => p.split('/').filter(Boolean)

describe('areas and sections', () => {
  it('puts each screen in its section', () => {
    expect(sectionOf(r('/records/treatments/abc'))).toBe('stock')
    expect(sectionOf(r('/records/feed/rations/new'))).toBe('stock')
    expect(sectionOf(r('/stock/x/move'))).toBe('stock')
    expect(sectionOf(r('/records/spray/new'))).toBe('paddocks')
    expect(sectionOf(r('/issues/new'))).toBe('paddocks')
    expect(sectionOf(r('/setup/paddocks/p1'))).toBe('paddocks')
    expect(sectionOf(r('/records/vehicles/v1/service'))).toBe('more')
    expect(sectionOf(r('/setup/modules'))).toBe('more')
    expect(sectionOf(r('/map'))).toBeNull()
    expect(sectionOf(r('/'))).toBeNull()
  })

  it('every area in a section has a path that the section rule agrees with', () => {
    for (const a of AREAS.filter((x) => x.section)) expect(sectionOf(r(a.path)), a.key).toBe(a.section)
  })

  it('a chosen tab lights up on its own screens', () => {
    expect(isInArea(areaByKey('feed')!, r('/records/feed/feed'))).toBe(true)
    expect(isInArea(areaByKey('feed')!, r('/records/treatments'))).toBe(false)
    expect(isInArea(areaByKey('paddocks')!, r('/records/spray/x'))).toBe(true)
    expect(isInArea(areaByKey('stock')!, r('/stock/x'))).toBe(true)
  })
})
