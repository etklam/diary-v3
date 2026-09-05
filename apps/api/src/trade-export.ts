import type { Database } from '@diary/db'
import { replayLedger, roundDecimalString } from '@diary/domain/ledger'
import { readUserLedger } from './ledger.js'

function csvField(value: string) {
  return /[,"\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value
}

export async function exportClosedTrades(db: Database, userId: bigint, symbol?: string) {
  const rows = await readUserLedger(db, userId)
  const { closedTrades } = replayLedger(rows.filter(row => !symbol || row.symbol === symbol).map(row => ({
    id: row.id.toString(), order: row.id, symbol: row.symbol, type: row.type,
    quantity: row.quantity, price: row.price, tradeDate: row.tradeDate,
  })))
  return [
    'symbol,sellDate,sellQuantity,sellPrice,avgCostBasis,realizedPnL,realizedPnLPct',
    ...closedTrades.map(trade => [
      // Spreadsheet formula prefixes are text, even when a legacy symbol contains them.
      /^[\s]*[=+\-@]|^[\t\r\n]/.test(trade.symbol) ? `'${trade.symbol}` : trade.symbol,
      trade.sellDate.toISOString().slice(0, 10), trade.sellQuantity, trade.sellPrice,
      trade.avgCostBasis, roundDecimalString(trade.realizedPnL, 2), roundDecimalString(trade.realizedPnLPct, 2),
    ].map(csvField).join(',')),
  ].join('\n')
}

export function tradeExportFilename(now: Date, symbol?: string) {
  // Keep a safe ASCII attachment name; the CSV retains the exact Unicode symbol.
  const suffix = symbol ? `-${symbol.replace(/[^A-Z0-9._-]/g, '_')}` : ''
  return `trades${suffix}-${now.toISOString().slice(0, 10)}.csv`
}
