import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// Keep builds and runtime on patched Node.js releases.
// https://nodejs.org/en/blog/vulnerability/october-2026-security-releases
const PATCHED_NODE_22 = '22.23.4'
const PATCHED_NODE_24 = '24.22.1'
const PATCHED_NODE_26 = '26.12.1'

const read = (path: string) => readFileSync(path, 'utf8')

describe('Node.js runtime security floor', () => {
  it('declares engine ranges that exclude the vulnerable releases', () => {
    const packageJson = JSON.parse(read('package.json')) as { engines?: { node?: string } }
    expect(packageJson.engines?.node).toBe(`^${PATCHED_NODE_22} || ^${PATCHED_NODE_24} || >=${PATCHED_NODE_26}`)
  })

  it('runs Forgejo source checks on the patched Node 22 release', () => {
    for (const workflow of ['deploy', 'regression', 'staging']) {
      expect(read(`.forgejo/workflows/${workflow}.yml`)).toContain(`node-version: ${PATCHED_NODE_22}`)
    }
  })

  it('builds and runs every production image on the patched Node 24 release', () => {
    const stages = [...read('Dockerfile').matchAll(/^FROM node:(\S+) AS \w+$/gm)].map(match => match.at(1) ?? '')
    expect(stages).toEqual(Array<string>(3).fill(`${PATCHED_NODE_24}-bookworm-slim`))
  })
})
