# retro-core

[![License: Apache-2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)

A generic retrospective orchestrator. It wires three pluggable pieces — a
**loader**, an **analyzer**, and a **router** — into a single run, and returns
what each of them produced.

The core performs **no side effects of its own**. It never writes a file, never
commits, and never calls out to a network. Every effect a retro has is the
router's, and the default router is print-only.

## Install

```sh
npm install retro-core
```

Requires Node.js **>= 22.8.0**. The package has no dependencies.

Licensed under **Apache-2.0** — see [`LICENSE`](LICENSE).

## Usage

```js
import { runRetro } from 'retro-core';

const { evidence, analysis, proposals, routed } = await runRetro({
  load: () => readSessionLogs(),                                     // loader
  analyze: (evidence, opts) => ({ proposals: diff(evidence, opts) }), // analyzer
  route: (proposals, opts) => writeProposalFiles(proposals, opts),    // router
  opts: { since: '2026-08-01' },
});
```

Run it with no router to get a fully pure, offline dry run:

```js
const out = await runRetro({ load, analyze });
out.routed; // { routed: false, proposals: [...] } — nothing was performed
```

## The loader / analyzer / router contract

| Piece        | Signature                             | Responsibility                                                                        |
| ------------ | ------------------------------------- | ------------------------------------------------------------------------------------- |
| **loader**   | `load() => evidence`                  | Read the evidence. Required. May be async.                                             |
| **analyzer** | `analyze(evidence, opts) => analysis` | Compare intent against outcome; return `{ proposals[], ... }`. Required. May be async.  |
| **router**   | `route(proposals, opts) => routed`    | Perform the side effect. Optional — defaults to print-only. May be async.               |

`runRetro` calls them in exactly that order — `load` → `analyze` → `route` —
awaiting each, and passes `opts` through unchanged to both the analyzer and the
router. The evidence the loader returns reaches the analyzer verbatim, including
`undefined`.

### `runRetro(cfg)`

| Option      | Type       | Default           | Notes                                                           |
| ----------- | ---------- | ----------------- | ---------------------------------------------------------------- |
| `load`      | `function` | — (**required**)  | Throws `runRetro: a load() function is required` if absent.       |
| `analyze`   | `function` | — (**required**)  | Throws `runRetro: an analyze() function is required` if absent.   |
| `route`     | `function` | `printOnlyRouter` | Used only when it is a function and `printOnly` is falsy.         |
| `printOnly` | `boolean`  | `false`           | Forces the print-only router, ignoring `route` entirely.          |
| `opts`      | `object`   | `{}`              | Passed through to `analyze` and `route`.                          |

Returns `{ evidence, analysis, proposals, routed }`. `proposals` is
`analysis.proposals` when the analyzer supplied it, otherwise `[]` — and it is
handed to the router by reference, unmodified.

Anything a piece throws propagates to the caller: `runRetro` rejects rather than
swallowing it.

### `printOnlyRouter(proposals)`

The default router. A pure no-op that returns
`{ routed: false, proposals: proposals ?? [] }`. The `routed: false` sentinel is
how a caller distinguishes a dry run from a run that actually performed
something.

## Development

```sh
npm test
```

No install step is needed — the suite imports only `node:test` and
`node:assert/strict`.

See [`CONTRIBUTING.md`](CONTRIBUTING.md) for the branch model, the full set of
checks CI runs, and the release process. Participation is governed by the
[Code of Conduct](CODE_OF_CONDUCT.md).
