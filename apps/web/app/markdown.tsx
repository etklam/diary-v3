import { useUi } from './ui';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import './markdown.css';
/** Raw HTML is deliberately not enabled. ReactMarkdown keeps its safe URL transform. */
export function Markdown({children, allowImages = true, imageFallback}:{children:string; allowImages?: boolean; imageFallback?: string}) {
 const {locale}=useUi();
 const blockedImage = imageFallback ?? (locale==='en' ? 'Image hidden until review.' : locale==='zh-CN' ? '图片将在审核后显示。' : '圖片會在檢閱後顯示。');
 return <div className="safe-markdown"><ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml components={{a:props=>props.href?<a href={props.href} rel="noopener noreferrer">{props.children}</a>:<span>{props.children}</span>,img:props=>allowImages?<img {...props} alt={props.alt ?? ''}/>:<span className="markdown-image-blocked" role="note">{blockedImage}</span>,table:props=><div className="markdown-table" tabIndex={0} role="region" aria-label={locale==='en'?'Markdown table':locale==='zh-CN'?'Markdown 表格':'Markdown 表格'}><table>{props.children}</table></div>}}>{children}</ReactMarkdown></div>;
}
