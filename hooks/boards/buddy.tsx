/* @jsx h */
import type { ClientSurface } from 'claude-code'
import { artFrame, EGG_ART, faceOf, HATCH_MS, PET_HEARTS, PET_MS, RARITY_COLOR, RARITY_STARS, type Bones, type Companion } from '../buddy/engine.ts'
import { MOOD_MARK, type Mood } from '../buddy/progress.ts'

// The buddy's window: a surface module on the drawing thread with its own frame clock. The hooks
// module owns the buddy (it reads it from ~/.claude.json, feeds it reactions from tool calls) and
// hands it in as props; this only draws it, animates it, and posts a click back as a pet.
//
// Never name a local `h` here: every JSX tag compiles to a call of `h`.

type Props = {
  bones: Bones
  companion: Companion
  // not hatched yet: an egg until /buddy
  egg?: boolean
  muted?: boolean
  bubble?: { text: string; at: number }
  // stamps from the hooks module; a new one starts that animation here
  petAt?: number
  hatchAt?: number
  level: number
  mood: Mood
  // one line instead of the sprite: a short terminal, a narrow pane, or /buddy compact
  compact?: boolean
  // /buddy still: no idle wiggle, no blink, no floating hearts
  still?: boolean
  working: boolean
  now: number
  columns: number
} | undefined
// ticks left on each animation, and the last stamp each one started from
type State = { tick: number; pet: number; petSeen: number; hatch: number; hatchSeen: number }

const TICK_MS = 500

export default function BuddyBoard(props: Props, surface: ClientSurface<State>) {
  const { Box, Text } = surface.elements

  if (surface.state === undefined) {
    // stamps already on the first props are old news, except a hatch still under way: hatching
    // renames the buddy, which mounts this fresh, and the animation must still play
    const hatchLeft = props?.hatchAt !== undefined ? Math.ceil((HATCH_MS - (props.now - props.hatchAt)) / TICK_MS) : 0
    surface.setState({ tick: 0, pet: 0, petSeen: props?.petAt ?? 0, hatch: Math.max(0, hatchLeft), hatchSeen: props?.hatchAt ?? 0 })
    surface.every(TICK_MS, () => {
      const s = surface.state
      if (s) surface.setState({ ...s, tick: s.tick + 1, pet: Math.max(0, s.pet - 1), hatch: Math.max(0, s.hatch - 1) })
    })
    surface.onPointer(ev => {
      const s = surface.state
      if (s && ev.type === 'down') {
        surface.setState({ ...s, pet: PET_MS / TICK_MS })
        surface.post({ type: 'pet' })
      }
    })
  }

  const s = surface.state
  if (!props) return <Text dimColor>buddy · waiting for the plugin to load it</Text>
  if (s) {
    const newPet = props.petAt !== undefined && props.petAt !== s.petSeen
    const newHatch = props.hatchAt !== undefined && props.hatchAt !== s.hatchSeen
    if (newPet || newHatch) {
      surface.setState({
        ...s,
        ...(newPet ? { petSeen: props.petAt!, pet: PET_MS / TICK_MS } : {}),
        ...(newHatch ? { hatchSeen: props.hatchAt!, hatch: HATCH_MS / TICK_MS } : {}),
      })
    }
  }

  const { bones, companion, working } = props
  const tick = s?.tick ?? 0
  const hatching = s?.hatch ?? 0

  if (props.egg && props.compact) return <Text>{`(  )  an egg · /buddy hatches it`}</Text>
  // still and compact skip the hatch animation and go straight to the buddy
  if (props.egg || (hatching > 0 && !props.still && !props.compact)) {
    // idle egg rocks now and then; a hatch wobbles, cracks, then opens on the last ticks
    const total = HATCH_MS / TICK_MS
    const step = total - hatching
    const egg = props.egg
      ? EGG_ART[tick % 6 === 5 ? 1 + (tick % 2) : 0]!
      : EGG_ART[step < total - 3 ? 1 + (step % 2) : step < total - 1 ? 3 : 4]!
    return (
      <Box flexDirection="row" columnGap={2}>
        <Box flexDirection="column">
          {egg.map(line => <Text>{line}</Text>)}
        </Box>
        <Box flexDirection="column" justifyContent="center">
          <Text bold>{props.egg ? 'an egg' : 'hatching...'}</Text>
          <Text dimColor>{props.egg ? '/buddy hatches it' : 'something is moving in there'}</Text>
        </Box>
      </Box>
    )
  }

  // working: cycle the three frames; idle: mostly still, a wiggle every few seconds, a blink now and then
  const still = props.still === true
  const frame = still ? 0 : working ? tick % 3 : tick % 8 === 7 ? 2 : 0
  const blink = !still && !working && tick % 11 === 10
  const petting = s?.pet ?? 0
  const art = artFrame(bones, frame, blink)
  // hearts float up over the sprite for the length of a pet, one row a tick; held still under /buddy still
  const hearts = petting > 0 ? (still ? PET_HEARTS[1]! : PET_HEARTS[PET_HEARTS.length - petting] ?? PET_HEARTS[0]!) : undefined
  const color = RARITY_COLOR[bones.rarity]
  const stars = RARITY_STARS[bones.rarity]
  const shiny = bones.shiny ? '✨ ' : ''

  const bubbleFresh = !props.muted && props.bubble && props.now - props.bubble.at < 30_000
  const said = bubbleFresh ? props.bubble!.text : undefined
  // the band's width less the art, the gaps and the bubble's frame
  const bubbleWidth = Math.max(12, Math.min(60, props.columns - 14 - 6))
  const status = `lv ${props.level} · ${MOOD_MARK[props.mood]} ${props.mood}`

  if (props.compact) {
    const heart = petting > 0 ? ' ♥' : ''
    return (
      <Text wrap="truncate-end">
        {[
          color ? <Text color={color}>{faceOf(bones, blink)}</Text> : <Text>{faceOf(bones, blink)}</Text>,
          <Text bold>{` ${companion.name}`}</Text>,
          <Text dimColor>{` ${stars}${bones.shiny ? ' ✨' : ''} · ${status}${heart}`}</Text>,
          ...(said ? [<Text>{`  “${said}”`}</Text>] : []),
        ]}
      </Text>
    )
  }

  const hint = working ? `${companion.name} is watching Claude work` : `click to pet · /buddy hides${props.muted ? ' · muted' : ''}`

  return (
    <Box flexDirection="row" columnGap={2}>
      <Box flexDirection="column">
        {[
          ...(hearts ? [<Text color="red">{hearts}</Text>] : []),
          ...art.map(line => (color ? <Text color={color}>{line}</Text> : <Text>{line}</Text>)),
        ]}
      </Box>
      <Box flexDirection="column" justifyContent="center">
        <Text>
          <Text bold>{companion.name}</Text>
          <Text dimColor>{`  ${shiny}${bones.rarity} ${bones.species} `}</Text>
          {color ? <Text color={color}>{stars}</Text> : <Text>{stars}</Text>}
          <Text dimColor>{`  ${status}`}</Text>
        </Text>
        {said ? (
          <Box borderStyle="round" borderDimColor paddingX={1} width={bubbleWidth + 4}>
            <Text wrap="wrap">{said}</Text>
          </Box>
        ) : (
          <Text dimColor wrap="truncate-end">{hint}</Text>
        )}
      </Box>
    </Box>
  )
}
