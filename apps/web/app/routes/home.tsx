import { Link, type MetaFunction } from 'react-router';
import Overview from '../overview';
import { useSessionState } from '../session';
import { useUi } from '../ui';
import '../public.css';

export const meta: MetaFunction = () => [
  { title: 'diary-v3 — Investment decisions, kept traceable' },
  { name: 'description', content: 'Record an investment decision, connect later evidence, and review what changed.' },
];

const copy = {
  en: {
    eyebrow: 'Investment decision diary', title: 'Keep investment decisions traceable.', intro: 'Record what you believed, what you observed, and what remained uncertain. Later, return to the same decision with evidence and a review.', register: 'Create an account', guide: 'Read the guide', example: 'Synthetic diary example', thesis: 'Thesis · demand may recover after the price reset', observation: 'Observation · 2026-09-04', observationText: 'The latest demand signal is not enough to confirm the recovery. Keep the original assumption visible.', review: 'Later review · 2026-10-02', reviewText: 'The price moved, but that alone did not prove the thesis. The missing evidence was still the question to carry forward.', synthetic: 'Synthetic example, not a real account or market record', stepsTitle: 'A decision stays readable through three steps', steps: [['Record', 'Write the original thesis, observation and uncertainty while the decision is fresh.'], ['Connect evidence', 'Keep research and transactions close to the decision they explain.'], ['Review', 'Return later, compare the outcome with the original reasoning, and record what changed.']], closing: 'Start with one decision you want to understand later.'
  },
  'zh-TW': {
    eyebrow: '投資決策日記', title: '讓投資決策保持可追溯。', intro: '記下你當時相信甚麼、觀察到甚麼，以及仍未確定的事情。之後回到同一個決策，連同證據一起複盤。', register: '建立帳戶', guide: '閱讀使用說明', example: '合成日記示例', thesis: '判斷・需求可能在價格重整後回升', observation: '觀察・2026-09-04', observationText: '最新需求訊號仍不足以確認回升，先讓原本的假設保持可見。', review: '稍後複盤・2026-10-02', reviewText: '價格有所變化，但這本身不能證明判斷成立。仍未取得的證據，是下一次要繼續追問的問題。', synthetic: '合成示例，不代表真實帳戶或市場記錄', stepsTitle: '一個決策透過三步保持可讀', steps: [['記錄', '在決策仍然清晰時，寫下原本的論點、觀察和不確定之處。'], ['連結證據', '把研究和交易放在能解釋它們的決策旁邊。'], ['複盤', '之後回看，把結果與原本的思路比較，並記下甚麼改變了。']], closing: '從一個你想在日後理解得更清楚的決策開始。'
  },
  'zh-CN': {
    eyebrow: '投资决策日记', title: '让投资决策保持可追溯。', intro: '记下你当时相信什么、观察到什么，以及仍未确定的事情。之后回到同一个决策，连同证据一起复盘。', register: '创建账户', guide: '阅读使用说明', example: '合成日记示例', thesis: '判断・需求可能在价格重整后回升', observation: '观察・2026-09-04', observationText: '最新需求信号仍不足以确认回升，先让原本的假设保持可见。', review: '稍后复盘・2026-10-02', reviewText: '价格有所变化，但这本身不能证明判断成立。仍未取得的证据，是下一次要继续追问的问题。', synthetic: '合成示例，不代表真实账户或市场记录', stepsTitle: '一个决策通过三步保持可读', steps: [['记录', '在决策仍然清晰时，写下原本的论点、观察和不确定之处。'], ['连接证据', '把研究和交易放在能解释它们的决策旁边。'], ['复盘', '之后回看，把结果与原本的思路比较，并记下什么改变了。']], closing: '从一个你想在日后理解得更清楚的决策开始。'
  },
} as const;

export default function Home() {
  const { locale } = useUi();
  const session = useSessionState();
  if (session.authenticated === true) return <Overview />;
  const c = copy[locale];
  return <section className="public-page public-home">
    <header className="public-hero"><div><p className="public-eyebrow">{c.eyebrow}</p><h1>{c.title}</h1><p className="lede">{c.intro}</p><div className="actions"><Link className="button" to="/register">{c.register}</Link><Link className="button secondary" to="/guide">{c.guide}</Link></div></div>
      <figure className="public-example" aria-labelledby="public-example-title"><figcaption id="public-example-title">{c.example}</figcaption><p className="public-example-label">{c.thesis}</p><p><time dateTime="2026-09-04">{c.observation}</time></p><p>{c.observationText}</p><p className="public-example-label">{c.review}</p><p><time dateTime="2026-10-02">{c.review}</time></p><p>{c.reviewText}</p><small>{c.synthetic}</small></figure>
    </header>
    <section className="public-section" aria-labelledby="public-steps-title"><h2 id="public-steps-title">{c.stepsTitle}</h2><ol className="public-steps">{c.steps.map(([title, body]) => <li key={title}><h3>{title}</h3><p>{body}</p></li>)}</ol></section>
    <section className="public-closing"><p>{c.closing}</p><Link className="button" to="/register">{c.register}</Link></section>
  </section>;
}
