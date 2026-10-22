import { config, requireConfig } from "./config.ts";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
async function readFetch(input: string | URL, init: RequestInit = {}) {
  for (let attempt = 0; ; attempt++) {
    try {
      const response = await fetch(input, { ...init, signal: AbortSignal.timeout(20000) });
      if (attempt < 2 && [502, 503, 504].includes(response.status)) {
        await response.body?.cancel();
      } else return response;
    } catch (error) {
      if (attempt >= 2) throw error;
    }
    await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
  }
}
export async function verifyTestContract(repo: string, sha: string) {
  if (repo !== config.repairRepo || config.workflow !== "acceptance.yml")
    throw new Error("فقط workflow ثابت مخزن نمونه مجاز است.");
  for (const path of [
    ".github/workflows/acceptance.yml",
    "test/checkout.test.mjs",
  ]) {
    const [actual, expected] = await Promise.all([
      fileAt(repo, sha, path),
      readFile(
        fileURLToPath(new URL("../sample/" + path, import.meta.url)),
        "utf8",
      ),
    ]);
    if (actual.replace(/\r\n/g, "\n") !== expected.replace(/\r\n/g, "\n"))
      throw new Error(`قرارداد تست تغییر کرده است: ${path}`);
  }
}
export function parseRepo(input: string) {
  const u = new URL(input);
  if (u.origin !== "https://github.com" || u.username || u.password)
    throw new Error("لینک باید مخزن github.com باشد.");
  const parts = u.pathname
    .replace(/\.git$/, "")
    .split("/")
    .filter(Boolean);
  if (parts.length !== 2 || !parts.every((x) => /^[\w.-]+$/.test(x)))
    throw new Error("لینک ریشه مخزن را وارد کنید؛ شاخه در فیلد جداست.");
  return parts.join("/");
}
export async function github(path: string, method = "GET", body?: any) {
  const u = new URL(path, "https://api.github.com");
  if (u.origin !== "https://api.github.com") throw new Error("GitHub origin");
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "hamyar-liara",
  };
  if (config.githubToken)
    headers.Authorization = `Bearer ${config.githubToken}`;
  if (method !== "GET") requireConfig(config.githubToken, "GitHub");
  const r = await (method === "GET" ? readFetch : fetch)(u, {
    method,
    headers: { ...headers, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    redirect: "error",
    signal: AbortSignal.timeout(20000),
  });
  const raw = await r.text();
  let data: any;
  try { data = raw ? JSON.parse(raw) : undefined; }
  catch {
    throw new Error(`GitHub ${r.status}: پاسخ غیر JSON؛ درخواست نوشتنی تکرار نشد.`);
  }
  if (!r.ok) throw new Error(`GitHub ${r.status}: ${data?.message || "خطا"}`);
  if (method === "GET" && data === undefined)
    throw new Error("GitHub: پاسخ خواندنی خالی است.");
  return data;
}
export async function resolveCommit(repo: string, ref: string) {
  return (
    await github(`/repos/${repo}/commits/${encodeURIComponent(ref || "HEAD")}`)
  ).sha as string;
}
export async function fileAt(repo: string, sha: string, path: string) {
  const r = await github(`/repos/${repo}/contents/${path}?ref=${sha}`);
  if (r.encoding !== "base64" || r.size > 100000)
    throw new Error("فایل برای بررسی قابل استفاده نیست.");
  return Buffer.from(r.content, "base64").toString("utf8");
}
export async function archiveBytes(repo: string, sha: string) {
  if (!/^[a-f0-9]{40}$/.test(sha)) throw new Error("commit معتبر لازم است.");
  const headers: Record<string, string> = { "User-Agent": "hamyar-liara" };
  if (config.githubToken)
    headers.Authorization = `Bearer ${config.githubToken}`;
  let r = await readFetch(`https://api.github.com/repos/${repo}/tarball/${sha}`, {
    headers,
    redirect: "manual",
    signal: AbortSignal.timeout(20000),
  });
  if (r.status === 302) {
    const target = new URL(r.headers.get("location") || "");
    if (target.origin !== "https://codeload.github.com")
      throw new Error("مقصد آرشیو مجاز نیست.");
    r = await readFetch(target, {
      redirect: "error",
      signal: AbortSignal.timeout(30000),
    });
  }
  if (!r.ok || !r.body) throw new Error(`دریافت آرشیو: ${r.status}`);
  const chunks: Uint8Array[] = [];
  let length = 0;
  for await (const chunk of r.body as any) {
    length += chunk.length;
    if (length > 20 * 1024 * 1024) {
      throw new Error("آرشیو بیش از ۲۰ مگابایت است.");
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
export async function createRepairCommit(
  repo: string,
  base: string,
  path: string,
  content: string,
  operationId: string,
) {
  const branch = `codex/repair-${operationId}`;
  const commit = await github(`/repos/${repo}/git/commits/${base}`);
  const blob = await github(`/repos/${repo}/git/blobs`, "POST", {
    content,
    encoding: "utf-8",
  });
  const entries = [{ path, mode: "100644", type: "blob", sha: blob.sha }];
  const tree = await github(`/repos/${repo}/git/trees`, "POST", {
    base_tree: commit.tree.sha,
    tree: entries,
  });
  const next = await github(`/repos/${repo}/git/commits`, "POST", {
    message: "fix: reviewed checkout repair",
    tree: tree.sha,
    parents: [base],
  });
  await github(`/repos/${repo}/git/refs`, "POST", {
    ref: `refs/heads/${branch}`,
    sha: base,
  });
  // Advance an existing branch so the reviewed commit emits an explicit push.
  // Never force-update or replay an ambiguous write.
  await github(`/repos/${repo}/git/refs/heads/${branch}`, "PATCH", {
    sha: next.sha,
    force: false,
  });
  return {
    sha: next.sha,
    branch,
    url: `https://github.com/${repo}/commit/${next.sha}`,
  };
}
export async function checkTests(repo: string, sha: string) {
  const data = await github(
    `/repos/${repo}/actions/workflows/${encodeURIComponent(config.workflow)}/runs?head_sha=${sha}&event=push&per_page=20`,
  );
  const run = data.workflow_runs
    ?.filter(
      (x: any) =>
        x.head_sha === sha &&
        x.event === "push" &&
        x.head_repository?.full_name === repo,
    )
    .sort(
      (a: any, b: any) =>
        Date.parse(b.created_at) - Date.parse(a.created_at) ||
        b.run_attempt - a.run_attempt,
    )[0];
  let rejected = false;
  if (run?.id && run.status !== "completed") {
    const jobs = await github(`/repos/${repo}/actions/runs/${run.id}/jobs?per_page=100`);
    rejected = jobs.jobs?.some((job: any) =>
      job.status === "completed" && ["failure", "timed_out", "cancelled"].includes(job.conclusion),
    ) || false;
  }
  return run
    ? {
        rejected,
        verified: run.status === "completed" && run.conclusion === "success",
        status: run.status,
        conclusion: run.conclusion,
        url: run.html_url,
        event: run.event,
        sha,
      }
    : {
        verified: false,
        status: "not_started",
        message: "گیت‌هاب هنوز اجرای تست این commit را ثبت نکرده است؛ قرارگرفتن در صف تأیید نشده و انتشار مجاز نیست.",
        sha,
      };
}
