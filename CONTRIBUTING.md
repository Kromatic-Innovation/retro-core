# Contributing to retro-core

Thanks for your interest. `retro-core` is a small, zero-dependency ESM module
with a deliberately narrow scope: it wires a **loader**, an **analyzer**, and a
**router** into one run and returns what each produced. It performs no side
effect of its own.

Read [`SKILL.md`](SKILL.md) before proposing a change to the contract — it
documents what each of the three pieces owes, and the boundary the core
guarantees. [`README.md`](README.md) is the API surface.

## Ground rules

- **Zero runtime dependencies.** Loaders, analyzers, and routers are *injected*,
  never imported. The package must stay dependency-free.
- **The core never applies a change.** It hands `proposals[]` to the injected
  router and has no path to commit. A change that gives it one is out of scope
  by design, not by oversight.
- **Offline tests only.** Every test injects stubs — no fs, no network. The
  suite imports only `node:test` and `node:assert/strict`.
- **The coverage floor is a lock, not a target.** `lib/retro-core.mjs` is held at
  100% lines, branches, and functions. If it goes red, cover the line — do not
  lower the threshold.
- **Keep scope tight.** Domain-specific analysis and routing belong in the
  caller's pieces, not in the core.

## Development

```bash
git clone https://github.com/Kromatic-Innovation/retro-core.git
cd retro-core
npm test              # node --test — both suites, no install step needed
npm run test:coverage # the 100% floor on lib/retro-core.mjs
npm run check:resolve # every relative reference resolves inside this repo
```

Requires Node.js **>= 22.8.0**. There is no install step and there are no dev
dependencies: the suites import only Node built-ins.

CI runs exactly those three commands, as the `Test`, `Coverage`, and
`Resolve check` jobs. All three are aggregated into a single `CI Required`
check, which is what the `develop` → `main` promotion gate reads.

## Pull requests

**Branch model:** `develop` is the default branch and the integration target for
all contributions; `main` is the release ref that `develop` is promoted to (see
[`promote-main.yml`](.github/workflows/promote-main.yml)). Branch from `develop`
and open your PR against `develop`.

1. Branch from `develop`.
2. Add or update offline tests for any behavior change.
3. Keep the public API stable (`runRetro`, `printOnlyRouter`). This is a pre-1.0
   library; a breaking change needs a clear rationale and a semver bump.
4. Ensure `npm test`, `npm run test:coverage`, and `npm run check:resolve` are
   green, and that `npm pack --dry-run` lists only what `package.json#files`
   intends.
5. Open the PR against `develop`, describe the change, and link any issue.

## Releasing (maintainers)

`retro-core` follows [Semantic Versioning](https://semver.org/) and is **pre-1.0
(0.x)** — while the major version is `0`, a **minor** bump may include breaking
changes and a **patch** bump is backward-compatible fixes only.

Publishing runs through
[`release-npm.yml`](.github/workflows/release-npm.yml), which is
**`workflow_dispatch`-only, deliberately**: an npm version cannot be cleanly
unpublished after 72 hours and can never be reused, so no push, tag, or schedule
trigger may be added to it.

1. Bump `version` in `package.json`.
2. Merge to `develop` and promote to `main`.
3. Tag the release commit: `git tag vX.Y.Z && git push origin vX.Y.Z`.
4. Dispatch the release workflow with `dry_run: true` first — that is the
   default, so a mis-dispatch cannot publish. It runs the suite and a
   `npm publish --dry-run`.
5. Dispatch again with `dry_run: false` to publish for real.

A real publish additionally requires the `NPM_TOKEN` repository secret (an npm
automation token with publish rights). Until it exists the workflow fails fast
with an explicit message rather than half-publishing.

You can rehearse packaging at any time, without the workflow, by running
`npm publish --dry-run` locally.

**Rolling back a bad release.** npm forbids re-publishing a version once
unpublished, and unpublish is only allowed within 72 hours. **Prefer
deprecation:** `npm deprecate retro-core@<version> "<reason>"` warns installers
without breaking existing pins; then cut a fixed version. Reserve
`npm unpublish` for a genuinely broken or leaked publish inside that window.

## Reporting bugs and requesting features

Open an [issue](https://github.com/Kromatic-Innovation/retro-core/issues). For
anything security-sensitive, email **opensource@kromatic.com** rather than
opening a public issue.

By contributing you agree that your contributions are licensed under the
project's [Apache-2.0](LICENSE) license.
