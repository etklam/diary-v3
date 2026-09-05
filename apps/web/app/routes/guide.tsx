import { Link, type MetaFunction } from 'react-router';
import { useUi } from '../ui';
import '../public.css';

export const meta: MetaFunction = () => [
  { title: 'Guide — diary-v3' },
  { name: 'description', content: 'Practical steps for creating diaries, adding transactions, capturing research, reviewing decisions and managing preferences.' },
];

const copy = {
  en: { title: 'Guide', intro: 'Use the workbench in the order that fits the decision. Private routes ask you to sign in first and return you to the task.', signIn: 'Sign in', tasks: [{ title: 'Create or append a diary', body: 'Start a diary with the original thesis, observation and uncertainty. Return to the same record when the reasoning changes.', link: '/diaries/new', action: 'Open diary editor' }, { title: 'Add transactions', body: 'Keep a buy or sell beside the diary that explains the decision. The diary editor is the working entry point.', link: '/diaries/new', action: 'Open diary editor' }, { title: 'Capture research', body: 'Use the company research area to keep evidence, notes and a dated record connected to a symbol.', link: '/stocks', action: 'Open company research' }, { title: 'Complete a review', body: 'Return to the review queue, compare later evidence with the original reasoning, and record what changed.', link: '/reviews', action: 'Open review queue' }, { title: 'Manage account preferences', body: 'Set language, theme, timezone and account settings from Preferences after signing in.', link: '/settings', action: 'Open preferences' }], closing: 'Private work begins after sign-in. New here?', register: 'Create an account' },
  'zh-TW': { title: '使用說明', intro: '按最適合這個決策的順序使用工作台。私人路由會先要求登入，完成後回到原本的工作。', signIn: '登入', tasks: [{ title: '建立或追加日記', body: '從原本的論點、觀察和不確定之處開始。思路改變時回到同一筆記錄。', link: '/diaries/new', action: '開啟日記編輯器' }, { title: '加入交易', body: '把買入或賣出放在能解釋該決策的日記旁邊；日記編輯器是實際入口。', link: '/diaries/new', action: '開啟日記編輯器' }, { title: '記錄研究', body: '在公司研究區保存與代號連結的證據、筆記和日期記錄。', link: '/stocks', action: '開啟公司研究' }, { title: '完成複盤', body: '回到複盤隊列，把後續證據與原本思路比較，並記下甚麼改變了。', link: '/reviews', action: '開啟複盤隊列' }, { title: '管理帳戶偏好', body: '登入後在偏好設定調整語言、主題、時區和帳戶設定。', link: '/settings', action: '開啟偏好設定' }], closing: '登入後即可開始私人工作。還沒有帳戶？', register: '建立帳戶' },
  'zh-CN': { title: '使用说明', intro: '按最适合这个决策的顺序使用工作台。私人路由会先要求登录，完成后回到原本的工作。', signIn: '登录', tasks: [{ title: '创建或追加日记', body: '从原本的论点、观察和不确定之处开始。思路改变时回到同一条记录。', link: '/diaries/new', action: '打开日记编辑器' }, { title: '加入交易', body: '把买入或卖出放在能解释该决策的日记旁边；日记编辑器是实际入口。', link: '/diaries/new', action: '打开日记编辑器' }, { title: '记录研究', body: '在公司研究区保存与代码连接的证据、笔记和日期记录。', link: '/stocks', action: '打开公司研究' }, { title: '完成复盘', body: '回到复盘队列，把后续证据与原本思路比较，并记下什么改变了。', link: '/reviews', action: '打开复盘队列' }, { title: '管理账户偏好', body: '登录后在偏好设置调整语言、主题、时区和账户设置。', link: '/settings', action: '打开偏好设置' }], closing: '登录后即可开始私人工作。还没有账户？', register: '创建账户' },
} as const;

export default function Guide() {
  const { locale } = useUi();
  const c = copy[locale];
  return <article className="public-page public-reading">
    <header><p className="public-eyebrow">diary-v3</p><h1>{c.title}</h1><p className="lede">{c.intro}</p></header>
    <ol className="public-guide-list">{c.tasks.map(task => <li key={task.title}><div><h2>{task.title}</h2><p>{task.body}</p></div><Link className="button secondary" to={task.link}>{task.action}</Link></li>)}</ol>
    <section className="public-closing"><p>{c.closing}</p><div className="actions"><Link className="button secondary" to="/login">{c.signIn}</Link><Link className="button" to="/register">{c.register}</Link></div></section>
  </article>;
}
