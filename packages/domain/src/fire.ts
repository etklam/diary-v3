/** Nominal FIRE model: monthly compounding, contributions at each month end. */
export interface FinancialFreedomInput {
  annualExpenses: number;
  currentAssets: number;
  monthlyContribution: number;
  expectedReturn: number;
  withdrawalRate: number;
  currentAge?: number | null;
}

export interface YearlyProjection {
  year: number;
  age: number | null;
  startingAssets: number;
  contribution: number;
  returns: number;
  endingAssets: number;
  isFreed: boolean;
}

export const withdrawalRatePresets = [
  { id: 'conservative', rate: 3, risk: 'low' },
  { id: 'moderate', rate: 4, risk: 'medium' },
  { id: 'aggressive', rate: 5, risk: 'high' },
] as const;
export type WithdrawalRatePreset = typeof withdrawalRatePresets[number]['id'];

function bounded(value: number, field: string, min: number, max = Number.MAX_VALUE) {
  if (!Number.isFinite(value) || value < min || value > max) throw new RangeError(`Invalid ${field}`);
}
function finite(value: number) {
  if (!Number.isFinite(value)) throw new RangeError('FIRE calculation exceeds the numeric range');
  return value;
}

export function calculateFireNumber(annualExpenses: number, withdrawalRate: number) {
  bounded(annualExpenses, 'annualExpenses', Number.MIN_VALUE);
  bounded(withdrawalRate, 'withdrawalRate', Number.MIN_VALUE, 100);
  return finite((annualExpenses * 100) / withdrawalRate);
}

/** Clamp month-end dates instead of overflowing January 31 into March. */
function addUtcMonths(now: Date, months: number) {
  const date = new Date(now);
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + months);
  const end = new Date(date);
  end.setUTCMonth(end.getUTCMonth() + 1, 0);
  date.setUTCDate(Math.min(day, end.getUTCDate()));
  return date;
}

export function calculateFinancialFreedom(input: FinancialFreedomInput, now = new Date()) {
  const { annualExpenses, currentAssets, monthlyContribution, expectedReturn, withdrawalRate } = input;
  bounded(currentAssets, 'currentAssets', 0);
  bounded(monthlyContribution, 'monthlyContribution', 0);
  bounded(expectedReturn, 'expectedReturn', 0, 30);
  const age = input.currentAge ?? null;
  if (age !== null) {
    bounded(age, 'currentAge', 0, 120);
    if (!Number.isInteger(age)) throw new RangeError('Invalid currentAge');
  }
  if (!Number.isFinite(now.getTime())) throw new RangeError('Invalid calculation date');
  const fireNumber = calculateFireNumber(annualExpenses, withdrawalRate);
  const monthlyRate = expectedReturn / 100 / 12;
  const grow = (amount: number) => finite(amount * (1 + monthlyRate) + monthlyContribution);

  // Search whole months: the old fractional-year loop reported a future deposit early.
  let monthsToFreedom: number | null = currentAssets >= fireNumber ? 0 : null;
  let assets = currentAssets;
  for (let month = 1; monthsToFreedom === null && month <= 1200; month++) {
    assets = grow(assets);
    if (assets >= fireNumber) monthsToFreedom = month;
  }

  const yearlyProjection: YearlyProjection[] = [];
  assets = currentAssets;
  let firstFreedomYear: number | null = currentAssets >= fireNumber ? 0 : null;
  for (let year = 1; year <= 50; year++) {
    const startingAssets = assets;
    for (let month = 0; month < 12; month++) assets = grow(assets);
    const contribution = finite(monthlyContribution * 12);
    if (firstFreedomYear === null && assets >= fireNumber) firstFreedomYear = year;
    yearlyProjection.push({
      year, age: age === null ? null : age + year, startingAssets, contribution,
      returns: finite(assets - startingAssets - contribution), endingAssets: assets,
      isFreed: firstFreedomYear !== null,
    });
    // Keep the ten-year export complete and show five full years after attainment.
    if (firstFreedomYear !== null && year >= Math.max(10, firstFreedomYear + 5)) break;
  }
  const annualWithdrawal = finite(fireNumber * (withdrawalRate / 100));
  return {
    fireNumber,
    currentProgress: Math.min(100, (currentAssets / fireNumber) * 100),
    amountNeeded: Math.max(0, fireNumber - currentAssets),
    monthsToFreedom,
    yearsToFreedom: monthsToFreedom === null ? null : monthsToFreedom / 12,
    freedomDate: monthsToFreedom === null ? null : addUtcMonths(now, monthsToFreedom),
    yearlyProjection,
    monthlyWithdrawal: annualWithdrawal / 12,
    weeklyWithdrawal: annualWithdrawal / 52,
    dailyWithdrawal: annualWithdrawal / 365,
    safeWithdrawalRate: withdrawalRate,
  };
}

export type FinancialFreedomResult = ReturnType<typeof calculateFinancialFreedom>;
