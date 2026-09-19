import { rankScopes, type BatchScope, type RankScope } from '@diary/domain/market-rotation/types'

export type RotationScopeExecution<T> = {
  ok: true
  results: T[]
} | {
  ok: false
  results: T[]
  error: unknown
}

/** Execute requested scopes in canonical order and stop at the first failure. */
export async function executeRotationScopes<T>(
  scope: BatchScope,
  run: (scope: RankScope) => Promise<T>,
): Promise<RotationScopeExecution<T>> {
  const results: T[] = []
  try {
    for (const selected of scope === 'all' ? rankScopes : [scope]) {
      results.push(await run(selected))
    }
    return { ok: true, results }
  } catch (error) {
    return { ok: false, results, error }
  }
}
