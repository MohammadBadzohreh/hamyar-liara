export function checkout(input) {
  if (!input || !Number.isInteger(input.amount) || input.amount <= 0 || input.amount > 100000000) {
    const error = new Error('INVALID_AMOUNT'); error.status = 400; throw error;
  }
  const code = input.user?.discount?.code;
  if (code !== undefined && typeof code !== 'string') { const error = new Error('INVALID_DISCOUNT'); error.status = 400; throw error; }
  return { total: code?.toUpperCase() === 'SAVE10' ? Math.round(input.amount * 0.9) : input.amount, currency: 'IRT' };
}
