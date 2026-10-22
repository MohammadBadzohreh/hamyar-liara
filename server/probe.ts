import https from "node:https";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
export function publicIPv4(ip: string) {
  if (isIP(ip) !== 4) return false;
  const [a, b, c] = ip.split(".").map(Number);
  return !(
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 168 || b === 0 || (b === 88 && c === 99))) ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
    (a === 203 && b === 0 && c === 113)
  );
}
export function probeURL(base: string, path: string) {
  const u = new URL(base);
  if (
    u.protocol !== "https:" ||
    u.username ||
    u.password ||
    (u.port && u.port !== "443")
  )
    throw new Error("فقط HTTPS عمومی مجاز است.");
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\"))
    throw new Error("مسیر نامعتبر");
  const target = new URL(path, u);
  if (target.origin !== u.origin) throw new Error("مقصد probe تغییر کرده است.");
  return target;
}
export async function probe(
  base: string,
  path: string,
  method = "GET",
  body?: any,
  extraHeaders: Record<string, string> = {},
) {
  const u = probeURL(base, path);
  const addresses = await lookup(u.hostname, { all: true, family: 4 });
  if (!addresses.length || addresses.some((x) => !publicIPv4(x.address)))
    throw new Error("آدرس داخلی یا رزروشده برای بررسی مجاز نیست.");
  const address = addresses[0].address;
  const started = Date.now();
  return new Promise<any>((resolve, reject) => {
    const request = https.request(
      u,
      {
        method,
        headers: {
          ...extraHeaders,
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        lookup: ((_host: any, opts: any, cb: any) =>
          opts?.all
            ? cb(null, [{ address, family: 4 }])
            : cb(null, address, 4)) as any,
      },
      (res) => {
        let text = "";
        let size = 0;
        res.on("data", (chunk) => {
          size += chunk.length;
          if (size > 64000) {
            request.destroy(new Error("پاسخ بیش از حد مجاز"));
            return;
          }
          text += chunk;
        });
        res.on("end", () =>
          resolve({
            status: res.statusCode,
            commit: res.headers["x-hamyar-commit"],
            ok: res.statusCode! >= 200 && res.statusCode! < 300,
            latencyMs: Date.now() - started,
            body: text,
            at: Date.now(),
            url: u.toString(),
          }),
        );
      },
    );
    request.setTimeout(10000, () =>
      request.destroy(new Error("زمان بررسی HTTP تمام شد")),
    );
    request.on("error", reject);
    if (body) request.write(JSON.stringify(body));
    request.end();
  });
}
