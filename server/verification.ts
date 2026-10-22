export type Check = {
  path: string;
  method?: string;
  body?: unknown;
  expected?: Record<string, unknown>;
  commit?: string;
};
export function hasVerifiedRepair(op: any, projectId: string, repo: string, sha: string) {
  return op?.kind === 'repair-test' && op.projectId === projectId &&
    op.status === 'succeeded' && op.parameters?.repo === repo &&
    op.result?.sha === sha && op.result?.tests?.sha === sha &&
    op.result.tests.verified === true && op.result.tests.status === 'completed' &&
    op.result.tests.conclusion === 'success';
}
export const sampleChecks: Check[] = [
  { path: "/health/live" },
  { path: "/api/payment-status" },
  {
    path: "/api/checkout",
    method: "POST",
    body: { amount: 10000, user: {} },
    expected: { total: 10000, currency: "IRT" },
  },
  {
    path: "/api/checkout",
    method: "POST",
    body: { amount: 10000, user: { discount: { code: "save10" } } },
    expected: { total: 9000, currency: "IRT" },
  },
];
export function assertHTTP(result: any, check: Check) {
  if (check.commit && result.commit !== check.commit)
    throw new Error("پاسخ HTTP متعلق به commit مورد انتظار نیست؛ جابه‌جایی نسخه هنوز تأیید نشده است.");
  if (!result.ok || result.status < 200 || result.status >= 300)
    throw new Error(
      `بررسی ${check.path} ناموفق است؛ آماده‌بودن release کافی نیست.`,
    );
  if (check.expected) {
    let body: any;
    try {
      body = JSON.parse(result.body);
    } catch {
      throw new Error("پاسخ عملکردی JSON معتبر نیست.");
    }
    for (const [key, value] of Object.entries(check.expected))
      if (body[key] !== value)
        throw new Error(
          `رفتار ${check.path} با نتیجه مورد انتظار مطابقت ندارد.`,
        );
  }
  return result;
}
export function expectedCheckout(input: any) {
  if (
    !Number.isInteger(input?.amount) ||
    input.amount <= 0 ||
    input.amount > 100000000
  )
    throw new Error("ورودی حادثه برای بررسی موفقیت checkout معتبر نیست.");
  const code = input.user?.discount?.code;
  if (code !== undefined && typeof code !== "string")
    throw new Error("نوع تخفیف معتبر نیست.");
  return {
    total:
      code?.toUpperCase() === "SAVE10"
        ? Math.round(input.amount * 0.9)
        : input.amount,
    currency: "IRT",
  };
}
