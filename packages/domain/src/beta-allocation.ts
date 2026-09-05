/**
 * Beta Allocation Policy Engine (T3, Phase 2 of Beta Cockpit plan).
 *
 * Pure function. No DB / UI / network deps. Deterministic.
 * Converts market regime + breadth + leadership into a suggested
 * portfolio beta posture (high beta / core index / cash split).
 *
 * See `docs/archive/completed/2026-06/beta-cockpit-plan.md` § Phase 2 + Code Quality C1.
 */

export interface BetaAllocationInput {
  marketState: 'risk_on' | 'neutral' | 'defensive' | 'risk_off' | 'unknown'
  breadthConfirmation: 'confirming' | 'mixed' | 'warning' | 'unknown'
  above50dRatio: number | null
  averageRsi: number | null
  leadership: {
    topImproving: string[]
    bottomWeakening: string[]
  }
}

export type BetaMode =
  | 'aggressive'
  | 'balanced'
  | 'defensive'
  | 'capital_preservation'
  | 'unknown'

export interface BetaAllocationResult {
  suggestedMode: BetaMode
  suggestedBetaLevel: number | null
  highBetaTargetPct: number
  coreIndexTargetPct: number
  cashTargetPct: number
  explanation: string
  warnings: string[]
}

// ---------- Mode → beta level ----------

const MODE_BETA_LEVEL: Record<BetaMode, number | null> = {
  aggressive: 1.3,
  balanced: 1.0,
  defensive: 0.5,
  capital_preservation: 0,
  unknown: null,
}

// ---------- Decision table (20 cells) ----------

interface AllocationCell {
  mode: BetaMode
  highBeta: number
  coreIndex: number
  cash: number
  explanation: string
}

const RISK_ON_EXPLANATIONS: Record<BetaAllocationInput['breadthConfirmation'], string> = {
  confirming:
    'Market is risk-on with confirming breadth. Suggested posture is aggressive: maintain high beta exposure, but avoid chasing extended names.',
  mixed:
    'Market is risk-on but breadth is mixed. Balanced posture: keep core exposure, trim extended high beta into strength.',
  warning:
    'Market is risk-on yet breadth warns of divergence. Drift toward balanced; do not add high beta on weakness.',
  unknown:
    'Market is risk-on but breadth confirmation is missing. Balanced posture until breadth clarifies.',
}

const NEUTRAL_EXPLANATIONS: Record<BetaAllocationInput['breadthConfirmation'], string> = {
  confirming:
    'Market is neutral with constructive breadth. Balanced posture; favor index core over high beta chasing.',
  mixed:
    'Market is neutral with mixed breadth. Balanced posture; reduce high beta tilt, keep core index exposure.',
  warning:
    'Market is neutral but breadth is deteriorating. Defensive tilt: cut high beta, raise cash buffer.',
  unknown:
    'Market is neutral with unclear breadth. Balanced posture pending confirmation.',
}

const DEFENSIVE_EXPLANATIONS: Record<BetaAllocationInput['breadthConfirmation'], string> = {
  confirming:
    'Market posture is defensive, though breadth still confirms. Balanced-lite: modest high beta, larger core + cash.',
  mixed:
    'Market is defensive with mixed breadth. Defensive posture: minimal high beta, emphasize core and cash.',
  warning:
    'Market is defensive and breadth is warning. Defensive posture: high beta to cash proxy, raise cash aggressively.',
  unknown:
    'Market is defensive with unclear breadth. Defensive posture as a precaution.',
}

const RISK_OFF_EXPLANATIONS: Record<BetaAllocationInput['breadthConfirmation'], string> = {
  confirming:
    'Market is risk-off. Capital preservation mode: raise cash, reduce high beta to zero.',
  mixed:
    'Market is risk-off, breadth mixed. Capital preservation mode; do not add risk.',
  warning:
    'Market is risk-off, breadth deteriorating fast. Maximum capital preservation: highest cash allocation.',
  unknown:
    'Market is risk-off with unclear breadth. Capital preservation mode.',
}

const UNKNOWN_EXPLANATIONS: Record<BetaAllocationInput['breadthConfirmation'], string> = {
  confirming:
    'Market regime is unclear despite confirming breadth. Balanced posture; await regime resolution.',
  mixed:
    'Market regime unclear, breadth mixed. Balanced posture; no high-confidence allocation.',
  warning:
    'Market regime unclear and breadth warns. Defensive tilt; reduce high beta exposure.',
  unknown:
    'Market regime unclear. No high-confidence allocation. Default to balanced cash position.',
}

type BreadthMap = Record<BetaAllocationInput['breadthConfirmation'], AllocationCell>

const DECISION_TABLE: Record<BetaAllocationInput['marketState'], BreadthMap> = {
  risk_on: {
    confirming: { mode: 'aggressive', highBeta: 60, coreIndex: 30, cash: 10, explanation: RISK_ON_EXPLANATIONS.confirming },
    mixed: { mode: 'balanced', highBeta: 45, coreIndex: 45, cash: 10, explanation: RISK_ON_EXPLANATIONS.mixed },
    warning: { mode: 'balanced', highBeta: 40, coreIndex: 45, cash: 15, explanation: RISK_ON_EXPLANATIONS.warning },
    unknown: { mode: 'balanced', highBeta: 45, coreIndex: 45, cash: 10, explanation: RISK_ON_EXPLANATIONS.unknown },
  },
  neutral: {
    confirming: { mode: 'balanced', highBeta: 40, coreIndex: 50, cash: 10, explanation: NEUTRAL_EXPLANATIONS.confirming },
    mixed: { mode: 'balanced', highBeta: 30, coreIndex: 60, cash: 10, explanation: NEUTRAL_EXPLANATIONS.mixed },
    warning: { mode: 'defensive', highBeta: 20, coreIndex: 60, cash: 20, explanation: NEUTRAL_EXPLANATIONS.warning },
    unknown: { mode: 'balanced', highBeta: 30, coreIndex: 60, cash: 10, explanation: NEUTRAL_EXPLANATIONS.unknown },
  },
  defensive: {
    confirming: { mode: 'balanced', highBeta: 25, coreIndex: 55, cash: 20, explanation: DEFENSIVE_EXPLANATIONS.confirming },
    mixed: { mode: 'defensive', highBeta: 10, coreIndex: 60, cash: 30, explanation: DEFENSIVE_EXPLANATIONS.mixed },
    warning: { mode: 'defensive', highBeta: 10, coreIndex: 50, cash: 40, explanation: DEFENSIVE_EXPLANATIONS.warning },
    unknown: { mode: 'defensive', highBeta: 10, coreIndex: 60, cash: 30, explanation: DEFENSIVE_EXPLANATIONS.unknown },
  },
  risk_off: {
    confirming: { mode: 'capital_preservation', highBeta: 0, coreIndex: 40, cash: 60, explanation: RISK_OFF_EXPLANATIONS.confirming },
    mixed: { mode: 'capital_preservation', highBeta: 0, coreIndex: 40, cash: 60, explanation: RISK_OFF_EXPLANATIONS.mixed },
    warning: { mode: 'capital_preservation', highBeta: 0, coreIndex: 30, cash: 70, explanation: RISK_OFF_EXPLANATIONS.warning },
    unknown: { mode: 'capital_preservation', highBeta: 0, coreIndex: 40, cash: 60, explanation: RISK_OFF_EXPLANATIONS.unknown },
  },
  unknown: {
    confirming: { mode: 'balanced', highBeta: 30, coreIndex: 60, cash: 10, explanation: UNKNOWN_EXPLANATIONS.confirming },
    mixed: { mode: 'balanced', highBeta: 25, coreIndex: 60, cash: 15, explanation: UNKNOWN_EXPLANATIONS.mixed },
    warning: { mode: 'defensive', highBeta: 10, coreIndex: 60, cash: 30, explanation: UNKNOWN_EXPLANATIONS.warning },
    unknown: { mode: 'unknown', highBeta: 0, coreIndex: 50, cash: 50, explanation: UNKNOWN_EXPLANATIONS.unknown },
  },
}

const FALLBACK_CELL: AllocationCell = {
  mode: 'unknown',
  highBeta: 0,
  coreIndex: 50,
  cash: 50,
  explanation:
    'Market regime unclear. No high-confidence allocation. Default to balanced cash position.',
}

// ---------- Warning rules ----------

const LEADERSHIP_ETF_SYMBOLS = new Set(['QQQ', 'QQQM', 'SOXX', 'SMH', 'XLK', 'IGV'])

const WEAK_RATIO_THRESHOLD = 0.35
const OVERBOUGHT_RSI_THRESHOLD = 70

function buildWarnings(input: BetaAllocationInput): string[] {
  const warnings: string[] = []

  if (input.above50dRatio != null && input.above50dRatio < WEAK_RATIO_THRESHOLD) {
    warnings.push(
      `Weak breadth ratio: ${(input.above50dRatio * 100).toFixed(0)}% of names above 50-day SMA despite confirmation.`,
    )
  }

  if (input.averageRsi != null && input.averageRsi > OVERBOUGHT_RSI_THRESHOLD) {
    warnings.push(
      `Average RSI at ${input.averageRsi.toFixed(0)} is overbought (> ${OVERBOUGHT_RSI_THRESHOLD}); pullback risk elevated.`,
    )
  }

  if (input.marketState === 'risk_on' && input.breadthConfirmation === 'warning') {
    warnings.push(
      'Conflicting signals (contradiction): risk-on regime with warning breadth. Size high beta conservatively.',
    )
  }

  if (input.leadership.topImproving.length === 0) {
    warnings.push('No leadership confirmed: top improving list is empty; trend lacks a leader.')
  }

  const weakLeaders = input.leadership.bottomWeakening.filter((s) =>
    LEADERSHIP_ETF_SYMBOLS.has(s.toUpperCase()),
  )
  if (weakLeaders.length > 0) {
    warnings.push(
      `Leadership ETF under pressure (weakening): ${weakLeaders.join(', ')}. Broad-market follow-through at risk.`,
    )
  }

  return warnings
}

// ---------- Main ----------

export function decideBetaAllocation(input: BetaAllocationInput): BetaAllocationResult {
  const breadthMap = DECISION_TABLE[input.marketState]
  const cell = breadthMap?.[input.breadthConfirmation] ?? FALLBACK_CELL

  const warnings = buildWarnings(input)

  // Drift flag: if input slipped outside the canonical table, surface it.
  if (!breadthMap || !(input.breadthConfirmation in breadthMap)) {
    warnings.push('Unmapped market state combination, using conservative fallback.')
  }

  return {
    suggestedMode: cell.mode,
    suggestedBetaLevel: MODE_BETA_LEVEL[cell.mode],
    highBetaTargetPct: cell.highBeta,
    coreIndexTargetPct: cell.coreIndex,
    cashTargetPct: cell.cash,
    explanation: cell.explanation,
    warnings,
  }
}
