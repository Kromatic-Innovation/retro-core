# Usage audit — what actually executes this package

**Measured:** 2026-08-15.
**Subjects and revisions read live at measurement time:**

| Repo | Revision read |
|---|---|
| `retro-core` (this repo) | `develop` @ `91c5026`, and `0ecb426` for the pre-scrub file |
| `code-workspace-config` | `develop` @ shallow clone, plus the commits API for history |
| `social-loop` | `develop` @ shallow clone, plus the `v0.2.1` tag (the revision actually installed) |

This audit answers the question it was filed with — *does anything actually use
this repo* — by resolving every caller to the file it loads, rather than by
counting how many documents mention the name. Every claim below carries the
command that produced it and that command's output.

> **Scope note.** Answering "who consumes this" requires naming the consumers,
> so this document names two first-party repositories and cites their commits.
> It is not part of the published package — `package.json#files` ships only
> `lib/retro-core.mjs` and `README.md`, so no `docs/` content reaches an npm
> tarball. Whether this file should be *visible* in a public repository is a
> separate call, and belongs to whoever flips the repo's visibility.

---

## Headline finding

**No code imports this repository's copy at runtime yet — but the reason has
changed since this audit was filed, and it changed in this repo's favour.**

The dependency edge now exists and is installed: `code-workspace-config`'s
social skill declares `retro-core` as a `github:` dependency at tag `v0.1.0`,
and on 2026-08-15 it **deleted its own vendored copy** rather than keeping one.
What still resolves elsewhere is the single executing import, which lives in
`social-loop` and still points at `social-loop`'s own vendored mirror by
relative path. That import is what a separate, already-filed cutover moves.

So the state is not "nothing uses this and nothing is going to." It is: **one of
the two consumers has cut over and the other has not**, and until the second
does, nothing loads this package's file.

The premise this issue was queued behind — *"a published package is what
consumers want"* — has been tested to the extent this audit can test it: one
consumer has already restructured itself around consuming this repo, using a
`github:` specifier, without waiting for an npm publish.

---

## 1. Which code paths execute this skeleton today

### The only runtime importer

```
$ grep -rnE "(from|import|require)\s*\(?\s*[\"'][^\"']*retro-core" --include='*.mjs' --include='*.js' social-loop/
engine/bin/social-retro.mjs:28:import { runRetro } from "../lib/retro-core.mjs";
engine/lib/retro-core.test.mjs:14:import { runRetro, printOnlyRouter } from "./retro-core.mjs";
```

One production import (`social-retro.mjs:28`) and one test import. Both are
**relative paths into `social-loop`'s own `engine/lib/`** — neither is a bare
`retro-core` specifier, so neither resolves to this package.

### In `code-workspace-config`: a declared dependency, not yet an import

```
$ grep -rn "retro-core" --include=package.json code-workspace-config/ | grep -v node_modules
.claude/skills/social/package.json:6:    "retro-core": "github:Kromatic-Innovation/retro-core#v0.1.0",
```

```
$ grep -rnE "[\"']retro-core[\"']" --include='*.mjs' --include='*.js' --include='*.ts' code-workspace-config/ | grep -v node_modules
(no matches)
```

The dependency is declared and locked (it also appears in
`.claude/skills/social/package-lock.json`), but **no `code-workspace-config`
module imports the bare specifier.** That manifest's own `description` field
states why, unprompted:

> retro-core is declared here so it is an ancestor `node_modules` of
> social-loop's engine … **once social-loop's own de-vendoring repoints its
> import at the bare specifier**.

The dependency is staged ahead of the cutover, deliberately. It is installed and
resolvable today; it is simply not yet the thing being imported.

### `code-workspace-config` deleted its vendored copy

```
$ gh api "repos/…/code-workspace-config/commits?path=.claude/skills/retro-core/lib/retro-core.mjs"
32064002d9b0 2026-08-15T19:53:35Z chore(retro-core): consume the published package; drop the vendored lib/
250190b5d7e7 2026-06-24T17:36:04Z feat(retro-core): shared read→compare→propose→route retro skeleton
```

```
$ gh api "repos/…/code-workspace-config/commits/32064002d9b0" --jq '.files[] | .filename + " (" + .status + ")"'
.claude/skills/retro-core/SKILL.md (modified)
.claude/skills/retro-core/lib/retro-core.mjs (removed)
.claude/skills/retro-core/lib/retro-core.test.mjs (removed)
.claude/skills/social/package-lock.json (modified)
.claude/skills/social/package.json (modified)
.claude/skills/voltaire-tgif/SKILL.md (modified)
.github/workflows/ci.yml (modified)
```

Two commits have ever touched that file: the one that created it, and the one
that removed it. **There are now two copies of this module in version control,
not three** — this repo's, and `social-loop`'s vendored mirror.

Nothing was left dangling by that deletion:

```
$ grep -rn "skills/retro-core/lib" code-workspace-config/ --include='*.md' --include='*.mjs' --include='*.yaml' --include='*.json' | grep -v node_modules
(no matches)
```

## 2. Runtime invocation vs. naming in prose

The consumers named in this package's own documentation are **agent-driven**:
their loader, analyzer, and router are procedures an agent performs, not
functions a JS engine calls. They conform to the contract; they do not import
it. Each says so in its own words:

```
$ grep -nE "(import|require).*retro-core" code-workspace-config/.claude/skills/{retro,retro-consolidation,tgif}/SKILL.md
retro/SKILL.md:35:                not a JS engine that imports `retro-core/lib/`:
retro-consolidation/SKILL.md:32:  retro corpus, not a JS engine that imports `retro-core/lib/`:
tgif/SKILL.md:107:               not a JS engine that imports `retro-core/lib/`. Conform to the contract by
```

Every match on the pattern `import.*retro-core` across those skills is a
sentence stating that the skill does **not** import. `voltaire-tgif` and `ship`
mention the package with no import-shaped line at all.

This matters for how the package's value is counted: the agent-driven consumers
are real consumers of the **contract**, and they are unaffected by which copy of
the `lib/` exists or where it is published. Only `social-retro` loads code.

## 3. Which copy each caller resolves to

| Caller | Resolves to | Mechanism |
|---|---|---|
| `social-loop` `engine/bin/social-retro.mjs` | `social-loop/engine/lib/retro-core.mjs` | relative path — its own vendored mirror |
| `code-workspace-config` social skill | `node_modules/retro-core` (**this repo**, tag `v0.1.0`) — installed, imported by nothing yet | `github:` dependency specifier |
| `retro`, `retro-consolidation`, `tgif`, `voltaire-tgif`, `ship` | nothing — no code path | prose conformance to the contract |

The middle row is the one that changed on 2026-08-15, and it is the reason this
audit's answer is no longer a flat "nothing."

**Measurement limitation, stated rather than glossed:** this audit ran with API
and git access only, so it could not read an installed `node_modules` tree
directly. It measured the `social-loop` revision that `code-workspace-config`
actually installs (`v0.2.1`) instead, and confirmed that tag's vendored file is
byte-identical to the one on `social-loop`'s `develop`:

```
$ gh api "repos/…/social-loop/contents/engine/lib/retro-core.mjs?ref=v0.2.1" | base64 -d | sha256sum
66460a9cfee8…   (82 lines)
$ sha256sum social-loop/engine/lib/retro-core.mjs
66460a9cfee8…   (82 lines)
```

---

## 4. The 23-line delta: a managed mirror, not drift

**Verdict: deliberate, documented, and correctly maintained vendoring. Not
unmanaged drift.** Three independent pieces of evidence:

**(a) Every one of the 23 lines is a header comment.** Stripping it leaves a
file that is byte-identical to what this repo shipped before today:

```
$ tail -n +24 social-loop/engine/lib/retro-core.mjs | sha256sum
7475b49e2234…   (59 lines)
$ git show 0ecb426:lib/retro-core.mjs | sha256sum
7475b49e2234…   (59 lines)
```

**(b) The banner declares itself a mirror and forbids local edits.** It names
its upstream path, cites the exact upstream commit it was copied from
(`250190b5d7e7`), says the vendoring exists because the upstream was then a bare
skill directory with no `package.json` and so could not travel as a dependency,
and names de-vendoring as the tracked end state.

**(c) The mirror was never stale.** The commit it cites, `250190b5d7e7`, is the
commit that *created* the upstream file, and the commits API above shows only
one later commit touching that path — the one that deleted it. Between mirroring
and deletion, the upstream content never changed. The drift guard held for the
file's entire life because there was never any drift for it to catch.

The concern that motivated this issue — *"two distinct versions of the contract
in service simultaneously"* — was therefore a false alarm, and the arithmetic
that produced it (82 lines vs. 59) counted a provenance banner as a fork.

### One real delta now exists, and this audit is its source

As of `develop@91c5026`, this repo's copy and the mirror are **no longer
byte-identical below the banner** — the internal-reference scrub landed here
first:

```
$ diff <(tail -n +24 social-loop/engine/lib/retro-core.mjs) <(git show origin/develop:lib/retro-core.mjs)
1c1
< // retro-core.mjs — the generic retrospective orchestrator (L3, <internal ref>).
---
> // retro-core.mjs — the generic retrospective orchestrator.
12c12
< // HARD BOUNDARY: the core NEVER auto-commits a skill edit. …
---
> // HARD BOUNDARY: the core NEVER commits a change of its own. …
16,17c16,17
< …the standard router (propose-skill-change soft path) writes raw-intake…
---
> …a router is expected to write proposals out for review rather than apply them…
```

All four hunks are comment lines. The **executable** code remains identical:

```
$ for f in <mirror, banner-stripped> <this repo @ develop>; do grep -vE '^\s*(//|$)' "$f" | sha256sum; done
d648f94766a1…
d648f94766a1…
```

This is worth stating plainly because it is exactly the condition the banner
exists to make visible: the mirror is now one comment-scrub behind upstream. It
is harmless today (comments only), and it resolves itself when `social-loop`
de-vendors — which is the cutover already filed. If that cutover is deferred for
long, re-mirroring is the cheap correction.

---

## 5. Recommendation — superseded by operator decision

This issue asked for a single recommendation among **publish**, **retire and
make a vendored copy canonical**, or **keep as an unpublished mirror**.

**That question was answered by the operator on 2026-08-15: publish.** The
stated basis was portfolio value plus cutting CI cost on the vendored copies
elsewhere. This section records that decision rather than re-litigating it; the
issue thread carries the decision itself.

For the record, the trade-off that was weighed:

- **For publishing:** one canonical artifact with a version number, and the
  removal of the vendoring machinery (banner, re-mirror discipline, per-copy CI)
  that each duplicate otherwise needs.
- **Against publishing:** a public npm package is a permanent external
  commitment — versioning, deprecation policy, and consumers you cannot see —
  taken on for a 59-line module whose only code consumer is first-party.

What this audit adds to that trade-off, which was not known when the issue was
filed: **the "one canonical version" argument no longer rests on a divergence,
because there is no divergence** — and it does not need to. The consumer count
already moved without a publish: a `github:` specifier at a tag was sufficient
for `code-workspace-config` to delete its vendored copy on the same day. The
npm publish is therefore a **distribution and visibility decision**, not a
correctness one. Nothing in this audit argues against it; it simply relocates
the reason.

## 6. What this means for the queued chain

Under the operator's decision, the chain proceeds — with one item's stated
justification updated by the findings above.

| Item | Status under the decision |
|---|---|
| Bootstrap `package.json` + CI + publish workflow | **Done.** Landed, and already proven sufficient: it is what made the `github:` specifier installable. |
| Flip public + publish `0.1.0` to npm | **Proceeds.** Now correctly framed as distribution and visibility, not as a fix for divergence. It is not on the critical path for de-duplicating copies — that is already happening without it. |
| Provision the publish credential | **Proceeds**, as a dependency of the publish. |
| Scrub internal references / static resolve-check | **Proceeds** — and both have now landed on `develop`. They gate going public, which is unchanged. |
| Repoint consumers off the vendored copies | **Half done.** `code-workspace-config` has cut over and deleted its copy. The `social-loop` de-vendoring — the one that repoints the single executing import at the bare specifier — is the remaining step, and is the step that makes the answer to this audit's question change from "nothing loads it" to "the only runtime caller loads it." |

**The one thing worth watching:** until the `social-loop` de-vendoring lands,
this package has an installed dependency edge and zero runtime loads. That is a
transient state by design, not a problem — but it is the state, and it should
not be described as "in use" before the cutover.
