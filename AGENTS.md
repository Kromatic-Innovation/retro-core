# AGENTS.md — retro-core

LLM-agnostic agent guidance for this repo.

## What this is

The shared retrospective skeleton — the read → compare → propose → route
contract that every retro process plugs a loader, an analyzer, and a router
into, with a hard never-apply boundary: the core hands proposals to an injected
router and has no path to commit a change itself.

`SKILL.md` is the contract in full — read it before changing anything under
`lib/`. `README.md` is the API surface.

## Branch policy

- Default branch: `develop`; open PRs against `develop`.

## Checks

Run before opening a PR — CI runs the same commands:

```sh
npm test              # both suites, hermetic (no fs, no network)
npm run test:coverage # 100% floor on lib/retro-core.mjs — a lock, not a target
npm run check:resolve # every relative reference resolves inside this repo
```
