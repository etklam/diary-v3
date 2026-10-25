/**
 * Compile-time locale parity for per-surface copy.
 *
 * The product ships zh-TW (default), zh-CN and en, and the copy lives in ~115
 * per-surface objects kept in sync by hand. TypeScript already rejects a *read*
 * of a key one locale lacks, so the gap this closes is the other direction:
 * keys nobody reads yet, and extra keys in a non-default locale. The first run
 * of `scripts/check-locale-parity.mjs` found seven of exactly that shape in
 * Research Studio, where an English fallback merge had been quietly rendering
 * English strings inside a Chinese page.
 *
 * zh-TW is authoritative because it is the default locale, matching
 * `check-locale-parity.mjs`.
 *
 * Both translation arms are fresh object literals checked against the inferred
 * base shape, so a missing key fails as a missing property and an extra key
 * fails excess-property checking. Values keep whatever shape the base declares
 * — string, array, nested object or function — rather than being forced to
 * `string`.
 */

export type Locale = 'zh-TW' | 'zh-CN' | 'en'

export function defineCopy<T extends object>(
  base: T,
  translations: { 'zh-CN': { [K in keyof T]: T[K] }; en: { [K in keyof T]: T[K] } },
): Record<Locale, T> {
  return { 'zh-TW': base, 'zh-CN': translations['zh-CN'], en: translations.en }
}
