import "dotenv/config";
import { resolve } from "node:path";
export const config = {
  port: Number(process.env.PORT || 3000),
  host: process.env.HOST || "127.0.0.1",
  production: process.env.NODE_ENV === "production",
  dataDir: resolve(process.env.DATA_DIR || ".local/data"),
  ownerHash: process.env.OWNER_PASSWORD_HASH || "",
  liaraToken: process.env.LIARA_API_TOKEN || "",
  team: process.env.LIARA_TEAM_ID || "",
  liaraApp: process.env.LIARA_APP_NAME || "",
  aiKey: process.env.AI_API_KEY || "",
  aiBase: process.env.AI_BASE_URL || "",
  aiModel: process.env.AI_MODEL || "google/gemini-2.5-flash",
  repairModel: process.env.AI_REPAIR_MODEL || "google/gemini-2.5-pro",
  githubToken: process.env.GITHUB_TOKEN || "",
  repairRepo: process.env.REPAIR_REPOSITORY || "",
  workflow: process.env.REPAIR_WORKFLOW || "acceptance.yml",
  demoToken: process.env.DEMO_TOKEN || "",
  envMode: process.env.LIARA_ENV_UPDATE_MODE || "unverified",
  metricCpuUnit: process.env.LIARA_CPU_UNIT || "unknown",
  metricMemoryUnit: process.env.LIARA_MEMORY_UNIT || "unknown",
  metricUnitSource: process.env.LIARA_METRIC_UNIT_SOURCE || "unverified",
};
export function requireConfig(value: string, name: string) {
  if (!value) throw new Error(`اتصال ${name} هنوز تنظیم نشده است.`);
  return value;
}
