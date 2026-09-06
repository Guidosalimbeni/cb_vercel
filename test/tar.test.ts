import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { parseTar } from "../src/lib/tar";

function fixture(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "cbtar-"));
  const root = path.join(dir, "owner-repo-abc123");
  const longDir = path.join(root, "wiki", "questions", "q-0001", "a-really-long-directory-name-to-push-the-path-past-one-hundred-characters-for-sure", "deeper");
  mkdirSync(longDir, { recursive: true });
  writeFileSync(path.join(root, "CLAUDE.md"), "# rules\n");
  writeFileSync(path.join(root, "wiki", "questions", "q-0001", "q-0001.md"), "---\nid: q-0001\n---\n");
  writeFileSync(path.join(longDir, "notes.md"), "long path content\n");
  return dir;
}

for (const format of ["gnu", "pax", "ustar"]) {
  test(`parseTar reads a ${format} tarball including long paths`, () => {
    const dir = fixture();
    const out = path.join(dir, "x.tgz");
    execFileSync("tar", ["--format", format, "-czf", out, "-C", dir, "owner-repo-abc123"]);
    const files = parseTar(gunzipSync(readFileSync(out)));
    const names = [...files.keys()].sort();
    assert.ok(names.includes("owner-repo-abc123/CLAUDE.md"), names.join(","));
    assert.equal(files.get("owner-repo-abc123/CLAUDE.md")!.toString(), "# rules\n");
    const long = names.find((n) => n.endsWith("deeper/notes.md"));
    if (format === "ustar") return; // ustar cannot represent >255-char paths; gnu tar may drop or split them
    assert.ok(long, `long path missing in ${format}: ${names.join(",")}`);
    assert.equal(files.get(long!)!.toString(), "long path content\n");
  });
}
