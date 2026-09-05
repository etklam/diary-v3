import { describe, expect, it } from 'vitest';
import { calculateFinancialFreedom, calculateFireNumber, type FinancialFreedomInput } from '../../packages/domain/src/fire';

const base: FinancialFreedomInput = {
  annualExpenses: 600000, currentAssets: 1000000, monthlyContribution: 20000,
  expectedReturn: 8, withdrawalRate: 4,
};
const now = new Date('2026-09-05T12:00:00.000Z');
const calculate = (patch: Partial<FinancialFreedomInput> = {}) => calculateFinancialFreedom({ ...base, ...patch }, now);

describe('FIRE nominal monthly model from the frozen financialFreedom.ts', () => {
  it('preserves the target, progress, contributions, and unrounded monthly return formula', () => {
    const result = calculate();
    expect(calculateFireNumber(600000, 4)).toBe(15000000);
    expect(result.currentProgress.toFixed(1)).toBe('6.7');
    expect(result.amountNeeded).toBe(14000000);
    expect(result.monthlyWithdrawal).toBe(50000);
    expect(result.weeklyWithdrawal).toBeCloseTo(11538.461538461539);
    expect(result.dailyWithdrawal).toBeCloseTo(1643.835616438356);
    // Fixed frozen-model fixtures; no intermediate rounding in the old model.
    expect(result.yearlyProjection[0]?.endingAssets).toBeCloseTo(1331998.0272300418, 6);
    expect(result.yearlyProjection[0]?.contribution).toBe(240000);
    expect(result.yearlyProjection[0]?.returns).toBeCloseTo(91998.0272300418, 6);
    expect(result.yearlyProjection[9]?.endingAssets).toBeCloseTo(5878560.938178882, 6);
    expect(result.yearlyProjection[9]?.endingAssets.toFixed(0)).toBe('5878561');
    expect(result.monthsToFreedom).toBe(227);
    expect(result.yearsToFreedom?.toFixed(1)).toBe('18.9');
  });

  it('reports the first actual contribution month instead of one month early, including its date', () => {
    const result = calculate({ annualExpenses: 1200, withdrawalRate: 100, currentAssets: 0, monthlyContribution: 100, expectedReturn: 0 });
    expect(result.monthsToFreedom).toBe(12);
    expect(result.yearsToFreedom).toBe(1);
    expect(result.freedomDate?.toISOString()).toBe('2027-09-05T12:00:00.000Z');
    const oneMonth = calculateFinancialFreedom({ ...base, annualExpenses: 100, withdrawalRate: 100,
      currentAssets: 0, monthlyContribution: 100, expectedReturn: 0 }, new Date('2028-01-31T12:00:00Z'));
    expect(oneMonth.monthsToFreedom).toBe(1);
    expect(oneMonth.freedomDate?.toISOString()).toBe('2028-02-29T12:00:00.000Z');
  });

  it('keeps ten full projection rows when already free and clamps progress and amount needed', () => {
    const result = calculate({ currentAssets: 20000000 });
    expect(result.monthsToFreedom).toBe(0);
    expect(result.currentProgress).toBe(100);
    expect(result.amountNeeded).toBe(0);
    expect(result.freedomDate).toEqual(now);
    expect(result.yearlyProjection).toHaveLength(10);
    expect(result.yearlyProjection.every((row) => row.isFreed)).toBe(true);
  });

  it('keeps five full years after attainment with a 50-year projection ceiling', () => {
    const result = calculate();
    const first = result.yearlyProjection.find((row) => row.isFreed)!;
    expect(result.yearlyProjection.at(-1)?.year).toBe(first.year + 5);
    const unreachable = calculate({ expectedReturn: 0, monthlyContribution: 0 });
    expect(unreachable.monthsToFreedom).toBeNull();
    expect(unreachable.yearsToFreedom).toBeNull();
    expect(unreachable.freedomDate).toBeNull();
    expect(unreachable.yearlyProjection).toHaveLength(50);
    expect(unreachable.yearlyProjection[9]?.endingAssets).toBe(1000000);
  });

  it('accepts attainment at the inclusive 100-year boundary', () => {
    expect(calculate({ annualExpenses: 120000, withdrawalRate: 100, currentAssets: 0,
      monthlyContribution: 100, expectedReturn: 0 }).monthsToFreedom).toBe(1200);
    expect(calculate({ annualExpenses: 120100, withdrawalRate: 100, currentAssets: 0,
      monthlyContribution: 100, expectedReturn: 0 }).monthsToFreedom).toBeNull();
  });

  it('propagates optional age only to display rows, preserving the frozen age regression', () => {
    const age25 = calculate({ currentAge: 25 });
    const age40 = calculate({ currentAge: 40 });
    expect(age25.yearlyProjection[0]?.age).toBe(26);
    expect(age40.yearlyProjection[0]?.age).toBe(41);
    expect(age25.fireNumber).toBe(age40.fireNumber);
    expect(age25.yearsToFreedom).toBe(age40.yearsToFreedom);
    expect(calculate().yearlyProjection.every((row) => row.age === null)).toBe(true);
  });

  it.each<Partial<FinancialFreedomInput>>([
    { withdrawalRate: 0 }, { withdrawalRate: -1 }, { annualExpenses: 0 },
    { currentAssets: -1 }, { monthlyContribution: -1 }, { expectedReturn: 31 },
    { expectedReturn: -1 }, { currentAge: 121 }, { currentAge: 1.5 },
    { annualExpenses: Infinity }, { currentAssets: NaN }, { monthlyContribution: Number.MAX_VALUE },
  ])('rejects invalid or overflowing assumptions %j instead of producing infinity or a false achieved state', (patch) => {
    expect(() => calculate(patch)).toThrow(RangeError);
  });
});
