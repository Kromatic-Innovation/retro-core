#!/usr/bin/env node
// check-resolve.mjs — static in-repo reference check.
//
// This package was extracted from a larger tree, where its files sat several
// levels below that tree's root. A verbatim copy carries every path-relative
// assumption with it, and the ones that reached *outward* — toward a sibling
// directory that no longer exists next to this repo — still parse, still lint,
// and still pass a test suite that never imports them. They fail only at the
// moment a consumer installs the package standalone.
//
// So this check is static and cheap: for every module this repo ships, every
// relative import must resolve to a file that exists inside THIS repository,
// and no specifier may escape the repository root. Same rule for any shell
// script the repo ships, over its `source` / `.` lines.
//
// Run it: `npm run check:resolve` (CI runs the same command on every PR).

import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { dirname, extname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/** Directories never walked — build output, VCS metadata, generated config. */
const SKIP_DIRS = new Set([
  ".git",
  "node_modules",
  ".agents",
  ".codex",
  "coverage",
]);

const JS_EXTENSIONS = new Set([".mjs", ".js", ".cjs"]);
const SHELL_EXTENSIONS = new Set([".sh", ".bash"]);

/**
 * Extension-less specifiers are not resolved by Node's ESM loader, but a
 * checker that only accepted exact paths would report a false positive on a
 * `require`-style CommonJS file. Try the specifier itself first, then the
 * conventional fallbacks, and report the specifier as resolved if any hit.
 */
const RESOLUTION_CANDIDATES = [
  (p) => p,
  (p) => `${p}.mjs`,
  (p) => `${p}.js`,
  (p) => `${p}.cjs`,
  (p) => join(p, "index.mjs"),
  (p) => join(p, "index.js"),
];

/** Tokens after which a `/` opens a regular expression rather than divides. */
const REGEX_PRECEDING_PUNCTUATION = new Set([
  "(", ",", "=", ":", "[", "!", "&", "|", "?", "{", "}", ";", "+", "-", "*",
  "%", "^", "~", "<", ">", "\n",
]);
const REGEX_PRECEDING_KEYWORDS = [
  "return", "typeof", "instanceof", "case", "in", "of", "new", "delete",
  "void", "do", "else", "yield", "await",
];

/** Stand-in character for masked-out string content — never appears in source. */
const MASK = "\u0001";

/**
 * Rewrite `source` so that comments, regular-expression literals, and the
 * *contents* of string literals are blanked out, while every character keeps
 * its original offset and every newline stays put.
 *
 * This is what makes the reference scan trustworthy rather than merely
 * plausible. A raw regex over the source cannot tell `import x from "./y"`
 * from the same text quoted inside a doc comment or inside a test fixture
 * string — and this checker's own source and suite contain both. Masking first
 * means a match can only land on code, and the quote offsets it reports index
 * back into `literals` for the real specifier.
 *
 * @param {string} source
 * @returns {{ masked: string, literals: Map<number, string> }}
 */
export function maskSource(source) {
  const masked = new Array(source.length);
  const literals = new Map();
  let i = 0;

  /** Last non-whitespace character of code emitted so far. */
  let lastCode = "\n";
  const emit = (index, char) => {
    masked[index] = char;
  };

  while (i < source.length) {
    const char = source[i];
    const next = source[i + 1];

    // Line comment.
    if (char === "/" && next === "/") {
      while (i < source.length && source[i] !== "\n") emit(i++, " ");
      continue;
    }
    // Block comment.
    if (char === "/" && next === "*") {
      emit(i++, " ");
      emit(i++, " ");
      while (i < source.length && !(source[i] === "*" && source[i + 1] === "/")) {
        emit(i, source[i] === "\n" ? "\n" : " ");
        i += 1;
      }
      if (i < source.length) {
        emit(i++, " ");
        emit(i++, " ");
      }
      continue;
    }
    // Regular-expression literal — only where a `/` cannot be division.
    if (char === "/" && startsRegex(source, i, lastCode)) {
      emit(i++, " ");
      let inClass = false;
      while (i < source.length) {
        const c = source[i];
        if (c === "\\") {
          emit(i++, " ");
          if (i < source.length) emit(i++, " ");
          continue;
        }
        if (c === "[") inClass = true;
        else if (c === "]") inClass = false;
        else if (c === "/" && !inClass) {
          emit(i++, " ");
          break;
        } else if (c === "\n") {
          break; // Unterminated — bail rather than swallow the rest of the file.
        }
        emit(i++, " ");
      }
      lastCode = ")"; // A regex literal is a value, so a following `/` divides.
      continue;
    }
    // String or template literal: keep the quotes, mask the contents, and
    // record the real value against the opening quote's offset.
    if (char === '"' || char === "'" || char === "`") {
      const quote = char;
      const start = i;
      let value = "";
      emit(i++, quote);
      while (i < source.length) {
        const c = source[i];
        if (c === "\\") {
          emit(i++, MASK);
          if (i < source.length) {
            value += source[i];
            emit(i, source[i] === "\n" ? "\n" : MASK);
            i += 1;
          }
          continue;
        }
        if (c === quote) {
          emit(i++, quote);
          break;
        }
        value += c;
        emit(i, c === "\n" ? "\n" : MASK);
        i += 1;
      }
      literals.set(start, value);
      lastCode = quote;
      continue;
    }

    emit(i, char);
    if (!/\s/.test(char) || char === "\n") lastCode = char;
    i += 1;
  }

  return { masked: masked.join(""), literals };
}

function startsRegex(source, index, lastCode) {
  if (REGEX_PRECEDING_PUNCTUATION.has(lastCode)) return true;
  const before = source.slice(0, index).trimEnd();
  return REGEX_PRECEDING_KEYWORDS.some(
    (keyword) => before.endsWith(keyword) && !/[\w$]/.test(before.at(-keyword.length - 1) ?? " "),
  );
}

/**
 * Every relative specifier a JS module names, with the line it appeared on.
 *
 * Static `import`/`export ... from`, dynamic `import()`, and `require()` are
 * all covered. Bare specifiers (`node:fs`, a dependency) are ignored: they are
 * resolved by the package manager, not by this repo's layout.
 *
 * @param {string} source
 * @returns {{ specifier: string, line: number }[]}
 */
export function extractJsSpecifiers(source) {
  const { masked, literals } = maskSource(source);
  const patterns = [
    // import x from "./y" / export * from "./y". The clause between the
    // keyword and `from` may span lines (a braced named-import list), but it
    // can never contain a quote or a `;` — bounding it that way stops the
    // match running past the end of the statement.
    /(?:^|[\s;})])(?:import|export)\s[^;'"`]*?\bfrom\s*(["'])/g,
    // import "./y"
    /(?:^|[\s;})])import\s*(["'])/g,
    // import("./y") and require("./y")
    /\bimport\s*\(\s*(["'])/g,
    /\brequire\s*\(\s*(["'])/g,
  ];

  const found = new Map();
  for (const pattern of patterns) {
    for (const match of masked.matchAll(pattern)) {
      const quoteIndex = match.index + match[0].length - 1;
      const specifier = literals.get(quoteIndex);
      if (!specifier || !specifier.startsWith(".")) continue;
      if (found.has(quoteIndex)) continue;
      found.set(quoteIndex, {
        specifier,
        line: source.slice(0, quoteIndex).split("\n").length,
      });
    }
  }
  return [...found.values()].sort((a, b) => a.line - b.line);
}

/**
 * Every relative path a shell script sources, with the line it appeared on.
 *
 * A sourced path built from a variable (`. "$LIB_DIR/x.sh"`) cannot be
 * resolved statically and is skipped rather than guessed at — this check
 * reports what it can prove, not what it suspects.
 *
 * @param {string} source
 * @returns {{ specifier: string, line: number }[]}
 */
export function extractShellSources(source) {
  const found = [];
  const lines = source.split("\n");
  lines.forEach((text, index) => {
    const match = text.match(/^\s*(?:source|\.)\s+(?:"([^"$]+)"|'([^']+)'|([^\s"'$;#]+))/);
    if (!match) return;
    const specifier = match[1] ?? match[2] ?? match[3];
    if (!specifier || !specifier.startsWith(".")) return;
    found.push({ specifier, line: index + 1 });
  });
  return found;
}

/**
 * Every file this repo ships that carries resolvable references.
 *
 * @param {string} root
 * @returns {string[]} absolute paths
 */
export function collectFiles(root) {
  const out = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name),
    )) {
      if (entry.name.startsWith(".") && entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
      }
      if (SKIP_DIRS.has(entry.name)) continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!entry.isFile()) continue;
      const ext = extname(entry.name);
      if (JS_EXTENSIONS.has(ext) || SHELL_EXTENSIONS.has(ext)) out.push(full);
    }
  };
  walk(root);
  return out;
}

/**
 * Check every relative reference in the repo at `root`.
 *
 * A reference is a problem when it escapes the repository root (`kind:
 * "escapes-repo"` — the extraction-breakage class this check exists for) or
 * when it resolves nowhere (`kind: "missing"`).
 *
 * @param {object} [cfg]
 * @param {string} [cfg.root] repository root to check (default: this repo)
 * @returns {{ ok: boolean, checked: number, references: number, problems: object[] }}
 */
export function checkResolve(cfg = {}) {
  const root = resolve(cfg.root ?? defaultRoot());
  const problems = [];
  let references = 0;

  const files = collectFiles(root);
  for (const file of files) {
    const source = readFileSync(file, "utf8");
    const isShell = SHELL_EXTENSIONS.has(extname(file));
    const specifiers = isShell
      ? extractShellSources(source)
      : extractJsSpecifiers(source);

    for (const { specifier, line } of specifiers) {
      references += 1;
      const target = resolve(dirname(file), specifier);
      const within = relative(root, target);
      if (within.startsWith(`..${sep}`) || within === ".." || within.startsWith(sep)) {
        problems.push({
          kind: "escapes-repo",
          file: relative(root, file),
          line,
          specifier,
          detail: `resolves to ${target}, outside this repository — a reference to a tree that does not exist beside a standalone checkout`,
        });
        continue;
      }
      const resolved = isShell
        ? existsFile(target)
          ? target
          : null
        : resolveJs(target);
      if (!resolved) {
        problems.push({
          kind: "missing",
          file: relative(root, file),
          line,
          specifier,
          detail: `resolves to ${relative(root, target)}, which does not exist in this repository`,
        });
      }
    }
  }

  return { ok: problems.length === 0, checked: files.length, references, problems };
}

function existsFile(path) {
  return existsSync(path) && statSync(path).isFile();
}

function resolveJs(target) {
  for (const candidate of RESOLUTION_CANDIDATES) {
    const path = candidate(target);
    if (existsFile(path)) return path;
  }
  return null;
}

function defaultRoot() {
  return resolve(dirname(fileURLToPath(import.meta.url)), "..");
}

/**
 * Render a report for a `checkResolve` result.
 *
 * @param {ReturnType<typeof checkResolve>} result
 * @returns {string}
 */
export function formatReport(result) {
  if (result.ok) {
    return `check-resolve: ${result.references} relative reference(s) across ${result.checked} file(s) all resolve in-repo.`;
  }
  const lines = [
    `check-resolve: ${result.problems.length} unresolved reference(s) across ${result.checked} file(s).`,
    "",
  ];
  for (const problem of result.problems) {
    lines.push(`  ${problem.file}:${problem.line}  ${problem.specifier}`);
    lines.push(`    ${problem.kind}: ${problem.detail}`);
  }
  lines.push("");
  lines.push(
    "Every relative reference must resolve to a file inside this repository. A",
    "reference that escapes the root is a leftover from this package's extraction",
    "and will break for anyone who installs it standalone.",
  );
  return lines.join("\n");
}

/* c8 ignore start — CLI wrapper, exercised by CI running this file, not by unit tests. */
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = checkResolve();
  console.log(formatReport(result));
  process.exit(result.ok ? 0 : 1);
}
/* c8 ignore stop */
