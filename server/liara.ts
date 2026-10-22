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
