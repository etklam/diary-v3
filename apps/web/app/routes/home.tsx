import { Link, type MetaFunction } from 'react-router';
import Overview from '../overview';
import { useSessionState } from '../session';
import { useUi } from '../ui';
import { Icon } from '../icons';
import { TOOLS } from '../tool-shell';
import '../public.css';

export const meta: MetaFunction = () => [
  { title: 'diary-v3 — Investment decisions, kept traceable' },
  { name: 'description', content: 'Record an investment decision, connect later evidence, and review what changed.' },
];

const copy = {
  en: {
    eyebrow: 'Investment decision diary', title: 'Keep investment decisions traceable.', intro: 'Record what you believed, what you observed, and what remained uncertain. Later, return to the same decision with evidence and a review.', primaryCta: 'Try the tools', secondaryCta: 'Start your diary', previewLabel: 'Interface preview', previewSynthetic: 'Interface preview with synthetic data — not a real account or market.', previewTitle: 'Demand signals still unconfirmed', previewDate: '2026-09-04', previewBody: 'Keep the original assumption visible until the next report confirms it.', previewBadge: 'Review due', previewSymbol: 'SYN', previewPrice: '110.00', previewChange: '+10.00 (+10.00%)', toolsTitle: 'Start with the tools — no account needed', toolsIntro: 'Every calculator and research tool below works for guests. Sign in only to save results into your own diary.', use: 'Use', stepsTitle: 'A decision stays readable through three steps', steps: [['Record', 'Write the original thesis, observation and uncertainty while the decision is fresh.'], ['Connect evidence', 'Keep research and transactions close to the decision they explain.'], ['Review', 'Return later, compare the outcome with the original reasoning, and record what changed.']], closing: 'Start with one decision you want to understand later.', register: 'Create an account'
  },
  'zh-TW': {
    eyebrow: '投資決策日記', title: '讓投資決策保持可追溯。', intro: '記下你當時相信甚麼、觀察到甚麼，以及仍未確定的事情。之後回到同一個決策，連同證據一起複盤。', primaryCta: '直接使用工具', secondaryCta: '開始記錄投資日記', previewLabel: '介面示意', previewSynthetic: '介面示意與合成資料，不代表真實帳戶或市場。', previewTitle: '需求訊號仍未確認', previewDate: '2026-09-04', previewBody: '在下一次報告確認之前，先讓原本的假設保持可見。', previewBadge: '待複盤', previewSymbol: 'SYN', previewPrice: '110.00', previewChange: '+10.00 (+10.00%)', toolsTitle: '先從工具開始，毋須帳戶', toolsIntro: '以下計算及研究工具訪客即可完整使用；只有把結果存入自己的日記時才需要登入。', use: '使用', stepsTitle: '一個決策透過三步保持可讀', steps: [['記錄', '在決策仍然清晰時，寫下原本的論點、觀察和不確定之處。'], ['連結證據', '把研究和交易放在能解釋它們的決策旁邊。'], ['複盤', '之後回看，把結果與原本的思路比較，並記下甚麼改變了。']], closing: '從一個你想在日後理解得更清楚的決策開始。', register: '建立帳戶'
  },
  'zh-CN': {
    eyebrow: '投资决策日记', title: '让投资决策保持可追溯。', intro: '记下你当时相信什么、观察到什么，以及还未确定的事情。之后回到同一个决策，连同证据一起复盘。', primaryCta: '直接使用工具', secondaryCta: '开始记录投资日记', previewLabel: '界面示意', previewSynthetic: '界面示意与合成数据，不代表真实账户或市场。', previewTitle: '需求信号仍未确认', previewDate: '2026-09-04', previewBody: '在下一次报告确认之前，先让原本的假设保持可见。', previewBadge: '待复盘', previewSymbol: 'SYN', previewPrice: '110.00', previewChange: '+10.00 (+10.00%)', toolsTitle: '先从工具开始，无需账户', toolsIntro: '以下计算和研究工具访客即可完整使用；只有把结果存入自己的日记时才需要登录。', use: '使用', stepsTitle: '一个决策通过三步保持可读', steps: [['记录', '在决策仍然清晰时，写下原本的论点、观察和不确定之处。'], ['连接证据', '把研究和交易放在能解释它们的决策旁边。'], ['复盘', '之后回看，把结果与原本的思路比较，并记下什么改变了。']], closing: '从一个你想在日后理解得更清楚的决策开始。', register: '创建账户'
  },
} as const;

export default function Home() {
  const { locale } = useUi();
  const session = useSessionState();
  if (session.authenticated === true) return <Overview />;
  const c = copy[locale];
  return <section className="public-page public-home">
    <header className="home-hero">
      <div>
        <p className="public-eyebrow">{c.eyebrow}</p>
        <h1>{c.title}</h1>
        <p className="lede">{c.intro}</p>
        <div className="actions">
          <Link className="button" to="/tools">{c.primaryCta}</Link>
          <Link className="button secondary" to="/register">{c.secondaryCta}</Link>
        </div>
      </div>
      <figure className="home-preview" aria-labelledby="home-preview-label">
        <div className="home-preview-window" role="img" aria-label={c.previewSynthetic}>
          <div className="home-preview-entry">
            <div className="home-preview-row"><strong>{c.previewTitle}</strong><span className="badge badge-warn">{c.previewBadge}</span></div>
            <p><time dateTime="2026-09-04">{c.previewDate}</time> · {c.previewBody}</p>
          </div>
          <div className="home-preview-quote">
            <strong>{c.previewSymbol}</strong>
            <span className="num">{c.previewPrice}</span>
            <span className="num market-up">{c.previewChange}</span>
          </div>
        </div>
        <figcaption className="home-preview-note" id="home-preview-label">{c.previewSynthetic}</figcaption>
      </figure>
    </header>
    <section className="public-section" aria-labelledby="home-tools-title">
      <h2 id="home-tools-title">{c.toolsTitle}</h2>
      <p className="lede home-tools-intro">{c.toolsIntro}</p>
      <div className="home-tools">
        {TOOLS.map(tool => <Link className="tool-card" key={tool.href} to={tool.href}>
          <span className="tool-card-icon"><Icon name={tool.icon} size={20} /></span>
          <h3>{tool.name[locale]}</h3>
          <p>{tool.purpose[locale]}</p>
          <span className="tool-card-go">{c.use} <Icon name="compass" size={14} /></span>
        </Link>)}
      </div>
    </section>
    <section className="public-section" aria-labelledby="public-steps-title">
      <h2 id="public-steps-title">{c.stepsTitle}</h2>
      <ol className="public-steps">{c.steps.map(([title, body]) => <li key={title}><h3>{title}</h3><p>{body}</p></li>)}</ol>
    </section>
    <section className="public-closing"><p>{c.closing}</p><Link className="button" to="/register">{c.register}</Link></section>
  </section>;
}
