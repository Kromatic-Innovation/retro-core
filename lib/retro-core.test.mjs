// Tests for the generic retro orchestrator (L3, cwc#738). Pure — no fs/network.
// Run: node --test .claude/skills/retro-core/lib/retro-core.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { runRetro, printOnlyRouter } from "./retro-core.mjs";

const PROPOSALS = [
  { target: "a", skill_path: "x.md", risk: "low", proposed_change: "do a" },
  { target: "b", skill_path: "y.md", risk: "low", proposed_change: "do b" },
];

test("runRetro wires load -> analyze -> route in order", async () => {
  const calls = [];
  const evidence = { topic: "t", n: 3 };
  const load = () => { calls.push("load"); return evidence; };
  const analyze = (ev, opts) => {
    calls.push("analyze");
    assert.equal(ev, evidence);          // analyzer receives the loader output
    assert.deepEqual(opts, { mode: "x" }); // opts passed through
    return { topic: ev.topic, proposals: PROPOSALS };
  };
  const route = (proposals, opts) => {
    calls.push("route");
    assert.equal(proposals.length, 2);
    assert.deepEqual(opts, { mode: "x" }); // opts passed through to router too
    return { routed: true, written: proposals.length };
  };

  const out = await runRetro({ load, analyze, route, opts: { mode: "x" } });
  assert.deepEqual(calls, ["load", "analyze", "route"]);
  assert.equal(out.evidence, evidence);
  assert.equal(out.analysis.topic, "t");
  assert.equal(out.proposals.length, 2);
  assert.deepEqual(out.routed, { routed: true, written: 2 });
});

test("proposals pass through to the router unmodified", async () => {
  let seen = null;
  await runRetro({
    load: () => ({}),
    analyze: () => ({ proposals: PROPOSALS }),
    route: (proposals) => { seen = proposals; return {}; },
  });
  // Same array reference, same objects — the core mutates nothing.
  assert.equal(seen, PROPOSALS);
  assert.deepEqual(seen, PROPOSALS);
});

test("default router is print-only: an injected spy router is NOT called", async () => {
  // Spy router wired to a flag so the no-side-effect property is genuinely
  // asserted (not vacuously true). When no `route` is injected, the default
  // printOnlyRouter runs and the spy must never fire.
  let routerInvoked = false;
  const spyRoute = () => { routerInvoked = true; return { routed: true }; };

  const out = await runRetro({
    load: () => ({}),
    analyze: () => ({ proposals: PROPOSALS }),
    // no route injected -> printOnlyRouter
  });
  assert.equal(routerInvoked, false); // spy never passed in -> never fires
  assert.deepEqual(out.routed, { routed: false, proposals: PROPOSALS });
  assert.equal(out.proposals.length, 2);

  // And when the spy router IS injected but printOnly:true forces suppression,
  // the injected router still must not fire.
  routerInvoked = false;
  const out2 = await runRetro({
    load: () => ({}),
    analyze: () => ({ proposals: PROPOSALS }),
    route: spyRoute,
    printOnly: true,
  });
  assert.equal(routerInvoked, false);            // injected router suppressed
  assert.deepEqual(out2.routed, { routed: false, proposals: PROPOSALS });
});

test("printOnly:true forces the print-only router even when a route is given", async () => {
  let realRouteCalled = false;
  const out = await runRetro({
    load: () => ({}),
    analyze: () => ({ proposals: PROPOSALS }),
    route: () => { realRouteCalled = true; return { routed: true }; },
    printOnly: true,
  });
  assert.equal(realRouteCalled, false);          // injected router skipped
  assert.equal(out.routed.routed, false);        // print-only sentinel
});

test("printOnlyRouter is a pure no-op returning the proposals", () => {
  const r = printOnlyRouter(PROPOSALS);
  assert.deepEqual(r, { routed: false, proposals: PROPOSALS });
  assert.deepEqual(printOnlyRouter(), { routed: false, proposals: [] });
});

test("runRetro awaits async load/analyze/route", async () => {
  const out = await runRetro({
    load: async () => ({ topic: "async" }),
    analyze: async (ev) => ({ proposals: PROPOSALS, topic: ev.topic }),
    route: async (p) => ({ routed: true, n: p.length }),
  });
  assert.equal(out.analysis.topic, "async");
  assert.deepEqual(out.routed, { routed: true, n: 2 });
});

test("runRetro tolerates an analyzer that returns no proposals key", async () => {
  const out = await runRetro({
    load: () => ({}),
    analyze: () => ({ topic: "empty" }), // no .proposals
  });
  assert.deepEqual(out.proposals, []);
  assert.deepEqual(out.routed, { routed: false, proposals: [] });
});

test("runRetro requires load() and analyze()", async () => {
  await assert.rejects(() => runRetro({ analyze: () => ({}) }), /load\(\) function is required/);
  await assert.rejects(() => runRetro({ load: () => ({}) }), /analyze\(\) function is required/);
});

test("a throwing router propagates to the caller (runRetro rejects)", async () => {
  await assert.rejects(
    () => runRetro({
      load: () => ({}),
      analyze: () => ({ proposals: PROPOSALS }),
      route: () => { throw new Error("router boom"); },
    }),
    /router boom/,
  );
});

test("null/undefined loader output passes straight through to analyze", async () => {
  let seen = "unset";
  const out = await runRetro({
    load: () => undefined,            // loader yields nothing
    analyze: (ev) => { seen = ev; return { proposals: [] }; },
  });
  assert.equal(seen, undefined);      // analyzer received the loader's value verbatim
  assert.equal(out.evidence, undefined);
  assert.deepEqual(out.proposals, []); // and runRetro did not crash before analyze
});
