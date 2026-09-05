export function uniqueSymbols(symbols: string[]): string[] {
  return Array.from(new Set(symbols.map(symbol => symbol.trim().toUpperCase()).filter(Boolean))).sort()
}
