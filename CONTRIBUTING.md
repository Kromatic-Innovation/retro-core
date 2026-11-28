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

Publishing runs through [`release.yml`](.github/workflows/release.yml), which
is **triggered by pushing a `vX.Y.Z` tag** and publishes to npm with OIDC
trusted publishing (no npm token is stored anywhere). Before publishing, it
refuses to proceed unless the tag matches `package.json#version` and the tagged
commit is already on `main`. It then runs the test suite and `npm pack --dry-run`
before `npm publish --provenance`.

1. Bump `version` in `package.json` in a PR against `develop`.
2. Merge, and promote `develop` to `main`.
3. Rehearse locally if you like: `npm publish --dry-run`.
4. Tag the promoted commit and push the tag — **this publishes**:
   `git tag vX.Y.Z <sha-on-main> && git push origin vX.Y.Z`.

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
