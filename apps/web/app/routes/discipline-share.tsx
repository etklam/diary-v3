import { data, Link, useLoaderData, type LoaderFunctionArgs, type MetaFunction, type HeadersArgs } from 'react-router';
import { decodeDisciplineShare, parseDisciplineShare } from '@diary/contracts/discipline-share';
import { useUi } from '../ui';
import '../trade-plan.css';
export function loader({ request }: LoaderFunctionArgs) {
 const url = new URL(request.url), encoded = url.searchParams.get('import');
 try {
  if (!encoded) throw new Error('Missing share payload');
  const preview = parseDisciplineShare(decodeDisciplineShare(encoded));
  return data({ preview, encoded, origin: url.origin }, { headers: { 'Referrer-Policy': 'no-referrer' } });
 } catch {
  return data({ preview: null, encoded: null, origin: url.origin }, { status: 400, headers: { 'Referrer-Policy': 'no-referrer' } });
 }
}
export function headers({ loaderHeaders }: HeadersArgs) { return loaderHeaders; }
export const meta: MetaFunction<typeof loader> = ({ loaderData: loaded }) => {
 const preview = loaded?.preview;
 const title = preview?.title || 'Trading principles — Trade basic';
 const description = preview?.description || (preview ? `${preview.count} trading principles` : 'This sharing link is invalid.');
 const image = `${loaded?.origin ?? ''}/api/og/discipline.svg?${new URLSearchParams({ title, author: preview?.author || 'Anonymous', count: String(preview?.count ?? 0) })}`;
 return [{ title }, { name: 'description', content: description }, { property: 'og:title', content: title }, { property: 'og:description', content: description }, { property: 'og:type', content: 'article' }, { property: 'og:image', content: image }, { name: 'robots', content: 'noindex' }];
};
export default function DisciplineShare() {
 const { preview, encoded } = useLoaderData<typeof loader>(), { locale } = useUi();
 const invalid = locale === 'en' ? 'This sharing link is invalid or incomplete.' : locale === 'zh-CN' ? '这个分享链接无效或不完整。' : '這個分享連結無效或不完整。';
 const importLabel = locale === 'en' ? 'Preview import' : locale === 'zh-CN' ? '预览导入' : '預覽匯入';
 if (!preview) return <section className="plan-page"><h1>{invalid}</h1><Link to="/discipline">{locale === 'en' ? 'Your principles' : locale === 'zh-CN' ? '你的纪律' : '你的紀律'}</Link></section>;
 return <article className="plan-page"><h1 style={{ overflowWrap: 'anywhere' }}>{preview.title}</h1>{preview.author && <p className="muted">{preview.author}</p>}{preview.description && <p className="lede" style={{ overflowWrap: 'anywhere' }}>{preview.description}</p>}<ol className="plan-list">{preview.disciplines.map((row, index) => <li key={index} style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{row.content}</li>)}</ol><Link className="button" to={`/discipline?import=${encodeURIComponent(encoded!)}`}>{importLabel}</Link></article>;
}
