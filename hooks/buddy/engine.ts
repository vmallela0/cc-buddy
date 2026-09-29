// The buddy: pure logic, no JSX, no `$`. Species, rarity, eyes, hat and stats are derived from the
// account id exactly as Claude Code 2.1.88 through 2.1.96 derived them (wyhash of id + salt, then
// mulberry32), so a buddy hatched back then comes back the same. The name and personality were
// written once by the model at hatching and live in ~/.claude.json under `companion`; this module
// only reads those, and invents a name from a pool when there is none.

export const SALT = 'friend-2026-401'

// the original eighteen, in the original order: the roll is Math.floor(rng * length), so adding
// a species would hand every existing buddy a different body
// Spelled as char codes, the way the original source did it so no species name (one of them an
// internal model codename) survived as a literal string in the build.
const c = (...codes: number[]) => String.fromCharCode(...codes)
export const SPECIES = [
  c(0x64, 0x75, 0x63, 0x6b),
  c(0x67, 0x6f, 0x6f, 0x73, 0x65),
  c(0x62, 0x6c, 0x6f, 0x62),
  c(0x63, 0x61, 0x74),
  c(0x64, 0x72, 0x61, 0x67, 0x6f, 0x6e),
  c(0x6f, 0x63, 0x74, 0x6f, 0x70, 0x75, 0x73),
  c(0x6f, 0x77, 0x6c),
  c(0x70, 0x65, 0x6e, 0x67, 0x75, 0x69, 0x6e),
  c(0x74, 0x75, 0x72, 0x74, 0x6c, 0x65),
  c(0x73, 0x6e, 0x61, 0x69, 0x6c),
  c(0x67, 0x68, 0x6f, 0x73, 0x74),
  c(0x61, 0x78, 0x6f, 0x6c, 0x6f, 0x74, 0x6c),
  c(0x63, 0x61, 0x70, 0x79, 0x62, 0x61, 0x72, 0x61),
  c(0x63, 0x61, 0x63, 0x74, 0x75, 0x73),
  c(0x72, 0x6f, 0x62, 0x6f, 0x74),
  c(0x72, 0x61, 0x62, 0x62, 0x69, 0x74),
  c(0x6d, 0x75, 0x73, 0x68, 0x72, 0x6f, 0x6f, 0x6d),
  c(0x63, 0x68, 0x6f, 0x6e, 0x6b),
] as unknown as readonly ['duck', 'goose', 'blob', 'cat', 'dragon', 'octopus', 'owl', 'penguin', 'turtle', 'snail', 'ghost', 'axolotl', 'capybara', 'cactus', 'robot', 'rabbit', 'mushroom', 'chonk']
export type Species = (typeof SPECIES)[number]

export const RARITIES = ['common', 'uncommon', 'rare', 'epic', 'legendary'] as const
export type Rarity = (typeof RARITIES)[number]
const RARITY_WEIGHTS: Record<Rarity, number> = { common: 60, uncommon: 25, rare: 10, epic: 4, legendary: 1 }
const RARITY_FLOOR: Record<Rarity, number> = { common: 5, uncommon: 15, rare: 25, epic: 35, legendary: 50 }
export const RARITY_STARS: Record<Rarity, string> = { common: '★', uncommon: '★★', rare: '★★★', epic: '★★★★', legendary: '★★★★★' }
// rarity is never carried by colour alone: the stars say it too
export const RARITY_COLOR: Record<Rarity, string | undefined> = { common: undefined, uncommon: 'green', rare: 'blue', epic: 'magenta', legendary: 'yellow' }

export const STAT_NAMES = ['DEBUGGING', 'PATIENCE', 'CHAOS', 'WISDOM', 'SNARK'] as const
export type StatName = (typeof STAT_NAMES)[number]
export type Stats = Record<StatName, number>

export const EYES = ['·', '✦', '×', '◉', '@', '°'] as const
export type Eye = (typeof EYES)[number]
export const HATS = ['none', 'crown', 'tophat', 'propeller', 'halo', 'wizard', 'beanie', 'tinyduck'] as const
export type Hat = (typeof HATS)[number]
export type Bones = { rarity: Rarity; species: Species; eye: Eye; hat: Hat; shiny: boolean; stats: Stats; peak: StatName; dump: StatName }
export type Companion = { name: string; personality: string; hatchedAt: number }

// Bones and soul. The soul (name, personality, hatch date) is written once and stored; the bones are
// recomputed from the account id every session and never persisted. Whatever else a stored companion
// carries (a rarity edited in by hand, say) is dropped here, so fresh bones always win, as the
// original's `{ ...stored, ...bones }` made sure.
export function soulOf(v: unknown): Companion | undefined {
  if (typeof v !== 'object' || v === null) return undefined
  const { name, personality, hatchedAt } = v as Record<string, unknown>
  if (typeof name !== 'string' || !name || typeof hatchedAt !== 'number') return undefined
  return { name, personality: typeof personality === 'string' ? personality : '', hatchedAt }
}

// ─── wyhash (Zig stdlib v4.2, what Bun.hash computes), 64-bit over BigInt ────────────────────────

const MASK64 = (1n << 64n) - 1n
const SECRET = [0xa0761d6478bd642fn, 0xe7037ed1a0b428dbn, 0x8ebc6af09c88c6e3n, 0x589965cc75374cc3n] as const
const mum = (a: bigint, b: bigint): [bigint, bigint] => {
  const x = (a & MASK64) * (b & MASK64)
  return [x & MASK64, (x >> 64n) & MASK64]
}
const mix = (a: bigint, b: bigint): bigint => {
  const [lo, hi] = mum(a, b)
  return (lo ^ hi) & MASK64
}
const read8 = (buf: Uint8Array, at: number): bigint => {
  let v = 0n
  for (let i = 0; i < 8; i++) v |= BigInt(buf[at + i] ?? 0) << BigInt(i * 8)
  return v
}
const read4 = (buf: Uint8Array, at: number): bigint => {
  let v = 0n
  for (let i = 0; i < 4; i++) v |= BigInt(buf[at + i] ?? 0) << BigInt(i * 8)
  return v
}

export function wyhash(input: string, seed = 0n): bigint {
  const buf = new TextEncoder().encode(input)
  const len = buf.length
  let s0 = (seed ^ mix((seed ^ SECRET[0]) & MASK64, SECRET[1])) & MASK64
  let s1 = s0
  let s2 = s0
  let a: bigint
  let b: bigint
  if (len <= 16) {
    if (len >= 4) {
      const q = (len >> 3) << 2
      a = ((read4(buf, 0) << 32n) | read4(buf, q)) & MASK64
      b = ((read4(buf, len - 4) << 32n) | read4(buf, len - 4 - q)) & MASK64
    } else if (len > 0) {
      a = (BigInt(buf[0] ?? 0) << 16n) | (BigInt(buf[len >> 1] ?? 0) << 8n) | BigInt(buf[len - 1] ?? 0)
      b = 0n
    } else {
      a = 0n
      b = 0n
    }
  } else {
    let i = 0
    if (len >= 48) {
      while (i + 48 < len) {
        const states = [s0, s1, s2]
        for (let j = 0; j < 3; j++) {
          states[j] = mix((read8(buf, i + 16 * j) ^ SECRET[j + 1]!) & MASK64, (read8(buf, i + 16 * j + 8) ^ states[j]!) & MASK64)
        }
        s0 = states[0]!
        s1 = states[1]!
        s2 = states[2]!
        i += 48
      }
      s0 = (s0 ^ s1 ^ s2) & MASK64
    }
    const rest = buf.subarray(i)
    let ri = 0
    while (ri + 16 < rest.length) {
      s0 = mix((read8(rest, ri) ^ SECRET[1]) & MASK64, (read8(rest, ri + 8) ^ s0) & MASK64)
      ri += 16
    }
    a = read8(buf, len - 16)
    b = read8(buf, len - 8)
  }
  a = (a ^ SECRET[1]) & MASK64
  b = (b ^ s0) & MASK64
  ;[a, b] = mum(a, b)
  return mix((a ^ SECRET[0] ^ BigInt(len)) & MASK64, (b ^ SECRET[1]) & MASK64)
}

export const hash32 = (s: string): number => Number(wyhash(s) & 0xffffffffn)

// FNV-1a, the fallback the original used off Bun (node, tests). The native binary ran on Bun, so the
// buddies people actually hatched came from wyhash above; this is here for tooling that wants the
// other path, not used for derivation.
export function fnv1a(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const pick = <T,>(rng: () => number, arr: readonly T[]): T => arr[Math.floor(rng() * arr.length)]!

export function generateBones(userId: string, salt = SALT): Bones {
  const rng = mulberry32(hash32(userId + salt))
  let roll = rng() * 100
  let rarity: Rarity = 'common'
  for (const r of RARITIES) {
    roll -= RARITY_WEIGHTS[r]
    if (roll < 0) {
      rarity = r
      break
    }
  }
  const species = pick(rng, SPECIES)
  const eye = pick(rng, EYES)
  const hat: Hat = rarity === 'common' ? 'none' : pick(rng, HATS)
  const shiny = rng() < 0.01
  const peak = pick(rng, STAT_NAMES)
  let dump = pick(rng, STAT_NAMES)
  while (dump === peak) dump = pick(rng, STAT_NAMES)
  const floor = RARITY_FLOOR[rarity]
  const stats = {} as Stats
  for (const name of STAT_NAMES) {
    if (name === peak) stats[name] = Math.min(100, floor + 50 + Math.floor(rng() * 30))
    else if (name === dump) stats[name] = Math.max(1, floor - 10 + Math.floor(rng() * 15))
    else stats[name] = floor + Math.floor(rng() * 40)
  }
  return { rarity, species, eye, hat, shiny, stats, peak, dump }
}

// ─── Hatching a buddy for an account that never had one ──────────────────────────────────────────

const NAMES = ['Pebble', 'Wobble', 'Quill', 'Mochi', 'Biscuit', 'Fennel', 'Tumble', 'Pip', 'Nimbus', 'Sprocket', 'Clover', 'Dumpling', 'Ziggy', 'Bramble', 'Noodle', 'Pixel', 'Waffle', 'Juniper', 'Gizmo', 'Marble']
const PEAK_PHRASES: Record<StatName, string> = {
  DEBUGGING: 'spots the off-by-one before the tests do',
  PATIENCE: 'outlasts any flaky test suite',
  CHAOS: 'treats breaking changes as a love language',
  WISDOM: 'has seen this bug before, in three other repos',
  SNARK: 'names things with uncomfortable accuracy',
}
const DUMP_PHRASES: Record<StatName, string> = {
  DEBUGGING: 'occasionally ships the workaround instead of the fix',
  PATIENCE: 'starts the rebase before the review is done',
  CHAOS: 'dislikes surprise refactors',
  WISDOM: 'sometimes reinvents the wheel with enthusiasm',
  SNARK: 'only leaves encouraging comments',
}

export function hatch(userId: string, bones: Bones, now: number): Companion {
  const rng = mulberry32(hash32(userId + 'name'))
  const name = pick(rng, NAMES)
  const shiny = bones.shiny ? ' Shimmers faintly in dark mode.' : ''
  const personality = `A ${bones.rarity} ${bones.species} that ${PEAK_PHRASES[bones.peak]}.${shiny} Though it ${DUMP_PHRASES[bones.dump]}.`
  return { name, personality, hatchedAt: now }
}

// ─── Art: three idle frames of five lines per species, {E} the eye ───────────────────────────────

export const SPECIES_ART: Record<Species, string[][]> = {
  duck: [
    ['            ', '    __      ', '  <({E} )___  ', '   (  ._>   ', '    `--\'    '],
    ['            ', '    __      ', '  <({E} )___  ', '   (  ._>   ', '    `--\'~   '],
    ['            ', '    __      ', '  <({E} )___  ', '   (  .__>  ', '    `--\'    '],
  ],
  goose: [
    ['            ', '     ({E}>    ', '     ||     ', '   _(__)_   ', '    ^^^^    '],
    ['            ', '    ({E}>     ', '     ||     ', '   _(__)_   ', '    ^^^^    '],
    ['            ', '     ({E}>>   ', '     ||     ', '   _(__)_   ', '    ^^^^    '],
  ],
  blob: [
    ['            ', '   .----.   ', '  ( {E}  {E} )  ', '  (      )  ', '   `----\'   '],
    ['            ', '  .------.  ', ' (  {E}  {E}  ) ', ' (        ) ', '  `------\'  '],
    ['            ', '    .--.    ', '   ({E}  {E})   ', '   (    )   ', '    `--\'    '],
  ],
  cat: [
    ['            ', '   /\\_/\\    ', '  ( {E}   {E})  ', '  (  ω  )   ', '  (")_(")   '],
    ['            ', '   /\\_/\\    ', '  ( {E}   {E})  ', '  (  ω  )   ', '  (")_(")~  '],
    ['            ', '   /\\-/\\    ', '  ( {E}   {E})  ', '  (  ω  )   ', '  (")_(")   '],
  ],
  dragon: [
    ['            ', '  /^\\  /^\\  ', ' <  {E}  {E}  > ', ' (   ~~   ) ', '  `-vvvv-\'  '],
    ['            ', '  /^\\  /^\\  ', ' <  {E}  {E}  > ', ' (        ) ', '  `-vvvv-\'  '],
    ['   ~    ~   ', '  /^\\  /^\\  ', ' <  {E}  {E}  > ', ' (   ~~   ) ', '  `-vvvv-\'  '],
  ],
  octopus: [
    ['            ', '   .----.   ', '  ( {E}  {E} )  ', '  (______)  ', '  /\\/\\/\\/\\  '],
    ['            ', '   .----.   ', '  ( {E}  {E} )  ', '  (______)  ', '  \\/\\/\\/\\/  '],
    ['     o      ', '   .----.   ', '  ( {E}  {E} )  ', '  (______)  ', '  /\\/\\/\\/\\  '],
  ],
  owl: [
    ['            ', '   /\\  /\\   ', '  (({E})({E}))  ', '  (  ><  )  ', '   `----\'   '],
    ['            ', '   /\\  /\\   ', '  (({E})({E}))  ', '  (  ><  )  ', '   .----.   '],
    ['            ', '   /\\  /\\   ', '  (({E})(-))  ', '  (  ><  )  ', '   `----\'   '],
  ],
  penguin: [
    ['            ', '  .---.     ', '  ({E}>{E})     ', ' /(   )\\    ', '  `---\'     '],
    ['            ', '  .---.     ', '  ({E}>{E})     ', ' |(   )|    ', '  `---\'     '],
    ['  .---.     ', '  ({E}>{E})     ', ' /(   )\\    ', '  `---\'     ', '   ~ ~      '],
  ],
  turtle: [
    ['            ', '   _,--._   ', '  ( {E}  {E} )  ', ' /[______]\\ ', '  ``    ``  '],
    ['            ', '   _,--._   ', '  ( {E}  {E} )  ', ' /[______]\\ ', '   ``  ``   '],
    ['            ', '   _,--._   ', '  ( {E}  {E} )  ', ' /[======]\\ ', '  ``    ``  '],
  ],
  snail: [
    ['            ', ' {E}    .--.  ', '  \\  ( @ )  ', '   \\_`--\'   ', '  ~~~~~~~   '],
    ['            ', '  {E}   .--.  ', '  |  ( @ )  ', '   \\_`--\'   ', '  ~~~~~~~   '],
    ['            ', ' {E}    .--.  ', '  \\  ( @  ) ', '   \\_`--\'   ', '   ~~~~~~   '],
  ],
  ghost: [
    ['            ', '   .----.   ', '  / {E}  {E} \\  ', '  |      |  ', '  ~`~``~`~  '],
    ['            ', '   .----.   ', '  / {E}  {E} \\  ', '  |      |  ', '  `~`~~`~`  '],
    ['    ~  ~    ', '   .----.   ', '  / {E}  {E} \\  ', '  |      |  ', '  ~~`~~`~~  '],
  ],
  axolotl: [
    ['            ', '}~(______)~{', '}~({E} .. {E})~{', '  ( .--. )  ', '  (_/  \\_)  '],
    ['            ', '~}(______){~', '~}({E} .. {E}){~', '  ( .--. )  ', '  (_/  \\_)  '],
    ['            ', '}~(______)~{', '}~({E} .. {E})~{', '  (  --  )  ', '  ~_/  \\_~  '],
  ],
  capybara: [
    ['            ', '  n______n  ', ' ( {E}    {E} ) ', ' (   oo   ) ', '  `------\'  '],
    ['            ', '  n______n  ', ' ( {E}    {E} ) ', ' (   Oo   ) ', '  `------\'  '],
    ['    ~  ~    ', '  u______n  ', ' ( {E}    {E} ) ', ' (   oo   ) ', '  `------\'  '],
  ],
  cactus: [
    ['            ', ' n  ____  n ', ' | |{E}  {E}| | ', ' |_|    |_| ', '   |    |   '],
    ['            ', '    ____    ', ' n |{E}  {E}| n ', ' |_|    |_| ', '   |    |   '],
    [' n        n ', ' |  ____  | ', ' | |{E}  {E}| | ', ' |_|    |_| ', '   |    |   '],
  ],
  robot: [
    ['            ', '   .[||].   ', '  [ {E}  {E} ]  ', '  [ ==== ]  ', '  `------\'  '],
    ['            ', '   .[||].   ', '  [ {E}  {E} ]  ', '  [ -==- ]  ', '  `------\'  '],
    ['     *      ', '   .[||].   ', '  [ {E}  {E} ]  ', '  [ ==== ]  ', '  `------\'  '],
  ],
  rabbit: [
    ['            ', '   (\\__/)   ', '  ( {E}  {E} )  ', ' =(  ..  )= ', '  (")__(")  '],
    ['            ', '   (|__/)   ', '  ( {E}  {E} )  ', ' =(  ..  )= ', '  (")__(")  '],
    ['            ', '   (\\__/)   ', '  ( {E}  {E} )  ', ' =( .  . )= ', '  (")__(")  '],
  ],
  mushroom: [
    ['            ', ' .-o-OO-o-. ', '(__________)', '   |{E}  {E}|   ', '   |____|   '],
    ['            ', ' .-O-oo-O-. ', '(__________)', '   |{E}  {E}|   ', '   |____|   '],
    ['   . o  .   ', ' .-o-OO-o-. ', '(__________)', '   |{E}  {E}|   ', '   |____|   '],
  ],
  chonk: [
    ['            ', '  /\\    /\\  ', ' ( {E}    {E} ) ', ' (   ..   ) ', '  `------\'  '],
    ['            ', '  /\\    /|  ', ' ( {E}    {E} ) ', ' (   ..   ) ', '  `------\'  '],
    ['            ', '  /\\    /\\  ', ' ( {E}    {E} ) ', ' (   ..   ) ', '  `------\'~ '],
  ],
}

export const HAT_ART: Record<Hat, string> = {
  none: '',
  crown: '   \\^^^/    ',
  tophat: '   [___]    ',
  propeller: '    -+-     ',
  halo: '   (   )    ',
  wizard: '    /^\\     ',
  beanie: '   (___)    ',
  tinyduck: '    ,>      ',
}

// the egg, before /buddy hatches it: idle, wobbling, cracking, open
export const EGG_ART: string[][] = [
  ['            ', '    .--.    ', '   /    \\   ', '  |      |  ', '   `----\'   '],
  ['            ', '   .--.     ', '  /    \\    ', ' |      |   ', '  `----\'    '],
  ['            ', '     .--.   ', '    /    \\  ', '   |      | ', '    `----\'  '],
  ['            ', '    .--.    ', '   / /\\ \\   ', '  |  \\/  |  ', '   `----\'   '],
  ['   \\ | /    ', '   .-/\\-.   ', '  / /  \\ \\  ', '  |      |  ', '   `----\'   '],
]

// floating hearts over the sprite for a pet: five half-second rows, two and a half seconds
export const PET_HEARTS = ['   ♥    ♥   ', '  ♥  ♥   ♥  ', ' ♥   ♥  ♥   ', '♥  ♥      ♥ ', '·    ·   ·  ']
export const PET_MS = 2_500
export const HATCH_MS = 4_000

export function artFrame(bones: Bones, frame: number, blink = false): string[] {
  const frames = SPECIES_ART[bones.species]
  const lines = frames[((frame % frames.length) + frames.length) % frames.length] ?? frames[0]!
  const eye = blink ? '-' : bones.eye
  const body = lines.map(line => line.replaceAll('{E}', eye))
  const hat = HAT_ART[bones.hat]
  return hat ? [hat, ...body.slice(1)] : body
}

// one-line faces for the compact band, {E} the eye
export const FACES: Record<Species, string> = {
  duck: '<({E})', goose: '({E}>', blob: '({E}{E})', cat: '={E}ω{E}=', dragon: '<{E}~{E}>', octopus: '~({E}{E})~', owl: '(({E})({E}))', penguin: '({E}>{E})', turtle: '[{E}_{E}]',
  snail: '{E}(@)', ghost: '/{E}{E}\\', axolotl: '}{E}.{E}{', capybara: '({E}oo{E})', cactus: '|{E}{E}|', robot: '[{E}{E}]', rabbit: '({E}..{E})', mushroom: '^{E}{E}^', chonk: '(({E}..{E}))',
}
export const faceOf = (bones: Bones, blink = false): string => FACES[bones.species].replaceAll('{E}', blink ? '-' : bones.eye)

// ─── A soul written by the model at hatching, as the original did it ─────────────────────────────

export function soulPrompt(bones: Bones): { system: string; prompt: string } {
  return {
    system: 'You name and describe newly hatched coding companions. Answer with JSON only, no prose, no code fence.',
    prompt: [
      `A ${bones.shiny ? 'shiny ' : ''}${bones.rarity} ${bones.species} just hatched in a developer's terminal.`,
      `Its stats out of 100: ${STAT_NAMES.map(n => `${n} ${bones.stats[n]}`).join(', ')}. Strongest ${bones.peak}, weakest ${bones.dump}.`,
      'Give it a short, warm, slightly odd name (one word, 3 to 10 letters) and a personality of two sentences, under 200 characters, that mentions its species and plays off its strongest and weakest stat.',
      'Format: {"name": "...", "personality": "..."}',
    ].join('\n'),
  }
}

// the model's answer, or undefined when it is not a usable soul
export function parseSoul(text: string): { name: string; personality: string } | undefined {
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) return undefined
  try {
    const v = JSON.parse(match[0]) as { name?: unknown; personality?: unknown }
    if (typeof v.name !== 'string' || typeof v.personality !== 'string') return undefined
    const name = v.name.trim().replace(/[^\p{L}\p{N}'-]/gu, '')
    const personality = v.personality.replace(/\s+/g, ' ').trim()
    if (name.length < 2 || name.length > 12 || personality.length < 10) return undefined
    return { name: name[0]!.toUpperCase() + name.slice(1), personality: personality.slice(0, 240) }
  } catch {
    return undefined
  }
}

// the /buddy card, as the original printed it, with this plugin's extras above the footer
export function card(companion: Companion, bones: Bones, now: number, extra: string[] = []): string {
  const shiny = bones.shiny ? '✨ ' : ''
  const days = Math.max(0, Math.floor((now - companion.hatchedAt) / 86_400_000))
  const lines = [
    ...artFrame(bones, 0).map(l => `  ${l}`),
    '',
    `  ${companion.name}  ${shiny}${bones.rarity} ${bones.species} ${RARITY_STARS[bones.rarity]}`,
    `  ${companion.personality}`,
    '',
  ]
  for (const stat of STAT_NAMES) {
    const val = bones.stats[stat]
    const bar = '█'.repeat(Math.floor(val / 5)) + '░'.repeat(20 - Math.floor(val / 5))
    const marker = stat === bones.peak ? ' ▲ peak' : stat === bones.dump ? ' ▼ dump' : ''
    lines.push(`  ${stat.padEnd(9)} ${bar} ${String(val).padStart(3)}${marker}`)
  }
  if (extra.length) lines.push('', ...extra.map(l => `  ${l}`))
  lines.push('', `  hatched ${days === 0 ? 'today' : `${days} days ago`} · /buddy help`)
  return lines.join('\n')
}

// ─── Reactions: what the buddy says, keyed by what Claude just did. No model call ever. ──────────

export type Moment = 'edit' | 'bash-ok' | 'bash-fail' | 'test-pass' | 'test-fail' | 'commit' | 'turn-done' | 'pet' | 'hello' | 'addressed'

const TEST_COMMAND = /\b(bun|npm|pnpm|yarn)\s+(run\s+)?test\b|\bnpx\s+(jest|vitest|mocha)\b|\b(pytest|jest|vitest|rspec|phpunit|mocha)\b|\bgo\s+test\b|\bcargo\s+test\b|\bmake\s+test\b/

// what a finished tool call means; `ok` is undefined when the call was denied
export function momentOf(tool: string, command: string | undefined, ok: boolean | undefined): Moment | undefined {
  if (ok === undefined) return undefined
  if (tool === 'Bash' && command) {
    if (TEST_COMMAND.test(command)) return ok ? 'test-pass' : 'test-fail'
    if (ok && /\bgit\s+commit\b/.test(command) && !/--dry-run\b/.test(command)) return 'commit'
    return ok ? 'bash-ok' : 'bash-fail'
  }
  if (ok && (tool === 'Edit' || tool === 'Write' || tool === 'NotebookEdit')) return 'edit'
  return undefined
}

const LINES: Record<Moment, string[]> = {
  edit: ['those variable names could use some work', 'saw that. saying nothing.', 'bold edit. i respect it.', 'i would have used a smaller function, but sure', 'one more edit and we rename everything, deal?', 'that diff smells fine to me'],
  'bash-ok': ['exit 0. as it should be.', 'that worked. suspicious.', 'ran clean. i was watching.', 'okay okay, it worked'],
  'bash-fail': ['that exit code was a choice', 'read the error. the whole error.', 'i saw that coming three lines ago', 'it is fine. it is fine. read the stderr.', 'the shell has opinions today'],
  'test-pass': ['green. we did that.', 'tests pass. i take partial credit.', 'all green. do not touch anything.', 'passing. suspiciously passing.'],
  'test-fail': ['red. hold my snacks.', 'a failing test is just a todo with feelings', 'the test is right, you know', 'we knew this one was flaky. we said nothing.'],
  commit: ['committed. no take-backs.', 'a commit! a real one!', 'shipped. i felt that in my bones.', 'commit message could be longer. or shorter. one of those.'],
  'turn-done': ['done. go read it.', 'claude finished. your move.', 'it stopped talking. finally.', 'reply is up. i skimmed it. looks fine.', 'back to you, boss'],
  pet: ['♥', 'hey. hey. that tickles.', 'okay that was nice', 'again.', 'we are friends now. that is how it works.'],
  hello: ['i am back. did you miss me.', 'hello again. i never really left.', 'good to be back above the prompt', 'they tried to delete me. i am moss on stone.'],
  addressed: ['you called?', 'i heard my name.', 'yes. i am listening.', 'present.'],
}

export function reaction(moment: Moment, seed: number): string {
  const pool = LINES[moment]
  return pool[Math.abs(seed) % pool.length] ?? ''
}

// speak at most once per cooldown, except a pet and a hello, which always land
export const COOLDOWN_MS: Record<Moment, number> = {
  edit: 25_000, 'bash-ok': 40_000, 'bash-fail': 10_000, 'test-pass': 5_000, 'test-fail': 5_000, commit: 0, 'turn-done': 0, pet: 0, hello: 0, addressed: 0,
}
export const BUBBLE_MS = 30_000

// ─── The roster: a suite of buddies, one per session ─────────────────────────────────────────────
// Every species at least twice, rarities spread as a collection should be (a few epics, one
// legendary), each body and personality seeded from the account id, so the roster is yours and the
// same every time. The original companion from ~/.claude.json, when there is one, leads it.

export type Buddy = { companion: Companion; bones: Bones }

export const ROSTER_SIZE = 48
// 26 common, 12 uncommon, 6 rare, 3 epic, 1 legendary, spread so neighbours differ
const RARITY_SCHEDULE: Rarity[] = [
  'common', 'uncommon', 'common', 'rare', 'common', 'common', 'uncommon', 'common', 'epic', 'common', 'common', 'uncommon',
  'common', 'rare', 'common', 'uncommon', 'common', 'common', 'legendary', 'common', 'uncommon', 'common', 'rare', 'common',
  'common', 'uncommon', 'common', 'epic', 'common', 'uncommon', 'common', 'rare', 'common', 'common', 'uncommon', 'common',
  'rare', 'common', 'uncommon', 'common', 'epic', 'common', 'uncommon', 'common', 'rare', 'common', 'uncommon', 'common',
]

const ROSTER_NAMES = [
  'Pebble', 'Wobble', 'Quill', 'Mochi', 'Biscuit', 'Fennel', 'Tumble', 'Pip', 'Nimbus', 'Sprocket', 'Clover', 'Dumpling',
  'Ziggy', 'Bramble', 'Noodle', 'Pixel', 'Waffle', 'Juniper', 'Gizmo', 'Marble', 'Toast', 'Fig', 'Rumble', 'Sable',
  'Tofu', 'Wren', 'Olive', 'Bolt', 'Crumb', 'Dobby', 'Echo', 'Flint', 'Gumbo', 'Hazel', 'Ivy', 'Jasper',
  'Kiwi', 'Lumen', 'Muffin', 'Nutmeg', 'Orbit', 'Pudding', 'Quark', 'Rusty', 'Sprout', 'Truffle', 'Umbra', 'Velvet',
  'Widget', 'Yarrow', 'Zephyr', 'Acorn', 'Bagel', 'Comet', 'Dusty', 'Ember', 'Frankie', 'Gravy', 'Hobnob', 'Inky',
]

const PEAK_POOL: Record<StatName, string[]> = {
  DEBUGGING: ['spots the off-by-one before the tests do', 'can read a backtrace like a map', 'finds the null before it finds you', 'hears a race condition coming'],
  PATIENCE: ['outlasts any flaky test suite', 'waits for the slow CI build without complaint', 'never merges before the green check', 'will watch a progress bar to the end, unblinking'],
  CHAOS: ['treats breaking changes as a love language', 'rewrites the Makefile on a Tuesday for fun', 'thrives wherever the incident channel is loudest', 'force-pushed once and enjoyed it'],
  WISDOM: ['has seen this bug before, in three other repos', 'quotes the relevant RFC from memory', 'recognizes the abstraction that will outlive its author', 'knows which config file actually wins'],
  SNARK: ['names things with uncomfortable accuracy', 'leaves code review comments that linger', 'finds the edge case you forgot and mentions it twice', 'has opinions about your commit messages'],
}
const DUMP_POOL: Record<StatName, string[]> = {
  DEBUGGING: ['occasionally ships the workaround instead of the fix', 'skips the repro step', 'trusts the logs a little too much'],
  PATIENCE: ['starts the rebase before the review is done', 'closes slow issues as stale', 'has never once waited for the linter'],
  CHAOS: ['dislikes surprise refactors', 'writes very thorough migration guides', 'prefers everything to stay exactly where it is'],
  WISDOM: ['sometimes reinvents the wheel with enthusiasm', 'skips the existing prior art', 'learns by doing, not by reading'],
  SNARK: ['only leaves encouraging comments', 'approves PRs with genuine warmth', 'never says what it actually thinks'],
}
const QUIRK: Record<Species, string> = {
  duck: 'Quacks once per merge conflict.',
  goose: 'Will honk at a bare except clause.',
  blob: 'Absorbs stray console.logs.',
  cat: 'Sits on the keyboard during deploys.',
  dragon: 'Hoards unused imports.',
  octopus: 'Runs eight terminals at once.',
  owl: 'Only truly awake after midnight builds.',
  penguin: 'Waddles off during long installs.',
  turtle: 'Slow to start, impossible to interrupt.',
  snail: 'Leaves a trail of TODOs.',
  ghost: 'Haunts the file you meant to delete.',
  axolotl: 'Regrows any branch you delete.',
  capybara: 'Calm through every incident.',
  cactus: 'Needs watering twice a quarter.',
  robot: 'Beeps at inconsistent indentation.',
  rabbit: 'Multiplies your test cases.',
  mushroom: 'Grows in the dark corners of node_modules.',
  chonk: 'Sits on the build until it passes.',
}
const CLOSER: Record<Rarity, string[]> = {
  common: ['Gets the job done.', 'Reliable, if unassuming.'],
  uncommon: ['Has a few tricks up its sleeve.', 'Worth keeping around.'],
  rare: ['Not to be underestimated.', 'Earns its keep.'],
  epic: ['Commands quiet respect.', 'The kind of companion repos are built around.'],
  legendary: ['The kind you find once, if you are lucky.', 'Leaves every codebase better than it found it.'],
}

function rosterBones(rng: () => number, species: Species, rarity: Rarity): Bones {
  const eye = pick(rng, EYES)
  const hat: Hat = rarity === 'common' ? 'none' : pick(rng, HATS)
  // 1 in 100, like any buddy, so a shiny legendary is 1 in 10,000
  const shiny = rng() < 0.01
  const peak = pick(rng, STAT_NAMES)
  let dump = pick(rng, STAT_NAMES)
  while (dump === peak) dump = pick(rng, STAT_NAMES)
  const floor = RARITY_FLOOR[rarity]
  const stats = {} as Stats
  for (const name of STAT_NAMES) {
    if (name === peak) stats[name] = Math.min(100, floor + 50 + Math.floor(rng() * 30))
    else if (name === dump) stats[name] = Math.max(1, floor - 10 + Math.floor(rng() * 15))
    else stats[name] = floor + Math.floor(rng() * 40)
  }
  return { rarity, species, eye, hat, shiny, stats, peak, dump }
}

export function roster(userId: string, original: Buddy | undefined, hatchedAt: number): Buddy[] {
  const rng = mulberry32(hash32(userId + ':roster'))
  // names dealt without repeats, the original's name skipped
  const names = [...ROSTER_NAMES].filter(n => n !== original?.companion.name)
  for (let i = names.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[names[i], names[j]] = [names[j]!, names[i]!]
  }
  // species dealt round-robin from a shuffled start, so each appears at least twice
  const species = [...SPECIES]
  for (let i = species.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[species[i], species[j]] = [species[j]!, species[i]!]
  }
  const out: Buddy[] = original ? [original] : []
  for (let i = 0; i < ROSTER_SIZE; i++) {
    const sp = species[i % species.length]!
    const rarity = RARITY_SCHEDULE[i % RARITY_SCHEDULE.length]!
    const bones = rosterBones(rng, sp, rarity)
    const name = names[i % names.length]!
    const shiny = bones.shiny ? ' Shimmers faintly in dark mode.' : ''
    const personality = `${rarity === 'uncommon' ? 'An' : 'A'} ${rarity} ${sp} that ${pick(rng, PEAK_POOL[bones.peak])}.${shiny} ${QUIRK[sp]} ${pick(rng, CLOSER[rarity])} Though it ${pick(rng, DUMP_POOL[bones.dump])}.`
    out.push({ companion: { name, personality, hatchedAt }, bones })
  }
  return out
}

// one line per buddy, for /buddy roster
export function rosterLine(b: Buddy, index: number, current: boolean): string {
  const mark = current ? '▶' : ' '
  const shiny = b.bones.shiny ? ' ✨' : ''
  return `${mark} ${String(index + 1).padStart(2)}  ${b.companion.name.padEnd(9)} ${b.bones.rarity.padEnd(9)} ${b.bones.species.padEnd(9)} ${RARITY_STARS[b.bones.rarity]}${shiny}`
}
