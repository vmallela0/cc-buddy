// Progress: XP, levels, moods and roster unlocks. Pure logic, no `$`. Nothing here decays and
// nothing is lost by staying away: XP only goes up, a mood is this session's and fades back to
// content on its own, and a buddy never goes hungry or runs off.

import type { Moment } from './engine.ts'

// what each moment is worth; a pet or a hello earns nothing, so there is nothing to farm
export const XP: Partial<Record<Moment, number>> = { edit: 1, 'bash-ok': 1, 'bash-fail': 1, 'test-pass': 5, 'test-fail': 1, commit: 10, 'turn-done': 2 }

// level 2 at 20 XP, 3 at 80, 5 at 320, 10 at 1620: quick at first, then a slow climb
export const levelOf = (xp: number): number => Math.floor(Math.sqrt(Math.max(0, xp) / 20)) + 1
export const xpFor = (level: number): number => 20 * (level - 1) ** 2

// "12/45 to level 4", for the card
export function levelProgress(xp: number): { level: number; into: number; span: number } {
  const level = levelOf(xp)
  const from = xpFor(level)
  return { level, into: xp - from, span: xpFor(level + 1) - from }
}

// one new roster buddy per this many commits, on top of the one you start with
export const COMMITS_PER_UNLOCK = 25

// how many of the roster are open: the first, one more per 25 commits, never fewer than a
// grandfathered count (someone who rotated through ten before unlocks existed keeps all ten)
export function unlockedCount(commits: number, grandfathered: number, size: number): number {
  return Math.max(1, Math.min(size, Math.max(grandfathered, 1 + Math.floor(Math.max(0, commits) / COMMITS_PER_UNLOCK))))
}

export const commitsToNextUnlock = (commits: number): number => COMMITS_PER_UNLOCK - (Math.max(0, commits) % COMMITS_PER_UNLOCK)

export type Mood = 'content' | 'focused' | 'proud' | 'worried' | 'sleepy' | 'happy'

// what the session has been like lately; kept in memory only
export type Recent = { lastEvent: number; lastWin: number; lastPet: number; failStreak: number }
export const freshRecent = (now: number): Recent => ({ lastEvent: now, lastWin: 0, lastPet: 0, failStreak: 0 })

export function note(recent: Recent, moment: Moment, now: number): Recent {
  const r = { ...recent, lastEvent: now }
  if (moment === 'pet') r.lastPet = now
  if (moment === 'test-pass' || moment === 'commit') {
    r.lastWin = now
    r.failStreak = 0
  }
  if (moment === 'test-fail' || moment === 'bash-fail') r.failStreak += 1
  if (moment === 'bash-ok' || moment === 'edit') r.failStreak = Math.max(0, r.failStreak - 1)
  return r
}

// most recent and most specific wins: a pet, then a streak of failures, then a win, then work
export function moodOf(recent: Recent, working: boolean, now: number): Mood {
  if (now - recent.lastPet < 60_000) return 'happy'
  if (recent.failStreak >= 3) return 'worried'
  if (recent.lastWin && now - recent.lastWin < 120_000) return 'proud'
  if (working) return 'focused'
  if (now - recent.lastEvent > 20 * 60_000) return 'sleepy'
  return 'content'
}

// the mood as a word, with a symbol so it never rests on colour
export const MOOD_MARK: Record<Mood, string> = { content: '○', focused: '»', proud: '↑', worried: '!', sleepy: 'z', happy: '♥' }

// subagent chatter, said in any voice; {n} is how many are out
export const AGENT_LINES = {
  out: ['{n} agents out. i am counting.', '{n} helpers dispatched. i will watch the door.', 'sent {n} off. i will keep their seats warm.'],
  back: ['all agents back. roll call complete.', 'everyone is home.', 'the agents returned. none lost.'],
}
