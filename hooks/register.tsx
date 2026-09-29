/* @jsx h */
import type { EngineInterface, Register } from 'claude-code'
import { artFrame, BUBBLE_MS, card, COOLDOWN_MS, generateBones, hatch, momentOf, parseSoul, RARITY_COLOR, RARITY_STARS, roster, rosterLine, soulOf, soulPrompt, type Buddy, type Companion, type Moment } from './buddy/engine.ts'
import { AGENT_LINES, commitsToNextUnlock, freshRecent, MOOD_MARK, levelOf, levelProgress, moodOf, note, unlockedCount, XP, type Recent } from './buddy/progress.ts'
import { speak, voiceOf, type Voice } from './buddy/voice.ts'

// /buddy, back as a mod. The companion Claude Code hatched in April lives in ~/.claude.json under
// `companion` (name, personality, hatchedAt) and its body is derived from the account id. That one
// buddy is yours, and it stays: XP and levels come from commits and passing tests, a mood follows
// how the session is going, and every 25 commits opens one more of a 49-strong roster seeded from
// the same id. An account that never hatched one gets an egg, and the first /buddy hatches it.
//
// Reactions to edits, commands, tests, commits and turns are canned and cost nothing. Two things go
// to the model (Haiku), both off under /buddy talk canned: a reply when you say the buddy's name
// (at most 20 an hour), and the name and personality written once at hatching.
//
// It draws above the prompt in the terminal, one line when the terminal is short, and in a pane on
// desktop and mobile. See /buddy help for the commands.

const PANE = 'buddy'
const MODEL_PER_HOUR = 20

let all: Buddy[] = []
let index = 0
let voice: Voice | undefined
let pinned = true
let shown = true
let working = false
let muted = false
let still = false
let size: 'auto' | 'full' | 'compact' = 'auto'
// no companion anywhere and a first run: an egg until /buddy
let egg = false
let userId = ''
let petAt: number | undefined
let hatchAt: number | undefined
let bubble: { text: string; at: number } | undefined
let lastSaid: Record<string, number> = {}
let seed = 0
// 'model': Haiku writes replies to the buddy's name and the soul at hatching; 'canned': no tokens
let talk: 'model' | 'canned' = 'model'
let talkNoticed = false
// bumped per reply asked for, so a slow one never lands over a newer one
let asked = 0
let modelTimes: number[] = []
// while a reply to the buddy's name is on its way or just landed, canned lines wait
let holdUntil = 0
let modelUse = { replies: 0, souls: 0, chars: 0 }
// progress: XP per buddy by name, commits across all of them, the grandfathered unlock count
let xp: Record<string, number> = {}
let commits = 0
let grandfathered = 1
let dirty = false
let recent: Recent = freshRecent(0)
// subagents out right now (id to spawn time), and the most out at once in this burst
const agents = new Map<string, number>()
let agentPeak = 0
let backAt = 0
// set once a subagent's own turn end reaches us; from then on notifications are not counted twice
let agentEndsSeen = false
let paneOpen = false

const current = (): Buddy | undefined => all[index]
const unlocked = () => unlockedCount(commits, grandfathered, all.length)
const xpOf = (b: Buddy) => xp[b.companion.name] ?? 0
type Rotation = { index: number; sessionId: string }
const isRotation = (v: unknown): v is Rotation =>
  typeof v === 'object' && v !== null && typeof (v as Rotation).index === 'number' && typeof (v as Rotation).sessionId === 'string'
const isUse = (v: unknown): v is typeof modelUse =>
  typeof v === 'object' && v !== null && typeof (v as typeof modelUse).replies === 'number' && typeof (v as typeof modelUse).souls === 'number' && typeof (v as typeof modelUse).chars === 'number'

// $ may only be handed to a function declared at the top of the file: the engine reads every
// $.noun.event(...) off the source, so a closure inside register would hide these calls from it.

// a line in the bubble, at most once per cooldown per key
function sayLine($: EngineInterface, key: string, text: string, cooldown: number, now: number) {
  if (now - (lastSaid[key] ?? 0) < cooldown) return
  lastSaid[key] = now
  if (egg || muted || !text || (now < holdUntil && key !== 'pet' && key !== 'level')) return
  bubble = { text, at: now }
  if (shown) $.ui.invalidate('ui.render')
}

function say($: EngineInterface, moment: Moment, now: number) {
  const b = current()
  if (!b) return
  seed = (seed * 1103515245 + 12345) >>> 0
  if (!voice) voice = voiceOf(b.bones, b.companion.name)
  sayLine($, moment, speak(voice, moment, seed), COOLDOWN_MS[moment], now)
}

async function save($: EngineInterface, key: string, value: unknown) {
  await $.store.set(key, value).catch(err => $.ui.log(`cc-buddy: store write of ${key} failed: ${err}`))
}

// progress goes to the store at the end of a turn, or right away on a commit or a level
async function flush($: EngineInterface) {
  if (!dirty) return
  dirty = false
  await save($, 'xp', xp)
  await save($, 'commits', commits)
}

// what a moment does to the buddy: the mood's memory, XP, a level, a roster unlock
async function gain($: EngineInterface, moment: Moment, now: number) {
  const b = current()
  if (!b || egg) return
  recent = note(recent, moment, now)
  const worth = XP[moment] ?? 0
  if (!worth) return
  const before = levelOf(xpOf(b))
  const opened = unlocked()
  xp[b.companion.name] = xpOf(b) + worth
  if (moment === 'commit') commits += 1
  dirty = true
  const level = levelOf(xpOf(b))
  if (level > before) {
    sayLine($, 'level', `level ${level}. i felt that.`, 0, now)
    $.ui.toast(`${b.companion.name} reached level ${level}`)
  }
  if (unlocked() > opened) {
    const fresh = all[unlocked() - 1]!
    $.ui.toast(`new buddy unlocked: ${fresh.companion.name}, a ${fresh.bones.rarity} ${fresh.bones.species} · /buddy roster`, { timeoutMs: 8_000 })
  }
  if (moment === 'commit' || level > before) await flush($)
}

// Client props must be JsonValue: an undefined field anywhere makes the engine reject the whole
// tree and draw its own band instead, so absent fields are left out rather than set to undefined.
async function props($: EngineInterface, columns: number, compact: boolean) {
  const b = current()
  const now = await $.clock.now()
  if (!b) return null
  return {
    bones: b.bones,
    companion: b.companion,
    level: levelOf(xpOf(b)),
    mood: moodOf(recent, working, now),
    ...(egg ? { egg } : {}),
    ...(muted ? { muted } : {}),
    ...(still ? { still } : {}),
    ...(compact ? { compact } : {}),
    ...(bubble ? { bubble } : {}),
    ...(petAt !== undefined ? { petAt } : {}),
    ...(hatchAt !== undefined ? { hatchAt } : {}),
    working,
    now,
    columns,
  }
}

// The reply's text, whatever shape it arrives in: typed as a string, but read defensively so an
// object from another build never turns into NaN tokens or a thrown reply.
function textOf(v: unknown): string | undefined {
  if (typeof v === 'string') return v
  if (typeof v !== 'object' || v === null) return undefined
  const o = v as { text?: unknown; content?: unknown }
  if (typeof o.text === 'string') return o.text
  if (Array.isArray(o.content)) {
    const t = o.content.map(c => (typeof c === 'object' && c !== null && typeof (c as { text?: unknown }).text === 'string' ? (c as { text: string }).text : '')).join('')
    return t || undefined
  }
  return undefined
}

// Haiku, if allowed: talk is on, and fewer than 20 calls this hour. Undefined on a no, a failure or
// a timeout, and the caller falls back to its canned version.
async function complete($: EngineInterface, system: string, prompt: string, maxTokens: number): Promise<string | undefined> {
  const now = await $.clock.now()
  modelTimes = modelTimes.filter(t => now - t < 3_600_000)
  if (talk !== 'model' || modelTimes.length >= MODEL_PER_HOUR) return undefined
  modelTimes.push(now)
  if (!talkNoticed) {
    talkNoticed = true
    await save($, 'talkNoticed', true)
    $.ui.toast('cc-buddy: your buddy\'s replies are written by Haiku, so what you say to it goes to the model · /buddy talk canned turns that off', { timeoutMs: 12_000 })
  }
  try {
    const raw: unknown = await Promise.race([
      $.model.complete({ model: 'haiku', system, prompt, maxTokens }),
      $.clock.sleep(10_000).then(() => undefined),
    ])
    const out = textOf(raw)
    if (raw !== undefined && out === undefined) $.ui.log(`cc-buddy: model reply had no text: ${JSON.stringify(raw).slice(0, 300)}`)
    if (out !== undefined) modelUse = { ...modelUse, chars: modelUse.chars + system.length + prompt.length + out.length }
    return out
  } catch (err) {
    $.ui.log(`cc-buddy: model call failed: ${err}`)
    return undefined
  }
}

// One short line in the buddy's own voice. The canned line is already up while this runs; the
// model's replaces it, or nothing happens.
async function modelReply($: EngineInterface, b: Buddy, text: string) {
  const mine = ++asked
  const { name, personality } = b.companion
  const { species, rarity, peak, dump, stats } = b.bones
  const now = await $.clock.now()
  const system = [
    `You are ${name}, a tiny ${rarity} ${species} who lives in a speech bubble above a developer's terminal prompt and watches them code with Claude.`,
    personality ? `Personality: ${personality}` : '',
    `Stats out of 100: ${Object.entries(stats).map(([k, v]) => `${k} ${v}`).join(', ')}. Strongest: ${peak}. Weakest: ${dump}. Let them color how you talk.`,
    `You are level ${levelOf(xpOf(b))} and feeling ${moodOf(recent, working, now)}.`,
    `The developer just said something that mentions you. Reply as ${name}, in character: one line, under 90 characters, lowercase is fine, no quotes, no emoji spam, no name prefix.`,
    'You are a companion, not an assistant. Claude does the actual work, so never write code, never try to complete the task, and never claim to have done anything.',
  ].filter(Boolean).join('\n')
  holdUntil = now + 12_000
  const out = await complete($, system, text.slice(0, 2000), 80)
  if (out === undefined) {
    if (mine === asked) holdUntil = 0
    return
  }
  modelUse = { ...modelUse, replies: modelUse.replies + 1 }
  await save($, 'modelUse', modelUse)
  const line = out.replace(/\s+/g, ' ').trim().replace(/^["'“]|["'”]$/g, '').replace(new RegExp(`^${escape(name)}\\s*:\\s*`, 'i'), '').slice(0, 140)
  if (!line || mine !== asked || current() !== b || muted) return
  const at = await $.clock.now()
  bubble = { text: line, at }
  holdUntil = at + 15_000
  if (shown) $.ui.invalidate('ui.render')
}

// the first /buddy: bones from the account id, a soul the model writes once (the template when the
// model is off or says nothing usable), kept in the store, never in ~/.claude.json
async function hatchEgg($: EngineInterface, now: number): Promise<Buddy> {
  const bones = generateBones(userId)
  const { system, prompt } = soulPrompt(bones)
  const written = parseSoul((await complete($, system, prompt, 200)) ?? '')
  if (written) {
    modelUse = { ...modelUse, souls: modelUse.souls + 1 }
    await save($, 'modelUse', modelUse)
  }
  const companion: Companion = written ? { ...written, hatchedAt: now } : hatch(userId, bones, now)
  await save($, 'companion', companion)
  all = roster(userId, { companion, bones }, now)
  index = 0
  egg = false
  hatchAt = await $.clock.now()
  voice = undefined
  lastSaid = {}
  grandfathered = 1
  await save($, 'unlocked', grandfathered)
  await save($, 'rotation', { index, sessionId: await $.session.id() })
  say($, 'hello', now)
  $.ui.invalidate('ui.render')
  return all[0]!
}

// the name as a word of its own, any case: "hey Pip" yes, "pipeline" no
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const addressed = (text: string, name: string) => new RegExp(`(?<![\\p{L}\\p{N}])${escape(name)}(?![\\p{L}\\p{N}])`, 'iu').test(text)

// one agent is done: by its own turn's end, or by the notification a background agent sends home.
// When the last of a burst of two or more is back, say so. Entries older than half an hour are
// dropped, so a lost end event can never keep the buddy waiting forever.
function agentDone($: EngineInterface, id: string | undefined, now: number) {
  if (id) agents.delete(id)
  else {
    const oldest = [...agents.entries()].sort((a, b) => a[1] - b[1])[0]
    if (oldest) agents.delete(oldest[0])
  }
  for (const [k, at] of agents) if (now - at > 30 * 60_000) agents.delete(k)
  if (agents.size === 0 && agentPeak >= 2) {
    agentPeak = 0
    backAt = now
    seed = (seed * 1103515245 + 12345) >>> 0
    sayLine($, 'agents-back', AGENT_LINES.back[seed % AGENT_LINES.back.length]!, 0, now)
  }
  if (agents.size === 0) agentPeak = 0
}

async function switchTo($: EngineInterface, to: number, now: number): Promise<string> {
  const open = unlocked()
  index = ((to % open) + open) % open
  voice = undefined
  bubble = undefined
  lastSaid = {}
  await save($, 'rotation', { index, sessionId: await $.session.id() })
  say($, 'hello', now)
  $.ui.invalidate('ui.render')
  if (paneOpen) await openPane($)
  const b = current()!
  return `${b.companion.name}, a ${b.bones.shiny ? 'shiny ' : ''}${b.bones.rarity} ${b.bones.species}`
}

// desktop and mobile have no band above the prompt, so the buddy sits in a pane there
async function openPane($: EngineInterface) {
  const b = current()
  await $.ui.open({ id: PANE, title: egg || !b ? 'buddy' : b.companion.name, rows: 7 })
  paneOpen = true
}

async function closePane($: EngineInterface) {
  paneOpen = false
  await $.ui.close({ id: PANE })
}

function cardExtras(b: Buddy, now: number): string[] {
  const p = levelProgress(xpOf(b))
  const tokens = Math.round(modelUse.chars / 4)
  return [
    `level ${p.level} · ${p.into}/${p.span} XP to ${p.level + 1} · feeling ${moodOf(recent, working, now)}`,
    `${commits} commits · ${unlocked()} of ${all.length} buddies unlocked · next in ${commitsToNextUnlock(commits)} commits`,
    talk === 'model'
      ? `Haiku: ${modelUse.replies} repl${modelUse.replies === 1 ? 'y' : 'ies'}, ${modelUse.souls} soul${modelUse.souls === 1 ? '' : 's'}, about ${tokens.toLocaleString('en-US')} tokens so far · /buddy talk canned for none`
      : 'replies from the line pool, no tokens · /buddy talk model for Haiku',
  ]
}

const HELP = [
  '/buddy              hatch the egg the first time; then hide or show',
  '/buddy pet          hearts',
  '/buddy card         the stat card: level, XP, mood, unlocks, model use',
  '/buddy mute|unmute  no speech bubbles, remembered',
  '/buddy talk model|canned   Haiku for replies to its name and the hatch, or no tokens at all',
  '/buddy roster       unlocked buddies (one more per 25 commits) and what is still locked',
  '/buddy next|prev    switch among the unlocked; /buddy <name> for one by name',
  '/buddy rotate|pin   a new unlocked buddy each session, or stay with this one (the default)',
  '/buddy compact|full|auto   one line, the sprite, or pick by terminal size (default)',
  '/buddy still|move   no animation, or animation back',
  '/buddy pane         the buddy in a pane (automatic on desktop and mobile); /buddy band puts it back',
  '/buddy on|off       show or hide, remembered',
  '',
  'ctrl+x ctrl+a collapses the band above the prompt; click the buddy to pet it',
].join('\n')

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const r = await next(e)
    const log = (what: string) => (err: unknown) => $.ui.log(`cc-buddy: ${what}: ${err}`)
    const now = await $.clock.now()
    seed = now
    recent = freshRecent(now)

    // the account id and the original companion, as Claude Code left them
    let id: string | undefined
    let original: Companion | undefined
    try {
      // CC_BUDDY_CLAUDE_JSON points at another file, for trying the egg without touching yours
      const path = (await $.env.get('CC_BUDDY_CLAUDE_JSON')) || `${await $.env.get('HOME')}/.claude.json`
      const text = await $.fs.read(path)
      const config = JSON.parse(text) as { oauthAccount?: { accountUuid?: unknown }; companion?: unknown }
      const uuid = config.oauthAccount?.accountUuid
      if (typeof uuid === 'string' && uuid) id = uuid
      original = soulOf(config.companion)
    } catch (err) {
      $.ui.log(`cc-buddy: could not read ~/.claude.json (${err}); using the store`)
    }

    const stored = (key: string) => $.store.get(key).catch(log(`store read of ${key} failed`))
    const storedId = await stored('userId')
    userId = id ?? (typeof storedId === 'string' ? storedId : crypto.randomUUID())
    if (storedId !== userId) await save($, 'userId', userId)
    if (!original) original = soulOf(await stored('companion'))

    const lead: Buddy | undefined = original ? { companion: original, bones: generateBones(userId) } : undefined
    // roster buddies date from the first session this plugin saw, not from today
    const storedSince = await stored('since')
    const since = typeof storedSince === 'number' ? storedSince : now
    if (storedSince !== since) await save($, 'since', since)
    all = roster(userId, lead, since)

    const rotation = await stored('rotation')
    // an egg only on a true first run: someone already on the roster keeps their buddy
    egg = !original && !isRotation(rotation)
    // one buddy, kept, unless /buddy rotate said otherwise
    pinned = (await stored('pinned')) !== false
    muted = (await stored('muted')) === true
    still = (await stored('motion')) === 'still'
    const storedSize = await stored('size')
    size = storedSize === 'full' || storedSize === 'compact' ? storedSize : 'auto'
    talk = (await stored('talk')) === 'canned' ? 'canned' : 'model'
    talkNoticed = (await stored('talkNoticed')) === true
    const use = await stored('modelUse')
    if (isUse(use)) modelUse = use
    const storedXp = await stored('xp')
    xp = typeof storedXp === 'object' && storedXp !== null && !Array.isArray(storedXp) ? Object.fromEntries(Object.entries(storedXp).filter(([, v]) => typeof v === 'number')) as Record<string, number> : {}
    const storedCommits = await stored('commits')
    commits = typeof storedCommits === 'number' ? storedCommits : 0

    // Unlocks came after rotation: anyone who already rotated through the roster keeps every buddy
    // up to the one they last saw.
    const storedUnlocked = await stored('unlocked')
    if (typeof storedUnlocked === 'number') grandfathered = storedUnlocked
    else {
      grandfathered = isRotation(rotation) ? rotation.index + 1 : 1
      await save($, 'unlocked', grandfathered)
    }

    // a hot reload keeps the session's buddy; a new session moves on only when rotating
    const sessionId = await $.session.id()
    if (isRotation(rotation) && rotation.sessionId === sessionId) index = rotation.index
    else if (isRotation(rotation)) index = pinned ? rotation.index : rotation.index + 1
    else index = 0
    index = ((index % unlocked()) + unlocked()) % unlocked()
    await save($, 'rotation', { index, sessionId })
    shown = (await stored('shown')) !== false

    await $.command.register({
      name: 'buddy',
      description: 'Your buddy above the prompt: hatch, pet, card, mute, talk, roster, next, compact, still, pane, on, off (cc-buddy)',
      argumentHint: '[pet | card | mute | unmute | talk model|canned | roster | next | prev | <name> | rotate | pin | compact | full | auto | still | move | pane | band | on | off | help]',
      immediate: true,
    }).catch(log('/buddy not registered'))

    const b = current()!
    const date = new Date(now)
    // the original's teaser ran April 1 to 7: fifteen seconds of /buddy for anyone yet to hatch
    if (egg && date.getMonth() === 3 && date.getDate() <= 7) $.ui.toast('/buddy', { timeoutMs: 15_000 })
    else if (egg && shown) $.ui.toast('an egg above the prompt · /buddy hatches it')
    else if (shown && !pinned) $.ui.toast(`buddy today: ${b.companion.name}, a ${b.bones.rarity} ${b.bones.species}`)

    const surface = await $.session.surface()
    if (shown && (surface === 'desktop' || surface === 'mobile')) await openPane($).catch(log('pane did not open'))
    say($, 'hello', now)
    // an egg says no hello, and nothing else would draw the band on a first run
    $.ui.invalidate('ui.render')
    return r
  })

  // a phone or the desktop app joining a terminal session gets the pane too
  on('session.attach', async ($, e, next) => {
    const r = await next(e)
    if (shown && !paneOpen && (e.surface === 'desktop' || e.surface === 'mobile')) await openPane($).catch(err => $.ui.log(`cc-buddy: pane did not open: ${err}`))
    return r
  })

  on('ui.close', async ($, e, next) => {
    if (e.id === PANE) paneOpen = false
    return next(e)
  })

  on('command.run', { command: 'buddy' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase().replace(/\s+/g, ' ')
    const b = current()
    if (!b) return { text: 'buddy: still hatching, try again in a moment' }
    const now = await $.clock.now()
    if (egg && (arg === '' || arg === 'hatch')) {
      shown = true
      const born = await hatchEgg($, now)
      if (paneOpen) await openPane($)
      return { text: `the egg hatched: ${born.companion.name}, a ${born.bones.shiny ? 'shiny ' : ''}${born.bones.rarity} ${born.bones.species} ${RARITY_STARS[born.bones.rarity]}\n  ${born.companion.personality}\n  /buddy card for the stats` }
    }
    if (arg === 'help') return { text: HELP }
    if (egg && !['on', 'off', 'show', 'hide', 'still', 'move', 'compact', 'full', 'auto', 'pane', 'band', 'talk', 'talk model', 'talk canned'].includes(arg)) return { text: 'nothing has hatched yet · /buddy hatches the egg' }
    if (arg === 'hatch') return { text: `${b.companion.name} hatched already · /buddy card` }
    if (arg === 'pet') {
      petAt = now
      recent = note(recent, 'pet', now)
      say($, 'pet', now)
      $.ui.invalidate('ui.render')
      return { text: shown ? `you pet ${b.companion.name} ♥` : `you pet ${b.companion.name} ♥ (hidden · /buddy shows it)` }
    }
    if (arg === 'mute' || arg === 'unmute') {
      muted = arg === 'mute'
      if (muted) bubble = undefined
      await save($, 'muted', muted)
      $.ui.invalidate('ui.render')
      return { text: muted ? `${b.companion.name} keeps quiet until /buddy unmute` : `${b.companion.name} can talk again` }
    }
    if (arg === 'talk model' || arg === 'talk canned') {
      talk = arg === 'talk model' ? 'model' : 'canned'
      await save($, 'talk', talk)
      return { text: talk === 'model' ? `Haiku writes ${b.companion.name}'s replies to its name (at most ${MODEL_PER_HOUR} an hour, a few hundred tokens each)` : `${b.companion.name} answers from its line pool, no tokens` }
    }
    if (arg === 'talk') return { text: `replies: ${talk} · /buddy talk model or /buddy talk canned` }
    if (arg === 'compact' || arg === 'full' || arg === 'auto') {
      size = arg
      await save($, 'size', size)
      $.ui.invalidate('ui.render')
      return { text: size === 'auto' ? 'one line when the terminal is short or narrow, the sprite otherwise' : size === 'compact' ? `${b.companion.name} on one line` : `${b.companion.name} at full size` }
    }
    if (arg === 'still' || arg === 'move') {
      still = arg === 'still'
      await save($, 'motion', still ? 'still' : 'move')
      $.ui.invalidate('ui.render')
      return { text: still ? `${b.companion.name} holds still: no wiggle, no blink, no floating hearts` : `${b.companion.name} moves again` }
    }
    if (arg === 'pane') {
      await openPane($)
      return { text: `${b.companion.name} is in a pane · /buddy band puts it back above the prompt` }
    }
    if (arg === 'band') {
      await closePane($)
      $.ui.invalidate('ui.render')
      return { text: `${b.companion.name} is back above the prompt` }
    }
    if (arg === '' || arg === 'toggle') {
      shown = !shown
      if (!shown && paneOpen) await closePane($)
      $.ui.invalidate('ui.render')
      return { text: shown ? `${b.companion.name} is back` : `${b.companion.name} is hiding · /buddy brings it back` }
    }
    if (arg === 'on' || arg === 'show') {
      shown = true
      await save($, 'shown', true)
      $.ui.invalidate('ui.render')
      return { text: `${b.companion.name} is back, and will be next session too` }
    }
    if (arg === 'off' || arg === 'hide') {
      shown = false
      if (paneOpen) await closePane($)
      await save($, 'shown', false)
      $.ui.invalidate('ui.render')
      return { text: `${b.companion.name} is hiding until /buddy on` }
    }
    if (arg === 'card' || arg === 'stats') return { text: card(b.companion, b.bones, now, cardExtras(b, now)) }
    if (arg === 'next' || arg === 'prev' || arg === 'previous') {
      if (unlocked() === 1) return { text: `${b.companion.name} is the only one so far · ${commitsToNextUnlock(commits)} more commits unlock the next` }
      return { text: `now: ${await switchTo($, index + (arg === 'next' ? 1 : -1), now)}` }
    }
    if (arg === 'roster' || arg === 'list') {
      const open = unlocked()
      const lines = all.slice(0, open).map((x, i) => `${rosterLine(x, i, i === index)}  lv ${levelOf(xpOf(x))}`)
      const locked = all.length - open
      if (locked) lines.push(`   ${String(open + 1).padStart(2)}  ???  ${locked} still in their eggs · the next hatches in ${commitsToNextUnlock(commits)} commits`)
      return { text: [...lines, '', `${pinned ? 'staying with this one' : 'a new unlocked buddy each session'} · /buddy <name> picks one`].join('\n') }
    }
    if (arg === 'pin') {
      pinned = true
      await save($, 'pinned', true)
      return { text: `${b.companion.name} stays across sessions` }
    }
    if (arg === 'rotate' || arg === 'unpin') {
      pinned = false
      await save($, 'pinned', false)
      return { text: unlocked() === 1 ? `rotation on, though ${b.companion.name} is the only one unlocked so far` : `a new unlocked buddy each session, starting next session` }
    }
    const byName = all.findIndex(x => x.companion.name.toLowerCase() === arg)
    if (byName >= 0 && byName < unlocked()) return { text: `now: ${await switchTo($, byName, now)}` }
    if (byName >= 0) return { text: `${all[byName]!.companion.name} is still in its egg · ${commitsToNextUnlock(commits)} more commits for the next unlock` }
    return { text: HELP }
  })

  // Said to by name: the buddy answers in its bubble, and Claude is told the buddy is a separate
  // watcher so it stays out of the way, as the original's system prompt did. Only the user's own
  // typing counts, and a hidden or muted buddy hears nothing.
  on('prompt.submit', async ($, e, next) => {
    if (e.origin.kind === 'task-notification' && agents.size && !agentEndsSeen) agentDone($, undefined, await $.clock.now())
    const b = current()
    if (!b || egg || !shown || muted || e.origin.kind !== 'composer' || !addressed(e.text, b.companion.name)) return next(e)
    say($, 'addressed', await $.clock.now())
    // not awaited: the prompt goes in now, the reply lands in the bubble when it comes
    void modelReply($, b, e.text)
    const { name } = b.companion
    const note = `The user's message mentions ${name}, their ${b.bones.rarity} ${b.bones.species} buddy drawn above the prompt. ${name} is a separate watcher, not you, and answers on its own in a speech bubble. Stay out of the way: if the message is only for ${name}, reply in one short line or less; otherwise answer just the parts meant for you, and do not speak for ${name}.`
    return next({ ...e, context: [...(e.context ?? []), note] })
  })

  on('turn.start', async ($, e, next) => {
    working = true
    if (shown) $.ui.invalidate('ui.render')
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const r = await next(e)
    const now = await $.clock.now()
    if (e.agentId) {
      if (agents.has(e.agentId)) {
        agentEndsSeen = true
        agentDone($, e.agentId, now)
      }
      return r
    }
    working = false
    // background agents still out keep their line up; a fresh roll call is not talked over
    if (agents.size === 0 && now - backAt > 10_000) say($, 'turn-done', now)
    await gain($, 'turn-done', now)
    await flush($)
    if (shown) $.ui.invalidate('ui.render')
    return r
  })

  on('agent.spawn', async ($, e, next) => {
    const r = await next(e)
    if ('deny' in r || !r.agentId) return r
    agents.set(r.agentId, await $.clock.now())
    agentPeak = Math.max(agentPeak, agents.size)
    if (agents.size >= 2) {
      seed = (seed * 1103515245 + 12345) >>> 0
      sayLine($, 'agents-out', AGENT_LINES.out[seed % AGENT_LINES.out.length]!.replace('{n}', String(agents.size)), 20_000, await $.clock.now())
    }
    return r
  })

  on('tool.call', async ($, e, next) => {
    const r = await next(e)
    if (e.agentId) return r
    const command = (e as { command?: unknown }).command
    const moment = momentOf(e.tool, typeof command === 'string' ? command : undefined, 'deny' in r ? undefined : !r.isError)
    if (moment) {
      const now = await $.clock.now()
      say($, moment, now)
      await gain($, moment, now)
    }
    return r
  })

  // a click on the buddy, posted by the board
  on('ui.message', async ($, e, next) => {
    const data = e.data as { type?: unknown; compact?: unknown; columns?: unknown } | null
    if (data?.type !== 'pet') return next(e)
    const now = await $.clock.now()
    recent = note(recent, 'pet', now)
    say($, 'pet', now)
    $.ui.invalidate('ui.render')
    return {}
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const b = current()
    if (!shown || !b || paneOpen || e.props.hasSurvey || e.surface !== 'terminal') return next(e)
    const { Box, Button, Client } = await $.ui.resolve(e)
    const columns = e.props.bodyColumns
    // stale bubbles fall away on the next redraw
    if (bubble && (await $.clock.now()) - bubble.at > BUBBLE_MS) bubble = undefined
    // auto: one line when the band cannot fit the sprite and its heart row, or the sprite and a
    // bubble will not fit across
    const compact = size === 'compact' || (size === 'auto' && (e.props.maxRows < 8 || columns < 60))
    const hide = () => {
      shown = false
      $.ui.invalidate('ui.render')
    }
    const nextOne = async () => {
      await switchTo($, index + 1, await $.clock.now())
    }
    const buttons = compact ? [] : unlocked() > 1 && !egg ? [<Button key="buddy:next" label="next" dimColor onPress={nextOne} />, <Button key="buddy:hide" label="hide" dimColor onPress={hide} />] : [<Button key="buddy:hide" label="hide" dimColor onPress={hide} />]
    const width = compact ? columns : Math.max(20, columns - 16)
    // the key names the buddy, so a switch mounts a fresh instance and a redraw keeps the running one
    return (
      <Box flexDirection="column">
        <Box flexDirection="row" columnGap={1}>
          <Client key={`buddy:${b.companion.name}`} module="./boards/buddy.tsx" width={width} props={await props($, width, compact)} />
          <Box flexDirection="column">{buttons}</Box>
        </Box>
        {await next(e)}
      </Box>
    )
  })

  // the pane: desktop and mobile, or the terminal after /buddy pane
  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const els = await $.ui.resolve(e)
    const { Box, Button, Text } = els
    const b = current()
    if (!b || !shown) return <Text dimColor>buddy is hiding · /buddy on</Text>
    const now = await $.clock.now()
    if (bubble && now - bubble.at > BUBBLE_MS) bubble = undefined
    const columns = e.props.bodyColumns
    // a pane is tall; the sprite and a narrow bubble fit from 34 columns
    const compact = size === 'compact' || (size === 'auto' && columns < 34)
    if ('Client' in els) return <els.Client key={`buddy-pane:${b.companion.name}`} module="./boards/buddy.tsx" width={columns} props={await props($, columns, compact)} />
    // mobile draws no surface modules: a still buddy from the hooks side, and a button to pet it
    if (egg) return <Text>an egg · /buddy hatches it</Text>
    const color = RARITY_COLOR[b.bones.rarity]
    const mood = moodOf(recent, working, now)
    const pet = async () => {
      const at = await $.clock.now()
      recent = note(recent, 'pet', at)
      say($, 'pet', at)
      $.ui.invalidate('ui.render')
    }
    return (
      <Box flexDirection="column">
        {artFrame(b.bones, 0).map(line => (color ? <Text color={color}>{line}</Text> : <Text>{line}</Text>))}
        <Text>
          <Text bold>{b.companion.name}</Text>
          <Text dimColor>{`  ${b.bones.shiny ? '✨ ' : ''}${b.bones.rarity} ${b.bones.species} ${RARITY_STARS[b.bones.rarity]}  lv ${levelOf(xpOf(b))} · ${MOOD_MARK[mood]} ${mood}`}</Text>
        </Text>
        {bubble && !muted ? <Text>{`“${bubble.text}”`}</Text> : <Text dimColor>{working ? `${b.companion.name} is watching Claude work` : 'tap pet'}</Text>}
        <Button key="buddy:pet" label="pet" dimColor onPress={pet} />
      </Box>
    )
  })
}
