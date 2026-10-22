import { test } from "node:test";
import assert from "node:assert/strict";
import { routeMessage } from "../src/intent.ts";

test("checkout complaint probes checkout with valid POST, never payment", () => {
  const intent = routeMessage("checkout خطای ۵۰۰ دارد");
  assert.equal(intent.kind, "investigate");
  if (intent.kind !== "investigate") throw new Error("missing target");
  assert.equal(intent.target.path, "/api/checkout");
  assert.equal(intent.target.method, "POST");
  assert.deepEqual("body" in intent.target && intent.target.body, { amount: 10000, user: {} });
});
test("ambiguous failures and slowness ask for a target without starting an unrelated probe", () => {
  for (const text of ["سایت مشکل دارد", "خطای 500", "سایت کند شده", "پرداخت و سفارش خراب است", "منابع زیاد شده"])
    assert.equal(routeMessage(text).kind, "choose");
});
test("Persian variants, explicit paths and deployment route correctly", () => {
  for (const [text, path] of [["تخفیف كار نميكند", "/api/checkout"], ["پرداخت مشکل دارد", "/api/payment-status"], ["گزارش کند است", "/api/heavy-report"], ["/health/ready", "/health/ready"]]) {
    const intent = routeMessage(text);
    assert.equal(intent.kind === "investigate" && intent.target.path, path);
  }
  assert.equal(routeMessage("برنامه پرداخت را دیپلوی کن").kind, "deploy");
  assert.equal(routeMessage("سلام").kind, "help");
});
