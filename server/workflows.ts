import { randomUUID } from "node:crypto";
import { hourlyWithTax } from "./pricing.ts";
import { z } from "zod";
import { createPatch } from "diff";
import { store, type Project, type Operation } from "./store.ts";
import { config } from "./config.ts";
import { hash, canonical, redact, seal, unseal } from "./security.ts";
import { liara, evidence } from "./liara.ts";
import { remainingBuildLogs } from "./build-logs.ts";
import { prepareArtifact, cleanupArtifact } from "./artifact.ts";
import {
  parseRepo,
  resolveCommit,
  fileAt,
  createRepairCommit,
  checkTests,
  verifyTestContract,
} from "./github.ts";
import { probe } from "./probe.ts";
import { analyze, repair } from "./ai.ts";
import {
  assertHTTP,
  sampleChecks,
  expectedCheckout,
  hasVerifiedRepair,
  type Check,
} from "./verification.ts";
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
export const projectSchema = z.object({
  name: z.string().min(1).max(60),
  repo: z.string().url(),
  ref: z.string().max(150).default("HEAD"),
  app: z.string().regex(/^[a-z][a-z0-9-]{2,40}$/),
  port: z.number().int().min(1).max(65535).default(3100),
});
export function publicOp(op: Operation) {
  const { sealedEnvs, ...parameters } = op.parameters || {};
  return {
    ...op,
    parameters: redact(parameters),
    proposal: redact(op.proposal),
    events: redact(op.events),
  };
}
export function addProject(input: any) {
  const x = projectSchema.parse(input);
  parseRepo(x.repo);
  if (store.list<Project>("project").some((p) => p.app === x.app))
    throw new Error("این برنامه قبلاً ثبت شده است.");
  const p: Project = {
    ...x,
    id: randomUUID(),
    url: `https://${x.app}.liara.run`,
    healthPath: "/health/live",
    monitor: false,
  };
  return store.put("project", p.id, p);
}
export function getProject(id: string) {
  const p = store.get<Project>("project", id);
  if (!p) throw new Error("پروژه پیدا نشد.");
  return p;
}
export async function inspect(p: Project) {
  const repo = parseRepo(p.repo),
    sha = await resolveCommit(repo, p.ref);
  const artifact = await prepareArtifact(repo, sha);
  try {
    const result = {
      repo,
      sha,
      checksum: artifact.checksum,
      size: artifact.size,
      name: artifact.pkg.name,
      start: artifact.pkg.scripts.start,
      node: artifact.pkg.engines?.node || "اعلام نشده",
      dependencies: Object.keys(artifact.pkg.dependencies || {}),
      limitations: [
        "مصرف واقعی منابع پس از استقرار اندازه‌گیری می‌شود.",
        "تنها پروژه Node.js با package.json در ریشه پشتیبانی می‌شود.",
      ],
    };
    store.put("inspection", p.id, result);
    return result;
  } finally {
    await cleanupArtifact(artifact.dir);
  }
}
export function normalizePlans(plans: any) {
  if (!plans?.projects) return [];
  return Object.entries(plans.projects).flatMap(([id, p]: [string, any]) =>
    p.available
      ? Object.entries(plans.projectBundlePlans?.[id] || {})
          .filter(([, b]: any) => b.available)
          .map(([bundleId, b]: [string, any]) => ({
            planID: id,
            bundlePlanID: bundleId,
            ram: p.RAM,
            cpu: p.CPU,
            disk: p.volume,
            resourceHourly: p.price,
            resourceMonthly: p.displayPrice,
            bundleHourly: b.price,
            bundleMonthly: b.displayPrice,
            retentionDays: b.maxLogsRetention,
            verified: process.env.LIARA_PRICE_SCHEMA_VERIFIED === "true",
          }))
      : [],
  );
}
async function quote(planID: string, bundlePlanID: string) {
  const [me, billing] = await Promise.all([
    liara("/v1/me"),
    liara("/v1/billing"),
  ]);
  const plan = normalizePlans(me.plans).find(
    (x) => x.planID === planID && x.bundlePlanID === bundlePlanID,
  );
  if (!plan) throw new Error("پلن یا بسته انتخاب‌شده موجود نیست.");
  if (!plan.verified)
    throw new Error(
      "قرارداد واحد و ترکیب قیمت هنوز روی حساب تأیید نشده؛ ساخت/تغییر پلن مسدود است.",
    );
  const balanceField = process.env.LIARA_BALANCE_FIELD || "";
  const balance = balanceField
    ? balanceField.split(".").reduce((a: any, k) => a?.[k], billing)
    : undefined;
  if (typeof balance !== "number" || !Number.isFinite(balance) || balance <= 0)
    throw new Error("فیلد موجودی معتبر و مثبت هنوز تأیید نشده است.");
  if (
    !Number.isFinite(plan.resourceHourly) || plan.resourceHourly < 0 ||
    !Number.isFinite(plan.bundleHourly) || plan.bundleHourly < 0
  )
    throw new Error("قیمت معتبر نیست.");
  const taxValue=process.env.LIARA_TAX_RATE;
  const taxRate=Number(taxValue);
  if(!taxValue||!Number.isFinite(taxRate)||taxRate<0||taxRate>1)throw new Error('نرخ مالیات حساب هنوز تأیید نشده است.');
  const hourly = hourlyWithTax(plan.resourceHourly, plan.bundleHourly, taxRate);
  return {
    plan,
    hourly,
    daily: hourly * 24,
    balance,
    currency: "تومان",
    taxRate,
    tax: "برآورد شامل مالیات تأییدشده است؛ مصرف واقعی و اقلام اضافی در صورتحساب تعیین می‌شوند.",
    fingerprint: hash(canonical({plan,taxRate})),
  };
}
export async function propose(p: Project, kind: string, input: any) {
  let parameters: any = { team: config.team, app: p.app },
    proposal: any;
  if (["deploy", "create-deploy"].includes(kind)) {
    const review = await inspect(p);
    let q;
    if (kind === "create-deploy")
      q = await quote(
        z.string().parse(input.planID),
        z.string().parse(input.bundlePlanID),
      );
    const envs = z
      .record(z.string().regex(/^[A-Z_][A-Z0-9_]*$/), z.string().max(4000))
      .parse(input.envs || {});
    if (Object.keys(envs).length && config.envMode === "unverified")
      throw new Error("قرارداد update-envs هنوز تأیید نشده است.");
    parameters = {
      ...parameters,
      sha: review.sha,
      checksum: review.checksum,
      repo: parseRepo(p.repo),
      planID: input.planID,
      bundlePlanID: input.bundlePlanID,
      network: input.network || undefined,
      port: p.port,
      quote: q,
      envKeys: Object.keys(envs),
      sealedEnvs: Object.keys(envs).length ? seal(envs) : undefined,
    };
    proposal = {
      title:
        kind === "create-deploy" ? "ساخت برنامه و انتشار" : "انتشار نسخه جدید",
      description:
        "کد این commit همراه فایل hamyar-build.json شامل شناسه نسخه بسته‌بندی می‌شود؛ برای نمونه، پاسخ HTTP نیز باید همین شناسه را برگرداند.",
      sha: review.sha,
      quote: q,
      envKeys: Object.keys(envs),
      risk: "ممکن است سرویس در زمان انتشار موقتاً قطع شود.",
    };
  } else if (kind === "env") {
    if (config.envMode === "unverified")
      throw new Error(
        "ابتدا رفتار merge/replace متغیرهای محیطی را تأیید کنید.",
      );
    const envs = z
      .record(z.string().regex(/^[A-Z_][A-Z0-9_]*$/), z.string().max(4000))
      .parse(input.envs);
    if (!Object.keys(envs).length) throw new Error("تغییری وارد نشده است.");
    parameters = {
      ...parameters,
      sealedEnvs: seal(envs),
      envKeys: Object.keys(envs),
      verifyPath:
        input.verifyPath === "/api/payment-status"
          ? input.verifyPath
          : p.healthPath,
    };
    if (input.incidentId) {
      const incident = store.get("incident", z.string().parse(input.incidentId));
      if (!incident || incident.projectId !== p.id || incident.analysis?.category !== "configuration")
        throw new Error("حادثه تنظیمات معتبر نیست.");
      parameters.incidentId = incident.id;
    }
    proposal = {
      title: "اصلاح تنظیمات",
      envKeys: Object.keys(envs),
      risk: "تنظیمات ممکن است باعث راه‌اندازی مجدد برنامه شوند. سایر متغیرها حفظ می‌شوند.",
    };
  } else if (kind === "restore") {
    if (!p.lastGoodCommit) throw new Error("نسخه سالم ثبت‌شده‌ای موجود نیست.");
    parameters = {
      ...parameters,
      repo: parseRepo(p.repo),
      sha: p.lastGoodCommit,
    };
    proposal = {
      title: "انتشار مجدد نسخه سالم",
      sha: p.lastGoodCommit,
      risk: "فقط کد بازیابی می‌شود؛ تنظیمات و دیتابیس rollback نمی‌شوند.",
    };
  } else if (kind === "restart") {
    proposal = {
      title: "راه‌اندازی مجدد",
      risk: "وقفه کوتاه در سرویس محتمل است.",
    };
  } else if (kind === "resize") {
    const q = await quote(input.planID, input.bundlePlanID);
    const detail = await liara(`/v1/projects/${p.app}`);
    if (detail.project?.bundlePlanID !== input.bundlePlanID)
      throw new Error(
        "تغییر بسته امکانات از مسیر resize تأیید نشده است؛ همان بسته جاری را انتخاب کنید.",
      );
    parameters = {
      ...parameters,
      planID: input.planID,
      bundlePlanID: input.bundlePlanID,
      quote: q,
    };
    proposal = {
      title: "تغییر منابع",
      quote: q,
      risk: "هزینه و منابع تغییر می‌کند؛ وقفه محتمل است.",
    };
  } else if (kind === "demo") {
    if (parseRepo(p.repo) !== config.repairRepo || !config.demoToken)
      throw new Error("سناریوی دمو فقط برای مخزن نمونه تنظیم‌شده مجاز است.");
    parameters = {
      ...parameters,
      scenario: z.enum(["resources", "reset"]).parse(input.scenario),
    };
    proposal = {
      title: "اجرای سناریوی آزمایشی",
      description:
        "بار محدود ۶۰ ثانیه‌ای؛ تا ۵۰ MiB حافظه و ۲۰۰ms CPU در هر درخواست.",
      risk: "فقط سایت نمونه؛ کندی موقت ایجاد می‌کند.",
    };
  } else if (kind === "domain") {
    const domain = z
      .string()
      .regex(
        /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/,
      )
      .parse(input.domain);
    parameters = { ...parameters, domain };
    proposal = {
      title: "افزودن دامنه",
      description: `اتصال ${domain} به ${p.app}. تنظیم DNS نزد ثبت‌کننده ممکن است دستی باشد.`,
      risk: "DNS فعلی خودکار تغییر نمی‌کند.",
    };
  } else if (kind === "ssl") {
    parameters = {
      ...parameters,
      domainId: z.string().min(1).max(100).parse(input.domainId),
    };
    proposal = {
      title: "درخواست SSL",
      risk: "تنها پس از بررسی مالکیت و اتصال دامنه.",
    };
  } else throw new Error("عملیات پشتیبانی نمی‌شود.");
  return store.operation(p.id, kind, parameters, proposal);
}
async function updateEnvs(p: Project, envs: Record<string, string>) {
  if (!["merge", "replace", "full-list-verified"].includes(config.envMode))
    throw new Error("رفتار env تأیید نشده است.");
  const detail = await liara(`/v1/projects/${p.app}`);
  const before = detail.project?.envs;
  if (!Array.isArray(before))
    throw new Error("دریافت تنظیمات فعلی ناموفق بود.");
  const map = new Map<string, string>();
  for (const e of before) {
    if (typeof e.key !== "string" || typeof e.value !== "string" || e.encrypted)
      throw new Error(
        "مقادیر فعلی به‌صورت قابل بازیابی موجود نیستند؛ از بازنویسی جلوگیری شد.",
      );
    map.set(e.key, e.value);
  }
  for (const [k, v] of Object.entries(envs)) map.set(k, v);
  await liara("/v1/projects/update-envs", "POST", {
    project: p.app,
    variables: [...map].map(([key, value]) => ({ key, value })),
  });
  const after = (await liara(`/v1/projects/${p.app}`)).project?.envs;
  if (!Array.isArray(after) || [...map].some(([key, value]) =>
    !after.some((e: any) => e.key === key && e.value === value)))
    throw new Error("تنظیمات پس از ذخیره با مقادیر مورد انتظار مطابقت ندارد؛ تکرار خودکار متوقف شد.");
}
export async function verify(p: Project, path = p.healthPath) {
  return verifyCheck(p, { path });
}
async function verifyCheck(p: Project, check: Check) {
  const results = [];
  for (let i = 0; i < 3; i++) {
    if (i) await pause(1500);
    results.push(
      assertHTTP(
        await probe(p.url, check.path, check.method || "GET", check.body),
        check,
      ),
    );
  }
  return results;
}
async function verifySettled(p: Project, check: Check) {
  // Read-only retries accommodate the asynchronous provider rollout; writes are never retried.
  let last: unknown;
  for (let attempt = 0; attempt < 20; attempt++) {
    try { return await verifyCheck(p, check); }
    catch (error) { last = error; }
    await pause(3000);
  }
  throw last || new Error("بررسی پس از اعمال تغییر ناموفق بود.");
}
async function verifyRelease(p: Project, op: Operation) {
  const sample = parseRepo(p.repo) === config.repairRepo;
  const commit = sample ? op.parameters.sha : undefined;
  const active = async () => {
    const releases = await liara(`/v1/projects/${p.app}/releases?page=1&count=5`);
    if (releases.currentRelease !== op.parameters.releaseID)
      throw new Error("انتشار فعال با نسخه مورد بررسی یکسان نیست.");
  };
  await active();
  const checks = await verifySettled(p, { path: p.healthPath, commit });
  const functional = [];
  if (op.parameters.incidentId) {
    const incident = store.get("incident", op.parameters.incidentId);
    if (!incident || incident.projectId !== p.id)
      throw new Error("حادثه اصلی پیدا نشد.");
    functional.push(
      ...(await verifySettled(p, {
        path: incident.path,
        method: incident.method,
        body: incident.body,
        commit,
        expected:
          incident.path === "/api/checkout"
            ? expectedCheckout(incident.body)
            : undefined,
      })),
    );
  }
  if (sample)
    for (const check of sampleChecks.slice(1))
      functional.push(...(await verifySettled(p, { ...check, commit })));
  await active();
  return { checks, functional };
}
export async function reverifyDeployment(id: string) {
  const op = store.get<Operation>('operation', id);
  if (!op || !['deploy','repair-deploy','restore','create-deploy'].includes(op.kind) ||
      !op.parameters.releaseID || !['failed','needs_review'].includes(op.status))
    throw new Error('این عملیات قابل بررسی مجدد نیست.');
  const p = getProject(op.projectId);
  if (store.list<Operation>('operation').some(x=>x.projectId===p.id&&x.status==='running'))
    throw new Error('عملیات دیگری در حال اجراست.');
  const assertActive = async () => {
    const releases = await liara(`/v1/projects/${p.app}/releases?page=1&count=5`);
    if (releases.currentRelease !== op.parameters.releaseID)
      throw new Error('انتشار فعال با این عملیات یکسان نیست.');
  };
  await assertActive();
  const verification = await verifyRelease(p, op);
  await assertActive();
  store.event(op.id,'بررسی مجدد انتشار فعال بدون انتشار یا اجرای دوباره', {previousError:op.error});
  p.currentCommit=op.parameters.sha;p.lastGoodCommit=op.parameters.sha;
  store.put('project',p.id,p);
  if(op.parameters.incidentId){
    const incident=store.get('incident',op.parameters.incidentId);
    incident.status='resolved';incident.resolution={operationId:op.id,at:Date.now(),verification};
    store.put('incident',incident.id,incident);
  }
  return store.finish(op.id,'succeeded',{releaseID:op.parameters.releaseID,commit:op.parameters.sha,...verification,reverified:true});
}
async function deploy(p: Project, op: Operation) {
  const a = await prepareArtifact(op.parameters.repo, op.parameters.sha);
  try {
    if (op.parameters.checksum && a.checksum !== op.parameters.checksum)
      throw new Error("آرشیو با نسخه تأییدشده یکسان نیست.");
    store.event(op.id, "سورس آماده شد", { commit: a.sha, size: a.size });
    const form = new FormData();
    form.set("file", new Blob([new Uint8Array(a.bytes)], { type: "application/gzip" }), "source.tar.gz");
    const source = await liara(`/v2/projects/${p.app}/sources`, "POST", form);
    if (!source.sourceID) throw new Error("sourceID دریافت نشد.");
    const release = await liara(`/v2/projects/${p.app}/releases`, "POST", {
      sourceID: source.sourceID,
      port: p.port,
      type: "node",
      message: `hamyar ${op.id} ${a.sha.slice(0, 7)}`,
    });
    if (!release.releaseID) throw new Error("releaseID دریافت نشد.");
    store.event(op.id, "انتشار ساخته شد", {
      releaseID: release.releaseID,
      sha: a.sha,
    });
    const current = store.get<Operation>("operation", op.id)!;
    current.parameters.releaseID = release.releaseID;
    op.parameters.releaseID = release.releaseID;
    store.put("operation", op.id, current);
    let cursor = "";
    let ready = false;
    for (let i = 0; i < 120; i++) {
      const data = await liara(
        `/v2/releases/${release.releaseID}/build-logs${cursor ? "?since=" + encodeURIComponent(cursor) : ""}`,
      );
      if (data.buildOutput?.length) {
        store.event(op.id, "خروجی ساخت", data.buildOutput.slice(-15));
        cursor = data.buildOutput.at(-1).createdAt;
      }
      const state = data.release?.state;
      if (state === "READY") {
        ready = true;
        break;
      }
      if (["FAILED", "UNHEALTHY", "CANCELED", "TIMEDOUT"].includes(state)) {
        let tail: any[] = [];
        try { tail = await remainingBuildLogs(release.releaseID, cursor); }
        catch { store.event(op.id, 'دریافت ادامه لاگ شکست ممکن نشد؛ وضعیت انتشار همچنان ناموفق است.'); }
        if(tail.length)store.event(op.id,'ادامه لاگ شکست ساخت',tail);
        const failure = [...(data.buildOutput || []), ...tail].filter((x:any)=>x.stream==='STDERR'||/npm error|error:|Error:/i.test(x.line||'')).at(-1);
        const reason=String(data.release?.failReason||failure?.line||'').replace(/\x1b\[[0-9;]*m/g,'').slice(0,500);
        throw new Error(`انتشار ناموفق: ${state}${reason?' — '+reason:''}`);
      }
      await pause(3000);
    }
    if (!ready)
      throw new Error(
        "زمان انتظار انتشار تمام شد؛ وضعیت باید دوباره بررسی شود.",
      );
    p.currentCommit = a.sha;
    store.put("project", p.id, p);
    const verification = await verifyRelease(p, op);
    p.lastGoodCommit = a.sha;
    store.put("project", p.id, p);
    if (op.parameters.incidentId) {
      const incident = store.get("incident", op.parameters.incidentId);
      incident.status = "resolved";
      incident.resolution = {
        operationId: op.id,
        at: Date.now(),
        verification,
      };
      store.put("incident", incident.id, incident);
    }
    return {
      releaseID: release.releaseID,
      commit: a.sha,
      ...verification,
      afterEvidence: await evidence(p.app, Math.floor(op.createdAt / 1000)),
    };
  } finally {
    await cleanupArtifact(a.dir);
  }
}
export async function execute(op: Operation) {
  const p = getProject(op.projectId);
  try {
    store.event(op.id, "تأیید ثبت شد؛ عملیات آغاز شد");
    if (op.parameters.team !== config.team || op.parameters.app !== p.app)
      throw new Error("مقصد عملیات تغییر کرده است.");
    let result: any;
    if (op.kind === "create-deploy") {
      const q = await quote(op.parameters.planID, op.parameters.bundlePlanID);
      if (q.fingerprint !== op.parameters.quote.fingerprint)
        throw new Error("قیمت تغییر کرده؛ پیشنهاد تازه لازم است.");
      await liara("/v1/projects", "POST", {
        name: p.app,
        platform: "node",
        planID: op.parameters.planID,
        bundlePlanID: op.parameters.bundlePlanID,
        network: op.parameters.network,
      });
      store.event(op.id, "برنامه ساخته شد");
    }
    if (
      ["deploy", "create-deploy", "repair-deploy", "restore"].includes(op.kind)
    ) {
      if (op.kind === "repair-deploy") {
        if (p.currentCommit !== op.parameters.base)
          throw new Error("نسخه سایت تغییر کرده؛ بررسی تازه لازم است.");
        await verifyTestContract(op.parameters.repo, op.parameters.sha);
        const tested = store.get<Operation>("operation", op.parameters.testOperationId);
        if (!hasVerifiedRepair(tested, p.id, op.parameters.repo, op.parameters.sha))
          throw new Error("نتیجه موفق تستِ همین commit و مخزن ثبت نشده است.");
      }
      if (op.parameters.sealedEnvs)
        await updateEnvs(p, unseal(op.parameters.sealedEnvs));
      result = await deploy(p, op);
    } else if (op.kind === "env") {
      const changes = unseal(op.parameters.sealedEnvs);
      await updateEnvs(p, changes);
      store.event(op.id, "تنظیمات ثبت شد؛ در انتظار بررسی");
      await pause(15000);
      if (parseRepo(p.repo) === config.repairRepo &&
          changes.DEMO_PAYMENT_MODE !== undefined && changes.DEMO_PAYMENT_MODE !== "sandbox") {
        // A healthy response from the old process must not validate an invalid payment configuration.
        for (let i = 0; i < 25; i++) {
          const response = await probe(p.url, "/api/payment-status");
          if (response.status === 500) break;
          await pause(2000);
        }
        throw new Error("تنظیم ذخیره شد اما حالت پرداخت معتبر نیست؛ سناریوی خطا سالم گزارش نمی‌شود.");
      }
      result = {
        checks: await verifySettled(p, {
          path: op.parameters.verifyPath,
          expected: op.parameters.verifyPath === "/api/payment-status" && changes.DEMO_PAYMENT_MODE === "sandbox"
            ? { mode: "sandbox", realPayments: false } : undefined,
        }),
        evidence: await evidence(p.app, Math.floor(op.createdAt / 1000)),
      };
      if (op.parameters.incidentId) {
        const incident = store.get("incident", op.parameters.incidentId);
        incident.status = "resolved";
        incident.resolution = { operationId: op.id, at: Date.now(), verification: result.checks };
        store.put("incident", incident.id, incident);
      }
    } else if (op.kind === "restart") {
      await liara(`/v1/projects/${p.app}/actions/restart`, "POST");
      await pause(15000);
      result = { checks: await verifySettled(p, { path: p.healthPath }) };
    } else if (op.kind === "resize") {
      const q = await quote(op.parameters.planID, op.parameters.bundlePlanID);
      if (q.fingerprint !== op.parameters.quote.fingerprint)
        throw new Error("قیمت تغییر کرده است.");
      await liara(`/v1/projects/${p.app}/resize`, "POST", {
        planID: op.parameters.planID,
      });
      result = { checks: await verify(p) };
    } else if (op.kind === "demo") {
      result = await probe(
        p.url,
        op.parameters.scenario === "reset"
          ? "/__demo/reset"
          : "/__demo/scenario",
        "POST",
        { scenario: op.parameters.scenario },
        { Authorization: `Bearer ${config.demoToken}` },
      );
      if (!result.ok) throw new Error("سناریوی آزمایشی فعال نشد.");
    } else if (op.kind === "domain") {
      result = await liara("/v1/domains", "POST", {
        name: op.parameters.domain,
        project: p.app,
        type: "PROJECT",
      });
    } else if (op.kind === "ssl") {
      const domains = await liara("/v1/domains");
      const d = domains.domains?.find(
        (x: any) =>
          x._id === op.parameters.domainId &&
          (x.project === p.app || x.project?.project_id === p.app),
      );
      if (!d) throw new Error("مالکیت دامنه برای پروژه تأیید نشد.");
      result = await liara("/v1/domains/provision-ssl-certs", "POST", {
        domain: op.parameters.domainId,
      });
    } else if (op.kind === "repair-test") {
      if (op.parameters.repo !== config.repairRepo)
        throw new Error("مخزن اصلاح مجاز نیست.");
      await verifyTestContract(op.parameters.repo, op.parameters.base);
      const created = await createRepairCommit(
        op.parameters.repo,
        op.parameters.base,
        "src/checkout.mjs",
        op.parameters.content,
        op.id,
      );
      store.event(op.id, "شاخه اصلاح ساخته شد", created);
      const checkpoint = store.get<Operation>("operation", op.id)!;
      checkpoint.result = created;
      store.put("operation", op.id, checkpoint);
      let checks: any;
      const testDeadline = Date.now() + 180000;
      for (let i = 0; i < 36 && Date.now() < testDeadline; i++) {
        checks = await checkTests(op.parameters.repo, created.sha);
        if (checks.status === "completed" || checks.rejected) break;
        await pause(5000);
      }
      result = { ...created, tests: checks };
      if (!checks?.verified) {
        if (checks?.status === "not_started") store.event(op.id, checks.message);
        store.finish(
          op.id,
          checks?.status === "completed" || checks?.rejected ? "failed_tests" : "waiting_tests",
          result,
        );
        return;
      }
    }
    store.event(op.id, "عملیات و بررسی نتیجه پایان یافت");
    store.finish(op.id, "succeeded", result);
  } catch (e: any) {
    store.event(op.id, "عملیات متوقف شد", e.message);
    store.finish(
      op.id,
      /timeout|fetch failed|network|زمان انتظار انتشار/i.test(e.message)
        ? "needs_review"
        : "failed",
      store.get<Operation>("operation", op.id)?.result,
      e.message,
    );
  }
}
const analyses = new Map<string, Promise<any>>();
export function investigate(
  p: Project,
  path: string,
  method = "GET",
  body?: any,
) {
  if (analyses.has(p.id))
    throw new Error("یک بررسی برای این پروژه در حال اجراست.");
  const task = collectIncident(p, path, method, body).finally(() =>
    analyses.delete(p.id),
  );
  analyses.set(p.id, task);
  return task;
}
async function collectIncident(
  p: Project,
  path: string,
  method = "GET",
  body?: any,
) {
  if (
    ![
      "/health/live",
      "/health/ready",
      "/api/payment-status",
      "/api/checkout",
      "/api/heavy-report",
    ].includes(path)
  )
    throw new Error("مسیر بررسی مجاز نیست.");
  let http: any;
  try {
    http = await probe(p.url, path, method, body);
  } catch (e: any) {
    http = { available: false, error: e.message, at: Date.now() };
  }
  const ev = await evidence(p.app);
  const incident: any = {
    id: randomUUID(),
    projectId: p.id,
    at: Date.now(),
    path,
    method,
    body,
    source: "live",
    evidence: redact({ http, ...ev, units: { cpu: config.metricCpuUnit, memory: config.metricMemoryUnit, source: config.metricUnitSource, verified: config.metricUnitSource === 'provider-confirmed' } }),
    units: { cpu: config.metricCpuUnit, memory: config.metricMemoryUnit, source: config.metricUnitSource, verified: config.metricUnitSource === 'provider-confirmed' },
    status: "collected",
  };
  try {
    incident.analysis = await analyze(incident.evidence);
    incident.status = "analyzed";
  } catch (e: any) {
    incident.analysisError = redact(e.message);
  }
  store.put("incident", incident.id, incident);
  return incident;
}
export async function proposeRepair(p: Project, incidentId: string) {
  const incident = store.get("incident", incidentId);
  if (!incident || incident.projectId !== p.id)
    throw new Error("حادثه معتبر نیست.");
  if (
    incident.path !== "/api/checkout" ||
    incident.analysis?.category !== "code"
  )
    throw new Error("اصلاح کد تنها برای باگ تشخیص‌داده‌شده checkout مجاز است.");
  const repo = parseRepo(p.repo);
  if (repo !== config.repairRepo)
    throw new Error("اصلاح فقط برای مخزن نمونه مجاز است.");
  if (!p.currentCommit) throw new Error("commit مستقرشده مشخص نیست.");
  await verifyTestContract(repo, p.currentCommit);
  const original = await fileAt(repo, p.currentCommit, "src/checkout.mjs");
  const acceptanceTests = await fileAt(repo, p.currentCommit, "test/checkout.test.mjs");
  const previous = store.list<Operation>("operation").find(
    (op) => op.projectId === p.id && op.kind === "repair-test" &&
      op.parameters.base === p.currentCommit && op.status === "failed_tests",
  );
  const suggestion = await repair({
    source: original,
    evidence: incident.evidence,
    acceptanceTests,
    previousAttempt: previous ? {
      content: previous.parameters.content,
      conclusion: previous.result?.tests?.conclusion,
      instruction: "This previous proposal failed the immutable acceptance suite. Recheck every required behavior.",
    } : undefined,
  });
  if (
    /\b(?:import|require|process|fetch|eval|Function|WebSocket)\b/.test(
      suggestion.content,
    )
  )
    throw new Error("پیشنهاد خارج از دامنه اصلاح محدود است.");
  const diff = createPatch("src/checkout.mjs", original, suggestion.content);
  if (suggestion.content === original)
    throw new Error("پیشنهاد هیچ تغییری ندارد.");
  return store.operation(
    p.id,
    "repair-test",
    {
      team: config.team,
      app: p.app,
      repo,
      base: p.currentCommit,
      content: suggestion.content,
      incidentId,
    },
    {
      title: "بازبینی اصلاح کد",
      description: suggestion.explanation,
      diff,
      risk: "پس از تأیید، شاخه جدا ساخته و تست می‌شود؛ انتشار تأیید جدا دارد.",
    },
  );
}
export async function repairDeploy(p: Project, id: string) {
  const op = store.get<Operation>("operation", id);
  if (
    !op ||
    op.projectId !== p.id ||
    op.kind !== "repair-test" ||
    !op.result?.sha
  )
    throw new Error("اصلاح قابل انتشار نیست.");
  if (p.currentCommit !== op.parameters.base)
    throw new Error("نسخه سایت تغییر کرده؛ بررسی تازه لازم است.");
  await verifyTestContract(op.parameters.repo, op.result.sha);
  const checks = hasVerifiedRepair(op, p.id, op.parameters.repo, op.result.sha)
    ? op.result.tests : await checkTests(op.parameters.repo, op.result.sha);
  if (!checks.verified) throw new Error(`تست همان commit هنوز موفق نیست: ${'message' in checks ? checks.message : checks.status} / ${'conclusion' in checks ? checks.conclusion : 'unknown'} (${op.result.sha}).`);
  if (!hasVerifiedRepair(op, p.id, op.parameters.repo, op.result.sha))
    store.finish(op.id, "succeeded", { ...op.result, tests: checks });
  return store.operation(
    p.id,
    "repair-deploy",
    {
      team: config.team,
      app: p.app,
      repo: op.parameters.repo,
      sha: op.result.sha,
      base: op.parameters.base,
      incidentId: op.parameters.incidentId,
      testOperationId: op.id,
    },
    {
      title: "انتشار اصلاح تست‌شده",
      sha: op.result.sha,
      tests: checks,
      risk: "نسخه سرویس عوض می‌شود.",
    },
  );
}
export async function reconcile() {
  for (const op of store
    .list<Operation>("operation")
    .filter((o) => o.status === "running")) {
    try {
      if (op.kind === "repair-test" && op.result?.sha) {
        const tests = await checkTests(op.parameters.repo, op.result.sha);
        store.finish(op.id, tests.verified ? "succeeded" :
          tests.rejected || tests.status === "completed" ? "failed_tests" : "waiting_tests",
          { ...op.result, tests, reconciled: true });
        continue;
      }
      if (op.parameters.releaseID) {
        const data = await liara(
          `/v2/releases/${op.parameters.releaseID}/build-logs`,
        );
        store.event(op.id, "وضعیت پس از راه‌اندازی مجدد بررسی شد", {
          state: data.release?.state,
        });
        if (data.release?.state === "READY") {
          const project = getProject(op.projectId);
          project.currentCommit = op.parameters.sha;
          store.put("project", project.id, project);
          const verification = await verifyRelease(project, op);
          project.lastGoodCommit = op.parameters.sha;
          store.put("project", project.id, project);
          store.finish(op.id, "succeeded", {
            releaseID: op.parameters.releaseID,
            ...verification,
            reconciled: true,
          });
          continue;
        }
      }
      store.finish(
        op.id,
        "needs_review",
        op.result,
        "اجرای قبلی قطع شده است؛ عملیات بدون تطبیق دوباره اجرا نمی‌شود.",
      );
    } catch {
      store.finish(
        op.id,
        "needs_review",
        op.result,
        "دریافت وضعیت خارجی ممکن نشد.",
      );
    }
  }
}
