import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import type { Corpus } from "./corpus.js";
import { getSections, listCategories, searchDocuments } from "./tools.js";

// Wires the three read tools onto an McpServer and returns it. Kept separate
// from src/index.ts so tests can spin the server up without going through the
// CLI entrypoint.

export function createServer(corpus: Corpus): McpServer {
  const server = new McpServer({
    name: "document-agent-mcp",
    version: "0.1.0",
  });

  server.tool(
    "search_documents",
    "質問に関連する候補ドキュメントを絞り込む。返るのはフロントマター（タイトル・カテゴリ・キーワード・要約・セクション見出し）のみで本文は含まない。読むべきセクションを選んで get_sections に渡すこと。",
    {
      query: z.string().min(1).describe("検索クエリ（自然文 OK）"),
      limit: z
        .number()
        .int()
        .positive()
        .max(50)
        .optional()
        .describe("返す候補数の上限（既定 12）"),
    },
    async ({ query, limit }) => {
      const result = searchDocuments(corpus, query, limit);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    },
  );

  server.tool(
    "get_sections",
    "search_documents で得た doc_id と section_id を指定して、該当セクションの本文を取得する。",
    {
      doc_id: z.string().min(1).describe("search_documents が返した doc_id"),
      section_ids: z
        .array(z.string().min(1))
        .min(1)
        .max(10)
        .describe("読みたいセクションの ID 配列（最大 10）"),
    },
    async ({ doc_id, section_ids }) => {
      const result = getSections(corpus, doc_id, section_ids);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    },
  );

  server.tool(
    "list_categories",
    "コーパスのカテゴリ一覧と各カテゴリの文書数を返す。検索クエリを絞り込む前の俯瞰用。",
    {},
    async () => {
      const result = listCategories(corpus);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    },
  );

  return server;
}

export async function runStdio(corpus: Corpus): Promise<void> {
  const server = createServer(corpus);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
