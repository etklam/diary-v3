import { disciplineListSchema, type DisciplineResponse } from '@diary/contracts/discipline';
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { decodeDisciplineShare, parseDisciplineShare, disciplineShareUrl, exportDisciplineResponseSchema } from '@diary/contracts/discipline-share';
import { api, useUi } from './ui';
import { FailureNotice, apiFailure, type Failure } from './api-error';
const copy = {
 en: { heading: 'Import and share', json: 'Share JSON', file: 'Choose JSON file', preview: 'Preview import', append: 'Append to existing principles', replace: 'Replace all existing principles', import: 'Import principles', confirm: 'Replace all your current principles with this preview?', invalid: 'This is not a valid principles file.', title: 'Share title', description: 'Share description', author: 'Include my profile name', prepare: 'Prepare export', download: 'Download JSON', link: 'Public share link', open: 'Open public preview', copy: 'Copy link', copyFailed: 'Copy was blocked. Select the link and copy it manually.', copied: 'Link copied.', imported: 'Import completed.', uncertain: 'Import status is uncertain. The list was checked; keep this preview and refresh before trying again.', notice: 'Anyone with the link can read the exported principles and included name.', count: 'Principles to import' },
 'zh-TW': { heading: '匯入與分享', json: '分享 JSON', file: '選擇 JSON 檔案', preview: '預覽匯入', append: '追加至現有紀律', replace: '取代所有現有紀律', import: '匯入紀律', confirm: '以預覽內容取代所有現有紀律？', invalid: '這不是有效的紀律檔案。', title: '分享標題', description: '分享說明', author: '包含我的個人名稱', prepare: '準備匯出', download: '下載 JSON', link: '公開分享連結', open: '開啟公開預覽', copy: '複製連結', copyFailed: '無法自動複製，請選取連結後手動複製。', copied: '連結已複製。', imported: '匯入完成。', uncertain: '匯入結果尚未確定。系統已檢查清單；請保留這份預覽並重新整理後再決定是否重試。', notice: '任何持有連結的人都可以閱讀匯出的紀律及所包含的名稱。', count: '將匯入的紀律' },
 'zh-CN': { heading: '导入与分享', json: '分享 JSON', file: '选择 JSON 文件', preview: '预览导入', append: '追加至现有纪律', replace: '替换所有现有纪律', import: '导入纪律', confirm: '以预览内容替换所有现有纪律？', invalid: '这不是有效的纪律文件。', title: '分享标题', description: '分享说明', author: '包含我的个人名称', prepare: '准备导出', download: '下载 JSON', link: '公开分享链接', open: '打开公开预览', copy: '复制链接', copyFailed: '无法自动复制，请选中链接后手动复制。', copied: '链接已复制。', imported: '导入完成。', uncertain: '导入结果尚未确定。系统已检查清单；请保留这份预览并刷新后再决定是否重试。', notice: '任何持有链接的人都可以阅读导出的纪律及所包含的名称。', count: '将导入的纪律' },
};
export function DisciplineTransfer({ disabled, onImported, principles, draftState }: { disabled: boolean; onImported: () => void; principles: readonly DisciplineResponse[]; draftState: { current: boolean } }) {
 const { locale, t } = useUi(), c = copy[locale], [params, setParams] = useSearchParams();
 const [json, setJson] = useState(''), [preview, setPreview] = useState<ReturnType<typeof parseDisciplineShare> | null>(null), [replace, setReplace] = useState(false);
 const [title, setTitle] = useState(''), [description, setDescription] = useState(''), [author, setAuthor] = useState(false);
 const [preparedSnapshot, setPrepared] = useState<{ json: string; url: string; source: readonly DisciplineResponse[] } | null>(null), [pending, setPending] = useState(false), [error, setError] = useState<Failure | null>(null), [notice, setNotice] = useState<'imported' | 'copied' | null>(null);
 const prepared = preparedSnapshot?.source === principles ? preparedSnapshot : null;
 useEffect(() => { draftState.current = pending || Boolean(json || (!prepared && (title || description || author))); return () => { draftState.current = false; }; }, [draftState, pending, json, prepared, title, description, author]);
 const request = useRef<AbortController | null>(null), invalidMessage = useRef(c.invalid); invalidMessage.current = c.invalid;
 useEffect(() => () => request.current?.abort(), []);
 const encoded = params.get('import');
 useEffect(() => { if (!encoded) return; try { const decoded = decodeDisciplineShare(encoded); setJson(decoded); setPreview(parseDisciplineShare(decoded)); } catch { setError({ message: invalidMessage.current, fields: [] }); } }, [encoded]);
 async function run(task: (signal: AbortSignal) => Promise<void>, recoverUncertain?: (signal: AbortSignal) => Promise<void>) {
  if (pending || disabled) return; const controller = new AbortController(); request.current = controller; setPending(true); setError(null); setNotice(null);
  try { await task(controller.signal); } catch { if (!controller.signal.aborted) { if (recoverUncertain) { try { await recoverUncertain(controller.signal); } catch { setError({ message: c.uncertain, fields: [] }); } } else setError(apiFailure(null, t('connection'))); } }
  finally { if (!controller.signal.aborted) setPending(false); }
 }
 function inspect(value = json) { try { setPreview(parseDisciplineShare(value)); setError(null); } catch { setPreview(null); setError({ message: c.invalid, fields: [] }); } }
 function importRows() {
  if (!preview || (replace && !window.confirm(c.confirm))) return;
  const before = principles.map(row => ({ id: row.id, content: row.content, order: row.order })), beforeIds = new Set(before.map(row => row.id)), appendStart = before.length ? Math.max(...before.map(row => row.order)) + 1 : 0, expected = preview.disciplines.map(row => row.content), replacing = replace;
  const reconcile = async (signal: AbortSignal) => {
   const result = await api.GET('/api/discipline', { signal });
   const parsed = disciplineListSchema.safeParse(result.data);
   if (!result.response.ok || !parsed.success) { setError({ message: c.uncertain, fields: [] }); return; }
   const rows = parsed.data, prefixMatches = before.every((row, index) => rows[index]?.id === row.id && rows[index]?.content === row.content && rows[index]?.order === row.order), suffix = rows.slice(before.length);
   const newRows = suffix.length === expected.length && suffix.every((row, index) => !beforeIds.has(row.id) && row.content === expected[index] && row.order === appendStart + index);
   const committed = replacing ? rows.length === expected.length && rows.every((row, index) => !beforeIds.has(row.id) && row.content === expected[index] && row.order === index) : rows.length === before.length + expected.length && prefixMatches && newRows;
   if (!committed) { setError({ message: c.uncertain, fields: [] }); return; }
   setPreview(null); setJson(''); setPrepared(null); setNotice('imported'); const next = new URLSearchParams(params); next.delete('import'); setParams(next, { replace: true }); onImported();
  };
  void run(async signal => {
   const result = await api.POST('/api/discipline/import', { body: { json, replaceExisting: replace }, signal });
   if (signal.aborted) return; if (!result.response.ok) { setError(apiFailure(result.error, t('failed'))); return; }
   setPreview(null); setJson(''); setPrepared(null); setNotice('imported'); const next = new URLSearchParams(params); next.delete('import'); setParams(next, { replace: true }); onImported();
  }, reconcile);
 }
 function prepare() { void run(async signal => {
  const result = await api.GET('/api/discipline/export', { params: { query: { title, description, includeAuthor: author ? 'true' : 'false' } }, signal });
  if (signal.aborted) return; const parsed = exportDisciplineResponseSchema.safeParse(result.data);
  if (!result.response.ok || !parsed.success) { setError(apiFailure(result.error, t('failed'))); return; }
  setPrepared({ source: principles, json: parsed.data.json, url: disciplineShareUrl(parsed.data.data, window.location.origin) });
 }); }
 function download() { if (!prepared) return; const url = URL.createObjectURL(new Blob([prepared.json], { type: 'application/json' })); const link = document.createElement('a'); link.href = url; link.download = 'trading-disciplines.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
 return <section aria-label={c.heading}><h2>{c.heading}</h2><fieldset disabled={pending || disabled} className="plan-form" style={{ display: 'grid', gap: 20 }}><label>{c.file}<input type="file" accept="application/json,.json" onChange={event => { const file = event.target.files?.[0]; if (file) void file.text().then(value => { setJson(value); inspect(value); }).catch(() => setError({ message: c.invalid, fields: [] })); }}/></label><label>{c.json}<textarea aria-label={c.json} rows={4} value={json} onChange={event => { setJson(event.target.value); setPreview(null); }}/></label><button type="button" className="secondary" onClick={() => inspect()}>{c.preview}</button>{preview && <><h3>{c.count}: {preview.count}</h3><ol>{preview.disciplines.map((row, index) => <li key={index} style={{ overflowWrap: 'anywhere' }}>{row.content}</li>)}</ol><label><select aria-label={c.heading} value={replace ? 'replace' : 'append'} onChange={event => setReplace(event.target.value === 'replace')}><option value="append">{c.append}</option><option value="replace">{c.replace}</option></select></label><button type="button" onClick={importRows}>{c.import}</button></>}
 <label>{c.title}<input value={title} onChange={event => { setTitle(event.target.value); setPrepared(null); }}/></label><label>{c.description}<textarea rows={2} value={description} onChange={event => { setDescription(event.target.value); setPrepared(null); }}/></label><label style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 44 }}><input style={{ width: 20, height: 20, minHeight: 20, margin: 0, flex: '0 0 auto' }} type="checkbox" checked={author} onChange={event => { setAuthor(event.target.checked); setPrepared(null); }}/>{c.author}</label><p>{c.notice}</p><button type="button" className="secondary" onClick={prepare}>{c.prepare}</button>{prepared && <><label>{c.link}<textarea aria-label={c.link} readOnly rows={3} value={prepared.url}/></label><div className="actions"><button type="button" onClick={download}>{c.download}</button><button type="button" className="secondary" onClick={() => void run(async () => { try { await navigator.clipboard.writeText(prepared.url); setNotice('copied'); } catch { setError({ message: c.copyFailed, fields: [] }); } })}>{c.copy}</button><a href={prepared.url} target="_blank" rel="noopener noreferrer">{c.open}</a></div></>}
 </fieldset><FailureNotice failure={error} id="transfer-error"/>{notice && <p role="status">{c[notice]}</p>}</section>;
}
