// Freezes ticket61 regression gates from the persisted legacy measurements.
// Must run BEFORE the rebuilt runtime is measured; gates are never revised
// after rebuilt results are seen (rerun only affected workloads after a real fix).
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { WORKLOAD_NAMES } from '../../tests/parity/performance-fixture'

const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
const args = process.argv.slice(2)
const force = args.includes('--force')
function option(name: string): string | undefined {
  const index = args.indexOf(name)
  return index >= 0 ? args[index + 1] : undefined
}
const legacyPath = option('--legacy') ?? `${repoRoot}docs/parity/performance-legacy-runtime.json`
const outPath = option('--out') ?? `${repoRoot}docs/parity/performance-gates.json`

if (!existsSync(legacyPath)) {
  console.error(`Legacy performance evidence not found: ${legacyPath}`)
  console.error('Run scripts/parity/performance-run-legacy.sh first (on a quiet host, no parallel builds/browser suites).')
  process.exit(1)
}
if (existsSync(outPath) && !force) {
  console.error(`Refusing to overwrite frozen gates at ${outPath} without --force.`)
  console.error('Gates must not change after rebuilt-runtime results were observed; record any exception in the ticket.')
  process.exit(1)
}

const legacy = JSON.parse(readFileSync(legacyPath, 'utf8')) as {
  runtime?: string
  environment?: Record<string, unknown>
  workloads?: Record<string, { verified?: boolean; failures?: string[]; medianMs?: number; p95Ms?: number }>
}
const workloads = legacy.workloads ?? {}
const frozen: Record<string, unknown> = {}
for (const name of WORKLOAD_NAMES) {
  const workload = workloads[name]
  if (!workload || workload.verified !== true) {
    console.error(`Legacy workload ${name} has no verified measurement; refusing to freeze gates from failed evidence.`)
    process.exit(1)
  }
  if (typeof workload.medianMs !== 'number' || typeof workload.p95Ms !== 'number' || !(workload.p95Ms > 0)) {
    console.error(`Legacy workload ${name} lacks median/p95 timings; refusing to freeze gates.`)
    process.exit(1)
  }
  // Astra's rule (docs/agents/final-performance-acceptance.md): each gate is
  // frozen to max(legacy p95 * 2, 250 ms) before the rebuilt runtime is measured.
  frozen[name] = {
    legacyMedianMs: workload.medianMs,
    legacyP95Ms: workload.p95Ms,
    gateMs: Math.max(workload.p95Ms * 2, 250),
  }
}

const evidence = {
  frozenFrom: legacyPath,
  frozenAt: new Date().toISOString(),
  rule: 'max(legacy p95 * 2, 250 ms), frozen before rebuilt-runtime measurement',
  legacyRuntime: legacy.runtime ?? 'unknown',
  legacyEnvironment: legacy.environment ?? {},
  workloads: frozen,
}
writeFileSync(outPath, `${JSON.stringify(evidence, null, 2)}\n`)
for (const name of WORKLOAD_NAMES) {
  const gate = frozen[name] as { legacyP95Ms: number; gateMs: number }
  console.log(`${name}: legacy p95 ${gate.legacyP95Ms} ms -> gate ${gate.gateMs} ms`)
}
console.log(`Frozen gates written to ${outPath}`)
