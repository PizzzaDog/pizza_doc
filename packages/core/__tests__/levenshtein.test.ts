import { describe, expect, it } from 'vitest'
import { closestMatches, levenshtein } from '../src/levenshtein.js'

describe('levenshtein', () => {
  it('returns 0 for identical strings', () => {
    expect(levenshtein('', '')).toBe(0)
    expect(levenshtein('hello', 'hello')).toBe(0)
  })

  it('computes expected edit distances', () => {
    expect(levenshtein('kitten', 'sitting')).toBe(3)
    expect(levenshtein('UserService', 'UserServic')).toBe(1)
    expect(levenshtein('abc', '')).toBe(3)
  })
})

describe('closestMatches', () => {
  it('suggests the closest candidate within threshold', () => {
    const matches = closestMatches('UserServic', ['UserService', 'UserRepository', 'EmailService'])
    expect(matches[0]).toBe('UserService')
  })

  it('returns empty when nothing is close', () => {
    const matches = closestMatches('xxxxxx', ['UserService', 'AuthController'])
    expect(matches.length).toBe(0)
  })
})
