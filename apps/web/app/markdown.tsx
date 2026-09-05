import { useUi } from './ui';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import './diary-editor.css';
/** Raw HTML is deliberately not enabled. ReactMarkdown keeps its safe URL transform. */
export function Markdown({children}:{children:string}) {
 const {locale}=useUi();
 return <div className="safe-markdown"><ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml components={{a:props=>props.href?<a href={props.href} rel="noopener noreferrer">{props.children}</a>:<span>{props.children}</span>,table:props=><div className="markdown-table" tabIndex={0} role="region" aria-label={locale==='en'?'Markdown table':locale==='zh-CN'?'Markdown 表格':'Markdown 表格'}><table>{props.children}</table></div>}}>{children}</ReactMarkdown></div>;
}
