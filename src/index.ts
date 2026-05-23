#!/usr/bin/env node
import path from "node:path";
import { FsAdapter } from "./adapters/fs.js";
import { Corpus } from "./corpus.js";
import { runStdio } from "./server.js";

// CLI entrypoint for `npx document-agent-mcp`.
//
// Usage:
//   document-agent-mcp [--root <dir>]
//   DOCUMENT_AGENT_ROOT=<dir> document-agent-mcp
//
// Anything written to stdout would corrupt the MCP framing on stdio, so logs
// go to stderr only.

interface Args {
  root: string;
}

function usage(): never {
  process.stderr.write(
    [
      "Usage: document-agent-mcp [--root <dir>]",
      "",
      "Starts a stdio MCP server that exposes Markdown documents under <dir>.",
      "",
      "Options:",
      "  --root <dir>   Root directory containing .md files (or set DOCUMENT_AGENT_ROOT).",
      "  -h, --help     Show this message.",
      "",
    ].join("\n"),
  );
  process.exit(1);
}

function parseArgs(argv: string[]): Args {
  let root: string | undefined = process.env.DOCUMENT_AGENT_ROOT;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "-h" || a === "--help") usage();
    if (a === "--root") {
      root = argv[++i];
      continue;
    }
    // Positional fallback: treat first non-flag arg as root.
    if (!a.startsWith("-") && !root) {
      root = a;
      continue;
    }
    process.stderr.write(`Unknown argument: ${a}\n`);
    usage();
  }
  if (!root) {
    process.stderr.write(
      "Error: no document root specified. Pass --root <dir> or set DOCUMENT_AGENT_ROOT.\n",
    );
    process.exit(1);
  }
  return { root: path.resolve(root) };
}

async function main(): Promise<void> {
  const { root } = parseArgs(process.argv.slice(2));
  const adapter = new FsAdapter({ root });
  const corpus = await Corpus.load(adapter);

  process.stderr.write(
    `document-agent-mcp: loaded ${corpus.list().length} document(s) from ${root}\n`,
  );
  if (corpus.diagnostics.skipped.length > 0) {
    process.stderr.write(
      `document-agent-mcp: skipped ${corpus.diagnostics.skipped.length} file(s):\n`,
    );
    for (const s of corpus.diagnostics.skipped) {
      process.stderr.write(`  - ${s.path}: ${s.reason}\n`);
    }
  }

  await runStdio(corpus);
}

main().catch((err) => {
  process.stderr.write(
    `document-agent-mcp: fatal: ${err instanceof Error ? err.stack ?? err.message : String(err)}\n`,
  );
  process.exit(1);
});
