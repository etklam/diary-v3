import { copyFileSync, cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/** Build an explicit historical migration fixture instead of assuming HEAD is N+1. */
export function historicalMigrations(cutoffTag: string) {
  const source = 'packages/db/migrations'
  const folder = mkdtempSync(join(tmpdir(), 'diary-v3-history-'))
  cpSync(join(source, 'meta'), join(folder, 'meta'), { recursive: true })
  const journal = JSON.parse(readFileSync(join(folder, 'meta', '_journal.json'), 'utf8')) as { entries: Array<{ tag: string }> }
  const cutoff = journal.entries.findIndex(entry => entry.tag === cutoffTag)
  if (cutoff < 0) { rmSync(folder, { recursive: true }); throw new Error(`Unknown historical migration: ${cutoffTag}`) }
  journal.entries = journal.entries.slice(0, cutoff + 1)
  for (const entry of journal.entries) copyFileSync(join(source, `${entry.tag}.sql`), join(folder, `${entry.tag}.sql`))
  writeFileSync(join(folder, 'meta', '_journal.json'), JSON.stringify(journal))
  return { folder, count: journal.entries.length, dispose: () => rmSync(folder, { recursive: true, force: true }) }
}
