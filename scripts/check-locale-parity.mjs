/* global console, process */

/**
 * Key-set parity across the three locales.
 *
 * The product ships zh-TW (default), zh-CN and en, and the copy lives in ~107
 * per-surface objects kept in sync by hand. TypeScript already rejects a
 * *read* of a key one locale is missing, so the gap is the rest: keys nobody
 * reads yet, extra keys in a non-default locale, and shapes that drifted.
 * Scanning the declarations catches all of those without first migrating every
 * file to a shared type.
 *
 * What this does NOT check: translation quality. zh-TW and zh-CN legitimately
 * share many phrases, and tickers, units and brand names can legitimately match
 * English, so an identical value is not a finding.
 *
 * Usage: node scripts/check-locale-parity.mjs [--json]
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import ts from 'typescript'

const ROOT = process.cwd()
const SCAN_DIRS = ['apps/web/app']
const LOCALES = ['zh-TW', 'zh-CN', 'en']
/** zh-TW is the default locale and the authoritative key set. */
const BASE_LOCALE = 'zh-TW'

function sourceFiles(dir) {
  const found = []
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) found.push(...sourceFiles(path))
    else if (/\.tsx?$/.test(entry)) found.push(path)
  }
  return found
}

function propertyName(node) {
  if (ts.isIdentifier(node) || ts.isPrivateIdentifier(node)) return node.text
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text
  if (ts.isNumericLiteral(node)) return node.text
  return null
}

/**
 * Dotted key paths for one locale's copy object. An array contributes its
 * length, because a locale silently short one label in a list is the same
 * defect class as a missing key.
 */
function keyPaths(node, prefix = '') {
  const paths = new Set()
  if (ts.isObjectLiteralExpression(node)) {
    for (const property of node.properties) {
      if (ts.isSpreadAssignment(property)) {
        // A spread makes the key set non-local; record it so the finding is
        // "not statically comparable" rather than a false parity pass.
        paths.add(`${prefix}<spread>`)
        continue
      }
      if (
        !ts.isPropertyAssignment(property) &&
        !ts.isShorthandPropertyAssignment(property) &&
        !ts.isMethodDeclaration(property)
      )
        continue
      const name = propertyName(property.name)
      if (name === null) {
        paths.add(`${prefix}<computed>`)
        continue
      }
      const path = `${prefix}${name}`
      if (ts.isPropertyAssignment(property)) {
        const nested = keyPaths(property.initializer, `${path}.`)
        if (nested.size > 0) for (const value of nested) paths.add(value)
        else paths.add(path)
      } else paths.add(path)
    }
    return paths
  }
  if (ts.isArrayLiteralExpression(node)) {
    paths.add(`${prefix}<array:${node.elements.length}>`)
    return paths
  }
  return paths
}

/**
 * Whether TypeScript already enforces this object's locale keys.
 *
 * `const labels: Record<PolicyLocale, …> = { … }` is checked by the compiler:
 * a missing locale or a missing key inside an annotated shape is a type error
 * already. Re-checking it here would only produce findings on deliberate
 * shapes — `Record<string, Record<'zh-TW' | 'zh-CN', string>>`, where the
 * English sentence is the key and the two translations are the value, is a
 * legitimate design this script must not call a defect.
 */
function alreadyTypeChecked(node) {
  let current = node.parent
  while (current) {
    if (ts.isVariableDeclaration(current)) return current.type !== undefined
    if (ts.isSatisfiesExpression(current)) return true
    if (ts.isAsExpression(current)) {
      // `as const` controls widening and enforces nothing about keys, so an
      // object behind it still needs checking. A named-type assertion does
      // constrain the shape.
      if (
        current.type.kind === ts.SyntaxKind.TypeReference &&
        current.type.typeName.getText(current.getSourceFile()) === 'const'
      ) {
        current = current.parent
        continue
      }
      return true
    }
    if (ts.isCallExpression(current)) {
      // `defineCopy(base, { 'zh-CN': …, en: … })` is the compile-time form of
      // this very check: the translation arms are mapped against the inferred
      // base, so a missing or extra key is already a type error. Its second
      // argument legitimately names only two locales.
      if (ts.isIdentifier(current.expression) && current.expression.text === 'defineCopy') return true
      current = current.parent
      continue
    }
    if (
      ts.isPropertyAssignment(current) ||
      ts.isObjectLiteralExpression(current) ||
      ts.isArrayLiteralExpression(current)
    ) {
      current = current.parent
      continue
    }
    return false
  }
  return false
}

/** Object literals that declare at least two locale keys are locale copy. */
function localeObjects(sourceFile) {
  const objects = []
  const visit = node => {
    if (ts.isObjectLiteralExpression(node) && !alreadyTypeChecked(node)) {
      const names = new Set()
      for (const property of node.properties) {
        if (ts.isPropertyAssignment(property) || ts.isShorthandPropertyAssignment(property)) {
          const name = propertyName(property.name)
          if (name !== null) names.add(name)
        }
      }
      const present = LOCALES.filter(locale => names.has(locale))
      if (present.length >= 2) objects.push({ node, present })
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  return objects
}

function describe(node, sourceFile) {
  // Nearest named ancestor, so a finding points at `diaryCopy`, not "line 2".
  let current = node.parent
  while (current) {
    if (ts.isVariableDeclaration(current) && ts.isIdentifier(current.name)) return current.name.text
    if (ts.isPropertyAssignment(current)) {
      const name = propertyName(current.name)
      if (name !== null && !LOCALES.includes(name)) return name
    }
    current = current.parent
  }
  return `object at line ${sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1}`
}

const findings = []
let objectsChecked = 0
let filesChecked = 0

for (const dir of SCAN_DIRS) {
  for (const file of sourceFiles(join(ROOT, dir))) {
    const text = readFileSync(file, 'utf8')
    if (!LOCALES.some(locale => text.includes(locale))) continue
    filesChecked += 1
    const sourceFile = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
    for (const { node, present } of localeObjects(sourceFile)) {
      objectsChecked += 1
      const where = `${relative(ROOT, file)} › ${describe(node, sourceFile)}`
      const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1

      if (present.length !== LOCALES.length) {
        findings.push({
          where,
          line,
          kind: 'missing-locale',
          detail: `declares ${present.join(', ')} but not ${LOCALES.filter(locale => !present.includes(locale)).join(', ')}`,
        })
        continue
      }

      const byLocale = new Map()
      for (const property of node.properties) {
        if (!ts.isPropertyAssignment(property)) continue
        const name = propertyName(property.name)
        if (name !== null && LOCALES.includes(name)) byLocale.set(name, keyPaths(property.initializer))
      }

      const base = byLocale.get(BASE_LOCALE)
      if (!base || base.size === 0) continue
      for (const locale of LOCALES) {
        if (locale === BASE_LOCALE) continue
        const other = byLocale.get(locale)
        if (!other) continue
        const missing = [...base].filter(key => !other.has(key))
        const extra = [...other].filter(key => !base.has(key))
        if (missing.length)
          findings.push({ where, line, kind: 'missing-key', detail: `${locale} is missing: ${missing.join(', ')}` })
        if (extra.length)
          findings.push({
            where,
            line,
            kind: 'extra-key',
            detail: `${locale} has keys ${BASE_LOCALE} does not: ${extra.join(', ')}`,
          })
      }
    }
  }
}

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ filesChecked, objectsChecked, findings }, null, 2))
} else {
  console.log(`${objectsChecked} locale copy objects checked across ${filesChecked} files.`)
  if (findings.length === 0) {
    console.log(`All three locales declare the same keys (${BASE_LOCALE} is authoritative).`)
  } else {
    for (const finding of findings)
      console.error(`${finding.where}:${finding.line} [${finding.kind}] ${finding.detail}`)
    console.error(`\n${findings.length} locale parity finding(s).`)
  }
}

if (findings.length > 0) process.exit(1)
