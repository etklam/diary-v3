import { Link } from 'react-router'
import { useUi } from '../ui'

const copy = {
  en: { title: 'Tools', intro: 'Public calculators and research tools. Use them without an account; sign in only when you want to save private work.', calculator: 'Calculators', research: 'Research', position: 'Position sizing', fire: 'Financial freedom', relative: 'Relative value', seasonality: 'Seasonality', etf: 'ETF research', rotation: 'Market rotation', sec: 'SEC filings' },
  'zh-TW': { title: '工具', intro: '公開計算及研究工具。毋須帳戶即可使用；只有保存私人工作時才需要登入。', calculator: '計算工具', research: '研究工具', position: '部位計算', fire: '財務自由', relative: '相對價值', seasonality: '季節性', etf: 'ETF 研究', rotation: '市場輪動', sec: 'SEC 申報' },
  'zh-CN': { title: '工具', intro: '公开计算和研究工具。无需账户即可使用；只有保存私人工作时才需要登录。', calculator: '计算工具', research: '研究工具', position: '仓位计算', fire: '财务自由', relative: '相对价值', seasonality: '季节性', etf: 'ETF 研究', rotation: '市场轮动', sec: 'SEC 申报' },
} as const

export default function ToolsIndex() {
  const { locale } = useUi()
  const c = copy[locale]
  const groups = [[c.calculator, [['/tools/position-sizing', c.position], ['/tools/financial-freedom', c.fire], ['/tools/relative-value', c.relative]]], [c.research, [['/tools/seasonality', c.seasonality], ['/tools/etf', c.etf], ['/tools/market-rotation', c.rotation], ['/tools/sec-filings', c.sec]]]] as const
  return <section className="public-page tools-index-page"><header className="public-reading"><h1>{c.title}</h1><p className="lede">{c.intro}</p></header>{groups.map(([heading, links]) => <section className="public-section" key={heading}><h2>{heading}</h2><ul className="tools-index-list">{links.map(([to, label]) => <li key={to}><Link to={to}>{label}</Link></li>)}</ul></section>)}</section>
}
