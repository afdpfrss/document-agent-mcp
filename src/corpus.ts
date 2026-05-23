import matter from "gray-matter";
import type { StorageAdapter } from "./adapters/types.js";

// Corpus = the parsed in-memory view of all Markdown documents reachable
// through the storage adapter. The MCP tools read from here.
//
// Design (carried over from the parent document-agent project,
// docs/v2-design.md §2–3):
//   - Metadata-driven retrieval: searching ranks documents by frontmatter
//     (title / category / keywords / summary), never by section body.
//   - Staged disclosure: section bodies are loaded lazily by get_sections and
//     truncated to keep the token budget bounded.

export interface SectionMeta {
  id: string;
  title: string;
}

export interface DocumentMeta {
  id: string;
  title: string;
  category: string;
  path: string;
  keywords: string[];
  summary: string;
  sections: SectionMeta[];
}

export interface SectionBody {
  id: string;
  title: string;
  body: string;
}

// Slug helper for falling back when a heading has no explicit section_id
// marker. Keeps ASCII letters/digits and converts everything else to "-";
// works well enough for English headings, and Japanese headings collapse to
// a short index suffix added by the caller.
function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

function parseSections(content: string): SectionBody[] {
  const lines = content.split("\n");
  const out: SectionBody[] = [];
  let currentId: string | null = null;
  let currentTitle = "";
  let buffer: string[] = [];
  const seenIds = new Set<string>();

  const flush = () => {
    if (currentId !== null) {
      out.push({
        id: currentId,
        title: currentTitle,
        body: buffer.join("\n").trim(),
      });
    }
  };

  const allocateId = (titleSlug: string): string => {
    const base = titleSlug || `sec-${out.length + 1}`;
    let candidate = base;
    let n = 2;
    while (seenIds.has(candidate)) {
      candidate = `${base}-${n++}`;
    }
    seenIds.add(candidate);
    return candidate;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith("## ")) {
      flush();
      currentTitle = line.slice(3).trim();
      const next = lines[i + 1] ?? "";
      const m = next.match(/<!--\s*section_id:\s*(\S+)\s*-->/);
      if (m) {
        currentId = m[1];
        seenIds.add(currentId);
        i++;
      } else {
        currentId = allocateId(slugify(currentTitle));
      }
      buffer = [];
      continue;
    }
    buffer.push(line);
  }
  flush();
  return out;
}

interface ParsedDocument {
  meta: DocumentMeta;
  sections: SectionBody[];
}

function parseDocument(relPath: string, raw: string): ParsedDocument {
  const fm = matter(raw);
  const data = fm.data as Record<string, unknown>;
  const sections = parseSections(fm.content);

  const id =
    typeof data.id === "string" && data.id.length > 0 ? data.id : relPath;
  const title =
    typeof data.title === "string" && data.title.length > 0
      ? data.title
      : firstHeading(fm.content) ?? relPath;
  const category =
    typeof data.category === "string" && data.category.length > 0
      ? data.category
      : "uncategorized";
  const keywords = Array.isArray(data.keywords)
    ? data.keywords.filter((k): k is string => typeof k === "string")
    : [];
  const summary =
    typeof data.summary === "string"
      ? data.summary
      : firstParagraph(fm.content) ?? "";

  return {
    meta: {
      id,
      title,
      category,
      path: relPath,
      keywords,
      summary,
      sections: sections.map((s) => ({ id: s.id, title: s.title })),
    },
    sections,
  };
}

function firstHeading(content: string): string | null {
  const m = content.match(/^#\s+(.+)$/m);
  return m ? m[1].trim() : null;
}

function firstParagraph(content: string): string | null {
  const stripped = content
    .replace(/^#+\s+.*$/gm, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .trim();
  const para = stripped.split(/\n\s*\n/)[0]?.trim() ?? "";
  if (!para) return null;
  return para.length > 200 ? para.slice(0, 200) + "…" : para;
}

// Corpus is built once at server startup and held in memory. For MVP we don't
// watch the filesystem — restart the MCP server (or the client) to pick up
// new docs. This keeps the runtime model trivially understandable; if users
// hit it, a --watch flag is a small follow-up.
export class Corpus {
  private constructor(
    readonly adapter: StorageAdapter,
    private readonly index: DocumentMeta[],
    private readonly bodies: Map<string, SectionBody[]>,
    readonly diagnostics: { skipped: { path: string; reason: string }[] },
  ) {}

  static async load(adapter: StorageAdapter): Promise<Corpus> {
    const paths = await adapter.listMarkdown();
    const index: DocumentMeta[] = [];
    const bodies = new Map<string, SectionBody[]>();
    const skipped: { path: string; reason: string }[] = [];
    const seenIds = new Set<string>();

    for (const p of paths) {
      try {
        const raw = await adapter.read(p);
        const parsed = parseDocument(p, raw);
        if (seenIds.has(parsed.meta.id)) {
          // Two docs claiming the same id is a real bug for the user — keep
          // the first, flag the rest. Surfacing via diagnostics rather than
          // throwing keeps the server up.
          skipped.push({ path: p, reason: `duplicate id: ${parsed.meta.id}` });
          continue;
        }
        seenIds.add(parsed.meta.id);
        index.push(parsed.meta);
        bodies.set(parsed.meta.id, parsed.sections);
      } catch (err) {
        skipped.push({
          path: p,
          reason: err instanceof Error ? err.message : String(err),
        });
      }
    }
    return new Corpus(adapter, index, bodies, { skipped });
  }

  list(): DocumentMeta[] {
    return this.index;
  }

  findById(docId: string): DocumentMeta | undefined {
    return this.index.find((d) => d.id === docId);
  }

  getSections(docId: string, sectionIds: string[], maxChars = 3000): SectionBody[] {
    const all = this.bodies.get(docId);
    if (!all) return [];
    const byId = new Map(all.map((s) => [s.id, s]));
    return sectionIds
      .map((sid) => {
        const s = byId.get(sid);
        if (!s) return null;
        const body =
          s.body.length > maxChars ? s.body.slice(0, maxChars) + "…" : s.body;
        return { id: sid, title: s.title, body };
      })
      .filter((x): x is SectionBody => x !== null);
  }

  allSectionsOf(docId: string): SectionBody[] | undefined {
    return this.bodies.get(docId);
  }
}
