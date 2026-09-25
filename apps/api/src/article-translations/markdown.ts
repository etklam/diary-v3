import { randomBytes } from 'node:crypto'
import { unified } from 'unified'
import remarkGfm from 'remark-gfm'
import remarkParse from 'remark-parse'
import remarkStringify from 'remark-stringify'
import { TranslationProviderError, type ArticleTranslationLocale, type TranslationProvider, type TranslationUsageMetadata } from './types.js'

export interface TranslateMarkdownOptions {
  markdown: string
  sourceLocale: ArticleTranslationLocale
  targetLocale: ArticleTranslationLocale
  articleAccess: 'PUBLIC' | 'MEMBER'
  signal?: AbortSignal
}

export interface TranslateMarkdownResult {
  markdown: string
  provider: 'edge' | 'ai'
  model: string | null
  usage: TranslationUsageMetadata | null
  translatedBlockCount: number
}

export interface TranslateMarkdownDocumentsResult {
  documents: Record<string, string>
  provider: 'edge' | 'ai'
  model: string | null
  usage: TranslationUsageMetadata | null
  translatedBlockCount: number
}

interface TextRange { start: number; end: number }
interface MarkdownUnit { kind: 'heading' | 'paragraph' | 'list-item' | 'blockquote' | 'table-cell'; range: TextRange }
interface Marker { value: string; structural: boolean; immutable: boolean }
interface PreparedUnit { block: string; markerPrefix: string; markers: Map<string, Marker>; structureOrder: string[] }
interface MdNode {
  type: string
  position?: { start: { offset?: number; line: number }; end: { offset?: number; line: number } }
  children?: MdNode[]
  [key: string]: unknown
}

const MAX_MARKDOWN_BYTES = 1_000_000
const MAX_MARKDOWN_UNITS = 1_000
const MAX_TRANSLATED_BLOCK_BYTES = 32_000
const markdownProcessor = unified().use(remarkParse).use(remarkGfm).use(remarkStringify)

function parseMarkdown(markdown: string): MdNode {
  return markdownProcessor.parse(markdown) as unknown as MdNode
}

function nodeOffset(node: MdNode, edge: 'start' | 'end'): number | null {
  const offset = node.position?.[edge].offset
  return typeof offset === 'number' ? offset : null
}

function isAncestor(ancestors: readonly string[], type: string): boolean { return ancestors.includes(type) }

function trimmedRange(markdown: string, start: number, end: number): TextRange | null {
  while (start < end && /\s/.test(markdown[start]!)) start++
  while (end > start && /\s/.test(markdown[end - 1]!)) end--
  return start < end ? { start, end } : null
}

function headingContentRange(markdown: string, node: MdNode): TextRange | null {
  const start = nodeOffset(node, 'start')
  const end = nodeOffset(node, 'end')
  if (start === null || end === null) return null
  const lineStart = Math.max(markdown.lastIndexOf('\n', start - 1), markdown.lastIndexOf('\r', start - 1)) + 1
  const lineEndCandidates = [markdown.indexOf('\n', start), markdown.indexOf('\r', start)].filter(offset => offset >= 0)
  const lineEnd = Math.min(...(lineEndCandidates.length ? lineEndCandidates : [end]))
  const text = markdown.slice(lineStart, lineEnd)
  const prefixLength = text.match(/^ {0,3}#{1,6}[ \t]+/)?.[0].length ?? 0
  let contentEnd = lineEnd
  if (prefixLength) {
    const closing = text.slice(prefixLength).match(/[ \t]+#+[ \t]*$/)
    if (closing) contentEnd -= closing[0].length
  }
  return trimmedRange(markdown, lineStart + prefixLength, contentEnd)
}

function tableCellContentRange(markdown: string, node: MdNode): TextRange | null {
  const start = nodeOffset(node, 'start')
  const end = nodeOffset(node, 'end')
  if (start === null || end === null) return null
  let contentStart = start
  let contentEnd = end
  if (markdown[contentStart] === '|') contentStart++
  if (markdown[contentEnd - 1] === '|') contentEnd--
  return trimmedRange(markdown, contentStart, contentEnd)
}

function discoverUnits(markdown: string, root: MdNode): MarkdownUnit[] {
  const units: MarkdownUnit[] = []
  const visit = (node: MdNode, ancestors: readonly string[]): void => {
    const nextAncestors = [...ancestors, node.type]
    if (node.type === 'heading') {
      const range = headingContentRange(markdown, node)
      if (range) units.push({ kind: 'heading', range })
      return
    }
    if (node.type === 'tableCell') {
      const range = tableCellContentRange(markdown, node)
      if (range) units.push({ kind: 'table-cell', range })
      return
    }
    if (node.type === 'paragraph') {
      const start = nodeOffset(node, 'start')
      const end = nodeOffset(node, 'end')
      if (start !== null && end !== null) {
        const kind = isAncestor(ancestors, 'listItem') ? 'list-item' : isAncestor(ancestors, 'blockquote') ? 'blockquote' : 'paragraph'
        const range = trimmedRange(markdown, start, end)
        if (range) units.push({ kind, range })
      }
      return
    }
    for (const child of node.children ?? []) visit(child, nextAncestors)
  }
  visit(root, [])
  return units
}

function findClosingBracket(text: string, start: number, open: string, close: string): number {
  let depth = 0
  for (let index = start; index < text.length; index++) {
    if (text[index] === '\\') { index++; continue }
    if (text[index] === open) depth++
    if (text[index] === close && --depth === 0) return index
  }
  return -1
}

function findClosingParenthesis(text: string, start: number): number {
  let depth = 0
  let quote = ''
  for (let index = start; index < text.length; index++) {
    const character = text[index]!
    if (character === '\\') { index++; continue }
    if (quote) { if (character === quote) quote = ''; continue }
    if (character === '"' || character === "'") { quote = character; continue }
    if (character === '(') depth++
    if (character === ')' && --depth === 0) return index
  }
  return -1
}

const immutablePatterns = [
  /^(?:https?:\/\/[^\s<>"']+)/i,
  /^(?:\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,6})?)?(?:Z|[+-]\d{2}:?\d{2})?)?(?:\s+[A-Z]{2,5})?)/,
  /^(?:[+-]?(?:[$€£¥]\s*)?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?(?:\s?(?:%|bps?|x))?)/i,
  /^(?:[A-Z][A-Z0-9]{0,5}(?:[.-][A-Z])?)/,
] as const

function matchingEmphasis(text: string, index: number): string | null {
  for (const delimiter of ['***', '___', '**', '__', '~~', '*', '_']) {
    if (text.startsWith(delimiter, index)) return delimiter
  }
  return null
}

function isWordCharacter(value: string | undefined): boolean { return value !== undefined && /[A-Za-z0-9_]/.test(value) }

function findUnescapedSequence(text: string, sequence: string, start: number): number {
  for (let index = text.indexOf(sequence, start); index !== -1; index = text.indexOf(sequence, index + sequence.length)) {
    let slashCount = 0
    for (let prior = index - 1; prior >= 0 && text[prior] === '\\'; prior--) slashCount++
    if (slashCount % 2 === 0) return index
  }
  return -1
}

function citationToken(text: string): string | null {
  const match = text.match(/^\[(?:\d+(?:,[ \t]*\d+)*|\^?[A-Za-z]+[-_:][A-Za-z0-9_.:-]+|@[-A-Za-z0-9_.:]+)\]/)
  return match?.[0] ?? null
}

function protectInline(text: string, markerPrefix: string, markers: Map<string, Marker>, structureOrder: string[]): string {
  let result = ''
  let nextMarker = markers.size
  const marker = (value: string, structural: boolean, immutable = !structural): string => {
    const token = `${markerPrefix}${String(nextMarker++).padStart(4, '0')}QXZ`
    markers.set(token, { value, structural, immutable })
    if (structural) structureOrder.push(token)
    return token
  }
  for (let index = 0; index < text.length;) {
    if ((text[index] === '\r' || text[index] === '\n') || (text[index] === ' ' || text[index] === '\t') && /^[ \t]{2,}(?=\r?\n)/.test(text.slice(index))) {
      let end = index
      if (text[index] !== '\r' && text[index] !== '\n') while (text[end] === ' ' || text[end] === '\t') end++
      if (text[end] === '\r' && text[end + 1] === '\n') end += 2
      else if (text[end] === '\r' || text[end] === '\n') end++
      const continuation = text.slice(end).match(/^[ \t]{0,3}(?:>[ \t]*)+/)?.[0]
      if (continuation) end += continuation.length
      else while (text[end] === ' ' || text[end] === '\t') end++
      result += marker(text.slice(index, end), true)
      index = end
      continue
    }
    if (text[index] === '\\' && index + 1 < text.length) {
      result += marker(text.slice(index, index + 2), true)
      index += 2
      continue
    }
    if (text[index] === '`') {
      let run = 1
      while (text[index + run] === '`') run++
      const closing = text.indexOf('`'.repeat(run), index + run)
      if (closing !== -1) {
        const end = closing + run
        result += marker(text.slice(index, end), true, true)
        index = end
        continue
      }
    }
    if (text[index] === '$') {
      const delimiter = text.startsWith('$$', index) ? '$$' : '$'
      const closing = findUnescapedSequence(text, delimiter, index + delimiter.length)
      if (closing !== -1 && closing > index + delimiter.length) {
        const end = closing + delimiter.length
        result += marker(text.slice(index, end), true, true)
        index = end
        continue
      }
    }
    const mathDelimiter = text.startsWith('\\(', index) ? '\\)' : text.startsWith('\\[', index) ? '\\]' : null
    if (mathDelimiter) {
      const closing = findUnescapedSequence(text, mathDelimiter, index + 2)
      if (closing !== -1) {
        const end = closing + 2
        result += marker(text.slice(index, end), true, true)
        index = end
        continue
      }
    }
    const image = text.startsWith('![', index)
    const bracketStart = image ? index + 1 : index
    if (text[bracketStart] === '[') {
      const citation = citationToken(text.slice(bracketStart))
      if (citation) {
        result += marker(citation, false)
        index = bracketStart + citation.length
        continue
      }
      const closingBracket = findClosingBracket(text, bracketStart, '[', ']')
      if (closingBracket !== -1) {
        const label = text.slice(bracketStart + 1, closingBracket)
        const after = closingBracket + 1
        const imagePrefix = image ? '!' : ''
        if (text[after] === '(') {
          const closingParen = findClosingParenthesis(text, after)
          if (closingParen !== -1) {
            result += marker(`${imagePrefix}[`, true) + protectInline(label, markerPrefix, markers, structureOrder)
            result += marker(text.slice(closingBracket, closingParen + 1), true)
            index = closingParen + 1
            continue
          }
        }
        if (text[after] === '[') {
          const referenceEnd = findClosingBracket(text, after, '[', ']')
          if (referenceEnd !== -1) {
            result += marker(`${imagePrefix}[`, true) + protectInline(label, markerPrefix, markers, structureOrder)
            result += marker(text.slice(closingBracket, referenceEnd + 1), true)
            index = referenceEnd + 1
            continue
          }
        }
      }
    }
    if (text[index] === '<') {
      const closing = text.indexOf('>', index + 1)
      if (closing !== -1 && /^(?:https?:\/\/|\/?[A-Za-z][^>]*|!|\?)/i.test(text.slice(index + 1, closing))) {
        result += marker(text.slice(index, closing + 1), true)
        index = closing + 1
        continue
      }
    }
    let immutable: string | undefined
    for (const pattern of immutablePatterns) {
      const candidate = text.slice(index).match(pattern)?.[0]
      if (!candidate) continue
      if (pattern === immutablePatterns[0] && /[.,!?;:，。！？；：)\]}]$/.test(candidate)) {
        const trimmed = candidate.replace(/[.,!?;:，。！？；：)\]}]+$/u, '')
        if (trimmed.length) immutable = trimmed
      } else {
        const previous = text[index - 1]
        const next = text[index + candidate.length]
        if ((pattern === immutablePatterns[2] || pattern === immutablePatterns[3]) && (isWordCharacter(previous) || isWordCharacter(next))) continue
        immutable = candidate
      }
      if (immutable) break
    }
    if (immutable) {
      result += marker(immutable, false)
      index += immutable.length
      continue
    }
    const emphasis = matchingEmphasis(text, index)
    if (emphasis) {
      result += marker(emphasis, true)
      index += emphasis.length
      continue
    }
    result += text[index]
    index++
  }
  return result
}

function prepareUnit(markdown: string, unit: MarkdownUnit): PreparedUnit {
  const markerPrefix = `ZXQ${randomBytes(5).toString('hex').toUpperCase()}P`
  const markers = new Map<string, Marker>()
  const structureOrder: string[] = []
  const block = protectInline(markdown.slice(unit.range.start, unit.range.end), markerPrefix, markers, structureOrder)
  if (Buffer.byteLength(block, 'utf8') > MAX_TRANSLATED_BLOCK_BYTES) throw new TranslationProviderError('TRANSLATION_INPUT_TOO_LARGE')
  return { block, markerPrefix, markers, structureOrder }
}

function decodedBlock(output: string, prepared: PreparedUnit): string {
  const markerRegex = new RegExp(`${prepared.markerPrefix}\\d{4}QXZ`, 'g')
  const found: string[] = output.match(markerRegex) ?? []
  const expected = [...prepared.markers.keys()]
  if (found.length !== expected.length || new Set(found).size !== found.length || expected.some(token => !found.includes(token))) {
    throw new TranslationProviderError('TRANSLATION_OUTPUT_INVALID')
  }
  let prior = -1
  for (const token of prepared.structureOrder) {
    const position = output.indexOf(token)
    if (position <= prior) throw new TranslationProviderError('TRANSLATION_OUTPUT_INVALID')
    prior = position
  }
  const unprotected = output.replace(markerRegex, '')
  if (/(?:https?:\/\/|`|!\[|\]\(|(?:\*\*|__|~~)|(?:^|\s)#{1,6}\s)/i.test(unprotected)) {
    throw new TranslationProviderError('TRANSLATION_OUTPUT_INVALID')
  }
  const restored = output.replace(markerRegex, token => {
    const value = prepared.markers.get(token)?.value
    if (value === undefined) throw new TranslationProviderError('TRANSLATION_OUTPUT_INVALID')
    return value
  })
  if (restored.includes(prepared.markerPrefix)) throw new TranslationProviderError('TRANSLATION_OUTPUT_INVALID')
  return restored
}

function structuralSignature(root: MdNode): string {
  const keys = ['depth', 'ordered', 'start', 'spread', 'align', 'url', 'title', 'identifier', 'label'] as const
  const visit = (node: MdNode): unknown => {
    const attrs: Record<string, unknown> = {}
    for (const key of keys) if (node[key] !== undefined) attrs[key] = node[key]
    if (node.type === 'code' || node.type === 'inlineCode' || node.type === 'html') attrs.value = node.value
    return [node.type, attrs, (node.children ?? []).map(visit)]
  }
  return JSON.stringify(visit(root))
}

function immutableValues(markdown: string): string[][] {
  const units = discoverUnits(markdown, parseMarkdown(markdown))
  return units.map(unit => {
    const prepared = prepareUnit(markdown, unit)
    return [...prepared.markers.values()].filter(value => value.immutable).map(value => value.value).sort()
  })
}

export function assertMarkdownTranslationPreservesSource(source: string, candidate: string): void {
  const sourceTree = parseMarkdown(source)
  const candidateTree = parseMarkdown(candidate)
  markdownProcessor.stringify(candidateTree as never)
  if (structuralSignature(sourceTree) !== structuralSignature(candidateTree)) throw new TranslationProviderError('TRANSLATION_OUTPUT_INVALID')
  const sourceValues = immutableValues(source)
  const candidateValues = immutableValues(candidate)
  if (sourceValues.length !== candidateValues.length || sourceValues.some((values, index) => JSON.stringify(values) !== JSON.stringify(candidateValues[index]))) {
    throw new TranslationProviderError('TRANSLATION_OUTPUT_INVALID')
  }
}

export async function translateMarkdown(markdown: string, options: TranslateMarkdownOptions, provider: TranslationProvider): Promise<TranslateMarkdownResult> {
  const translated = await translateMarkdownDocuments([{ key: 'content', markdown }], options, provider)
  return {
    markdown: translated.documents.content ?? markdown,
    provider: translated.provider,
    model: translated.model,
    usage: translated.usage,
    translatedBlockCount: translated.translatedBlockCount,
  }
}

export async function translateMarkdownDocuments(
  documents: readonly { key: string; markdown: string }[],
  options: Omit<TranslateMarkdownOptions, 'markdown'>,
  provider: TranslationProvider,
): Promise<TranslateMarkdownDocumentsResult> {
  if (documents.length === 0 || new Set(documents.map(document => document.key)).size !== documents.length || documents.some(document => !document.key)) {
    throw new TranslationProviderError('TRANSLATION_CONFIGURATION_INVALID')
  }
  if (documents.reduce((total, document) => total + Buffer.byteLength(document.markdown, 'utf8'), 0) > MAX_MARKDOWN_BYTES) {
    throw new TranslationProviderError('TRANSLATION_INPUT_TOO_LARGE')
  }
  if (options.sourceLocale === options.targetLocale) throw new TranslationProviderError('TRANSLATION_CONFIGURATION_INVALID')
  const parsedDocuments = documents.map(document => ({ ...document, sourceTree: parseMarkdown(document.markdown) }))
  const units = parsedDocuments.flatMap(document => discoverUnits(document.markdown, document.sourceTree).map(unit => ({ ...unit, key: document.key })))
  if (units.length > MAX_MARKDOWN_UNITS) throw new TranslationProviderError('TRANSLATION_INPUT_TOO_LARGE')
  if (units.length === 0) {
    return {
      documents: Object.fromEntries(documents.map(document => [document.key, document.markdown])),
      provider: provider.id,
      model: null,
      usage: null,
      translatedBlockCount: 0,
    }
  }
  const markdownByKey = new Map(documents.map(document => [document.key, document.markdown]))
  const prepared = units.map(unit => prepareUnit(markdownByKey.get(unit.key) ?? '', unit))
  const response = await provider.translate({
    sourceLocale: options.sourceLocale,
    targetLocale: options.targetLocale,
    articleAccess: options.articleAccess,
    blocks: prepared.map(unit => unit.block),
    ...(options.signal ? { signal: options.signal } : {}),
  })
  if (!Array.isArray(response.translations) || response.translations.length !== prepared.length) throw new TranslationProviderError('TRANSLATION_OUTPUT_INVALID')
  const replacementsByKey = new Map<string, { range: TextRange; value: string }[]>()
  units.forEach((unit, index) => replacementsByKey.set(unit.key, [
    ...(replacementsByKey.get(unit.key) ?? []),
    { range: unit.range, value: decodedBlock(response.translations[index]!, prepared[index]!) },
  ]))
  const translatedDocuments: Record<string, string> = {}
  for (const document of parsedDocuments) {
    let translated = document.markdown
    const replacements = replacementsByKey.get(document.key) ?? []
    replacements.sort((left, right) => right.range.start - left.range.start)
    for (const replacement of replacements) translated = `${translated.slice(0, replacement.range.start)}${replacement.value}${translated.slice(replacement.range.end)}`
    const translatedTree = parseMarkdown(translated)
    markdownProcessor.stringify(translatedTree as never)
    if (structuralSignature(document.sourceTree) !== structuralSignature(translatedTree)) throw new TranslationProviderError('TRANSLATION_OUTPUT_INVALID')
    translatedDocuments[document.key] = translated
  }
  return { documents: translatedDocuments, provider: response.provider, model: response.model, usage: response.usage, translatedBlockCount: prepared.length }
}

export function markdownTranslationUnitCount(markdown: string): number {
  return discoverUnits(markdown, parseMarkdown(markdown)).length
}
