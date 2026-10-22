import {
  mkdtemp,
  writeFile,
  readFile,
  rm,
  readdir,
  stat,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as tar from "tar";
import { createHash } from "node:crypto";
import { archiveBytes } from "./github.ts";
import { gunzipSync } from "node:zlib";
export function safeEntry(path: string, type: string, size: number) {
  const pieces = path.split("/");
  if (
    !pieces[0] ||
    path.startsWith("/") ||
    path.includes("\\") ||
    pieces.includes("..") ||
    pieces.some(
      (p) =>
        p.includes(":") ||
        /[. ]$/.test(p) ||
        /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p),
    ) ||
    !["File", "Directory", "OldFile"].includes(type) ||
    !Number.isSafeInteger(size) ||
    size < 0
  )
    throw new Error("آرشیو دارای مسیر یا نوع فایل غیرمجاز است.");
}
export function excluded(path: string) {
  return path
    .toLowerCase()
    .split("/")
    .some(
      (p) =>
        p === ".git" ||
        p === "node_modules" ||
        p === ".local" ||
        p === ".aws" ||
        p === ".ssh" ||
        p === ".codex" ||
        p === "dist" ||
        p === ".next" ||
        p === ".npmrc" ||
        p === ".netrc" ||
        p.startsWith(".env") ||
        /\.(pem|key|sqlite|db|log)$/i.test(p),
    );
}
export async function prepareArtifact(repo: string, sha: string) {
  return prepareArchive(await archiveBytes(repo, sha), sha);
}
export async function prepareArchive(bytes: Buffer, sha: string) {
  if (bytes.length > 20 * 1024 * 1024)
    throw new Error("آرشیو بیش از ۲۰ مگابایت است.");
  const dir = await mkdtemp(join(tmpdir(), "hamyar-"));
  try {
    const input = join(dir, "source.tar"),
      work = join(dir, "work");
    await writeFile(
      input,
      gunzipSync(bytes, { maxOutputLength: 110 * 1024 * 1024 }),
    );
    let total = 0,
      count = 0,
      root: string | undefined;
    let bad: Error | undefined;
    const seen = new Set<string>();
    await tar.t({
      file: input,
      strict: true,
      onReadEntry: (e) => {
        try {
          safeEntry(e.path, e.type, e.size);
          const part = e.path.split("/")[0];
          root ??= part;
          if (root !== part)
            throw new Error("آرشیو باید یک پوشه ریشه داشته باشد.");
          const key = e.path.replace(/\/$/, "").toLowerCase();
          if (seen.has(key)) throw new Error("مسیر تکراری در آرشیو.");
          seen.add(key);
          total += e.size;
          if (++count > 5000 || total > 100 * 1024 * 1024)
            throw new Error("حجم یا تعداد فایل‌ها بیش از سقف مجاز است.");
        } catch (err: any) {
          bad = err;
        }
      },
    });
    if (bad) throw bad;
    const { mkdir } = await import("node:fs/promises");
    await mkdir(work);
    await tar.x({
      file: input,
      cwd: work,
      strip: 1,
      strict: true,
      filter: (p) => !excluded(p),
    });
    const pkg = JSON.parse(await readFile(join(work, "package.json"), "utf8"));
    if (typeof pkg.scripts?.start !== "string" || pkg.workspaces)
      throw new Error(
        "پروژه ساده Node.js با دستور start و بدون workspace لازم است.",
      );
    // Deployment metadata is generated from the pinned source commit, never env.
    // It is part of the archive checksum approved before upload.
    await writeFile(join(work, "hamyar-build.json"), JSON.stringify({ commit: sha }));
    const files = (await readdir(work)).sort();
    const output = join(dir, "deploy.tar.gz");
    await tar.c(
      {
        cwd: work,
        file: output,
        gzip: true,
        portable: true,
        mtime: new Date(0),
        filter: (p) => !excluded(p),
      },
      files,
    );
    const packed = await readFile(output);
    if (packed.length > 20 * 1024 * 1024)
      throw new Error("خروجی بیش از سقف مجاز است.");
    return {
      dir,
      work,
      bytes: packed,
      sha,
      checksum: createHash("sha256").update(packed).digest("hex"),
      size: packed.length,
      pkg,
    };
  } catch (e) {
    await rm(dir, { recursive: true, force: true });
    throw e;
  }
}
export async function cleanupArtifact(dir: string) {
  await rm(dir, { recursive: true, force: true });
}
