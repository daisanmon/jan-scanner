import { describe, expect, it } from 'vitest'
import { isValidJanCode } from './janCode'

describe('existing JAN validation', () => {
  it('continues to accept the confirmed JAN code', () => {
    expect(isValidJanCode('4580563378953')).toBe(true)
  })

  it('rejects an invalid check digit', () => {
    expect(isValidJanCode('4580563378954')).toBe(false)
  })
})
