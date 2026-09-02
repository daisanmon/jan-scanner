import { describe, expect, it } from 'vitest'
import { isDifferentJstDate, toJstDateKey } from './jstDate'

describe('JST date boundaries', () => {
  it('changes date at midnight in Asia/Tokyo', () => {
    expect(toJstDateKey('2026-08-28T14:59:59.999Z')).toBe('2026-08-28')
    expect(toJstDateKey('2026-08-28T15:00:00.000Z')).toBe('2026-08-29')
    expect(isDifferentJstDate(
      '2026-08-28T14:59:59.999Z',
      new Date('2026-08-28T15:00:00.000Z'),
    )).toBe(true)
  })

  it('does not treat a UTC date change as a JST date change', () => {
    expect(isDifferentJstDate(
      '2026-08-27T23:59:59.999Z',
      new Date('2026-08-28T00:00:00.000Z'),
    )).toBe(false)
  })
})
