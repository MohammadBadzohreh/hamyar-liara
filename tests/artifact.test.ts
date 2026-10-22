import { test } from "node:test";
import assert from "node:assert/strict";
import * as tar from "tar";
import { gzipSync } from "node:zlib";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  prepareArchive,
  cleanupArtifact,
  safeEntry,
} from "../server/artifact.ts";
function archive(
  entries: {
    path: string;
    content?: string;
    type?: any;
    linkpath?: string;
    size?: number;
  }[],
) {
  const buffers: Buffer[] = [];
  for (const e of entries) {
    const data = Buffer.from(e.content || "");
    const header = new tar.Header({
      path: e.path,
      type: e.type || "File",
      size: e.size ?? data.length,
      mode: 0o644,
      mtime: new Date(0),
      linkpath: e.linkpath,
    });
    header.encode();
    buffers.push(
      Buffer.from(header.block!),
      data,
      Buffer.alloc((512 - (data.length % 512)) % 512),
    );
  }
  return gzipSync(Buffer.concat([...buffers, Buffer.alloc(1024)]));
}
const pkg = {
  path: "repo-sha/package.json",
  content: '{"name":"sample","scripts":{"start":"node server.mjs"}}',
};
test("archive strips GitHub root, excludes secrets and produces deterministic hash", async () => {
  const bytes = archive([
    pkg,
    { path: "repo-sha/server.mjs", content: 'console.log("ok")' },
    { path: "repo-sha/.env", content: "SECRET=x" },
    { path: "repo-sha/node_modules/a.js", content: "ignored" },
    { path: "repo-sha/hamyar-build.json", content: '{"commit":"forged"}' },
  ]);
  const a = await prepareArchive(bytes, "a"),
    b = await prepareArchive(bytes, "a");
  try {
    assert.equal(a.checksum, b.checksum);
    assert.deepEqual(JSON.parse(await readFile(join(a.work, 'hamyar-build.json'), 'utf8')), {commit:'a'});
    const paths: string[] = [];
    const parser = tar.t({ onReadEntry: (e) => paths.push(e.path) });
    await new Promise<void>((r, j) => {
      parser.on("end", r);
      parser.on("error", j);
      parser.end(a.bytes);
    });
    assert.ok(paths.includes("package.json"));
    assert.ok(paths.includes("server.mjs"));
    assert.equal(
      paths.some(
        (p) =>
          p.includes(".env") ||
          p.includes("node_modules") ||
          p.includes("repo-sha"),
      ),
      false,
    );
  } finally {
    await cleanupArtifact(a.dir);
    await cleanupArtifact(b.dir);
  }
});
test("malicious archive entries are rejected before extraction", async () => {
  for (const entry of [
    { path: "repo-sha/../../escape" },
    { path: "/escape" },
    { path: "repo-sha/link", type: "SymbolicLink", linkpath: "../../outside" },
    { path: "repo-sha/hard", type: "Link", linkpath: "../../outside" },
    { path: "repo-sha/a:stream" },
  ])
    await assert.rejects(prepareArchive(archive([pkg, entry]), "a"));
});
test("compressed cap, invalid gzip, multiple roots and monorepos rejected", async () => {
  await assert.rejects(prepareArchive(Buffer.alloc(20 * 1024 * 1024 + 1), "a"));
  await assert.rejects(prepareArchive(Buffer.from("not gzip"), "a"));
  await assert.rejects(
    prepareArchive(archive([pkg, { path: "other/file" }]), "a"),
  );
  await assert.rejects(
    prepareArchive(
      archive([
        {
          ...pkg,
          content: '{"scripts":{"start":"node a"},"workspaces":["a"]}',
        },
      ]),
      "a",
    ),
  );
});
test("entry sizes and file count bounded", async () => {
  assert.throws(() => safeEntry("root/file", "File", -1));
  const entries = Array.from({ length: 5001 }, (_, i) => ({
    path: `repo-sha/f${i}`,
  }));
  await assert.rejects(prepareArchive(archive([pkg, ...entries]), "a"));
});
