import express from "express";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { z } from "zod";
import { config } from "./config.ts";
import { token, hash, verifyPassword, redact } from "./security.ts";
import { store, type Project, type Operation } from "./store.ts";
import { account, evidence, liara, storageStatus } from "./liara.ts";
import { probe } from "./probe.ts";
import { recommendPlan } from "./recommendation.ts";
import { recordHealth, claimIncident } from "./monitor-policy.ts";
import {
  addProject,
  getProject,
  inspect,
  normalizePlans,
  propose,
  publicOp,
  execute,
  investigate,
  proposeRepair,
  repairDeploy,
  reconcile,
  reverifyDeployment,
} from "./workflows.ts";
const app = express();
app.disable("x-powered-by");
app.set("trust proxy", false);
app.use(express.json({ limit: "150kb" }));
app.use((_req, res, next) => {
  res.set({
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Cache-Control": "no-store",
    "Content-Security-Policy":
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; frame-ancestors 'none'",
  });
  next();
});
const cookie = (req: express.Request) =>
  req.headers.cookie
    ?.split(";")
    .map((x) => x.trim())
    .find((x) => x.startsWith("hamyar="))
    ?.slice(7) || "";
const session = (req: express.Request) =>
  store.db
    .prepare("SELECT * FROM sessions WHERE id=? AND expires>?")
    .get(hash(cookie(req)), Date.now()) as any;
const attempts = new Map<string, { count: number; until: number }>();
app.get("/api/session", (req, res) => {
  const s = session(req);
  res.json({
    authenticated: !!s,
    csrf: s?.csrf,
    setupRequired: !config.ownerHash,
  });
});
app.post("/api/login", (req, res) => {
  const ip = req.socket.remoteAddress || "local";
  const a = attempts.get(ip);
  if (a && a.until > Date.now() && a.count >= 10)
    return res.status(429).json({ error: "چند دقیقه بعد دوباره تلاش کنید." });
  const password = z.string().max(200).parse(req.body.password);
  if (!config.ownerHash || !verifyPassword(password, config.ownerHash)) {
    attempts.set(ip, {
      count: a && a.until > Date.now() ? a.count + 1 : 1,
      until: Date.now() + 900000,
    });
    return res
      .status(401)
      .json({ error: "رمز ورود معتبر نیست؛ راهنمای اتصال را بررسی کنید." });
  }
  attempts.delete(ip);
  const key = token(),
    csrf = token();
  store.db
    .prepare("INSERT INTO sessions VALUES(?,?,?)")
    .run(hash(key), csrf, Date.now() + 8 * 3600000);
  res.setHeader(
    "Set-Cookie",
    `hamyar=${key}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${config.production ? "; Secure" : ""}`,
  );
  res.json({ authenticated: true, csrf });
});
app.get("/health/live", (_req, res) => res.json({ status: "ok" }));
app.use("/api", (req, res, next) => {
  const s = session(req);
  if (!s) return res.status(401).json({ error: "ابتدا وارد شوید." });
  if (req.method !== "GET" && req.headers["x-csrf-token"] !== s.csrf)
    return res.status(403).json({ error: "درخواست معتبر نیست." });
  next();
});
app.post("/api/logout", (req, res) => {
  store.db.prepare("DELETE FROM sessions WHERE id=?").run(hash(cookie(req)));
  res.setHeader(
    "Set-Cookie",
    "hamyar=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0",
  );
  res.json({ ok: true });
});
app.get("/api/status", (_req, res) =>
  res.json({
    connections: {
      liara: !!config.liaraToken && !!config.team,
      ai: !!config.aiKey && !!config.aiBase,
      github: !!config.githubToken,
      repair: !!config.repairRepo,
      envUpdate: config.envMode,
      prices: process.env.LIARA_PRICE_SCHEMA_VERIFIED === "true",
    },
    source: "live-only",
    pricing: {
      taxRate: process.env.LIARA_TAX_RATE && Number.isFinite(Number(process.env.LIARA_TAX_RATE)) && Number(process.env.LIARA_TAX_RATE) >= 0 && Number(process.env.LIARA_TAX_RATE) <= 1
        ? Number(process.env.LIARA_TAX_RATE)
        : null,
      taxSource: "برآورد نمایش‌داده‌شده در پنل لیارا؛ مبلغ نهایی با صورتحساب تعیین می‌شود.",
    },
    limitations: [
      "اتصال پیکربندی‌شده به معنی تأیید عملی نیست.",
      ...(config.envMode === "unverified" ? ["تغییر env تا تأیید قرارداد واقعی API مسدود است."] : []),
      "خرید و تغییر پلن به تأیید قرارداد قیمت، مالیات و مجوز هزینه نیاز دارد.",
      "واحد نامعلوم منابع به‌صورت درصد یا صفر نمایش داده نمی‌شود.",
    ],
  }),
);
app.get("/api/account", async (_req, res) => {
  const data = await account();
  res.json({ ...data, choices: normalizePlans(data.plans) });
});
app.get("/api/storage", async (_req, res) => res.json(await storageStatus()));
app.get("/api/projects", (_req, res) => res.json(store.list("project")));
app.post("/api/projects", (req, res) =>
  res.status(201).json(addProject(req.body)),
);
app.post("/api/projects/:id/source", (req, res) => {
  const p = getProject(String(req.params.id));
  p.ref = z.string().min(1).max(150).parse(req.body.ref);
  store.put('inspection',p.id,null);
  store.put("project", p.id, p);
  res.json(p);
});
app.get("/api/projects/:id/recommendation", async (req, res) => {
  const p = getProject(String(req.params.id));
  const data = await account();
  res.json(
    recommendPlan(store.get("inspection", p.id), normalizePlans(data.plans)),
  );
});
app.get("/api/projects/:id/inspection", async (req, res) =>
  res.json(await inspect(getProject(String(req.params.id)))),
);
app.get("/api/projects/:id/evidence", async (req, res) =>
  res.json(await evidence(getProject(String(req.params.id)).app)),
);
app.post("/api/projects/:id/proposals", async (req, res) =>
  res.json(
    publicOp(
      await propose(getProject(String(req.params.id)), req.body.kind, req.body),
    ),
  ),
);
app.post("/api/operations/:id/approve", (req, res) => {
  const op = store.approve(String(req.params.id));
  res.status(202).json(publicOp(op));
  void execute(op);
});
app.post("/api/operations/:id/reject", (req, res) =>
  res.json(publicOp(store.reject(String(req.params.id)))),
);
app.get("/api/operations", (_req, res) =>
  res.json(store.list<Operation>("operation").map(publicOp)),
);
app.post('/api/operations/:id/reverify', async (req,res) =>
  res.json(publicOp(await reverifyDeployment(String(req.params.id)))));
app.get("/api/operations/:id/events", (req, res) => {
  const id = String(req.params.id);
  if (!store.get("operation", id)) return res.sendStatus(404);
  res.set({ "Content-Type": "text/event-stream", Connection: "keep-alive" });
  res.flushHeaders();
  let last = "";
  const send = () => {
    const value = JSON.stringify(
      publicOp(store.get<Operation>("operation", id)!),
    );
    if (value !== last) {
      res.write(`event: operation\ndata: ${value}\n\n`);
      last = value;
    } else res.write(": heartbeat\n\n");
  };
  send();
  const interval = setInterval(send, 2000);
  req.on("close", () => clearInterval(interval));
});
app.post("/api/projects/:id/investigate", async (req, res) => {
  const body = z
    .object({
      path: z.string().default("/health/live"),
      method: z.enum(["GET", "POST"]).default("GET"),
      body: z.any().optional(),
    })
    .parse(req.body);
  res.json(
    await investigate(
      getProject(String(req.params.id)),
      body.path,
      body.method,
      body.body,
    ),
  );
});
app.get("/api/incidents", (_req, res) => res.json(store.list("incident")));
app.post("/api/projects/:id/repair", async (req, res) =>
  res.json(
    publicOp(
      await proposeRepair(
        getProject(String(req.params.id)),
        z.string().parse(req.body.incidentId),
      ),
    ),
  ),
);
app.post("/api/projects/:id/repair-deploy", async (req, res) =>
  res.json(
    publicOp(
      await repairDeploy(
        getProject(String(req.params.id)),
        z.string().parse(req.body.operationId),
      ),
    ),
  ),
);
app.post("/api/projects/:id/monitor", (req, res) => {
  const p = getProject(String(req.params.id));
  p.monitor = z.boolean().parse(req.body.enabled);
  if (req.body.healthPath !== undefined)
    p.healthPath = z.enum(['/health/live','/health/ready','/api/payment-status']).parse(req.body.healthPath);
  store.put("project", p.id, p);
  res.json(p);
});
app.get("/api/projects/:id/domains", async (req, res) => {
  const p = getProject(String(req.params.id));
  const data = await liara("/v1/domains");
  res.json({
    domains:
      data.domains?.filter(
        (d: any) => d.project === p.app || d.project?.project_id === p.app,
      ) || [],
    instructions:
      "رکوردهای DNS را از تنظیمات دامنه لیارا بررسی کنید. تغییر nameserver در پنل ثبت‌کننده دستی است؛ IP حدس زده نمی‌شود.",
  });
});
app.get("/api/health", (_req, res) =>
  res.json(
    store
      .list<Project>("project")
      .map((p) => ({ projectId: p.id, ...store.get("health", p.id) })),
  ),
);
app.use("/api", (_req, res) =>
  res.status(404).json({ error: "مسیر API پیدا نشد." }),
);
if (existsSync("dist/index.html")) {
  app.use(express.static("dist"));
  app.get("/{*path}", (_req, res) =>
    res.sendFile(join(process.cwd(), "dist/index.html")),
  );
} else
  app.get("/", (_req, res) =>
    res.type("text").send("Run npm run build, or open the Vite dev server."),
  );
app.use(
  (
    err: any,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    res.status(err instanceof z.ZodError ? 400 : 409).json({
      error: redact(
        err instanceof z.ZodError
          ? "اطلاعات ورودی معتبر نیست."
          : err.message || "خطای داخلی",
      ),
    });
  },
);
const monitorState = new Map<
  string,
  { failures: number; lastIncident: number; busy: boolean }
>();
const monitor = setInterval(async () => {
  for (const p of store.list<Project>("project").filter((x) => x.monitor)) {
    const state = monitorState.get(p.id) || {
      failures: 0,
      lastIncident: store.get("monitor-cooldown", p.id)?.lastIncident || 0,
      busy: false,
    };
    if (state.busy) continue;
    state.busy = true;
    monitorState.set(p.id, state);
    try {
      const check = await probe(p.url, p.healthPath);
      recordHealth(state, check.ok);
      store.put("health", p.id, check);
    } catch (e: any) {
      recordHealth(state, false);
      store.put("health", p.id, {
        ok: false,
        error: redact(e.message),
        at: Date.now(),
      });
    }
    try {
      if (claimIncident(state, Date.now())) {
        store.put("monitor-cooldown", p.id, { lastIncident: state.lastIncident });
        await investigate(p, p.healthPath);
      }
    } catch (e: any) {
      store.put("monitor-error", p.id, {
        at: Date.now(),
        error: redact(e.message),
      });
    } finally {
      state.busy = false;
    }
  }
}, 60000);
monitor.unref();
app.listen(config.port, config.host, () => {
  console.log(`Hamyar listening at http://${config.host}:${config.port}`);
  void reconcile();
});
