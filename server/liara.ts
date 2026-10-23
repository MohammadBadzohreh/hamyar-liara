import { config, requireConfig } from "./config.ts";
import { redact } from "./security.ts";
export async function liara(
  path: string,
  method = "GET",
  body?: any,
): Promise<any> {
  const url = new URL(path, "https://api.liara.ir");
  if (url.origin !== "https://api.liara.ir")
    throw new Error("مقصد API نامعتبر");
  url.searchParams.set("teamID", requireConfig(config.team, "شناسه تیم"));
  const headers: Record<string, string> = {
    Authorization: `Bearer ${requireConfig(config.liaraToken, "لیارا")}`,
  };
  if (body && !(body instanceof FormData))
    headers["Content-Type"] = "application/json";
  const response = await fetch(url, {
    method,
    headers,
    body:
      body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
    redirect: "error",
    signal: AbortSignal.timeout(25000),
  });
  const raw = await response.text();
  let data: any;
  try {
    data = JSON.parse(raw);
  } catch {
    data = { message: raw.slice(0, 400) };
  }
  if (!response.ok)
    throw new Error(
      `Liara ${response.status}: ${redact(data.message || "درخواست ناموفق")}`,
    );
  return data;
}
export async function account() {
  const [me, billing, apps, networks] = await Promise.allSettled([
    liara("/v1/me"),
    liara("/v1/billing"),
    liara("/v1/projects"),
    liara("/v1/networks"),
  ]);
  const val = (r: PromiseSettledResult<any>) =>
    r.status === "fulfilled"
      ? redact(r.value)
      : { unavailable: true, error: redact(r.reason.message) };
  return {
    plans: me.status === "fulfilled" ? me.value.plans : null,
    billing: val(billing),
    apps: apps.status === "fulfilled" && Array.isArray(apps.value.projects) ? apps.value.projects.map((p:any)=>({id:p._id,name:p.project_id||p.name,platform:p.platform||p.type,state:p.state||p.status,planID:p.planID,bundlePlanID:p.bundlePlanID})) : [],
    networks: val(networks),
    errors: [me, billing, apps, networks]
      .filter((r) => r.status === "rejected")
      .map((r: any) => redact(r.reason.message)),
    source: "live",
    checkedAt: Date.now(),
  };
}

/** Return only safe, user-facing storage facts for the configured assistant app. */
export async function storageStatus() {
  const app = config.liaraApp;
  if (!app)
    return {
      available: false,
      source: "not_configured",
      message: "نام برنامهٔ آنلاین دستیار تنظیم نشده است.",
    };
  try {
    const details = await liara(`/v1/projects/${encodeURIComponent(app)}`);
    const project = details?.project;
    const id = project?._id;
    if (!id)
      return {
        available: false,
        source: "live",
        app,
        message: "شناسهٔ برنامه برای خواندن دیسک دریافت نشد.",
      };
    const disks = await liara(`/v1/projects/${encodeURIComponent(id)}/disks`);
    return {
      available: true,
      source: "live",
      app,
      planID: project.planID,
      bundlePlanID: project.bundlePlanID,
      dataDir: process.env.DATA_DIR || config.dataDir,
      disks: Array.isArray(disks?.disks)
        ? disks.disks.map((d: any) => ({
            name: d.name,
            size: d.size,
            createdAt: d.createdAt,
            updatedAt: d.updatedAt,
          }))
        : [],
      mounts: Array.isArray(disks?.mounts)
        ? disks.mounts.map((m: any) => ({ name: m.name, mountedTo: m.mountedTo }))
        : [],
      persistence: "دادهٔ برنامه پس از restart روی دیسک پایدار نگه‌داری می‌شود.",
    };
  } catch (error: any) {
    return {
      available: false,
      source: "live",
      app,
      message: redact(error?.message || "خواندن دیسک ناموفق بود."),
    };
  }
}
export async function evidence(app: string, start?: number) {
  const n = encodeURIComponent(app),
    since = start ?? Math.floor(Date.now() / 1000) - 900;
  const paths = {
    logs: `/v2/projects/${n}/logs?start=${since}&direction=forward&last_lines=true`,
    events: `/v1/projects/${n}/events?start=${since}`,
    summary: `/v1/projects/${n}/metrics/summary`,
    cpu: `/v1/projects/${n}/metrics/cpu?since=${since}`,
    memory: `/v1/projects/${n}/metrics/memory?since=${since}`,
    releases: `/v1/projects/${n}/releases?page=1&count=5`,
  };
  const data = await Promise.all(
    Object.entries(paths).map(async ([key, path]) => {
      try {
        return [
          key,
          { available: true, value: redact(await liara(path)), at: Date.now() },
        ];
      } catch (e: any) {
        return [
          key,
          { available: false, error: redact(e.message), at: Date.now() },
        ];
      }
    }),
  );
  return Object.fromEntries(data);
}
