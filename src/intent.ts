export const diagnosticTargets = [
  { id: "checkout", label: "ثبت سفارش و تخفیف", path: "/api/checkout", method: "POST", body: { amount: 10000, user: {} } },
  { id: "payment", label: "تنظیمات پرداخت", path: "/api/payment-status", method: "GET" },
  { id: "report", label: "گزارش و زمان پاسخ", path: "/api/heavy-report", method: "GET" },
  { id: "health", label: "آمادگی سرویس", path: "/health/ready", method: "GET" },
] as const;
export type Target = typeof diagnosticTargets[number];
export type Intent = { kind: "investigate"; target: Target } | { kind: "choose" | "deploy" | "help" };

// Navigation only. The model receives evidence after the user chooses a known endpoint.
export function routeMessage(input: string): Intent {
  const text = input.normalize("NFKC").replace(/ي/g, "ی").replace(/ك/g, "ک").toLowerCase();
  const matches = [
    /checkout|سفارش|تخفیف|سبد خرید/,
    /payment|پرداخت/,
    /heavy-report|گزارش/,
    /health|سلامت|آمادگی/,
  ].map((pattern, i) => pattern.test(text) ? diagnosticTargets[i] : null).filter((x): x is Target => x !== null);
  if (matches.length > 1) return { kind: "choose" };
  if (/منتشر|دیپلوی|استقرار|deploy/.test(text)) return { kind: "deploy" };
  if (matches.length === 1) return { kind: "investigate", target: matches[0] };
  if (/500|۵۰۰|خطا|مشکل|کند|منابع|error|slow/.test(text)) return { kind: "choose" };
  return { kind: "help" };
}
