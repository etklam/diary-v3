import { Link, type MetaFunction } from 'react-router';
import { useUi } from '../ui';
import '../public.css';

export const meta: MetaFunction = () => [
  { title: 'About Trade basic' },
  { name: 'description', content: 'A Diary-first workbench for recording investment decisions, research, transactions and review.' },
];

const copy = {
  en: { title: 'About Trade basic', intro: 'A Diary-first workbench for keeping an investment decision readable from its first observation to its later review.', purpose: 'The Diary is the starting point. It keeps the original reasoning, research evidence, transactions, reminders and later review in one decision context.', who: 'Who uses the workbench', whoText: 'It is for people who want to record investment decisions while they are forming, then return to the record instead of relying on memory alone.', distinction: 'Research and reflection have different jobs', distinctionText: 'Research captures evidence about a company, market or event. Reflection comes later: it compares what happened with the original reasoning and records what changed.', start: 'Read the guide', register: 'Create an account' },
  'zh-TW': { title: '關於 Trade basic', intro: '以日記為核心的工作台，讓投資決策從最初觀察一直保持可讀，直到之後複盤。', purpose: '日記是起點，把原本的思路、研究證據、交易、提醒和稍後的複盤放在同一個決策脈絡中。', who: '誰會使用這個工作台', whoText: '適合想在投資決策形成時先記錄，之後回到原本記錄，而不是只依賴記憶的人。', distinction: '研究與反思各有不同工作', distinctionText: '研究保存有關公司、市場或事件的證據。反思在之後發生：把結果與原本的思路比較，並記下甚麼改變了。', start: '閱讀使用說明', register: '建立帳戶' },
  'zh-CN': { title: '关于 Trade basic', intro: '以日记为核心的工作台，让投资决策从最初观察一直保持可读，直到之后复盘。', purpose: '日记是起点，把原本的思路、研究证据、交易、提醒和稍后的复盘放在同一个决策脉络中。', who: '谁会使用这个工作台', whoText: '适合想在投资决策形成时先记录，之后回到原本记录，而不是只依赖记忆的人。', distinction: '研究与反思各有不同工作', distinctionText: '研究保存有关公司、市场或事件的证据。反思在之后发生：把结果与原本的思路比较，并记下什么改变了。', start: '阅读使用说明', register: '创建账户' },
} as const;

export default function About() {
  const { locale } = useUi();
  const c = copy[locale];
  return <article className="public-page public-reading">
    <header><p className="public-eyebrow">Trade basic</p><h1>{c.title}</h1><p className="lede">{c.intro}</p></header>
    <section className="public-section"><h2>{c.purpose}</h2></section>
    <section className="public-section"><h2>{c.who}</h2><p>{c.whoText}</p></section>
    <section className="public-section"><h2>{c.distinction}</h2><p>{c.distinctionText}</p></section>
    <p className="actions"><Link className="button" to="/guide">{c.start}</Link><Link className="button secondary" to="/register">{c.register}</Link></p>
  </article>;
}
