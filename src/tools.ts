import type { Corpus, DocumentMeta } from "./corpus.js";

// MCP read tools, adapted from afdpfrss/document-agent/lib/mcp/tools.ts.
//
// Important: these functions deliberately do NOT call any LLM. Candidate
// selection and answer generation are the caller's job — this server only
// does metadata filtering, so the staged-disclosure structure is preserved
// at the tool boundary (parent project's docs/v2-design.md §2–4).

export interface DocCandidate {
  doc_id: string;
  title: string;
  category: string;
  keywords: string[];
  summary: string;
  sections: { id: string; title: string }[];
  score: number;
}

export interface SearchDocumentsResult {
  query: string;
  total_documents: number;
  candidate_count: number;
  candidates: DocCandidate[];
  note: string;
}

// Character bigrams, whitespace-stripped + lowercased. Bigram overlap is a
// tokenizer-free fuzzy match that works for Japanese (no word spaces) as
// well as Latin-script keywords.
function bigrams(s: string): Set<string> {
  const t = s.toLowerCase().replace(/\s+/g, "");
  const out = new Set<string>();
  for (let i = 0; i < t.length - 1; i++) out.add(t.slice(i, i + 2));
  return out;
}

function metadataScore(query: string, doc: DocumentMeta): number {
  const q = query.toLowerCase();
  let score = 0;
  for (const kw of doc.keywords) {
    if (kw && q.includes(kw.toLowerCase())) score += 3;
  }
  if (doc.title && q.includes(doc.title.toLowerCase())) score += 4;
  if (doc.category && q.includes(doc.category.toLowerCase())) score += 2;
  for (const s of doc.sections) {
    if (s.title && q.includes(s.title.toLowerCase())) score += 1;
  }
  const qb = bigrams(query);
  if (qb.size > 0) {
    const db = bigrams(`${doc.title} ${doc.keywords.join(" ")} ${doc.summary}`);
    let overlap = 0;
    for (const g of qb) if (db.has(g)) overlap++;
    score += (overlap / qb.size) * 3;
  }
  return score;
}

const DEFAULT_CANDIDATE_LIMIT = 12;

export function searchDocuments(
  corpus: Corpus,
  query: string,
  limit = DEFAULT_CANDIDATE_LIMIT,
): SearchDocumentsResult {
  const index = corpus.list();
  const candidates: DocCandidate[] = [];
  for (const doc of index) {
    const score = metadataScore(query, doc);
    if (score <= 0) continue;
    candidates.push({
      doc_id: doc.id,
      title: doc.title,
      category: doc.category,
      keywords: doc.keywords,
      summary: doc.summary,
      sections: doc.sections.map((s) => ({ id: s.id, title: s.title })),
      score: Number(score.toFixed(3)),
    });
  }
  candidates.sort((a, b) => b.score - a.score);
  const top = candidates.slice(0, limit);

  return {
    query,
    total_documents: index.length,
    candidate_count: top.length,
    candidates: top,
    note: "これは候補プールです。フロントマターと要約だけが含まれます。読むべきセクションを選び、get_sections で本文を取得してください。",
  };
}

export interface GetSectionsResult {
  doc_id: string;
  title: string;
  category: string;
  sections: { id: string; title: string; body: string }[];
  missing_section_ids: string[];
}

export interface GetSectionsError {
  error: string;
}

const MAX_SECTIONS_PER_CALL = 10;

export function getSections(
  corpus: Corpus,
  docId: string,
  sectionIds: string[],
): GetSectionsResult | GetSectionsError {
  const doc = corpus.findById(docId);
  if (!doc) {
    return {
      error: `doc_id が見つかりません: ${docId}。search_documents で正しい doc_id を確認してください。`,
    };
  }
  const requested = sectionIds.slice(0, MAX_SECTIONS_PER_CALL);
  const sections = corpus.getSections(docId, requested);
  const found = new Set(sections.map((s) => s.id));
  return {
    doc_id: doc.id,
    title: doc.title,
    category: doc.category,
    sections,
    missing_section_ids: requested.filter((id) => !found.has(id)),
  };
}

export interface ListCategoriesResult {
  total_documents: number;
  category_count: number;
  categories: { name: string; document_count: number }[];
}

export function listCategories(corpus: Corpus): ListCategoriesResult {
  const index = corpus.list();
  const counts = new Map<string, number>();
  for (const d of index) {
    counts.set(d.category, (counts.get(d.category) ?? 0) + 1);
  }
  const categories = [...counts.entries()]
    .map(([name, document_count]) => ({ name, document_count }))
    .sort(
      (a, b) =>
        b.document_count - a.document_count || a.name.localeCompare(b.name),
    );
  return {
    total_documents: index.length,
    category_count: categories.length,
    categories,
  };
}
