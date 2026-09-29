import { describe, expect, test } from 'bun:test'
import { commitsToNextUnlock, freshRecent, levelOf, levelProgress, moodOf, note, unlockedCount, xpFor } from '../hooks/buddy/progress.ts'

describe('levels', () => {
  test('the curve', () => {
    expect([0, 19, 20, 79, 80, 320, 1620].map(levelOf)).toEqual([1, 1, 2, 2, 3, 5, 10])
    for (let l = 1; l < 30; l++) expect(levelOf(xpFor(l))).toBe(l)
  })
  test('progress within a level', () => {
    expect(levelProgress(30)).toEqual({ level: 2, into: 10, span: 60 })
  })
})

describe('unlocks', () => {
  test('one to start, one more per 25 commits, capped at the roster', () => {
    expect(unlockedCount(0, 1, 49)).toBe(1)
    expect(unlockedCount(24, 1, 49)).toBe(1)
    expect(unlockedCount(25, 1, 49)).toBe(2)
    expect(unlockedCount(10_000, 1, 49)).toBe(49)
    expect(commitsToNextUnlock(0)).toBe(25)
    expect(commitsToNextUnlock(24)).toBe(1)
  })
  test('grandfathered buddies stay open', () => {
    expect(unlockedCount(0, 12, 49)).toBe(12)
    expect(unlockedCount(0, 99, 49)).toBe(49)
  })
})

describe('moods', () => {
  const t0 = 1_000_000
  test('content by default, focused while working', () => {
    const r = freshRecent(t0)
    expect(moodOf(r, false, t0)).toBe('content')
    expect(moodOf(r, true, t0)).toBe('focused')
  })
  test('three failures in a row worry it; a win clears that', () => {
    let r = freshRecent(t0)
    for (let i = 0; i < 3; i++) r = note(r, 'test-fail', t0 + i)
    expect(moodOf(r, false, t0 + 10)).toBe('worried')
    r = note(r, 'test-pass', t0 + 20)
    expect(moodOf(r, false, t0 + 30)).toBe('proud')
    expect(moodOf(r, false, t0 + 20 + 121_000)).toBe('content')
  })
  test('a pet wins over everything for a minute', () => {
    let r = freshRecent(t0)
    for (let i = 0; i < 3; i++) r = note(r, 'bash-fail', t0)
    r = note(r, 'pet', t0 + 1)
    expect(moodOf(r, true, t0 + 2)).toBe('happy')
    expect(moodOf(r, false, t0 + 61_002)).toBe('worried')
  })
  test('sleepy after twenty quiet minutes, and never worse than that', () => {
    const r = freshRecent(t0)
    expect(moodOf(r, false, t0 + 21 * 60_000)).toBe('sleepy')
    expect(moodOf(r, false, t0 + 400 * 24 * 3_600_000)).toBe('sleepy')
  })
})
