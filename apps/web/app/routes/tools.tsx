import { Link } from 'react-router'
import { useUi } from '../ui'
import { Icon } from '../icons'
import { TOOLS } from '../tool-shell'

const copy = {
  en: { title: 'Tools', intro: 'Public calculators and research tools. Use them without an account; sign in only when you want to save private work.', calculator: 'Calculators', research: 'Research', use: 'Use the tool' },
  'zh-TW': { title: '工具', intro: '公開計算及研究工具。毋須帳戶即可使用；只有保存私人工作時才需要登入。', calculator: '計算工具', research: '研究工具', use: '使用工具' },
  'zh-CN': { title: '工具', intro: '公开计算和研究工具。无需账户即可使用；只有保存私人工作时才需要登录。', calculator: '计算工具', research: '研究工具', use: '使用工具' },
} as const

export default function ToolsIndex() {
  const { locale } = useUi()
  const c = copy[locale]
  return <section className="public-page tools-index-page">
    <header className="tools-index-header">
      <h1>{c.title}</h1>
      <p className="lede">{c.intro}</p>
    </header>
    {(['calculator', 'research'] as const).map(category => (
      <section className="public-section tools-index-group" key={category} aria-labelledby={`tools-group-${category}`}>
        <h2 id={`tools-group-${category}`}>{c[category]}</h2>
        <div className="tools-index-grid">
          {TOOLS.filter(tool => tool.category === category).map(tool => (
            <Link className="tool-card" key={tool.href} to={tool.href}>
              <span className="tool-card-icon"><Icon name={tool.icon} size={20} /></span>
              <h3>{tool.name[locale]}</h3>
              <p>{tool.purpose[locale]}</p>
              <span className="tool-card-go">{c.use} <Icon name="compass" size={14} /></span>
            </Link>
          ))}
        </div>
      </section>
    ))}
  </section>
}
