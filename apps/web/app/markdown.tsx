import { useUi } from './ui';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import './markdown.css';

/** Per the Figure Rule, a table cell holding nothing but a figure — amount,
 *  price, percentage, ratio, count or date — takes the mono cut so the column
 *  aligns down the page. A cell carrying prose stays in the sans face. */
const FIGURE_CELL = /^[+\-−]?[$€£¥]?\d[\d,. :/-]*%?$/;

type HastNode = { value?: string; children?: HastNode[] };
const nodeText = (node?: HastNode): string => node?.value ?? (node?.children ?? []).map(nodeText).join('');
const figureClass = (node?: HastNode) => (FIGURE_CELL.test(nodeText(node).trim()) ? 'num' : undefined);

/** Raw HTML is deliberately not enabled. ReactMarkdown keeps its safe URL transform. */
export function Markdown({children, allowImages = true, imageFallback}:{children:string; allowImages?: boolean; imageFallback?: string}) {
 const {locale}=useUi();
 const blockedImage = imageFallback ?? (locale==='en' ? 'Image hidden until review.' : locale==='zh-CN' ? '图片将在审核后显示。' : '圖片會在檢閱後顯示。');
 return <div className="safe-markdown"><ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml components={{
  a:props=>props.href?<a href={props.href} rel="noopener noreferrer">{props.children}</a>:<span>{props.children}</span>,
  img:props=>allowImages?<img {...props} alt={props.alt ?? ''}/>:<span className="markdown-image-blocked" role="note">{blockedImage}</span>,
  table:props=><div className="markdown-table" tabIndex={0} role="region" aria-label={locale==='en'?'Markdown table':locale==='zh-CN'?'Markdown 表格':'Markdown 表格'}><table>{props.children}</table></div>,
  // A block that scrolls sideways must be reachable without a pointer.
  pre:({node:_node,...props})=><pre {...props} tabIndex={0}/>,
  th:({node,...props})=><th {...props} className={figureClass(node)}/>,
  td:({node,...props})=><td {...props} className={figureClass(node)}/>,
 }}>{children}</ReactMarkdown></div>;
}
