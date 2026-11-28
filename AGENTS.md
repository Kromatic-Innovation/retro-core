# AGENTS.md — retro-core

LLM-agnostic agent guidance for this repo.

## What this is

A public, Apache-2.0, zero-dependency npm package: the shared retrospective
skeleton (read → compare → propose → route). A caller supplies a loader, an
analyzer, and a router; the core wires them together and has no path to apply a
change itself.

- `README.md` — north star, non-goals, and the API surface. Read it first.
- `SKILL.md` — the contract in prose. Read it before changing anything under
  `lib/`.

## Status: maintenance

Bug fixes and security fixes only. Before adding anything, check it against the
README's **North star** and **Non-goals**. If it is not a bug fix, it almost
certainly does not belong here. Keep the public API (`runRetro`,
`printOnlyRouter`) stable.

## This is a public repository

Everything committed here is world-readable and part of an OSS project. Do not
add:

- lists of internal consumers, internal issue references, or internal repo names;
- local filesystem paths, personal names, or plus-addressed emails
  (`public-safe-lint.sh` enforces the generic shapes in CI);
- internal audits, plans, or retros. Those belong in the maintainers' private
  tracking, not here.

Which internal projects consume this package is tracked outside this repo by
its maintainers. To find code that imports it, search for the bare specifier
`"retro-core"` in the consuming repositories rather than trusting a list.

## Files you should not hand-edit

- `.github/workflows/promote-main.yml` is generated from an org-wide template
  and re-synced automatically; a local edit is overwritten and fails the
  template drift guard. Change the template upstream instead.

## Branch policy

- Default branch: `develop`; open PRs against `develop`.
- `develop` is promoted to `main` by `promote-main.yml`, gated on the
  `CI Required` check.

## Releasing

Pushing a `vX.Y.Z` tag **publishes to npm** (`.github/workflows/release.yml`,
OIDC trusted publishing). The tag must match `package.json#version` and sit on a
commit already on `main`. A pushed tag is effectively irreversible; see
`CONTRIBUTING.md` → Releasing.

## Checks

Run before opening a PR — CI runs the same commands:

```sh
npm test              # both suites, hermetic (no fs, no network)
npm run test:coverage # 100% floor on lib/retro-core.mjs — a lock, not a target
npm run check:resolve # every relative reference resolves inside this repo
```
