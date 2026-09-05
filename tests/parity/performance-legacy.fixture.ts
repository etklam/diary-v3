// Executed only inside the isolated legacy snapshot by
// scripts/parity/performance-run-legacy.sh (copied to
// tests/integration/http/performance-baseline.test.ts there).
// Measures the frozen Nuxt/Nitro runtime over real HTTP with synthetic data.
// @vitest-environment node
import { PrismaMariaDb } from '@prisma/adapter-mariadb'
import { PrismaClient } from '@prisma/client'
import { fetch, setup } from '@nuxt/test-utils/e2e'
import bcrypt from 'bcryptjs'
import { readFileSync, writeFileSync } from 'node:fs'
import { expect, it } from 'vitest'
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
  type WorkloadName,
  type WorkloadResult,
} from './performance-fixture'

const databaseUrl = process.env.BACKEND_HTTP_TEST_DATABASE_URL!
if (!/^mysql:\/\/root:test-password@127\.0\.0\.1:\d+\/backend_http_test$/.test(databaseUrl)) throw new Error('Disposable DB required')
const evidencePath = process.env.PERFORMANCE_EVIDENCE_PATH!
if (!evidencePath) throw new Error('PERFORMANCE_EVIDENCE_PATH required')
// Partial rerun support: PERFORMANCE_WORKLOAD=<name> measures only that
// workload and copies the other verified workload records unmodified from
// PERFORMANCE_PRIOR_EVIDENCE, so one failed verifier never invalidates the
// other three observations.
const onlyWorkload = process.env.PERFORMANCE_WORKLOAD as WorkloadName | undefined
if (onlyWorkload !== undefined && !WORKLOAD_NAMES.includes(onlyWorkload)) {
  throw new Error(`PERFORMANCE_WORKLOAD must be one of: ${WORKLOAD_NAMES.join(', ')}`)
}
const priorEvidencePath = process.env.PERFORMANCE_PRIOR_EVIDENCE
if (onlyWorkload !== undefined && !priorEvidencePath) throw new Error('PERFORMANCE_PRIOR_EVIDENCE required for a partial rerun')
await setup({
  rootDir: process.cwd(),
  browser: false,
  server: true,
  build: true,
  setupTimeout: 240_000,
  env: {
    NODE_ENV: 'test',
    DATABASE_URL: databaseUrl,
    JWT_SECRET: 'baseline-only-isolated-jwt-secret-not-production',
    NUXT_PUBLIC_SITE_URL: 'http://127.0.0.1',
    NODE_PATH: `${process.cwd()}/node_modules`,
  },
})

it('legacy performance: long Diary read, paginated search, ledger holdings, core rotation history', { timeout: 300_000 }, async () => {
  const prisma = new PrismaClient({ adapter: new PrismaMariaDb(databaseUrl) })
  try {
    const user = await prisma.user.create({
      data: {
        email: FIXTURE.userEmail,
        name: 'Synthetic performance fixture',
        password: await bcrypt.hash(FIXTURE.userPassword, 4),
      },
    })
    const userId = user.id
    const noon = (civilDate: string) => new Date(`${civilDate}T12:00:00.000Z`)
    const midnight = (civilDate: string) => new Date(`${civilDate}T00:00:00.000Z`)

    await prisma.diary.createMany({
      data: Array.from({ length: FIXTURE.diaryCount }, (_, index) => ({
        userId,
        title: diaryTitle(index),
        content: diaryContent(index),
        tagsString: 'performance',
        date: noon(diaryDate(index)),
      })),
    })
    const longDiary = await prisma.diary.create({
      data: {
        userId,
        title: FIXTURE.longDiaryTitle,
        content: LONG_DIARY_CONTENT,
        tagsString: 'performance',
        date: noon('2020-01-01'),
      },
    })
    const diariesByDate = new Map<string, bigint>()
    for (const row of await prisma.diary.findMany({ where: { userId }, select: { id: true, date: true } })) {
      diariesByDate.set(row.date.toISOString().slice(0, 10), row.id)
    }
    await prisma.transaction.createMany({
      data: Array.from({ length: FIXTURE.diaryCount }, (_, index) => ({
        diaryId: diariesByDate.get(diaryDate(index))!,
        userId,
        symbol: symbolForIndex(index),
        type: 'BUY',
        quantity: FIXTURE.quantityPerTrade,
        price: symbolPrice(index),
        tradeDate: noon(diaryDate(index)),
      })),
    })
    const rotationRows = rotationSnapshotRows()
    for (let index = 0; index < rotationRows.length; index += 575) {
      await prisma.marketRotationSnapshot.createMany({
        data: rotationRows.slice(index, index + 575).map(row => ({
          date: midnight(row.date),
          symbol: row.symbol,
          rankScope: FIXTURE.rotationScope,
          groupType: row.groupType,
          sectorName: row.sectorName,
          lastPrice: row.lastPrice,
          adjustedClose: row.adjustedClose,
          rsi14: row.rsi14,
          percentFromHigh: row.percentFromHigh,
          rotationScore: row.rotationScore,
          rotationScoreDelta2W: row.rotationScoreDelta2W,
          rotationRank: row.rotationRank,
          rankDelta2W: row.rankDelta2W,
          rsiDelta2W: row.rsiDelta2W,
          twoWeekPerformancePct: row.twoWeekPerformancePct,
          above20d: row.above20d,
          above50d: row.above50d,
          maStatus: row.maStatus,
          signalStatus: row.signalStatus,
        })),
      })
    }

    const loginResponse = await fetch('/api/auth/native/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: FIXTURE.userEmail, password: FIXTURE.userPassword, deviceName: 'Performance runner' }),
    })
    expect(loginResponse.status).toBe(200)
    const accessToken = ((await loginResponse.json()) as { data: { accessToken: string } }).data.accessToken
    const headers = { authorization: `Bearer ${accessToken}` }
    const request = async (url: string) => {
      const response = await fetch(url, { headers })
      return { status: response.status, body: await response.json() }
    }

    let dbVersion = 'unknown'
    try {
      dbVersion = String((await prisma.$queryRawUnsafe<Array<{ v: string }>>('SELECT VERSION() AS v'))[0]?.v)
    } catch { dbVersion = 'unknown' }

    const workloadBuilders: Record<WorkloadName, () => Promise<WorkloadResult>> = {
      'diary-read': () => measureWorkload('diary-read', `/api/diaries/${longDiary.id}`, request, verifyDiaryRead),
      'diary-search': () => measureWorkload('diary-search', `/api/diaries?search=${encodeURIComponent(FIXTURE.searchTerm)}&page=1&limit=${FIXTURE.pageSize}&sortBy=date-desc`, request, verifyDiarySearch),
      'ledger-holdings': () => measureWorkload('ledger-holdings', '/api/stocks/holdings', request, verifyHoldings),
      'rotation-history': () => measureWorkload('rotation-history', `/api/market/rotation-monitor?scope=${FIXTURE.rotationScope}`, request, verifyRotationMonitor),
    }
    const measuredNames: WorkloadName[] = onlyWorkload ? [onlyWorkload] : [...WORKLOAD_NAMES]
    const workloads = {} as Record<WorkloadName, WorkloadResult>
    for (const name of measuredNames) workloads[name] = await workloadBuilders[name]()

    let provenance: Record<string, unknown>
    if (onlyWorkload) {
      const prior = JSON.parse(readFileSync(priorEvidencePath!, 'utf8')) as { workloads: Record<string, WorkloadResult> }
      const reusedNames = WORKLOAD_NAMES.filter(name => name !== onlyWorkload)
      for (const name of reusedNames) {
        if (!prior.workloads[name] || prior.workloads[name]!.verified !== true) {
          throw new Error(`Prior evidence ${priorEvidencePath} lacks a verified record for ${name}`)
        }
        workloads[name] = prior.workloads[name]!
      }
      provenance = {
        partialRerun: true,
        measuredWorkloads: [onlyWorkload],
        rerunReason: process.env.PERFORMANCE_RERUN_REASON ?? 'workload-specific verifier fix',
        reused: {
          source: priorEvidencePath,
          workloads: reusedNames,
          note: 'Workload records copied unmodified from the first observation; same fixture, protocol and host.',
        },
      }
    }
    else {
      provenance = { partialRerun: false, measuredWorkloads: [...WORKLOAD_NAMES] }
    }

    const evidence = {
      runner: 'scripts/parity/performance-run-legacy.sh',
      runtime: 'frozen diary-vue source (Nuxt/Nitro production build) + disposable MariaDB',
      synthetic: true,
      workloadProvenance: provenance,
      environment: captureEnvironment(dbVersion, 'frozen Nuxt/Nitro build (NODE_ENV=test) served by @nuxt/test-utils'),
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
      failures: collectFailures(Object.values(workloads)),
    }
    writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`)
    expect(evidence.failures).toEqual([])
  } finally {
    await prisma.$disconnect()
  }
})
