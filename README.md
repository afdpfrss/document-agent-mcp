# md-agent-mcp

A Model Context Protocol (MCP) server that lets any MCP client — Claude
Desktop / Cursor / Cline / Zed / Continue / etc. — search and read
Markdown documents stored in a local folder.

## Why

- **Markdown = portability + transparency.** No vendor lock-in. The one
  intermediate format both humans and AI can read.
- **Storage-agnostic.** MVP ships a local filesystem adapter; the same
  interface will plug into NAS, Google Drive, Notion, S3, etc.
- **Staged disclosure.** Search returns only frontmatter and section
  headings; bodies are loaded on demand. This keeps token budgets bounded
  even on large corpora.
- **No embeddings, no DB.** Metadata-driven retrieval over an in-memory
  index. Trivial to understand, zero setup.

## Install

No install needed — run via `npx`:

```sh
npx md-agent-mcp --root /path/to/your/markdown/folder
```

## Configuring your MCP client

Add this to your client's MCP config. Replace `/path/to/your/markdown` with
the folder containing your `.md` files.

### Claude Desktop

`~/Library/Application Support/Claude/claude_desktop_config.json`
(macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "documents": {
      "command": "npx",
      "args": ["-y", "md-agent-mcp", "--root", "/path/to/your/markdown"]
    }
  }
}
```

### Cursor / Cline / Continue / Zed

The shape is the same — set `command` to `npx` and `args` to
`["-y", "md-agent-mcp", "--root", "/path/to/your/markdown"]`. See
your client's MCP docs for the exact config file location.

## Tools exposed

- **`search_documents(query, limit?)`** — ranks documents by frontmatter
  relevance. Returns titles, categories, keywords, summaries, and section
  headings. **No section bodies.**
- **`get_sections(doc_id, section_ids[])`** — returns the body of the
  requested sections. Bodies are truncated to ~3000 chars each.
- **`list_categories()`** — category names + per-category document counts.

The intended client-side flow: call `search_documents` to find candidates,
then `get_sections` for the specific sections you need.

## Markdown format

Each document should have YAML frontmatter and use `## ` headings for
sections.

```markdown
---
id: refund-policy            # optional; falls back to file path
title: Refund Policy
category: customer-support
keywords:
  - refund
  - cancellation
summary: One-line description shown in search results.
---

## Eligibility
<!-- section_id: eligibility -->

Section body…

## How to apply

(no explicit section_id marker — one will be generated from the heading
slug, e.g. `how-to-apply`)
```

The `<!-- section_id: ... -->` marker is optional. When absent, section
IDs are derived from the heading text. Markers are recommended if you
plan to link to sections from other tools, because heading slugs change
when you rename a heading.

If a field is missing from the frontmatter, sensible fallbacks are used:

| Field | Fallback |
| --- | --- |
| `id` | the file path |
| `title` | the first `# ` heading, or the file path |
| `category` | `uncategorized` |
| `keywords` | `[]` |
| `summary` | first paragraph (truncated to 200 chars) |

## CLI options

```
md-agent-mcp [--root <dir>]

  --root <dir>   Root directory containing .md files.
                 Defaults to $MD_AGENT_ROOT.
```

The corpus is built in-memory at startup. Restart the MCP server (or the
client) to pick up new or changed documents. A `--watch` mode is on the
roadmap.

## What's NOT included in the MVP

- Editing tools (`propose_edit`, `merge_edit`, …) — read-only for now.
- Format conversion (Word / Excel / PDF → Markdown). Bring your own MD.
- API-based storage backends (Google Drive API, Notion, S3, …). The
  adapter interface is in place; the implementations will come once
  individual users ask for them.

If you'd find any of these useful, please open an issue describing your
workflow — that's how this server will grow.

## Development

```sh
npm install
npm run build    # tsc → dist/
npm test         # node:test
npm run dev      # tsx (no build needed)
```

## Acknowledgements

This MCP server is a single-user spin-off of the team-oriented
[afdpfrss/document-agent](https://github.com/afdpfrss/document-agent)
project. The metadata-driven retrieval design and the staged-disclosure
tool contract come from there.

## License

MIT
