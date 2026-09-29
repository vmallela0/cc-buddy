import { describe, expect, test } from 'bun:test'
import { artFrame, EGG_ART, faceOf, FACES, generateBones, hash32, HATS, parseSoul, PET_HEARTS, RARITIES, roster, SALT, soulOf, SPECIES, SPECIES_ART, wyhash } from '../hooks/buddy/engine.ts'
import { MOMENTS, voiceOf } from '../hooks/buddy/voice.ts'

// Frozen bones for fixed ids. Rarity, eyes, hat, shiny and stats were checked against the
// community port (github.com/1270011/claude-buddy) over 20,000 random ids; species follows the
// original eighteen. If one of these changes, every returning user's buddy changed with it.
const GOLDEN: [string, object][] = [
  ["00000000-0000-4000-8000-000000000000",{"rarity":"common","species":"goose","eye":"°","hat":"none","shiny":false,"peak":"WISDOM","dump":"PATIENCE","stats":{"DEBUGGING":18,"PATIENCE":6,"CHAOS":5,"WISDOM":55,"SNARK":13}}],
  ["6f1c2d3e-4b5a-4c6d-8e7f-901a2b3c4d5e",{"rarity":"common","species":"duck","eye":"·","hat":"none","shiny":false,"peak":"CHAOS","dump":"WISDOM","stats":{"DEBUGGING":35,"PATIENCE":7,"CHAOS":68,"WISDOM":1,"SNARK":28}}],
  ["a3b1c2d4-e5f6-4789-9abc-def012345678",{"rarity":"uncommon","species":"axolotl","eye":"@","hat":"beanie","shiny":false,"peak":"SNARK","dump":"CHAOS","stats":{"DEBUGGING":36,"PATIENCE":49,"CHAOS":9,"WISDOM":33,"SNARK":66}}],
  ["ffffffff-ffff-4fff-bfff-ffffffffffff",{"rarity":"common","species":"duck","eye":"@","hat":"none","shiny":false,"peak":"PATIENCE","dump":"DEBUGGING","stats":{"DEBUGGING":1,"PATIENCE":77,"CHAOS":34,"WISDOM":8,"SNARK":16}}],
  ["test-user-1",{"rarity":"common","species":"axolotl","eye":"◉","hat":"none","shiny":false,"peak":"SNARK","dump":"CHAOS","stats":{"DEBUGGING":15,"PATIENCE":39,"CHAOS":5,"WISDOM":6,"SNARK":55}}],
  ["test-user-2",{"rarity":"common","species":"robot","eye":"✦","hat":"none","shiny":false,"peak":"DEBUGGING","dump":"WISDOM","stats":{"DEBUGGING":66,"PATIENCE":14,"CHAOS":16,"WISDOM":1,"SNARK":13}}],
  ["claude",{"rarity":"rare","species":"cactus","eye":"✦","hat":"wizard","shiny":false,"peak":"PATIENCE","dump":"WISDOM","stats":{"DEBUGGING":35,"PATIENCE":81,"CHAOS":46,"WISDOM":26,"SNARK":35}}],
  ["buddy-2026",{"rarity":"common","species":"snail","eye":"✦","hat":"none","shiny":false,"peak":"PATIENCE","dump":"WISDOM","stats":{"DEBUGGING":38,"PATIENCE":67,"CHAOS":39,"WISDOM":1,"SNARK":31}}],
]

describe('bones', () => {
  test.each(GOLDEN)('%s', (id, expected) => {
    const { rarity, species, eye, hat, shiny, peak, dump, stats } = generateBones(id)
    expect({ rarity, species, eye, hat, shiny, peak, dump, stats }).toEqual(expected as never)
  })

  test('the hash matches Bun.hash, which the shipped binary used', () => {
    for (const s of ['', 'a', 'abc', 'friend-2026-401', 'x'.repeat(15), 'x'.repeat(16), 'x'.repeat(17), 'y'.repeat(47), 'y'.repeat(48), 'y'.repeat(49), 'z'.repeat(200), 'ünïcödé-✦']) {
      expect(wyhash(s)).toBe(BigInt(Bun.hash(s)))
    }
    for (let i = 0; i < 500; i++) {
      const id = crypto.randomUUID() + SALT
      expect(hash32(id)).toBe(Number(BigInt(Bun.hash(id)) & 0xffffffffn))
    }
  })

  test('the original eighteen species, in the original order', () => {
    expect([...SPECIES]).toEqual(['duck', 'goose', 'blob', 'cat', 'dragon', 'octopus', 'owl', 'penguin', 'turtle', 'snail', 'ghost', 'axolotl', 'capybara', 'cactus', 'robot', 'rabbit', 'mushroom', 'chonk'])
  })

  test('hats as the original drew them: none on commons, the full list otherwise', () => {
    let rarerWithoutHat = 0
    for (let i = 0; i < 5000; i++) {
      const b = generateBones(crypto.randomUUID())
      if (b.rarity === 'common') expect(b.hat).toBe('none')
      else if (b.hat === 'none') rarerWithoutHat++
      expect(HATS).toContain(b.hat)
    }
    // 'none' is on the list, so some rarer buddies draw it
    expect(rarerWithoutHat).toBeGreaterThan(0)
  })

  test('stats: peak high, dump low, all within 1..100', () => {
    for (let i = 0; i < 2000; i++) {
      const b = generateBones(crypto.randomUUID())
      for (const v of Object.values(b.stats)) {
        expect(v).toBeGreaterThanOrEqual(1)
        expect(v).toBeLessThanOrEqual(100)
      }
      expect(b.peak).not.toBe(b.dump)
      expect(Math.max(...Object.values(b.stats))).toBe(b.stats[b.peak])
    }
  })
})

describe('art', () => {
  const width = (l: string) => [...l].length
  test('every species: three frames of five lines, twelve wide', () => {
    for (const sp of SPECIES) {
      expect(SPECIES_ART[sp]).toHaveLength(3)
      for (const frame of SPECIES_ART[sp]) {
        expect(frame).toHaveLength(5)
        for (const line of frame) expect(width(line.replaceAll('{E}', '·'))).toBe(12)
      }
    }
  })
  test('hats sit on the top line and keep the width', () => {
    for (const hat of HATS) {
      const lines = artFrame({ ...generateBones('x'), hat }, 0)
      expect(lines).toHaveLength(5)
      for (const l of lines) expect(width(l)).toBe(12)
    }
  })
  test('egg and hearts are twelve wide', () => {
    for (const f of EGG_ART) for (const l of f) expect(width(l)).toBe(12)
    for (const l of PET_HEARTS) expect(width(l)).toBe(12)
  })
  test('a compact face for every species, all different', () => {
    expect(Object.keys(FACES).sort()).toEqual([...SPECIES].sort())
    expect(new Set(Object.values(FACES)).size).toBe(SPECIES.length)
    expect(faceOf({ ...generateBones('x'), species: 'cat', eye: '◉' })).toBe('=◉ω◉=')
  })
})

describe('voice', () => {
  test('every moment has lines for every buddy on the roster', () => {
    for (const b of roster('voice-test', undefined, 0)) {
      const v = voiceOf(b.bones, b.companion.name)
      for (const m of MOMENTS) {
        expect(v[m].length).toBeGreaterThan(0)
        for (const line of v[m]) {
          expect(line.length).toBeGreaterThan(0)
          expect(line).not.toContain('{name}')
        }
      }
    }
  })
})

describe('soul', () => {
  test('stored extras never ride along: bones are recomputed', () => {
    expect(soulOf({ name: 'Pip', personality: 'x', hatchedAt: 1, rarity: 'legendary', species: 'dragon' })).toEqual({ name: 'Pip', personality: 'x', hatchedAt: 1 })
    expect(soulOf({ name: '', hatchedAt: 1 })).toBeUndefined()
    expect(soulOf(null)).toBeUndefined()
  })
  test('a model-written soul is parsed, tidied, or refused', () => {
    expect(parseSoul('{"name": "quillon", "personality": "A cactus that never waits for the linter."}')).toEqual({ name: 'Quillon', personality: 'A cactus that never waits for the linter.' })
    expect(parseSoul('Sure! {"name":"Mo","personality":"A calm capybara with strong opinions."} hope that helps')?.name).toBe('Mo')
    expect(parseSoul('no json here')).toBeUndefined()
    expect(parseSoul('{"name": "Averyveryverylongname", "personality": "long enough text"}')).toBeUndefined()
    expect(parseSoul('{"name": "Pip", "personality": "short"}')).toBeUndefined()
  })
})

describe('roster', () => {
  test('48 buddies, every species at least twice, one legendary, the same every time', () => {
    const a = roster('abc', undefined, 0)
    expect(a).toHaveLength(48)
    for (const sp of SPECIES) expect(a.filter(b => b.bones.species === sp).length).toBeGreaterThanOrEqual(2)
    expect(a.filter(b => b.bones.rarity === 'legendary')).toHaveLength(1)
    expect(roster('abc', undefined, 0)).toEqual(a)
    expect(new Set(a.map(b => b.companion.name)).size).toBe(48)
    for (const b of a) expect(RARITIES).toContain(b.bones.rarity)
  })
  test('the original leads, and its name is not reused', () => {
    const lead = { companion: { name: 'Pebble', personality: 'p', hatchedAt: 0 }, bones: generateBones('abc') }
    const a = roster('abc', lead, 0)
    expect(a[0]).toBe(lead)
    expect(a.filter(b => b.companion.name === 'Pebble')).toHaveLength(1)
  })
})
