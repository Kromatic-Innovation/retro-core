// retro-core.mjs — the generic retrospective orchestrator (L3, cwc#738, epic #735).
//
// A retro is three pluggable pieces:
//   - LOADER   load()                 -> evidence        (read the evidence)
//   - ANALYZER analyze(evidence,opts) -> { proposals[], ...summary }
//                                        (compare intent vs outcome -> structured proposals)
//   - ROUTER   route(proposals,opts)  -> routed          (perform the side-effect)
//
// runRetro wires them: load -> analyze -> route, and returns the evidence, the
// proposals, and whatever the router returned.
//
// HARD BOUNDARY: the core NEVER auto-commits a skill edit. It only hands the
// proposals to the injected router. The default router is print-only (a pure
// no-op that returns the proposals unmodified), so a retro is fully pure and
// offline-testable until a real router is injected. Any side effect is the
// router's responsibility, and the standard router (propose-skill-change soft
// path) writes raw-intake proposal files for human approval — it does not commit.

/**
 * Default router: print-only. Performs no side effect and routes nothing.
 * Returns a sentinel so callers can tell a no-route run from a routed one.
 *
 * @param {object[]} proposals
 * @returns {{ routed: false, proposals: object[] }}
 */
export function printOnlyRouter(proposals) {
  return { routed: false, proposals: proposals || [] };
}

/**
 * Run a retrospective: read evidence, analyze it into proposals, route them.
 *
 * @param {object} cfg
 *   @param {function} cfg.load                () => evidence            REQUIRED loader
 *   @param {function} cfg.analyze             (evidence, opts) => { proposals[], ... } REQUIRED analyzer
 *   @param {function} [cfg.route]             (proposals, opts) => routed  router (default printOnly)
 *   @param {boolean}  [cfg.printOnly]         force the print-only router (ignore cfg.route)
 *   @param {object}   [cfg.opts]              passed through to analyze() and route()
 * @returns {{ evidence, analysis, proposals: object[], routed }}
 */
export async function runRetro(cfg = {}) {
  const { load, analyze, opts = {} } = cfg;
  if (typeof load !== "function") {
    throw new Error("runRetro: a load() function is required");
  }
  if (typeof analyze !== "function") {
    throw new Error("runRetro: an analyze() function is required");
  }
  const route = cfg.printOnly || typeof cfg.route !== "function"
    ? printOnlyRouter
    : cfg.route;

  const evidence = await load();
  const analysis = await analyze(evidence, opts);
  const proposals = (analysis && analysis.proposals) || [];
  const routed = await route(proposals, opts);

  return { evidence, analysis, proposals, routed };
}
