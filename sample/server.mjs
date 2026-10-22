import http from "node:http";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";
import { checkout } from "./src/checkout.mjs";
import { ResourceScenario } from "./src/resource-scenario.mjs";
const resources = new ResourceScenario();
let sourceCommit = "unavailable";
try {
  const metadata = JSON.parse(readFileSync(new URL("./hamyar-build.json", import.meta.url), "utf8"));
  if (/^[a-f0-9]{40}$/.test(metadata.commit)) sourceCommit = metadata.commit;
} catch {}
const log = (data) =>
  console.log(
    JSON.stringify({
      time: new Date().toISOString(),
      release: sourceCommit,
      ...data,
    }),
  );
const authorized = (req) => {
  const expected = process.env.DEMO_TOKEN || "",
    actual = req.headers.authorization?.replace(/^Bearer /, "") || "";
  return (
    expected.length > 20 &&
    actual.length === expected.length &&
    timingSafeEqual(Buffer.from(actual), Buffer.from(expected))
  );
};
const server = http.createServer(async (req, res) => {
  res.setHeader("X-Hamyar-Commit", sourceCommit);
  const requestId = randomUUID(),
    path = new URL(req.url, "http://localhost").pathname,
    started = Date.now();
  const send = (status, data) => {
    res.writeHead(status, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    });
    res.end(JSON.stringify(data));
    log({ requestId, path, status, durationMs: Date.now() - started });
  };
  try {
    if (
      req.method === "GET" &&
      ["/health/live", "/health/ready"].includes(path)
    )
      return send(200, { status: "ok" });
    if (req.method === "GET" && path === "/") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(
        '<html dir="rtl" lang="fa"><meta name="viewport" content="width=device-width"><title>فروشگاه نمونه همیار</title><body style="font-family:Tahoma;background:#edf5f5;color:#163c42;padding:10vw"><h1>فروشگاه نمونه همیار</h1><p>این سایت واقعاً روی زیرساخت اجرا می‌شود. سناریوهای خطا برای آزمون دستیار هستند.</p><a href="/api/payment-status">بررسی تنظیمات پرداخت نمایشی</a> · <a href="/health/live">سلامت فرایند</a></body></html>',
      );
      return;
    }
    if (req.method === "GET" && path === "/api/payment-status") {
      if (process.env.DEMO_PAYMENT_MODE !== "sandbox") {
        log({
          requestId,
          path,
          code: "PAYMENT_CONFIG_INVALID",
          message: "DEMO_PAYMENT_MODE must be sandbox",
        });
        return send(500, { error: "PAYMENT_CONFIG_INVALID", requestId });
      }
      return send(200, { mode: "sandbox", realPayments: false });
    }
    if (req.method === "GET" && path === "/api/heavy-report") {
      if (!resources.run()) return send(429, { error: "DEMO_RATE_LIMIT" });
      return send(200, { report: "ready", durationMs: Date.now() - started });
    }
    let raw = "";
    for await (const chunk of req) {
      raw += chunk;
      if (raw.length > 16000) return send(413, { error: "BODY_TOO_LARGE" });
    }
    const body = raw ? JSON.parse(raw) : {};
    if (req.method === "POST" && path === "/api/checkout")
      return send(200, checkout(body));
    if (req.method === "POST" && path.startsWith("/__demo/")) {
      if (process.env.DEMO_MODE !== "true" || !authorized(req))
        return send(403, { error: "FORBIDDEN" });
      if (path === "/__demo/reset") {
        resources.reset();
        return send(200, { reset: true });
      }
      if (path === "/__demo/scenario" && body.scenario === "resources") {
        return send(200, resources.start());
      }
      return send(400, { error: "UNSUPPORTED_SCENARIO" });
    }
    send(404, { error: "NOT_FOUND" });
  } catch (e) {
    log({ requestId, path, code: e.message, stack: e.stack?.slice(0, 2000) });
    send(e.status || 500, {
      error: e.status ? e.message : "INTERNAL_ERROR",
      requestId,
    });
  }
});
server.listen(Number(process.env.PORT || 3100), "0.0.0.0", () =>
  log({ message: "sample ready" }),
);
