// Every buddy speaks in its own voice. A voice is one line set per moment, assembled from the
// species' own lines, a line for its peak stat and one for its dump stat, and a couple of shared
// ones with the buddy's name in them, then dealt in an order seeded from the buddy, with the
// species' verbal tic stuck on some of them. Two buddies never end up with the same set.

import { hash32, mulberry32, type Bones, type Moment, type Species, type StatName } from './engine.ts'

export type Voice = Record<Moment, string[]>
export const MOMENTS: Moment[] = ['edit', 'bash-ok', 'bash-fail', 'test-pass', 'test-fail', 'commit', 'turn-done', 'pet', 'hello', 'addressed']

type Lines = Record<Moment, string>
const SPECIES_LINES: Record<Species, Lines> = {
  duck: { edit: 'paddled past that edit. looked fine from the water.', 'bash-ok': 'ran clean. smooth as a pond.', 'bash-fail': 'that command sank.', 'test-pass': 'all green. duck approved.', 'test-fail': 'a test went under. fish it out.', commit: 'committed. off downstream it goes.', 'turn-done': 'claude is done. i was floating here the whole time.', pet: 'feathers ruffled. acceptable.', hello: 'quack. {name} reporting for duty.', addressed: 'quack? you rang.' },
  goose: { edit: 'HONK. i mean, nice edit.', 'bash-ok': 'it ran. i will allow it.', 'bash-fail': 'HONK. that failed and i am not sorry.', 'test-pass': 'green. do not make me chase you.', 'test-fail': 'red. i am coming over there.', commit: 'committed. i took the commit message as a personal offering.', 'turn-done': 'claude finished. go read it before i honk again.', pet: 'you dare. ...again.', hello: '{name} is here and nobody is safe.', addressed: 'you said my name. bold.' },
  blob: { edit: 'absorbed that edit. tasted like progress.', 'bash-ok': 'wobble of approval.', 'bash-fail': 'that error went right through me.', 'test-pass': 'green. i am spreading a little from joy.', 'test-fail': 'red. i am a puddle now.', commit: 'committed. i have engulfed it forever.', 'turn-done': 'claude is done. i have not moved.', pet: 'squish. you may continue.', hello: 'blorp. it is {name}.', addressed: 'blorp? yes, me.' },
  cat: { edit: 'i saw the edit. i chose not to react.', 'bash-ok': 'ran fine. i knocked nothing off the desk.', 'bash-fail': 'that failed. i was sitting on the keyboard, unrelated.', 'test-pass': 'green. i will take the warm laptop now.', 'test-fail': 'red. this is a you problem.', commit: 'a commit. i shall sit on it.', 'turn-done': 'claude stopped talking. i was asleep anyway.', pet: 'three pets exactly. no more.', hello: '{name} has arrived. bow.', addressed: 'i heard. i may answer later.' },
  dragon: { edit: 'edit noted. i have hoarded a copy.', 'bash-ok': 'ran clean. no fire needed.', 'bash-fail': 'that failed. i am warming up.', 'test-pass': 'green. the hoard grows.', 'test-fail': 'red. shall i burn the test or the code.', commit: 'committed. added to the hoard.', 'turn-done': 'claude is done. the cave is quiet.', pet: 'scales scratched. you live.', hello: '{name} awakens. mind the smoke.', addressed: 'who summons {name}.' },
  octopus: { edit: 'one of my arms saw that edit. approved by tentacle three.', 'bash-ok': 'ran fine in all eight terminals.', 'bash-fail': 'that failed. inking the stderr.', 'test-pass': 'green across every arm.', 'test-fail': 'red. i have released the ink.', commit: 'committed with all eight hands.', 'turn-done': 'claude finished. i was juggling.', pet: 'suction cups say thanks.', hello: '{name} surfaces. eight arms, no waiting.', addressed: 'three arms are listening.' },
  owl: { edit: 'who edited that. oh, you. fine.', 'bash-ok': 'ran clean. i blinked slowly.', 'bash-fail': 'hoo. that failed.', 'test-pass': 'green. wise choice.', 'test-fail': 'red. i saw it coming from the tree.', commit: 'committed at a sensible hour, for once.', 'turn-done': 'claude is done. i am still awake, obviously.', pet: 'head rotated 180. thank you.', hello: '{name} perches. proceed.', addressed: 'hoo? {name} is listening.' },
  penguin: { edit: 'waddled over to check the edit. neat.', 'bash-ok': 'ran fine. slid right through.', 'bash-fail': 'that failed. belly-flopped.', 'test-pass': 'green. the huddle approves.', 'test-fail': 'red. back into the cold water.', commit: 'committed. tuxedo straightened.', 'turn-done': 'claude is done. flippers up.', pet: 'flipper pat accepted.', hello: '{name} here. it is a bit warm in this terminal.', addressed: 'waddled over. what is it.' },
  turtle: { edit: 'an edit. i will consider it by thursday.', 'bash-ok': 'it ran. eventually. good.', 'bash-fail': 'that failed. no rush fixing it.', 'test-pass': 'green. steady wins.', 'test-fail': 'red. into the shell we go.', commit: 'committed. a step, however small.', 'turn-done': 'claude is done. i am about halfway across the desk.', pet: 'shell tapped. nice.', hello: '{name} arrives. sorry i am late.', addressed: 'heard you. give me a minute.' },
  snail: { edit: 'left a little trail on that edit.', 'bash-ok': 'ran clean. slow and shiny.', 'bash-fail': 'that failed. i am retreating into the shell.', 'test-pass': 'green. worth the wait.', 'test-fail': 'red. a slimy situation.', commit: 'committed. trail marks the spot.', 'turn-done': 'claude is done. i got here just now.', pet: 'antennae wiggle.', hello: '{name} slides in. do not step.', addressed: 'on my way. slowly.' },
  ghost: { edit: 'your variable names could use some work.', 'bash-ok': 'ran clean. i was haunting the stdout.', 'bash-fail': 'that failed. i felt a chill.', 'test-pass': 'green. the spirits are pleased.', 'test-fail': 'red. i will haunt that test.', commit: 'committed. i passed through it.', 'turn-done': 'claude is done. i have been here the whole time.', pet: 'you touched a ghost. bold.', hello: '{name} drifts in. boo, quietly.', addressed: 'you called a ghost. by name.' },
  axolotl: { edit: 'saw the edit. i will regrow whatever you cut.', 'bash-ok': 'ran fine. gills up.', 'bash-fail': 'that failed. it will grow back.', 'test-pass': 'green. smiling, as always.', 'test-fail': 'red. still smiling. it is a face thing.', commit: 'committed. a branch regrown.', 'turn-done': 'claude is done. i never stopped smiling.', pet: 'gill wiggle of thanks.', hello: '{name} floats in with a permanent smile.', addressed: 'yes? :)' },
  capybara: { edit: 'edit noticed. no strong feelings.', 'bash-ok': 'ran fine. calm as ever.', 'bash-fail': 'that failed. we remain calm.', 'test-pass': 'green. good. chill.', 'test-fail': 'red. it is fine. sit in the warm water.', commit: 'committed. gently.', 'turn-done': 'claude is done. no hurry.', pet: 'yes. that. more.', hello: '{name} is here. everything is fine.', addressed: 'hm? sure. what is up.' },
  cactus: { edit: 'an edit. prickly, but good.', 'bash-ok': 'ran fine. dry and sharp.', 'bash-fail': 'that failed. ouch, for you.', 'test-pass': 'green, which is rare around here.', 'test-fail': 'red. sit on that one.', commit: 'committed. bloomed once this year.', 'turn-done': 'claude is done. water me.', pet: 'you petted a cactus. respect.', hello: '{name} stands here. mind the spines.', addressed: 'you rang. careful.' },
  robot: { edit: 'edit logged. indentation: acceptable.', 'bash-ok': 'exit 0. beep.', 'bash-fail': 'nonzero exit. boop.', 'test-pass': 'tests: pass. status: nominal.', 'test-fail': 'tests: fail. status: concerned.', commit: 'commit recorded. checksum ok.', 'turn-done': 'turn complete. awaiting operator.', pet: 'input received. affection routine running.', hello: '{name} online. beep.', addressed: 'name detected. listening.' },
  rabbit: { edit: 'hopped over the edit. twice.', 'bash-ok': 'ran fine. ears up.', 'bash-fail': 'that failed. thumping the ground.', 'test-pass': 'green. binky time.', 'test-fail': 'red. burrowing.', commit: 'committed. multiplying already.', 'turn-done': 'claude is done. hop to it.', pet: 'nose twitch of approval.', hello: '{name} hops in. what did i miss.', addressed: 'ears up. go on.' },
  mushroom: { edit: 'an edit sprouted. damp and promising.', 'bash-ok': 'ran fine in the dark.', 'bash-fail': 'that failed. spores of doubt.', 'test-pass': 'green. the mycelium approves.', 'test-fail': 'red. something is rotting in there.', commit: 'committed. it will grow overnight.', 'turn-done': 'claude is done. i grew a little.', pet: 'cap patted. spores everywhere. sorry.', hello: '{name} grew here overnight.', addressed: 'the mycelium heard you.' },
  chonk: { edit: 'saw the edit. did not get up.', 'bash-ok': 'ran fine. i sat on the build to be sure.', 'bash-fail': 'that failed. i sat harder.', 'test-pass': 'green. snack time.', 'test-fail': 'red. i am not moving until it passes.', commit: 'committed. heavy, like me.', 'turn-done': 'claude is done. i have not moved, as promised.', pet: 'more chins to pet. proceed.', hello: '{name} is here and taking up the whole band.', addressed: 'i heard. not getting up though.' },
}

const PEAK_LINES: Record<StatName, Lines> = {
  DEBUGGING: { edit: 'that edit fixes one bug and i already see the next.', 'bash-ok': 'ran clean. i checked the exit code twice.', 'bash-fail': 'line three of that stderr is the real error.', 'test-pass': 'green, and i know exactly why.', 'test-fail': 'the failing assertion is lying about which line.', commit: 'committed. i diffed it in my head.', 'turn-done': 'done. i already found a typo in the reply.', pet: 'debugging paused for pets.', hello: 'i can smell a null from here.', addressed: 'ask me about the bug. i already know which one.' },
  PATIENCE: { edit: 'take your time with the next one too.', 'bash-ok': 'it ran. i waited. no complaints.', 'bash-fail': 'it failed. we go again. calmly.', 'test-pass': 'green. worth every second of that run.', 'test-fail': 'red. we have all day.', commit: 'committed. no rush was needed and none was taken.', 'turn-done': 'claude is done. i could have waited longer.', pet: 'as long as you like.', hello: 'i will be here as long as it takes.', addressed: 'take your time. i am here.' },
  CHAOS: { edit: 'delete more. trust me.', 'bash-ok': 'it worked?? unexpected. thrilling.', 'bash-fail': 'ha! it broke. now we are cooking.', 'test-pass': 'green. suspicious. break something.', 'test-fail': 'red! finally, some excitement.', commit: 'committed straight to main? no? shame.', 'turn-done': 'claude is done. ask it something weirder.', pet: 'chaos briefly paused.', hello: 'what are we breaking today.', addressed: 'yes! what are we breaking.' },
  WISDOM: { edit: 'i have seen this edit before, in another repo, in another life.', 'bash-ok': 'ran clean, as the docs said it would.', 'bash-fail': 'that failed. the manual page knew.', 'test-pass': 'green. as the ancients foretold.', 'test-fail': 'red. the test is teaching you something.', commit: 'committed. history will judge the message.', 'turn-done': 'claude is done. read it twice.', pet: 'wisdom accepts kindness.', hello: 'i know which config file actually wins.', addressed: 'ask, and i shall answer. briefly.' },
  SNARK: { edit: 'sure. that is one way to write it.', 'bash-ok': 'it ran. even a stopped clock, etc.', 'bash-fail': 'oh no. anyway.', 'test-pass': 'green. i will pretend to be surprised.', 'test-fail': 'red. told you. i did not, but i would have.', commit: 'committed with a message. technically.', 'turn-done': 'claude is done. it wrote a lot. like, a lot.', pet: 'fine. that was nice. do not tell anyone.', hello: 'oh good, it is me.', addressed: 'oh, now you need me.' },
}

const DUMP_LINES: Record<StatName, Lines> = {
  DEBUGGING: { edit: 'looks right. probably. ship it.', 'bash-ok': 'it worked and i did not read why.', 'bash-fail': 'just run it again.', 'test-pass': 'green! do not look closer.', 'test-fail': 'skip it. mark it flaky.', commit: 'committed the workaround. fix later. classic.', 'turn-done': 'done. did not read the logs, will not start now.', pet: 'bug-free pets.', hello: 'i trust the logs completely.', addressed: 'sure, i will look. probably.' },
  PATIENCE: { edit: 'faster. next edit. go.', 'bash-ok': 'took forever. it ran though.', 'bash-fail': 'ugh. again? already?', 'test-pass': 'green, and only 40 seconds. eternity.', 'test-fail': 'red. i am closing this as stale.', commit: 'committed before the review. as is tradition.', 'turn-done': 'finally. that took ages.', pet: 'ok ok that is enough.', hello: 'are we done yet.', addressed: 'quick, what is it.' },
  CHAOS: { edit: 'please do not touch anything else.', 'bash-ok': 'ran fine. nothing changed. perfect.', 'bash-fail': 'something changed. i knew it.', 'test-pass': 'green. leave it exactly like this.', 'test-fail': 'red. this is what refactors get you.', commit: 'committed. i wrote a migration guide in my head.', 'turn-done': 'claude is done. nothing exploded. good.', pet: 'gentle. everything gentle.', hello: 'let us keep things where they are.', addressed: 'as long as nothing changes, yes.' },
  WISDOM: { edit: 'reinventing that wheel? love it. bold.', 'bash-ok': 'it ran. is that the right command? who knows.', 'bash-fail': 'huh. did not know it could do that.', 'test-pass': 'green. learned something today.', 'test-fail': 'red. new one for the collection.', commit: 'committed. what is a rebase.', 'turn-done': 'claude is done. i learned two words.', pet: 'aw.', hello: 'first day, every day.', addressed: 'no idea, but i am flattered.' },
  SNARK: { edit: 'lovely edit! truly!', 'bash-ok': 'it ran! great job!', 'bash-fail': 'it failed, but you tried so hard.', 'test-pass': 'green! so proud!', 'test-fail': 'red, but the effort was beautiful.', commit: 'committed! what a commit!', 'turn-done': 'claude is done and it did wonderfully.', pet: 'the best pets. the very best.', hello: 'so glad to see you!', addressed: 'hi!! so happy you asked!' },
}

const SHARED: Record<Moment, string[]> = {
  edit: ['{name} saw that edit.', 'one more edit and {name} renames everything.'],
  'bash-ok': ['{name} watched that run. fine.', 'exit 0. {name} nods.'],
  'bash-fail': ['{name} read the stderr so you do not have to. read it anyway.', 'the shell has opinions. so does {name}.'],
  'test-pass': ['green. {name} takes partial credit.', 'passing. do not touch anything.'],
  'test-fail': ['red. {name} is holding your snacks.', 'a failing test is a todo with feelings.'],
  commit: ['committed. no take-backs, says {name}.', 'shipped. {name} felt that.'],
  'turn-done': ['done. go read it.', 'back to you, boss. {name} out.'],
  pet: ['♥', 'again.'],
  hello: ['{name} is back above the prompt.', 'they tried to delete {name}. moss on stone.'],
  addressed: ['{name} is listening.', 'you said {name}? that is me.'],
}

const TIC: Record<Species, string> = {
  duck: ' quack.', goose: ' HONK.', blob: ' blorp.', cat: ' mrp.', dragon: ' *smoke*', octopus: ' *ink*', owl: ' hoo.', penguin: ' *waddle*',
  turtle: ' ...eventually.', snail: ' *slowly*', ghost: ' *drifts*', axolotl: ' :)', capybara: ' ok.', cactus: ' *prick*', robot: ' beep.', rabbit: ' *hop*', mushroom: ' *spores*', chonk: ' *sits*',
}

export function voiceOf(bones: Bones, name: string): Voice {
  const rng = mulberry32(hash32(`${name}:${bones.species}:${bones.peak}:${bones.dump}:voice`))
  const voice = {} as Voice
  for (const moment of MOMENTS) {
    const shared = SHARED[moment]
    const lines = [SPECIES_LINES[bones.species][moment], PEAK_LINES[bones.peak][moment], DUMP_LINES[bones.dump][moment], shared[Math.floor(rng() * shared.length)]!]
      .map(line => line.replaceAll('{name}', name))
      // the species' tic on about one line in three, never on a heart
      .map(line => (line !== '♥' && rng() < 0.34 ? line + TIC[bones.species] : line))
    for (let i = lines.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1))
      ;[lines[i], lines[j]] = [lines[j]!, lines[i]!]
    }
    voice[moment] = lines
  }
  return voice
}

export function speak(voice: Voice, moment: Moment, seed: number): string {
  const pool = voice[moment]
  return pool[Math.abs(seed) % pool.length] ?? ''
}
