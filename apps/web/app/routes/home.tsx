import { Link, type MetaFunction } from 'react-router';
import Overview from '../overview';
import { useSessionState } from '../session';
import { useUi } from '../ui';
import { Icon } from '../icons';
import { TOOLS } from '../tool-shell';
import '../public.css';

export const meta: MetaFunction = () => [
  { title: 'Trade basic — Investment decisions, kept traceable' },
  { name: 'description', content: 'Record an investment decision, connect later evidence, and review what changed.' },
];

const copy = {
  en: {
    title: 'Keep investment decisions traceable.', intro: 'Record what you believed, what you observed, and what remained uncertain. Later, return to the same decision with evidence and a review.', primaryCta: 'Start your diary', secondaryCta: 'Try the tools', heroNote: 'No account needed for the calculators and research tools.', previewTitle: 'Demand recovery still unconfirmed', previewBadge: 'Reviewed', trace: [['2026-06-18', 'Original reasoning', 'Bought on the assumption that demand recovers by Q3. If units come in flat, the reason to hold is gone.'], ['2026-08-27', 'Later evidence', 'Q2 units flat year on year. The recovery is not in the data yet.'], ['2026-09-30', 'Review', 'The price recovered; the assumption did not. Cut to a half position and recorded what would have changed my mind.']], previewSymbol: 'SYN', ledgerLast: 'Last close', ledgerLastValue: '110.00', ledgerSince: 'Since the entry', ledgerSinceValue: '+10.00 (+10.00%)', previewSynthetic: 'Synthetic data · interface illustration, not a real account or market.', previewAlt: 'Interface illustration: one synthetic decision recorded three times — the original reasoning in June, later evidence in August, and a review in September — beside a synthetic quote showing the price up 10 percent. Not a real account or market.', stepsTitle: 'A decision stays readable through three steps', steps: [['Record', 'Write the original thesis, observation and uncertainty while the decision is fresh.'], ['Connect evidence', 'Keep research and transactions close to the decision they explain.'], ['Review', 'Return later, compare the outcome with the original reasoning, and record what changed.']], toolsTitle: 'Or start with the tools, no account needed', toolsIntro: 'Every calculator and research tool below works for guests. Sign in only to save results into your own diary.', use: 'Use', closing: 'Start with one decision you want to understand later.', register: 'Create an account'
  },
  'zh-TW': {
    title: '讓投資決策保持可追溯。', intro: '記下你當時相信甚麼、觀察到甚麼，以及仍未確定的事情。之後回到同一個決策，連同證據一起複盤。', primaryCta: '開始記錄投資日記', secondaryCta: '先試用工具', heroNote: '計算及研究工具毋須帳戶即可使用。', previewTitle: '需求回升仍未獲證實', previewBadge: '已複盤', trace: [['2026-06-18', '原始判斷', '買入時假設需求會在第三季回升。若出貨量持平，持有的理由便不再成立。'], ['2026-08-27', '後續證據', '第二季出貨量按年持平，回升仍未反映在數據上。'], ['2026-09-30', '複盤', '價格回升了，假設卻沒有。減至半個部位，並記下甚麼才會讓我改變想法。']], previewSymbol: 'SYN', ledgerLast: '最後收市價', ledgerLastValue: '110.00', ledgerSince: '自買入至今', ledgerSinceValue: '+10.00 (+10.00%)', previewSynthetic: '合成資料・介面示意，不代表真實帳戶或市場。', previewAlt: '介面示意：同一個合成決策被記錄三次——六月的原始判斷、八月的後續證據、九月的複盤——旁邊是上升一成的合成報價。不代表真實帳戶或市場。', stepsTitle: '一個決策透過三步保持可讀', steps: [['記錄', '在決策仍然清晰時，寫下原本的論點、觀察和不確定之處。'], ['連結證據', '把研究和交易放在能解釋它們的決策旁邊。'], ['複盤', '之後回看，把結果與原本的思路比較，並記下甚麼改變了。']], toolsTitle: '或者先從工具開始，毋須帳戶', toolsIntro: '以下計算及研究工具訪客即可完整使用；只有把結果存入自己的日記時才需要登入。', use: '使用', closing: '從一個你想在日後理解得更清楚的決策開始。', register: '建立帳戶'
  },
  'zh-CN': {
    title: '让投资决策保持可追溯。', intro: '记下你当时相信什么、观察到什么，以及还未确定的事情。之后回到同一个决策，连同证据一起复盘。', primaryCta: '开始记录投资日记', secondaryCta: '先试用工具', heroNote: '计算及研究工具无需账户即可使用。', previewTitle: '需求回升仍未获证实', previewBadge: '已复盘', trace: [['2026-06-18', '原始判断', '买入时假设需求会在第三季回升。若出货量持平，持有的理由便不再成立。'], ['2026-08-27', '后续证据', '第二季出货量按年持平，回升仍未反映在数据上。'], ['2026-09-30', '复盘', '价格回升了，假设却没有。减至半个部位，并记下什么才会让我改变想法。']], previewSymbol: 'SYN', ledgerLast: '最后收市价', ledgerLastValue: '110.00', ledgerSince: '自买入至今', ledgerSinceValue: '+10.00 (+10.00%)', previewSynthetic: '合成数据・界面示意，不代表真实账户或市场。', previewAlt: '界面示意：同一个合成决策被记录三次——六月的原始判断、八月的后续证据、九月的复盘——旁边是上升一成的合成报价。不代表真实账户或市场。', stepsTitle: '一个决策通过三步保持可读', steps: [['记录', '在决策仍然清晰时，写下原本的论点、观察和不确定之处。'], ['连接证据', '把研究和交易放在能解释它们的决策旁边。'], ['复盘', '之后回看，把结果与原本的思路比较，并记下什么改变了。']], toolsTitle: '或者先从工具开始，无需账户', toolsIntro: '以下计算和研究工具访客即可完整使用；只有把结果存入自己的日记时才需要登录。', use: '使用', closing: '从一个你想在日后理解得更清楚的决策开始。', register: '创建账户'
  },
} as const;

export default function Home() {
  const { locale } = useUi();
  const session = useSessionState();
  if (session.authenticated === true) return <Overview />;
  const c = copy[locale];
  return <section className="public-page public-home">
    <header className="home-hero">
      <div className="home-hero-intro">
        <h1>{c.title}</h1>
        <p className="lede">{c.intro}</p>
        <div className="actions">
          <Link className="button" to="/register">{c.primaryCta}</Link>
          <Link className="button secondary" to="/tools">{c.secondaryCta}</Link>
        </div>
        <p className="home-hero-note">{c.heroNote}</p>
      </div>
      {/* The product's claim is that one decision stays readable over months, so
          the illustration is a date axis carrying the same decision three times
          — not a screenshot of a dashboard. `role="img"` keeps assistive tech
          from reading synthetic figures as a real account; the label describes
          what the illustration shows instead. */}
      <figure className="home-preview">
        <div className="home-preview-window" role="img" aria-label={c.previewAlt}>
          <div className="home-preview-head">
            <strong>{c.previewTitle}</strong>
            <span className="badge">{c.previewBadge}</span>
          </div>
          <ol className="home-trace">
            {c.trace.map(([date, label, body]) => <li key={date}>
              <time dateTime={date}>{date}</time>
              <span className="home-trace-label">{label}</span>
              <p>{body}</p>
            </li>)}
          </ol>
          <div className="ledger home-preview-ledger">
            <div className="ledger-row"><span>{c.previewSymbol} · {c.ledgerLast}</span><span>{c.ledgerLastValue}</span></div>
            <div className="ledger-row"><span>{c.ledgerSince}</span><span className="market-up">{c.ledgerSinceValue}</span></div>
          </div>
        </div>
        <figcaption className="home-preview-note">{c.previewSynthetic}</figcaption>
      </figure>
    </header>
    <section className="public-section" aria-labelledby="public-steps-title">
      <h2 id="public-steps-title">{c.stepsTitle}</h2>
      <ol className="public-steps">{c.steps.map(([title, body]) => <li key={title}><h3>{title}</h3><p>{body}</p></li>)}</ol>
    </section>
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
    <section className="public-closing"><p>{c.closing}</p><Link className="button" to="/register">{c.register}</Link></section>
  </section>;
}
