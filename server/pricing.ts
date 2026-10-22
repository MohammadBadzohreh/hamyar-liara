export function hourlyWithTax(resourceHourly: number, bundleHourly: number, taxRate: number) {
  if (![resourceHourly, bundleHourly, taxRate].every(Number.isFinite) || resourceHourly < 0 || bundleHourly < 0 || taxRate < 0 || taxRate > 1)
    throw new Error('قیمت یا نرخ مالیات معتبر نیست.');
  // Use API hourly charges, not rounded display prices or monthly / 720.
  return (resourceHourly + bundleHourly) * (1 + taxRate);
}
