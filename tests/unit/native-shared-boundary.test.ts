import { builtinModules } from 'node:module'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

const packagePaths = ['packages/api-client', 'packages/contracts', 'packages/domain']
const repositoryRoot = process.cwd()
const packageRoots = packagePaths.map(path => resolve(repositoryRoot, path))
const forbiddenPackages = [
  '@diary/db', '@hono', 'hono', 'drizzle-orm', '@react-router',
  'react-router', 'react-router-dom', 'react-dom', 'react-native', 'expo', '@expo',
]
const nodeBuiltins = new Set(builtinModules.flatMap(name => [name, name.replace(/^node:/, '')]))

function sourceFiles(path: string): string[] {
  return readdirSync(path).flatMap(entry => {
    const child = resolve(path, entry)
    return statSync(child).isDirectory()
      ? sourceFiles(child)
      : child.endsWith('.ts') || child.endsWith('.tsx') ? [child] : []
  })
}

function imports(source: string, file: string): string[] {
  const parsed = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true)
  const result: string[] = []
  const visit = (node: ts.Node) => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node))
      && node.moduleSpecifier && ts.isStringLiteralLike(node.moduleSpecifier)) {
      result.push(node.moduleSpecifier.text)
    } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword
      && node.arguments.length === 1 && ts.isStringLiteralLike(node.arguments[0]!)) {
      result.push(node.arguments[0]!.text)
    }
    ts.forEachChild(node, visit)
  }
  visit(parsed)
  return result
}

function isInside(path: string, root: string): boolean {
  const fromRoot = relative(root, path)
  return fromRoot === '' || (!fromRoot.startsWith(`..${sep}`) && fromRoot !== '..' && !isAbsolute(fromRoot))
}

describe('native shared package boundaries', () => {
  it('keeps contracts, api-client, and domain free of platform and server runtime imports', () => {
    const violations: string[] = []
    for (const root of packageRoots) {
      for (const file of sourceFiles(resolve(root, 'src'))) {
        const source = readFileSync(file, 'utf8')
        const sourcePath = relative(repositoryRoot, file)
        for (const specifier of imports(source, file)) {
          const packageName = specifier.startsWith('@')
            ? specifier.split('/').slice(0, 2).join('/')
            : specifier.split('/')[0]!
          if (specifier.startsWith('node:') || nodeBuiltins.has(specifier) || nodeBuiltins.has(packageName)
            || forbiddenPackages.some(name => packageName === name || packageName.startsWith(`${name}/`))) {
            violations.push(`${sourcePath} imports forbidden runtime ${specifier}`)
          }
          if (specifier.startsWith('.')) {
            const target = resolve(dirname(file), specifier)
            if (!packageRoots.some(allowed => isInside(target, allowed))) {
              violations.push(`${sourcePath} escapes shared packages via ${specifier}`)
            }
          }
        }
        if (/\bwindow\s*\.\s*(?:location|document|navigator|localStorage|sessionStorage|indexedDB|fetch|history|matchMedia|addEventListener|removeEventListener)\b|\b(?:document|navigator)\s*\.|\b(?:localStorage|sessionStorage|indexedDB|File|Blob|Buffer)\b|\bURL\s*\.\s*createObjectURL\b|\bprocess\s*\.\s*env\b/.test(source)) {
          violations.push(`${sourcePath} uses a browser-only or Node-only global`)
        }
      }
    }
    expect(violations).toEqual([])
  })
})
