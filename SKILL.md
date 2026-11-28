---
name: retro-core
description: Shared retrospective skeleton — read evidence, compare intent vs outcome, propose, route. A retro process supplies a loader, an analyzer, and a router; retro-core orchestrates them and guarantees it never applies a change itself. A persona-agnostic utility, consumed either as a library or as a contract an agent-driven process conforms to.
user-invocable: false
---

# retro-core

The shared skeleton every retrospective walks: **read evidence -> compare intent
vs outcome -> propose -> route**. A retro process plugs three pieces into the
core and the core wires them together:

```
LOADER    load()                  -> evidence
ANALYZER  analyze(evidence, opts) -> { proposals[], ...summary }
ROUTER    route(proposals, opts)  -> routed
```

This is a utility, not an operator persona. It performs no outward action of its
own — every side effect belongs to the injected router.

> `README.md` documents the API surface — options, return shape, and errors.
> This file documents the *contract*: what each piece is responsible for, the
> boundary the core guarantees, and what it means for a process to conform to
> the skeleton without importing it.

## The contract (`lib/retro-core.mjs`)

```js
import { runRetro, printOnlyRouter } from "retro-core";

const { evidence, analysis, proposals, routed } = await runRetro({
  load,            // REQUIRED () => evidence            — read the evidence
  analyze,         // REQUIRED (evidence, opts) => { proposals[], ... } — intent vs outcome
  route,           // optional (proposals, opts) => routed — perform the side-effect
  printOnly,       // optional: force the print-only router (ignore `route`)
  opts,            // optional: passed through to analyze() AND route()
});
```

- **LOADER** reads the evidence for the run (a run record, a ledger slice, a set
  of retro entries). It returns whatever shape the analyzer expects.
- **ANALYZER** compares where the run was *meant* to go against where it *landed*
  and returns structured `proposals[]` (plus any summary fields). It is pure: it
  derives proposals, it does not act on them.
- **ROUTER** performs the side-effect for the proposals. The default is
  `printOnlyRouter` — a pure no-op that routes nothing and returns the proposals
  unmodified, so a retro is fully offline-testable until a real router is wired.
  A typical router writes each proposal out somewhere a human reviews it.

`opts` flows to both the analyzer and the router so a process can thread topic,
session context, output directory, and a `--print-only` flag through one channel.

## Hard boundary — never apply a change

retro-core NEVER edits or commits a file. It only hands `proposals[]` to the
injected router. The intended shape for a router is the soft path: write the
proposals out for review, so that the change which eventually lands is a human's
visible decision. A process that wires retro-core inherits that boundary for
free — the core gives it no path to commit.

## How a process wires it

A retro process supplies its own three pieces:

1. a **loader** for its evidence,
2. an **analyzer** that derives its domain proposals (carrying any domain
   boundary notes verbatim — e.g. a constraint that a given retro may propose
   only process changes, never content changes), and
3. a **router** (default: write the proposals out for review).

A CLI flag like `--print-only` maps to `printOnly: true`, which forces
`printOnlyRouter` and writes nothing.

## Two kinds of consumer

retro-core is a contract first and a `lib/` second. Consumers come in two shapes,
both bound by the same four-phase skeleton (read -> compare -> propose -> route)
and the same never-apply boundary:

1. **Code process** — a module that imports `runRetro` and supplies real
   `load` / `analyze` / `route` functions. Use this when the evidence is
   structured and the analysis is deterministic.
2. **Agent-driven retro** — a process whose loader, analyzer, and router are
   *procedures an agent performs* (a query, a diff of the trail left behind,
   reading prior retro entries, a plus/minus/delta judgement), not a JS engine.
   It does not import `lib/` — it **conforms to** this contract: it names its
   situational LOADER, ANALYZER, and ROUTER, follows read -> compare -> propose
   -> route in that order, and inherits the never-apply boundary. The shared
   core is the single source of the skeleton; the process supplies only its
   situational pieces and its approval gate.

A process migrated onto retro-core MUST keep its situational routing/approval
gate and its existing output destinations — retro-core centralizes the skeleton,
it does not change where a retro's proposals land or who approves them.

### What a consumer looks like in practice

| Shape | LOADER | ANALYZER | ROUTER / gate |
|---|---|---|---|
| Code process | read the latest run record | derive proposals from the run's stated intent vs. its outcome | write proposal files for review |
| Agent-driven, metrics | a rolling predicted-vs-realized window | correlation, top surprises, directional recommendations | a one-page report on a fixed cadence |
| Agent-driven, corpus | read the retro entries accumulated since the last pass | group and classify recurring patterns | ranked findings -> proposals / issues, behind a human approval gate |

## Tests

```
npm test
```

Hermetic: injected loader/analyzer/router stubs, no fs and no network. Covers the
load -> analyze -> route order, `opts` pass-through, proposals reaching the router
unmodified, the print-only/no-route path, and the required-dependency guard.
