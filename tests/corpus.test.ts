import { strict as assert } from "node:assert";
import { test } from "node:test";
import type { StorageAdapter } from "../src/adapters/types.js";
import { Corpus } from "../src/corpus.js";
import {
  getSections,
  listCategories,
  searchDocuments,
} from "../src/tools.js";

class FakeAdapter implements StorageAdapter {
  constructor(private readonly files: Record<string, string>) {}
  async listMarkdown(): Promise<string[]> {
    return Object.keys(this.files);
  }
  async read(p: string): Promise<string> {
    const content = this.files[p];
    if (content === undefined) throw new Error(`no such file: ${p}`);
    return content;
  }
}

const REFUND = `---
id: refund
title: 返金ポリシー
category: support
keywords: [返金, refund]
summary: 14 日以内返金可。
---

## 条件
<!-- section_id: eligibility -->

14 日以内、未開封のみ。

## 除外
<!-- section_id: exclusions -->

デジタル商品は対象外。
`;

const SHIPPING = `---
id: shipping
title: 配送ガイド
category: logistics
keywords: [配送, shipping]
summary: 5000 円以上で送料無料。
---

## 国内
<!-- section_id: domestic -->

3 営業日以内。
`;

test("Corpus.load parses frontmatter and sections", async () => {
  const adapter = new FakeAdapter({ "a.md": REFUND, "b.md": SHIPPING });
  const corpus = await Corpus.load(adapter);
  assert.equal(corpus.list().length, 2);
  const refund = corpus.findById("refund");
  assert.ok(refund);
  assert.equal(refund.title, "返金ポリシー");
  assert.equal(refund.sections.length, 2);
  assert.deepEqual(
    refund.sections.map((s) => s.id),
    ["eligibility", "exclusions"],
  );
});

test("searchDocuments ranks by metadata only", async () => {
  const adapter = new FakeAdapter({ "a.md": REFUND, "b.md": SHIPPING });
  const corpus = await Corpus.load(adapter);
  const res = searchDocuments(corpus, "返金 について");
  assert.equal(res.candidates[0].doc_id, "refund");
  assert.ok(res.candidates[0].score > 0);
  // sections list returned but no bodies
  assert.ok(!("body" in res.candidates[0].sections[0]));
});

test("get_sections returns bodies and reports missing ids", async () => {
  const adapter = new FakeAdapter({ "a.md": REFUND });
  const corpus = await Corpus.load(adapter);
  const res = getSections(corpus, "refund", ["eligibility", "nope"]);
  assert.ok("sections" in res);
  assert.equal(res.sections.length, 1);
  assert.equal(res.sections[0].id, "eligibility");
  assert.deepEqual(res.missing_section_ids, ["nope"]);
});

test("get_sections returns error for unknown doc_id", async () => {
  const adapter = new FakeAdapter({ "a.md": REFUND });
  const corpus = await Corpus.load(adapter);
  const res = getSections(corpus, "missing", ["x"]);
  assert.ok("error" in res);
});

test("list_categories aggregates counts", async () => {
  const adapter = new FakeAdapter({ "a.md": REFUND, "b.md": SHIPPING });
  const corpus = await Corpus.load(adapter);
  const res = listCategories(corpus);
  assert.equal(res.total_documents, 2);
  assert.equal(res.category_count, 2);
});

test("fallback section ids are assigned when no marker is present", async () => {
  const adapter = new FakeAdapter({
    "x.md": `---
id: x
title: X
---

## First Heading

body 1

## Second Heading

body 2
`,
  });
  const corpus = await Corpus.load(adapter);
  const doc = corpus.findById("x");
  assert.ok(doc);
  assert.deepEqual(
    doc.sections.map((s) => s.id),
    ["first-heading", "second-heading"],
  );
});

test("duplicate id is skipped and recorded as diagnostic", async () => {
  const dup = REFUND.replace("id: refund", "id: refund");
  const adapter = new FakeAdapter({ "a.md": REFUND, "b.md": dup });
  const corpus = await Corpus.load(adapter);
  assert.equal(corpus.list().length, 1);
  assert.equal(corpus.diagnostics.skipped.length, 1);
  assert.match(corpus.diagnostics.skipped[0].reason, /duplicate id/);
});
