import fs from "node:fs/promises";
import path from "node:path";
import type { StorageAdapter } from "./types.js";

// Local filesystem adapter. Covers the common case (a folder of .md files),
// and via OS-level mounts also covers NAS, iCloud Drive, Google Drive desktop
// sync, Dropbox, OneDrive, etc. — anywhere the user has Markdown sitting in a
// directory.

export interface FsAdapterOptions {
  root: string;
  // Directory names that are skipped during the walk. node_modules and .git
  // are obvious; the rest mirror tools like ripgrep so users don't have to
  // think about it.
  ignoreDirs?: string[];
}

const DEFAULT_IGNORE_DIRS = new Set([
  "node_modules",
  ".git",
  ".next",
  ".turbo",
  "dist",
  "build",
  ".cache",
  ".vscode",
  ".idea",
]);

export class FsAdapter implements StorageAdapter {
  readonly root: string;
  private readonly ignoreDirs: Set<string>;

  constructor(opts: FsAdapterOptions) {
    this.root = path.resolve(opts.root);
    this.ignoreDirs = new Set([
      ...DEFAULT_IGNORE_DIRS,
      ...(opts.ignoreDirs ?? []),
    ]);
  }

  async listMarkdown(): Promise<string[]> {
    const out: string[] = [];
    await this.walk(this.root, out);
    out.sort();
    return out;
  }

  async read(relPath: string): Promise<string> {
    const abs = this.resolveSafe(relPath);
    return fs.readFile(abs, "utf8");
  }

  // Resolve a corpus-relative path and refuse anything that escapes the root
  // via .. or absolute paths. The adapter is a trust boundary: tool arguments
  // come from a model, and we don't want a crafted doc_id to read /etc/passwd.
  private resolveSafe(relPath: string): string {
    const abs = path.resolve(this.root, relPath);
    const rel = path.relative(this.root, abs);
    if (rel.startsWith("..") || path.isAbsolute(rel)) {
      throw new Error(`path escapes corpus root: ${relPath}`);
    }
    return abs;
  }

  private async walk(dir: string, out: string[]): Promise<void> {
    let entries: import("node:fs").Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith(".") && entry.name !== ".") {
        if (this.ignoreDirs.has(entry.name)) continue;
      }
      if (entry.isDirectory()) {
        if (this.ignoreDirs.has(entry.name)) continue;
        await this.walk(path.join(dir, entry.name), out);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) {
        const abs = path.join(dir, entry.name);
        out.push(path.relative(this.root, abs));
      }
    }
  }
}
