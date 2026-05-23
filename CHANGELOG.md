# Changelog

All notable changes to `md-agent-mcp` will be documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] — Initial release

### Added
- Stdio MCP server exposing a Markdown corpus through three read-only tools:
  `search_documents`, `get_sections`, `list_categories`.
- Storage adapter interface with a local filesystem (`FsAdapter`)
  implementation. Recursively walks `.md` files with path-traversal guard
  and standard ignore directories (`node_modules`, `.git`, …).
- YAML frontmatter parsing with fallbacks (`id` → file path, `title` →
  first `# ` heading, `category` → `uncategorized`, `summary` → first
  paragraph).
- H2-based sectioning, with optional `<!-- section_id: ... -->` markers
  and slug-based IDs as a fallback.
- `npx md-agent-mcp --root <dir>` entrypoint with `--version`, `--help`,
  positional fallback, and `MD_AGENT_ROOT` env var support.
- Root directory validation (existence + is-a-directory) and clear
  diagnostics for duplicate document IDs.
- `node:test` suite covering corpus parsing, search ranking,
  `get_sections`, error paths, and duplicate-ID handling.

[Unreleased]: https://github.com/afdpfrss/document-agent-mcp/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/afdpfrss/document-agent-mcp/releases/tag/v0.1.0
