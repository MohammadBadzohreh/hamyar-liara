export function recommendPlan(inspection: any, choices: any[]) {
  if (!inspection)
    return { available: false, reason: "ابتدا سورس پروژه بررسی شود." };
  const heavy = (inspection.dependencies || []).filter((x: string) =>
    [
      "next",
      "puppeteer",
      "playwright",
      "sharp",
      "@tensorflow/tfjs-node",
    ].includes(x),
  );
  if (heavy.length)
    return {
      available: false,
      reason: `پروژه دارای ${heavy.join("، ")} است؛ منابع لازم نیاز به benchmark دارد.`,
    };
  const ranked = choices
    .filter(
      (c) =>
        c.verified &&
        Number.isFinite(c.resourceHourly) &&
        c.resourceHourly >= 0 &&
        Number.isFinite(c.bundleHourly) &&
        c.bundleHourly >= 0,
    )
    .sort(
      (a, b) =>
        a.resourceHourly +
        a.bundleHourly -
        (b.resourceHourly + b.bundleHourly),
    );
  if (!ranked.length)
    return {
      available: false,
      reason: "پلن با قرارداد قیمت تأییدشده در دسترس نیست.",
    };
  return {
    available: true,
    planID: ranked[0].planID,
    bundlePlanID: ranked[0].bundlePlanID,
    provisional: true,
    reason:
      "برای پروژه ساده Node.js، کم‌هزینه‌ترین ترکیب موجود برای شروع آزمون پیشنهاد می‌شود؛ کافی‌بودن منابع پس از اندازه‌گیری تأیید خواهد شد.",
  };
}
