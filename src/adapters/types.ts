// Storage adapter interface. The corpus layer (src/corpus.ts) talks only to
// this interface, so swapping the backend (FS → NAS → Google Drive API →
// Notion → S3) is a matter of adding one adapter class.
//
// MVP ships only FsAdapter. The interface is intentionally small: read-only
// for now. The write half (used by future edit tools) will be added when the
// edit feature lands.

export interface StorageAdapter {
  // Enumerate all Markdown documents the server should expose. Paths returned
  // here are opaque identifiers handed back to read() — they need not be
  // filesystem paths. The FsAdapter happens to return paths relative to its
  // root, but a NotionAdapter could return page IDs.
  listMarkdown(): Promise<string[]>;

  // Read a Markdown document by the identifier returned from listMarkdown().
  read(path: string): Promise<string>;
}
