// check-resolve.test.mjs — the resolve-check's own suite.
//
// Every case builds a throwaway tree under the OS temp dir and points the
// checker at it, so the assertions are about the checker's behaviour and not
// about whatever this repo happens to contain today. The one exception is the
// last test, which deliberately runs against this repo — a check that has only
// ever been pointed at synthetic fixtures has not been shown to pass on the
// real tree.

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  checkResolve,
  collectFiles,
  extractJsSpecifiers,
  extractShellSources,
  formatReport,
} from "./check-resolve.mjs";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Build a fixture tree from a `{ 'relative/path': 'contents' }` map and hand
 * its root to `fn`, removing it afterwards.
 */
function withTree(files, fn) {
  const root = mkdtempSync(join(tmpdir(), "check-resolve-"));
  try {
    for (const [path, contents] of Object.entries(files)) {
      const full = join(root, path);
      mkdirSync(dirname(full), { recursive: true });
      writeFileSync(full, contents);
    }
    return fn(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("extractJsSpecifiers finds every relative reference form", () => {
  const found = extractJsSpecifiers(
    [
      'import a from "./a.mjs";',
      "import { b } from '../b.mjs';",
      'export * from "./c.mjs";',
      'import "./d.mjs";',
      'const e = await import("./e.mjs");',
      'const f = require("./f.js");',
    ].join("\n"),
  );
  assert.deepEqual(
    found.map((entry) => entry.specifier),
    ["./a.mjs", "../b.mjs", "./c.mjs", "./d.mjs", "./e.mjs", "./f.js"],
  );
  assert.deepEqual(
    found.map((entry) => entry.line),
    [1, 2, 3, 4, 5, 6],
  );
});

test("extractJsSpecifiers ignores bare specifiers", () => {
  const found = extractJsSpecifiers(
    ['import { readFileSync } from "node:fs";', 'import x from "some-package";'].join("\n"),
  );
  assert.deepEqual(found, []);
});

test("extractShellSources finds sourced relative paths and skips interpolated ones", () => {
  const found = extractShellSources(
    [
      'source "./lib/helpers.sh"',
      ". ../shared/env.sh",
      'source "$LIB_DIR/dynamic.sh"',
      "source /absolute/path.sh",
    ].join("\n"),
  );
  assert.deepEqual(
    found.map((entry) => entry.specifier),
    ["./lib/helpers.sh", "../shared/env.sh"],
  );
  assert.deepEqual(
    found.map((entry) => entry.line),
    [1, 2],
  );
});

test("collectFiles walks shipped modules and scripts, skipping generated dirs", () => {
  withTree(
    {
      "lib/a.mjs": "",
      "scripts/b.sh": "",
      "node_modules/dep/index.js": "",
      ".git/hooks/pre-commit.sh": "",
      "README.md": "",
    },
    (root) => {
      const files = collectFiles(root).map((file) => file.slice(root.length + 1));
      assert.deepEqual(files, [join("lib", "a.mjs"), join("scripts", "b.sh")]);
    },
  );
});

test("a tree whose relative imports all resolve in-repo passes", () => {
  withTree(
    {
      "lib/core.mjs": 'export const core = 1;\n',
      "lib/index.mjs": 'import { core } from "./core.mjs";\nexport { core };\n',
    },
    (root) => {
      const result = checkResolve({ root });
      assert.equal(result.ok, true);
      assert.deepEqual(result.problems, []);
      assert.equal(result.checked, 2);
      assert.equal(result.references, 1);
      assert.match(formatReport(result), /all resolve in-repo/);
    },
  );
});

test("an import reaching outside the repository root is reported as escaping", () => {
  withTree(
    {
      "lib/index.mjs": 'import x from "../../code-workspace-config/lib/x.mjs";\nexport { x };\n',
    },
    (root) => {
      const result = checkResolve({ root });
      assert.equal(result.ok, false);
      assert.equal(result.problems.length, 1);
      assert.equal(result.problems[0].kind, "escapes-repo");
      assert.equal(result.problems[0].file, join("lib", "index.mjs"));
      assert.equal(result.problems[0].line, 1);
      assert.match(formatReport(result), /escapes-repo/);
    },
  );
});

test("an in-repo import pointing at a file that does not exist is reported as missing", () => {
  withTree(
    {
      "lib/index.mjs": 'import x from "./gone.mjs";\nexport { x };\n',
    },
    (root) => {
      const result = checkResolve({ root });
      assert.equal(result.ok, false);
      assert.equal(result.problems.length, 1);
      assert.equal(result.problems[0].kind, "missing");
      assert.match(formatReport(result), /missing/);
    },
  );
});

test("extension-less and directory-index specifiers resolve", () => {
  withTree(
    {
      "lib/core.mjs": "export const core = 1;\n",
      "lib/nested/index.mjs": "export const nested = 1;\n",
      "lib/index.mjs": 'import { core } from "./core";\nimport { nested } from "./nested";\nexport { core, nested };\n',
    },
    (root) => {
      const result = checkResolve({ root });
      assert.equal(result.ok, true, formatReport(result));
      assert.equal(result.references, 2);
    },
  );
});

test("a shell script sourcing a path outside the repository is reported", () => {
  withTree(
    {
      "scripts/run.sh": '#!/bin/bash\nsource "../../shared/env.sh"\n',
    },
    (root) => {
      const result = checkResolve({ root });
      assert.equal(result.ok, false);
      assert.equal(result.problems[0].kind, "escapes-repo");
      assert.equal(result.problems[0].line, 2);
    },
  );
});

test("a shell script sourcing an in-repo path passes", () => {
  withTree(
    {
      "scripts/lib/env.sh": "export X=1\n",
      "scripts/run.sh": '#!/bin/bash\nsource "./lib/env.sh"\n',
    },
    (root) => {
      const result = checkResolve({ root });
      assert.equal(result.ok, true, formatReport(result));
      assert.equal(result.references, 1);
    },
  );
});

test("this repository's own tree resolves cleanly", () => {
  const result = checkResolve({ root: REPO_ROOT });
  assert.equal(result.ok, true, formatReport(result));
});
