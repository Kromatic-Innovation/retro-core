---
name: retro-core
description: Shared retrospective skeleton — read evidence, compare intent vs outcome, propose, route. A retro process supplies a loader, an analyzer, and a router; retro-core orchestrates them and guarantees it never auto-commits a skill edit. Persona-agnostic utility consumed by retro processes (social demo-run retro today).
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

## The contract (lib/retro-core.mjs)

```js
import { runRetro, printOnlyRouter } from "retro-core/lib/retro-core.mjs";

const { evidence, analysis, proposals, routed } = await runRetro({
  load,            // REQUIRED () => evidence            — read the evidence
  analyze,         // REQUIRED (evidence, opts) => { proposals[], ... } — intent vs outcome
  route,           // optional (proposals, opts) => routed — perform the side-effect
  printOnly,       // optional: force the print-only router (ignore `route`)
  opts,            // optional: passed through to analyze() AND route()
});
```

- **LOADER** reads the evidence for the run (a run-record, a ledger slice, a set
  of retro entries). It returns whatever shape the analyzer expects.
- **ANALYZER** compares where the run was *meant* to go against where it *landed*
  and returns structured `proposals[]` (plus any summary fields). It is pure: it
  derives proposals, it does not act on them.
- **ROUTER** performs the side-effect for the proposals. The default is
  `printOnlyRouter` — a pure no-op that routes nothing and returns the proposals
  unmodified, so a retro is fully offline-testable until a real router is wired.
  The standard router is the **propose-skill-change soft path**: it writes
  raw-intake proposal files for human approval in the room.

`opts` flows to both the analyzer and the router so a process can thread topic,
session context, output dir, and a `--print-only` flag through one channel.

## Hard boundary — never auto-commit

retro-core NEVER edits or commits a skill file. It only hands `proposals[]` to
the injected router. The standard router (propose-skill-change soft path) writes
proposal files surfaced for human review; the committed change is the human's
visible decision after review. A retro process that wires retro-core inherits the
`autoCommit:false` guarantee for free — the core gives it no path to commit.

## Evidence provenance — source class and controls (cwc#1826)

A retro is where an incident's claims get promoted into durable knowledge, so an
unvalidated claim promoted here is worse than one that stays in a transcript — it
becomes a rule that misdirects future sessions. Before a claim is used to derive a
proposal, it is held to two clauses:

1. **Name the source class.** Every claim declares whether its evidence is
   **ground truth** (a direct read of the subject — an API response, `ps`, `git`),
   a **system-derived field** (a value computed or reported by some tool *about*
   the subject), or an **agent-authored instrument** (a script/probe the session
   wrote to answer the question). Any claim in the latter two classes that
   **drives a fix design** requires a **second, independent** source before it is
   quotable — one that does not share the first's failure mode.
2. **An instrument authored mid-incident is not quotable until run against a
   known-positive *and* a known-negative control.** A probe that has only ever
   been pointed at the failing case cannot distinguish "the thing is broken" from
   "the probe never measured what I think it measured." It earns the right to be
   cited only after it goes green on a case known to be good *and* red on a case
   known to be bad.

*Why load-bearing (2026-07-30 hestia 57-issue-bundle retro).* Three self-authored
instruments produced confident **wrong** answers in a single session, each caught
only late and by luck:
- **Exit code read through a pipeline.** `bash guard 2>&1 | tail -12; echo
  "exit=$?"` reads `tail`'s status, not the guard's — a false finding
  ("deploy-guard aborts but exits 0") carried into the retro's own pattern set
  until a reviewer challenged it (a controlled probe showed the guard exits `1`).
  The class-mate rule lives in `.claude/skills/quine/SKILL.md` anti-pattern #5.
- **A re-probe with no positive control.** The first correction created an
  untracked dotfile that never tripped the dirty check at all, so its "exit 0"
  meant *clean pass*, not *abort with 0* — it proved nothing while appearing to
  confirm. Exactly the control clause 2 requires.
- **A reporter reading a field its source omits.** A lane-watcher read `epicRefs`
  from a JSON view that does not carry it (a system-derived field taken as ground
  truth) and printed a confident negative verdict for every lane.

This is unusually clean evidence: the false claim, the failed correction, and the
successful control are all in one incident. Corresponding principle:
`instrument-needs-controls-before-quotable`.

## How a process wires it

A retro process supplies its own three pieces:

1. a **loader** for its evidence,
2. an **analyzer** that derives its domain proposals (carrying any domain
   boundary notes verbatim — e.g. a PROCESS-only constraint), and
3. a **router** (default: propose-skill-change soft path).

The reference consumer is the social demo-run retro (`social/bin/social-retro.mjs`):

| Piece | Social wiring |
|---|---|
| LOADER | `latestRunRecord()` (`social/lib/run-record.mjs`) |
| ANALYZER | `analyzeRetro()` (`social/lib/retro-analyze.mjs`) — PROCESS-only, two proposals |
| ROUTER | `writeProposals()` (`social/lib/propose-writer.mjs`) — propose-skill-change soft path |

`social-retro --print-only` maps to `printOnly:true`, which forces
`printOnlyRouter` and writes no proposal files.

## Two kinds of consumer

retro-core is a contract first and a `lib/` second. Consumers come in two shapes,
both bound by the same four-phase skeleton (read -> compare -> propose -> route)
and the same never-auto-commit boundary:

1. **Code process** — a `.mjs` that imports `runRetro` and supplies real
   `load`/`analyze`/`route` functions. The reference is `social-retro`. Use this
   when the evidence is structured and the analysis is deterministic.
2. **Agent-driven retro** — a SKILL.md whose loader/analyzer/router are
   *procedures the agent performs* (a `bq` pull, a `git`-trail diff, reading retro
   entries, a +/-/∆ judgement), not a JS engine. It does not import `lib/` — it
   **conforms to** this contract: its SKILL.md names its situational LOADER,
   ANALYZER, and ROUTER, follows read -> compare -> propose -> route in that
   order, and inherits the never-auto-commit boundary. This mirrors how the
   agent-facing half of `blog-persona-review` consumes the persona-review
   register (cwc#741): the shared core is the single source of the skeleton; the
   skill supplies only its situational pieces and gate.

A consumer migrated onto retro-core MUST keep its situational routing/approval
gate and its existing output destinations — retro-core centralizes the skeleton,
it does not change where a retro's proposals land or who approves them.

### Consumers

| Consumer | Repo | Shape | LOADER | ANALYZER | ROUTER / gate |
|---|---|---|---|---|---|
| `social-retro` | cwc | code (`runRetro`) | `latestRunRecord()` | `analyzeRetro()` | `writeProposals()` (propose-skill-change soft path) |
| `tgif` | cwc | agent-driven | rolling bq prediction-vs-realized window | correlation + top surprises + directional recs | one-page report file (Friday cron output) |
| `voltaire-tgif` | cwc | agent-driven (over TS code in `Kromatic-Innovation/voltaire`) | `readWeekTriageLog` + Gmail Sent/Trash | `aggregateSignals` (six signals) | `proposeRuleEdit` -> `/voltaire-rule-edit` confirm flow |
| `retro-consolidation` | cwc | agent-driven | read `~/knowledge/raw/retros/*.md` (corpus, since last pass) | group + classify recurring patterns; three jobs (improve session retros, action skipped items, elevate patterns) | ranked findings -> principle proposals / issues / policy review (human approval gate) |
| `blog-retro` | kroblog | agent-driven (cross-repo) | draft + brief + reviews + git trail | +/-/∆ vs git-trail evidence | dated entry + running logs; every-3rd pattern review (approval gate) |
| `retro` | cwc | agent-driven | current-session evidence + real-artifact grounding (Phase 1 / 1b) | multi-persona review + synthesis + applicability check (Phases 2-4 + 4.5) | Phase 5 2x2 matrix on lock state + autonomy (issues / soft-path proposals / direct apply after human confirmation), plus writing the session entry to the corpus |

## Tests

```
cd .claude/skills/retro-core && node --test
```

Hermetic: injected loader/analyzer/router stubs, no fs or network. Covers the
load->analyze->route order, opts pass-through, proposals passing through the
router unmodified, the print-only/no-route path, and the required-deps guard.
