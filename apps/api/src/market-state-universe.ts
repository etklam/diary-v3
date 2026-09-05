import { uniqueSymbols } from '@diary/domain/market-state/seed-universe-utils'

/** Configured stock basket used to calculate the persisted regime. */
export const MARKET_STATE_UNIVERSE_KEY = 'SP500_NDX'

const NASDAQ_100_SYMBOLS = [
  'AAPL', 'MSFT', 'NVDA', 'AMZN', 'META', 'AVGO', 'GOOGL', 'GOOG', 'TSLA', 'COST',
  'NFLX', 'AMD', 'PEP', 'ADBE', 'LIN', 'CSCO', 'TMUS', 'INTU', 'QCOM', 'TXN',
  'AMAT', 'BKNG', 'ISRG', 'AMGN', 'HON', 'CMCSA', 'VRTX', 'MU', 'PANW', 'ADP',
  'LRCX', 'ADI', 'GILD', 'SBUX', 'MELI', 'REGN', 'MDLZ', 'KLAC', 'INTC', 'CRWD',
  'CDNS', 'SNPS', 'PYPL', 'CEG', 'MAR', 'ASML', 'ORLY', 'ABNB', 'FTNT', 'CSX',
  'MRVL', 'NXPI', 'ROP', 'WDAY', 'DASH', 'PCAR', 'MNST', 'ADSK', 'CPRT', 'CHTR',
  'KDP', 'PAYX', 'ROST', 'AEP', 'FAST', 'TEAM', 'KHC', 'DDOG', 'BKR', 'ODFL',
  'CTAS', 'EA', 'EXC', 'VRSK', 'XEL', 'GEHC', 'IDXX', 'AZN', 'TTD', 'ZS',
  'BIIB', 'FANG', 'ON', 'DXCM', 'CDW', 'MDB', 'GFS', 'WBD', 'MCHP', 'ANSS',
  'ILMN', 'ARM', 'CCEP', 'TTWO', 'LULU', 'MRNA', 'WBA', 'SIRI', 'DLTR', 'LCUL',
]

const SP500_LARGE_CAP_SYMBOLS = [
  'AAPL', 'MSFT', 'NVDA', 'AMZN', 'META', 'GOOGL', 'GOOG', 'BRK-B', 'LLY', 'AVGO',
  'JPM', 'TSLA', 'UNH', 'XOM', 'V', 'MA', 'JNJ', 'PG', 'HD', 'COST',
  'ABBV', 'BAC', 'WMT', 'NFLX', 'KO', 'CRM', 'MRK', 'CVX', 'AMD', 'PEP',
  'ORCL', 'TMO', 'ADBE', 'LIN', 'ACN', 'MCD', 'CSCO', 'WFC', 'ABT', 'QCOM',
  'GE', 'DHR', 'IBM', 'TXN', 'AMAT', 'PM', 'VZ', 'CAT', 'NOW', 'INTU',
  'DIS', 'ISRG', 'NEE', 'UBER', 'GS', 'RTX', 'PFE', 'SPGI', 'AMGN', 'CMCSA',
  'T', 'LOW', 'UNP', 'PGR', 'HON', 'BLK', 'BKNG', 'COP', 'SYK', 'LMT',
  'TJX', 'ELV', 'VRTX', 'ETN', 'NKE', 'C', 'MU', 'BSX', 'MDT', 'PANW',
  'ADP', 'CB', 'PLD', 'ADI', 'SCHW', 'MMC', 'GILD', 'UPS', 'LRCX', 'AMT',
  'SBUX', 'KLAC', 'DE', 'REGN', 'MDLZ', 'CI', 'SO', 'BMY', 'FI', 'INTC',
  'MO', 'DUK', 'ICE', 'CL', 'ZTS', 'SHW', 'CME', 'EQIX', 'APH', 'WM',
  'MCO', 'CVS', 'PH', 'PYPL', 'CDNS', 'SNPS', 'AON', 'TDG', 'EOG', 'HCA',
  'GD', 'CMG', 'USB', 'PNC', 'MMM', 'MSI', 'ITW', 'NOC', 'APD', 'EMR',
  'FCX', 'ORLY', 'MAR', 'ROP', 'AJG', 'TGT', 'BDX', 'ECL', 'ADSK', 'CARR',
  'NSC', 'AFL', 'PSA', 'GM', 'FDX', 'HLT', 'SLB', 'PCAR', 'TRV', 'ROST',
  'BK', 'AZO', 'MET', 'O', 'DLR', 'DHI', 'SPG', 'KMB', 'AEP', 'ALL',
]

export const MARKET_STATE_SYMBOLS = uniqueSymbols([...NASDAQ_100_SYMBOLS, ...SP500_LARGE_CAP_SYMBOLS])
