#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FsAdapter } from "./adapters/fs.js";
import { Corpus } from "./corpus.js";
import { runStdio } from "./server.js";

// CLI entrypoint for `npx md-agent-mcp`.
//
// Anything written to stdout would corrupt the MCP framing on stdio, so logs
// go to stderr only.

interface Args {
  root: string;
}

const LOG_PREFIX = "md-agent-mcp:";

function usage(): never {
  process.stderr.write(
    [
      "Usage: md-agent-mcp [--root <dir>]",
      "       md-agent-mcp <dir>",
      "",
      "Starts a stdio MCP server that exposes Markdown documents under <dir>.",
      "",
      "Options:",
      "  --root <dir>   Root directory containing .md files.",
      "                 Falls back to $MD_AGENT_ROOT.",
      "  -v, --version  Print version and exit.",
      "  -h, --help     Show this message.",
      "",
      "Examples:",
      "  md-agent-mcp --root ~/notes",
      "  MD_AGENT_ROOT=~/notes md-agent-mcp",
      "",
    ].join("\n"),
  );
  process.exit(1);
}

async function readVersion(): Promise<string> {
  // package.json sits next to the package root, which is two levels up from
  // dist/index.js. fileURLToPath keeps this working both when run from the
  // installed bin (dist/) and when run via tsx from src/.
  const here = path.dirname(fileURLToPath(import.meta.url));
  for (const candidate of [
    path.join(here, "..", "package.json"),
    path.join(here, "..", "..", "package.json"),
  ]) {
    try {
      const raw = await fs.readFile(candidate, "utf8");
      const pkg = JSON.parse(raw) as { version?: string };
      if (pkg.version) return pkg.version;
    } catch {
      // try next candidate
    }
  }
  return "unknown";
}

function parseArgs(argv: string[]): Args | { action: "version" } {
  let root: string | undefined = process.env.MD_AGENT_ROOT;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "-h" || a === "--help") usage();
    if (a === "-v" || a === "--version") return { action: "version" };
    if (a === "--root") {
      root = argv[++i];
      continue;
    }
    if (!a.startsWith("-") && !root) {
      root = a;
      continue;
    }
    process.stderr.write(`Unknown argument: ${a}\n`);
    usage();
  }
  if (!root) {
    process.stderr.write(
      `${LOG_PREFIX} no document root specified. Pass --root <dir> or set MD_AGENT_ROOT.\n`,
    );
    process.exit(1);
  }
  return { root: path.resolve(root) };
}

async function validateRoot(root: string): Promise<void> {
  let stat;
  try {
    stat = await fs.stat(root);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      process.stderr.write(
        `${LOG_PREFIX} root does not exist: ${root}\n`,
      );
    } else if (code === "EACCES") {
      process.stderr.write(
        `${LOG_PREFIX} cannot read root (permission denied): ${root}\n`,
      );
    } else {
      process.stderr.write(`${LOG_PREFIX} cannot stat root: ${root} (${code ?? "unknown error"})\n`);
    }
    process.exit(1);
  }
  if (!stat.isDirectory()) {
    process.stderr.write(
      `${LOG_PREFIX} root is not a directory: ${root}\n`,
    );
    process.exit(1);
  }
}

async function main(): Promise<void> {
  const parsed = parseArgs(process.argv.slice(2));
  if ("action" in parsed) {
    const v = await readVersion();
    process.stdout.write(`${v}\n`);
    return;
  }

  const { root } = parsed;
  await validateRoot(root);

  const adapter = new FsAdapter({ root });
  const corpus = await Corpus.load(adapter);
  const count = corpus.list().length;

  process.stderr.write(
    `${LOG_PREFIX} loaded ${count} document(s) from ${root}\n`,
  );
  if (count === 0) {
    process.stderr.write(
      `${LOG_PREFIX} no .md files found under ${root}. Search will return nothing.\n`,
    );
  }
  if (corpus.diagnostics.skipped.length > 0) {
    process.stderr.write(
      `${LOG_PREFIX} skipped ${corpus.diagnostics.skipped.length} file(s):\n`,
    );
    for (const s of corpus.diagnostics.skipped) {
      process.stderr.write(`  - ${s.path}: ${s.reason}\n`);
    }
  }

  await runStdio(corpus);
}

main().catch((err) => {
  process.stderr.write(
    `${LOG_PREFIX} fatal: ${err instanceof Error ? err.stack ?? err.message : String(err)}\n`,
  );
  process.exit(1);
});
