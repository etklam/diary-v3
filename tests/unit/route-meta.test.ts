import { readdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { publicMetaPaths, publicPageMeta, type PublicMetaPath } from '../../apps/web/app/route-meta'

const routesDir = resolve(process.cwd(), 'apps/web/app/routes')

/** Every `publicPageMeta('<path>')` declaration found across the route modules. */
async function declaredMetaPaths(): Promise<string[]> {
  const entries = (await readdir(routesDir)).filter(name => name.endsWith('.tsx'))
  const declared: string[] = []
  for (const entry of entries) {
    const source = await readFile(resolve(routesDir, entry), 'utf8')
    for (const match of source.matchAll(/publicPageMeta\('([^']+)'\)/gu)) declared.push(match[1]!)
  }
  return declared
}

describe('public route metadata', () => {
  it('covers every registered public meta path with exactly one route module', async () => {
    const declared = await declaredMetaPaths()
    expect([...declared].sort()).toEqual([...publicMetaPaths].sort())
    expect(new Set(declared).size).toBe(declared.length)
  })

  it('builds title, description, Open Graph and canonical descriptors for each path', () => {
    for (const path of publicMetaPaths) {
      const descriptors = publicPageMeta(path)({ location: { pathname: path } } as never) as Record<string, string>[]
      const title = descriptors.find(descriptor => 'title' in descriptor)?.title
      expect(title).toMatch(/ — Trade basic$/u)
      expect(descriptors.find(descriptor => descriptor.name === 'description')?.content).toBeTruthy()
      expect(descriptors.find(descriptor => descriptor.property === 'og:title')?.content).toBe(title)
      expect(descriptors.find(descriptor => descriptor.property === 'og:description')?.content).toBeTruthy()
      expect(descriptors.find(descriptor => descriptor.rel === 'canonical')?.href).toBe(path)
    }
  })

  it('types each registered path as a public meta path', () => {
    const paths: PublicMetaPath[] = [...publicMetaPaths]
    expect(paths.length).toBeGreaterThan(0)
  })
})
