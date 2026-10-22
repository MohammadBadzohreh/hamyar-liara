import { test } from "node:test";
import assert from "node:assert/strict";
import { Store } from "../server/store.ts";
import {
  canonical,
  passwordHash,
  verifyPassword,
  seal,
  unseal,
  redact,
} from "../server/security.ts";
import { publicIPv4, probeURL } from "../server/probe.ts";
import { assertHTTP, sampleChecks } from "../server/verification.ts";
import { parseRepo } from "../server/github.ts";

test("approval survives JSON persistence and cannot be replayed", () => {
  const s = new Store();
  try {
    const op = s.operation(
      "p",
      "deploy",
      { sha: "a", optional: undefined },
      { title: "publish" },
    );
    assert.equal(s.approve(op.id).status, "running");
    assert.throws(() => s.approve(op.id));
  } finally {
    s.close();
  }
});
test("duplicate proposal is idempotent and projects serialize", () => {
  const s = new Store();
  try {
    const a = s.operation("p", "deploy", { sha: "a" }, {});
    assert.equal(s.operation("p", "deploy", { sha: "a" }, {}).id, a.id);
    const b = s.operation("p", "restart", {}, {});
    s.approve(a.id);
    assert.throws(() => s.approve(b.id));
    s.finish(a.id, "succeeded");
    assert.equal(s.approve(b.id).status, "running");
  } finally {
    s.close();
  }
});
test("expired, rejected, wrong owner and changed destination never execute", () => {
  for (const kind of ["expired", "rejected", "owner", "target"]) {
    const s = new Store();
    try {
      const a = s.operation("p", "deploy", { app: "one" }, {});
      if (kind === "expired")
        s.db.prepare("UPDATE approvals SET expires=0").run();
      if (kind === "rejected") s.reject(a.id);
      if (kind === "target") {
        a.parameters.app = "two";
        s.put("operation", a.id, a);
      }
      assert.throws(() =>
        s.approve(a.id, kind === "owner" ? "stranger" : "owner"),
      );
    } finally {
      s.close();
    }
  }
});
test("password and encrypted configuration round trip; tampering rejected", () => {
  const encoded = passwordHash("correct horse");
  assert.ok(verifyPassword("correct horse", encoded));
  assert.equal(verifyPassword("wrong", encoded), false);
  process.env.ENCRYPTION_KEY = "a".repeat(64);
  const encrypted = seal({ SECRET: "test-value" });
  assert.equal(encrypted.includes("test-value"), false);
  assert.deepEqual(unseal(encrypted), { SECRET: "test-value" });
  assert.throws(() => unseal(encrypted.slice(0, -2) + "ff"));
  assert.equal(canonical({ a: 1, b: undefined }), canonical({ a: 1 }));
  assert.equal(redact({ password: "x" }).password, "[REDACTED]");
});
test("probe rejects internal addresses and origin escapes", () => {
  for (const ip of [
    "127.0.0.1",
    "10.1.1.1",
    "169.254.169.254",
    "192.168.1.1",
    "172.17.1.1",
    "::1",
    "100.64.0.1",
    "203.0.113.1",
  ])
    assert.equal(publicIPv4(ip), false);
  assert.equal(publicIPv4("8.8.8.8"), true);
  for (const path of ["//evil.test", "https://evil.test", "/\\evil.test"])
    assert.throws(() => probeURL("https://sample.liara.run", path));
  assert.throws(() => probeURL("http://localhost", "/"));
});
test("HTTP 500 and fake success with incorrect business total fail verification", () => {
  assert.throws(() => assertHTTP({ status: 500, ok: false }, sampleChecks[0]));
  assert.throws(() =>
    assertHTTP({ status: 200, ok: true, body: '{"total":1}' }, sampleChecks[2]),
  );
  assertHTTP(
    { status: 200, ok: true, body: '{"total":10000,"currency":"IRT"}' },
    sampleChecks[2],
  );
});
test("only root GitHub repository URLs accepted", () => {
  assert.equal(parseRepo("https://github.com/a/b.git"), "a/b");
  for (const value of [
    "https://evil.test/a/b",
    "https://github.com/a/b/tree/main",
    "https://user:pass@github.com/a/b",
  ])
    assert.throws(() => parseRepo(value));
});

test("healthy old or unidentified runtime cannot validate a new deployment", () => {
  const check = { ...sampleChecks[2], commit: 'b'.repeat(40) };
  const healthy = { status: 200, ok: true, body: '{"total":10000,"currency":"IRT"}' };
  assert.throws(() => assertHTTP(healthy, check), /commit/);
  assert.throws(() => assertHTTP({ ...healthy, commit: 'a'.repeat(40) }, check), /commit/);
  assertHTTP({ ...healthy, commit: check.commit }, check);
  assert.throws(() => assertHTTP({ ...healthy, commit: check.commit, status: 500, ok: false }, check));
});
