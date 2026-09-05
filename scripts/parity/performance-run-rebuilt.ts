// Ticket61 rebuilt-runtime performance measurement: boots the real Hono API on
// an ephemeral port against a disposable PostgreSQL database, seeds the same
// synthetic fixture as the legacy runner, measures equivalent authenticated
// HTTP reads and checks them against the frozen gates from
// scripts/parity/performance-freeze-gates.ts. Run only on a quiet host.
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { getRequestListener } from '@hono/node-server'
import bcrypt from 'bcryptjs'
import { createApp } from '../../apps/api/src/app'
import { provisionTestDatabase } from '../../tests/support/database'
import {
  FIXTURE,
  LONG_DIARY_CONTENT,
  WORKLOAD_NAMES,
  captureEnvironment,
  collectFailures,
  diaryContent,
  diaryDate,
  diaryTitle,
  measureWorkload,
  rotationSnapshotRows,
  symbolForIndex,
  symbolPrice,
  verifyDiaryRead,
  verifyDiarySearch,
  verifyHoldings,
  verifyRotationMonitor,
} from '../../tests/parity/performance-fixture'

const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
const gatesPath = `${repoRoot}docs/parity/performance-gates.json`
const evidencePath = process.env.PERFORMANCE_EVIDENCE_PATH ?? `${repoRoot}docs/parity/performance-rebuilt-runtime.json`

if (!existsSync(gatesPath)) {
  console.error(`Frozen gates not found at ${gatesPath}.`)
  console.error('Gates must be frozen from legacy measurements BEFORE the rebuilt runtime is measured:')
  console.error('  node --import tsx scripts/parity/performance-freeze-gates.ts')
  process.exit(1)
}
const gates = JSON.parse(readFileSync(gatesPath, 'utf8')) as { workloads: Record<string, { gateMs: number }> }
const missingGates = WORKLOAD_NAMES.filter(name => typeof gates.workloads[name]?.gateMs !== 'number')
if (missingGates.length > 0) {
  console.error(`Frozen gates are missing workloads: ${missingGates.join(', ')}`)
  process.exit(1)
}

function chunk<T>(rows: T[], size: number): T[][] {
  const pages: T[][] = []
  for (let index = 0; index < rows.length; index += size) pages.push(rows.slice(index, index + size))
  return pages
}

const database = await provisionTestDatabase('diary_v3_perf')
let server: import('node:http').Server | undefined
try {
  const pool = database.pool
  const userRow = await pool.query(
    'insert into users(email, password, name) values ($1, $2, $3) returning id',
    [FIXTURE.userEmail, await bcrypt.hash(FIXTURE.userPassword, 4), 'Synthetic performance fixture'],
  )
  const userId = String(userRow.rows[0]!.id)

  const diaryRows = [
    ...Array.from({ length: FIXTURE.diaryCount }, (_, index) => ({
      title: diaryTitle(index), content: diaryContent(index), date: diaryDate(index),
    })),
    { title: FIXTURE.longDiaryTitle, content: LONG_DIARY_CONTENT, date: '2020-01-01' },
  ]
  const diaryIds: string[] = []
  for (const page of chunk(diaryRows, 200)) {
    const values = page.map((_, index) => `($${index * 4 + 1}, $${index * 4 + 2}, $${index * 4 + 3}, $${index * 4 + 4})`)
    const params = page.flatMap(row => [userId, row.title, row.content, row.date])
    const inserted = await pool.query(
      `insert into diaries (user_id, title, content, date) values ${values.join(', ')} returning id`,
      params,
    )
    for (const row of inserted.rows) diaryIds.push(String(row.id))
  }

  for (const page of chunk(diaryIds.slice(0, FIXTURE.diaryCount).map((diaryId, index) => ({
    diaryId,
    symbol: symbolForIndex(index),
    price: symbolPrice(index),
    date: `${diaryDate(index)}T12:00:00Z`,
  })), 200)) {
    const values = page.map((_, index) => `($${index * 6 + 1}, $${index * 6 + 2}, $${index * 6 + 3}, 'BUY', $${index * 6 + 4}, $${index * 6 + 5}, $${index * 6 + 6})`)
    const params = page.flatMap(row => [row.diaryId, userId, row.symbol, String(FIXTURE.quantityPerTrade), String(row.price), row.date])
    await pool.query(
      `insert into transactions (diary_id, user_id, symbol, type, quantity, price, trade_date) values ${values.join(', ')}`,
      params,
    )
  }

  for (const page of chunk(rotationSnapshotRows(), 300)) {
    const columns = `(date, symbol, rank_scope, group_type, sector_name, last_price, adjusted_close, rsi14, percent_from_high, rotation_score, rotation_score_delta_2w, rotation_rank, rank_delta_2w, rsi_delta_2w, two_week_performance_pct, above20d, above50d, ma_status, signal_status)`
    const values = page.map((_, index) => `(${Array.from({ length: 19 }, (_, column) => `$${index * 19 + column + 1}`).join(', ')})`)
    const params = page.flatMap(row => [
      row.date, row.symbol, FIXTURE.rotationScope, row.groupType, row.sectorName, row.lastPrice, row.adjustedClose,
      row.rsi14, row.percentFromHigh, row.rotationScore, row.rotationScoreDelta2W, row.rotationRank, row.rankDelta2W,
      row.rsiDelta2W, row.twoWeekPerformancePct, row.above20d, row.above50d, row.maStatus, row.signalStatus,
    ])
    await pool.query(`insert into market_rotation_snapshot ${columns} values ${values.join(', ')}`, params)
  }

  const app = createApp({
    db: database.db,
    databasePool: database.pool,
    config: {
      jwtSecret: 'performance-runner-disposable-secret-not-production',
      nodeEnv: 'test',
      trustProxy: false,
      webOrigin: 'http://127.0.0.1',
    },
  })
  const listener = getRequestListener(app.fetch)
  const httpServer = createServer((request, response) => listener(request, response))
  server = httpServer
  await new Promise<void>(resolve => httpServer.listen(0, '127.0.0.1', resolve))
  const port = (httpServer.address() as AddressInfo).port
  const base = `http://127.0.0.1:${port}`

  const loginResponse = await fetch(`${base}/api/auth/native/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: FIXTURE.userEmail, password: FIXTURE.userPassword, deviceName: 'Performance runner' }),
  })
  if (loginResponse.status !== 200) throw new Error(`Native login failed with status ${loginResponse.status}`)
  const accessToken = ((await loginResponse.json()) as { data: { accessToken: string } }).data.accessToken
  const request = async (path: string) => {
    const response = await fetch(`${base}${path}`, { headers: { authorization: `Bearer ${accessToken}` } })
    return { status: response.status, body: await response.json() }
  }

  let dbVersion = 'unknown'
  try {
    dbVersion = String((await pool.query('select version()')).rows[0]!.version)
  } catch { dbVersion = 'unknown' }

  const longDiaryId = diaryIds[diaryIds.length - 1]!
  const workloads = {
    'diary-read': await measureWorkload('diary-read', '/api/diaries/:id', url => request(url.replace(':id', longDiaryId)), verifyDiaryRead),
    'diary-search': await measureWorkload('diary-search', `/api/diaries?search=${encodeURIComponent(FIXTURE.searchTerm)}&page=1&limit=${FIXTURE.pageSize}&sortBy=date-desc`, request, verifyDiarySearch),
    'ledger-holdings': await measureWorkload('ledger-holdings', '/api/stocks/holdings', request, verifyHoldings),
    'rotation-history': await measureWorkload('rotation-history', `/api/market/rotation-monitor?scope=${FIXTURE.rotationScope}`, request, verifyRotationMonitor),
  }

  const gateVerdicts = Object.fromEntries(WORKLOAD_NAMES.map(name => {
    const workload = workloads[name]
    const gateMs = gates.workloads[name]!.gateMs
    return [name, { gateMs, p95Ms: workload.p95Ms, gatePass: workload.verified && workload.p95Ms <= gateMs }]
  }))

  const evidence = {
    runner: 'scripts/parity/performance-run-rebuilt.ts',
    runtime: 'rebuilt diary-v3 Hono API + disposable PostgreSQL',
    synthetic: true,
    gatesFrozenFrom: gatesPath,
    gateRule: 'max(legacy p95 * 2, 250 ms)',
    environment: captureEnvironment(dbVersion, 'Hono API via tsx (nodeEnv=test) on ephemeral 127.0.0.1 port'),
    fixture: {
      diaryCount: FIXTURE.diaryCount,
      longDiaryChars: FIXTURE.longDiaryChars,
      searchTerm: FIXTURE.searchTerm,
      searchTotal: FIXTURE.searchTotal,
      pageSize: FIXTURE.pageSize,
      transactionCount: FIXTURE.diaryCount,
      symbols: 20,
      rotationScope: FIXTURE.rotationScope,
      rotationSnapshotDates: FIXTURE.rotationDates,
      rotationSnapshotRows: FIXTURE.rotationDates * 23,
      coreSymbols: 23,
    },
    protocol: {
      warmupsPerWorkload: workloads['diary-read'].warmups,
      samplesPerWorkload: workloads['diary-read'].samples,
      sequential: true,
      loginOutsideMeasuredLatency: true,
    },
    workloads,
    gateVerdicts,
    failures: collectFailures(Object.values(workloads)),
  }
  writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`)

  for (const name of WORKLOAD_NAMES) {
    const workload = workloads[name]
    const verdict = gateVerdicts[name]!
    console.log(`${name}: median ${workload.medianMs} ms, p95 ${workload.p95Ms} ms, gate ${verdict.gateMs} ms -> ${verdict.gatePass ? 'PASS' : 'FAIL'}`)
  }
  const gateFailures = WORKLOAD_NAMES.filter(name => !gateVerdicts[name]!.gatePass)
  if (evidence.failures.length > 0) console.error(`Result verification failures: ${evidence.failures.join('; ')}`)
  if (gateFailures.length > 0) console.error(`Gate failures: ${gateFailures.join(', ')} (evidence preserved at ${evidencePath})`)
  if (evidence.failures.length > 0 || gateFailures.length > 0) process.exitCode = 1
} catch (error) {
  console.error(error)
  process.exitCode = 1
} finally {
  server?.closeAllConnections?.()
  server?.close()
  await database.dispose()
}
