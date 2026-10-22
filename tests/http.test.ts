import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm, cp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";
import { once } from "node:events";
import { passwordHash } from "../server/security.ts";
async function freePort() {
  const s = createServer();
  s.listen(0, "127.0.0.1");
  await once(s, "listening");
  const port = (s.address() as any).port;
  await new Promise<void>((r) => s.close(() => r()));
  return port;
}
async function launch(file: string, env: Record<string, string>) {
  const port = await freePort();
  const child = spawn(process.execPath, [file], {
    env: { ...process.env, ...env, PORT: String(port) },
    stdio: "ignore",
    windowsHide: true,
  });
  const base = `http://127.0.0.1:${port}`;
  try {
    for (let i = 0; i < 60; i++) {
      try {
        if ((await fetch(base + "/health/live")).ok) return { child, base };
      } catch {}
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error("Server did not start");
  } catch (e) {
    child.kill();
    throw e;
  }
}
async function stop(child: ReturnType<typeof spawn>) {
  const closed = once(child, "exit");
  child.kill();
  await closed;
}
test("sample response identity comes from immutable archive metadata, not mutable environment", async () => {
  const dir = await mkdtemp(join(tmpdir(), "hamyar-runtime-test-"));
  let server: Awaited<ReturnType<typeof launch>> | undefined;
  try {
    await cp("sample", dir, { recursive: true });
    const sha = "a".repeat(40);
    await writeFile(join(dir, "hamyar-build.json"), JSON.stringify({ commit: sha }));
    server = await launch(join(dir, "server.mjs"), { RELEASE_SHA: "b".repeat(40), DEMO_PAYMENT_MODE: "sandbox" });
    for (const path of ["/health/live", "/api/payment-status", "/missing"])
      assert.equal((await fetch(server.base + path)).headers.get("x-hamyar-commit"), sha);
  } finally {
    if (server) await stop(server.child);
    await rm(dir, { recursive: true, force: true });
  }
});
test("owner login, CSRF, API routing, duplicate project and consumed approval", async () => {
  const dir = await mkdtemp(join(tmpdir(), "hamyar-api-test-"));
  const server = await launch("server/index.ts", {
    DATA_DIR: dir,
    OWNER_PASSWORD_HASH: passwordHash("test-password"),
    LIARA_API_TOKEN: "",
    LIARA_TEAM_ID: "",
    NODE_ENV: "test",
  });
  try {
    const url = (p: string) => server.base + "/api" + p;
    assert.equal((await fetch(url("/projects"))).status, 401);
    const login = await fetch(url("/login"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "test-password" }),
    });
    assert.equal(login.status, 200);
    const cookie = login.headers.get("set-cookie")!.split(";")[0],
      session = (await login.json()) as any;
    const headers = {
      Cookie: cookie,
      "Content-Type": "application/json",
      "X-CSRF-Token": session.csrf,
    };
    assert.equal(
      (
        await fetch(url("/projects"), {
          method: "POST",
          headers: { Cookie: cookie, "Content-Type": "application/json" },
          body: "{}",
        })
      ).status,
      403,
    );
    const input = {
      name: "آزمون",
      repo: "https://github.com/test/sample",
      app: "hamyar-test",
      port: 3100,
    };
    const created = await fetch(url("/projects"), {
      method: "POST",
      headers,
      body: JSON.stringify(input),
    });
    assert.equal(created.status, 201);
    const p = (await created.json()) as any;
    const monitor = await fetch(url(`/projects/${p.id}/monitor`), {
      method:'POST',headers,body:JSON.stringify({enabled:false,healthPath:'/api/payment-status'}),
    });
    assert.equal(monitor.status,200);
    assert.equal(((await monitor.json()) as any).healthPath,'/api/payment-status');
    assert.equal((await fetch(url(`/projects/${p.id}/monitor`), {
      method:'POST',headers,body:JSON.stringify({enabled:true,healthPath:'https://evil.test/'}),
    })).status,400);
    assert.equal(
      (
        await fetch(url("/projects"), {
          method: "POST",
          headers,
          body: JSON.stringify(input),
        })
      ).status,
      409,
    );
    assert.ok(
      Array.isArray(await (await fetch(url("/health"), { headers })).json()),
    );
    assert.equal((await fetch(url("/unknown"), { headers })).status, 404);
    const op = (await (
      await fetch(url(`/projects/${p.id}/proposals`), {
        method: "POST",
        headers,
        body: '{"kind":"restart"}',
      })
    ).json()) as any;
    assert.equal(
      (
        await fetch(url(`/operations/${op.id}/approve`), {
          method: "POST",
          headers,
          body: "{}",
        })
      ).status,
      202,
    );
    assert.equal(
      (
        await fetch(url(`/operations/${op.id}/approve`), {
          method: "POST",
          headers,
          body: "{}",
        })
      ).status,
      409,
    );
  } finally {
    await stop(server.child);
    await rm(dir, { recursive: true, force: true });
  }
});
test("sample separates process health from configuration; checkout and demo authentication work", async () => {
  const { child, base } = await launch("sample/server.mjs", {
    DEMO_PAYMENT_MODE: "invalid",
    DEMO_MODE: "true",
    DEMO_TOKEN: "x".repeat(32),
  });
  try {
    assert.equal((await fetch(base + "/health/live")).status, 200);
    assert.equal((await fetch(base + "/api/payment-status")).status, 500);
    assert.deepEqual(
      await (
        await fetch(base + "/api/checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: '{"amount":10000,"user":{}}',
        })
      ).json(),
      { total: 10000, currency: "IRT" },
    );
    assert.equal(
      (
        await fetch(base + "/__demo/scenario", {
          method: "POST",
          body: '{"scenario":"resources"}',
        })
      ).status,
      403,
    );
    const headers = {
      "Content-Type": "application/json",
      Authorization: "Bearer " + "x".repeat(32),
    };
    const activationStarted = Date.now();
    const activation = (await (
      await fetch(base + "/__demo/scenario", {
        method: "POST",
        headers,
        body: '{"scenario":"resources"}',
      })
    ).json()) as any;
    assert.equal(activation.maxMiB, 50);
    // HTTP crosses processes: allow small wall-clock sampling skew. The exact
    // 60-second reset and buffer release are asserted with a controlled clock
    // in sample/test/resources.test.mjs.
    assert.ok(Number.isFinite(activation.expiresAt));
    assert.ok(activation.expiresAt >= activationStarted + 60000 - 100);
    assert.ok(activation.expiresAt <= Date.now() + 60000 + 100,
      `expiry exceeds HTTP clock tolerance: ${activation.expiresAt - Date.now()}ms`);
    const heavy = (await (
      await fetch(base + "/api/heavy-report")
    ).json()) as any;
    assert.ok(heavy.durationMs >= 190);
    assert.equal((await fetch(base + "/api/heavy-report")).status, 429);
    assert.equal(
      (
        await fetch(base + "/__demo/reset", {
          method: "POST",
          headers,
          body: "{}",
        })
      ).status,
      200,
    );
    assert.equal((await fetch(base + "/api/heavy-report")).status, 200);
  } finally {
    await stop(child);
  }
});
