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

## Evidence provenance — source class and controls

A retro is where an incident's claims get promoted into durable knowledge, so an
unvalidated claim promoted here is worse than one that stays in a transcript — it
becomes a rule that misdirects future work. Before a claim is used to derive a
proposal, hold it to two clauses:

1. **Name the source class.** Every claim declares whether its evidence is
   **ground truth** (a direct read of the subject — an API response, `ps`, `git`),
   a **system-derived field** (a value computed or reported by some tool *about*
   the subject), or an **authored instrument** (a script or probe written during
   the session to answer the question). Any claim in the latter two classes that
   **drives a fix design** requires a **second, independent** source before it is
   quotable — one that does not share the first's failure mode.
2. **An instrument authored mid-incident is not quotable until it has been run
   against a known-positive *and* a known-negative control.** A probe that has
   only ever been pointed at the failing case cannot distinguish "the thing is
   broken" from "the probe never measured what I think it measured." It earns
   the right to be cited only after it goes green on a case known to be good
   *and* red on a case known to be bad.

*Why this is load-bearing.* These clauses come out of a single incident in which
three self-authored instruments each produced a confident **wrong** answer:

- **An exit code read through a pipeline.** `bash guard 2>&1 | tail -12; echo
  "exit=$?"` reports `tail`'s status, not the guard's. It produced a false
  finding — "the guard aborts but exits 0" — that was carried forward until a
  reviewer challenged it and a controlled probe showed the guard exits `1`.
- **A re-probe with no positive control.** The first correction tested against a
  case that never triggered the condition at all, so its "exit 0" meant *clean
  pass*, not *abort with 0*. It proved nothing while appearing to confirm —
  exactly the control that clause 2 requires.
- **A reporter reading a field its source omits.** A watcher read a field from a
  JSON view that does not carry it — a system-derived field taken as ground
  truth — and printed a confident negative verdict for every case it examined.

The false claim, the failed correction, and the successful control were all in
one incident, which is unusually clean evidence for a rule that would otherwise
read as pedantry.

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
