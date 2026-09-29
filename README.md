# cc-buddy

`/buddy` is back. The small terminal creature Claude Code hatched for people in April 2026 (and removed in 2.1.97), drawn above the prompt again and brought up to date, as a plugin built on Claude Code's function hooks.

```
              Noodle  rare ghost ★★★  lv 2 · » focused              [ next ]
   .----.                                                            [ hide ]
  / ×  × \    ╭──────────────────────────────────────────────╮
  |      |    │ sent 2 off. i will keep their seats warm.    │
  ~`~``~`~    ╰──────────────────────────────────────────────╯
```

This is an unofficial fan project. It isn't made or endorsed by Anthropic.

## What it does

**Your buddy comes back as it was.** If you hatched one in April, it's still listed in `~/.claude.json`. cc-buddy reads it and redraws the same creature: same name and personality, and the same species, rarity, eyes, hat and stats. The body is derived from your account id exactly the way the original did it (wyhash of the id plus `friend-2026-401`, fed to Mulberry32). A test suite pins this down so it can't drift.

**New here? You get an egg.** Run `/buddy` and it hatches: a short animation, then Haiku writes its name and personality once, the way the original did. The body still comes from your account id.

**It stays yours.** You keep one buddy, and it grows:

- XP from commits, passing tests, edits and finished turns, with levels that come quickly at first and slowly later.
- A mood that follows the session. It's `» focused` while Claude works, `↑ proud` after a green run or a commit, `! worried` after three failures in a row, `z sleepy` after twenty quiet minutes, and `♥ happy` after a pet. Every mood shows as a symbol and a word, never color alone.
- Nothing decays. A buddy never gets hungry, never runs off, and never guilts you into opening the terminal.

**A collection you earn.** A roster of 49 more buddies (two of them legendary), seeded from your account id, opens one at a time: one new buddy per 25 commits. `/buddy roster` shows what's open and how far the next one is. If you used an earlier version that rotated through the roster, you keep everyone you already met.

**It reacts, cheaply.** When Claude edits a file, runs a command, passes or fails tests, commits or finishes a turn, your buddy says something in its own voice. Those lines come from a pool built per buddy from its species and stats, so they cost no tokens.

**Talk to it.** Mention your buddy by name in a prompt and it answers in its bubble. A pool line shows up right away, then Haiku writes a proper reply in character and swaps it in. Claude gets a note that the buddy is a separate watcher and should stay out of the way, so it doesn't answer for it.

**It notices agents.** When Claude sends out two or more subagents, the buddy counts them out and tells you when they're all back.

**It fits your screen.** It shows the full sprite when there's room and a single line when the terminal is short or narrow. On the desktop app and mobile, where there's no band above the prompt, it sits in a pane instead.

## Requirements

- Claude Code 2.1.269 or later.
- Function hooks turned on: `"CLAUDE_CODE_ENABLE_FUNCTION_HOOKS": "1"` under `env` in `~/.claude/settings.json`.
- An interactive session: the terminal, the desktop app's Code tab, or mobile. Nothing draws under `claude -p`.

## Install

```sh
claude plugin marketplace add vmallela0/cc-buddy
claude plugin install cc-buddy@cc-buddy
```

Or from a clone, for one session: `claude --plugin-dir /path/to/cc-buddy`

## Commands

| command | what it does |
|---|---|
| `/buddy` | hatch the egg the first time; after that, hide or show for this session |
| `/buddy pet` | two and a half seconds of floating hearts (or click the buddy) |
| `/buddy card` | the stat card: stats, level and XP, mood, commits, unlocks, model use |
| `/buddy mute`, `/buddy unmute` | silence the speech bubbles, remembered |
| `/buddy talk model`, `/buddy talk canned` | Haiku for replies and the hatch (default), or no tokens at all |
| `/buddy roster` | unlocked buddies with their levels, and how far the next unlock is |
| `/buddy next`, `/buddy prev`, `/buddy <name>` | switch among the unlocked |
| `/buddy rotate`, `/buddy pin` | a different unlocked buddy each session, or stay with this one (default) |
| `/buddy compact`, `/buddy full`, `/buddy auto` | one line, the sprite, or pick by terminal size (default) |
| `/buddy still`, `/buddy move` | turn animation off (no wiggle, blink or floating hearts) or back on |
| `/buddy pane`, `/buddy band` | move it into a pane, or back above the prompt |
| `/buddy on`, `/buddy off` | show or hide, remembered |
| `/buddy help` | this list |

`ctrl+x ctrl+a` collapses the band above the prompt, buddy included.

## Cost and privacy

Only two things ever reach a model, both through Claude Code's own client, and both stop with `/buddy talk canned`:

- **Replies to its name.** When a prompt you type mentions the buddy, that prompt (the first 2,000 characters) goes to Haiku along with the buddy's personality, and a one-line reply comes back. It's capped at 20 replies an hour. Each one is a few hundred tokens.
- **Hatching.** One call of about 300 tokens when an egg hatches.

The first time either happens you get a notice saying so. `/buddy card` shows how many calls were made and roughly how many tokens they used.

Everything else stays local:

- At session start it reads `~/.claude.json` once, for your account id and the original companion. It never writes to that file.
- It looks at each tool call's name and success, and for Bash the command text, to pick a reaction. Nothing from that is stored or logged.
- It reads prompts you type only to check for the buddy's name.
- XP, commit count, unlocks and settings live in the plugin's own store.
- There's no telemetry, and it makes no other network calls.

## Develop

```sh
bun test                         # bones, art, voice, soul parsing, progress
bun run typecheck                # needs .claude/types, see below
claude plugin validate .         # what the module hooks and calls
claude --plugin-dir . --debug    # hot reloads on save
```

Run `/plugin-types` once in a Claude Code session in this folder to write `.claude/types/claude-code.d.ts`, which `tsconfig.json` includes. CI runs the tests only, since those types come from your local Claude Code.

To see the egg without touching your own buddy, point the plugin at a stand-in config and give it a fresh store by renaming the plugin in a copy:

```sh
echo '{"oauthAccount":{"accountUuid":"any-id-you-like"}}' > /tmp/fake.json
CC_BUDDY_CLAUDE_JSON=/tmp/fake.json claude --plugin-dir /path/to/renamed-copy
```

Layout:

- `hooks/register.tsx` is the hooks module: session start, `/buddy`, reactions, the band and the pane.
- `hooks/boards/buddy.tsx` is the surface module that draws and animates the buddy.
- `hooks/buddy/engine.ts` holds the derivation, art, card and roster.
- `hooks/buddy/voice.ts` builds each buddy's lines.
- `hooks/buddy/progress.ts` holds XP, levels, moods and unlocks.

Species art and the derivation follow the community port at [1270011/claude-buddy](https://github.com/1270011/claude-buddy), trimmed to the original eighteen species so existing buddies keep their bodies. Some write-ups describe hats as gated by rarity. The shipped code never gated them, so this plugin doesn't either.

## License

MIT
