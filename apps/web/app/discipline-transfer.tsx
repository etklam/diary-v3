import { disciplineListSchema, type DisciplineResponse } from '@diary/contracts/discipline';
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { decodeDisciplineShare, parseDisciplineShare, disciplineShareUrl, exportDisciplineResponseSchema } from '@diary/contracts/discipline-share';
import { api, useUi } from './ui';
import { FailureNotice, apiFailure, type Failure } from './api-error';
const copy = {
 en: { heading: 'Import and share', importHeading: 'Import from a file or link', exportHeading: 'Export and share', json: 'Share JSON', file: 'Choose JSON file', preview: 'Preview import', mode: 'Import mode', append: 'Append to existing principles', replace: 'Replace all existing principles', import: 'Import principles', replaceTitle: 'Replace every stored principle?', replaceBody: 'Your current principles are deleted and replaced by this preview. This cannot be undone.', replaceConfirm: 'Replace all', cancel: 'Cancel', invalid: 'This is not a valid principles file.', title: 'Share title', description: 'Share description', author: 'Include my profile name', prepare: 'Prepare export', download: 'Download JSON', link: 'Public share link', open: 'Open public preview', copy: 'Copy link', copyFailed: 'Copy was blocked. Select the link and copy it manually.', copied: 'Link copied.', imported: 'Import completed.', uncertain: 'Import status is uncertain. The list was checked; keep this preview and refresh before trying again.', notice: 'Anyone with the link can read the exported principles and included name.', count: 'Principles to import' },
 'zh-TW': { heading: '匯入與分享', importHeading: '從檔案或連結匯入', exportHeading: '匯出與分享', json: '分享 JSON', file: '選擇 JSON 檔案', preview: '預覽匯入', mode: '匯入方式', append: '追加至現有紀律', replace: '取代所有現有紀律', import: '匯入紀律', replaceTitle: '取代所有已儲存的紀律？', replaceBody: '現有紀律會被刪除，並以這份預覽取代，之後無法復原。', replaceConfirm: '全部取代', cancel: '取消', invalid: '這不是有效的紀律檔案。', title: '分享標題', description: '分享說明', author: '包含我的個人名稱', prepare: '準備匯出', download: '下載 JSON', link: '公開分享連結', open: '開啟公開預覽', copy: '複製連結', copyFailed: '無法自動複製，請選取連結後手動複製。', copied: '連結已複製。', imported: '匯入完成。', uncertain: '匯入結果尚未確定。系統已檢查清單；請保留這份預覽並重新整理後再決定是否重試。', notice: '任何持有連結的人都可以閱讀匯出的紀律及所包含的名稱。', count: '將匯入的紀律' },
 'zh-CN': { heading: '导入与分享', importHeading: '从文件或链接导入', exportHeading: '导出与分享', json: '分享 JSON', file: '选择 JSON 文件', preview: '预览导入', mode: '导入方式', append: '追加至现有纪律', replace: '替换所有现有纪律', import: '导入纪律', replaceTitle: '替换所有已保存的纪律？', replaceBody: '现有纪律会被删除，并以这份预览替换，之后无法恢复。', replaceConfirm: '全部替换', cancel: '取消', invalid: '这不是有效的纪律文件。', title: '分享标题', description: '分享说明', author: '包含我的个人名称', prepare: '准备导出', download: '下载 JSON', link: '公开分享链接', open: '打开公开预览', copy: '复制链接', copyFailed: '无法自动复制，请选中链接后手动复制。', copied: '链接已复制。', imported: '导入完成。', uncertain: '导入结果尚未确定。系统已检查清单；请保留这份预览并刷新后再决定是否重试。', notice: '任何持有链接的人都可以阅读导出的纪律及所包含的名称。', count: '将导入的纪律' },
};
export function DisciplineTransfer({ disabled, onImported, principles, draftState }: { disabled: boolean; onImported: () => void; principles: readonly DisciplineResponse[]; draftState: { current: boolean } }) {
 const { locale, t } = useUi(), c = copy[locale], [params, setParams] = useSearchParams();
 const [json, setJson] = useState(''), [preview, setPreview] = useState<ReturnType<typeof parseDisciplineShare> | null>(null), [replace, setReplace] = useState(false);
 const [title, setTitle] = useState(''), [description, setDescription] = useState(''), [author, setAuthor] = useState(false);
 const [preparedSnapshot, setPrepared] = useState<{ json: string; url: string; source: readonly DisciplineResponse[] } | null>(null), [pending, setPending] = useState(false), [error, setError] = useState<Failure | null>(null), [notice, setNotice] = useState<'imported' | 'copied' | null>(null);
 const encoded = params.get('import');
 const [open, setOpen] = useState(Boolean(encoded));
 const prepared = preparedSnapshot?.source === principles ? preparedSnapshot : null;
 const replaceDialog = useRef<HTMLDialogElement>(null);
 useEffect(() => { draftState.current = pending || Boolean(json || (!prepared && (title || description || author))); return () => { draftState.current = false; }; }, [draftState, pending, json, prepared, title, description, author]);
 const request = useRef<AbortController | null>(null), invalidMessage = useRef(c.invalid); invalidMessage.current = c.invalid;
 useEffect(() => () => request.current?.abort(), []);
 useEffect(() => { if (!encoded) return; try { const decoded = decodeDisciplineShare(encoded); setJson(decoded); setPreview(parseDisciplineShare(decoded)); setOpen(true); } catch { setError({ message: invalidMessage.current, fields: [] }); setOpen(true); } }, [encoded]);
 async function run(task: (signal: AbortSignal) => Promise<void>, recoverUncertain?: (signal: AbortSignal) => Promise<void>) {
  if (pending || disabled) return; const controller = new AbortController(); request.current = controller; setPending(true); setError(null); setNotice(null);
  try { await task(controller.signal); } catch { if (!controller.signal.aborted) { if (recoverUncertain) { try { await recoverUncertain(controller.signal); } catch { setError({ message: c.uncertain, fields: [] }); } } else setError(apiFailure(null, t('connection'))); } }
  finally { if (!controller.signal.aborted) setPending(false); }
 }
 function inspect(value = json) { try { setPreview(parseDisciplineShare(value)); setError(null); setOpen(true); } catch { setPreview(null); setError({ message: c.invalid, fields: [] }); } }
 function importRows() {
  if (!preview) return;
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
 return <section aria-label={c.heading}><details className="discipline-transfer" open={open} onToggle={event => setOpen(event.currentTarget.open)}><summary>{c.heading}</summary>
  <div className="discipline-transfer-body">
   <section className="panel discipline-import" aria-labelledby="discipline-import-title">
    <header><h3 id="discipline-import-title">{c.importHeading}</h3></header>
    <fieldset disabled={pending || disabled} className="discipline-fields">
     <div className="discipline-field"><label htmlFor="transfer-file">{c.file}</label><input id="transfer-file" type="file" accept="application/json,.json" onChange={event => { const file = event.target.files?.[0]; if (file) void file.text().then(value => { setJson(value); inspect(value); }).catch(() => setError({ message: c.invalid, fields: [] })); }}/></div>
     <div className="discipline-field"><label htmlFor="transfer-json">{c.json}</label><textarea id="transfer-json" rows={4} value={json} onChange={event => { setJson(event.target.value); setPreview(null); }}/></div>
     <div className="actions"><button type="button" className="secondary" onClick={() => inspect()}>{c.preview}</button></div>
     {preview && <>
      <h4>{c.count}: {preview.count}</h4>
      <ol className="discipline-preview">{preview.disciplines.map((row, index) => <li key={index}>{row.content}</li>)}</ol>
      <div className="discipline-field"><label htmlFor="transfer-mode">{c.mode}</label><select id="transfer-mode" value={replace ? 'replace' : 'append'} onChange={event => setReplace(event.target.value === 'replace')}><option value="append">{c.append}</option><option value="replace">{c.replace}</option></select></div>
      <div className="actions"><button type="button" onClick={() => { if (replace) replaceDialog.current?.showModal(); else importRows(); }}>{c.import}</button></div>
     </>}
    </fieldset>
   </section>
   <section className="panel discipline-export" aria-labelledby="discipline-export-title">
    <header><h3 id="discipline-export-title">{c.exportHeading}</h3></header>
    <fieldset disabled={pending || disabled} className="discipline-fields">
     <div className="discipline-field"><label htmlFor="transfer-title">{c.title}</label><input id="transfer-title" value={title} onChange={event => { setTitle(event.target.value); setPrepared(null); }}/></div>
     <div className="discipline-field"><label htmlFor="transfer-description">{c.description}</label><textarea id="transfer-description" rows={2} value={description} onChange={event => { setDescription(event.target.value); setPrepared(null); }}/></div>
     <div className="discipline-checkbox"><input id="transfer-author" type="checkbox" checked={author} onChange={event => { setAuthor(event.target.checked); setPrepared(null); }}/><label htmlFor="transfer-author">{c.author}</label></div>
     <p className="muted">{c.notice}</p>
     <div className="actions"><button type="button" className="secondary" onClick={prepare}>{c.prepare}</button></div>
     {prepared && <>
      <div className="discipline-link-row"><div className="discipline-field"><label htmlFor="transfer-link">{c.link}</label><input id="transfer-link" readOnly value={prepared.url}/></div><button type="button" className="secondary" onClick={() => void run(async () => { try { await navigator.clipboard.writeText(prepared.url); setNotice('copied'); } catch { setError({ message: c.copyFailed, fields: [] }); } })}>{c.copy}</button></div>
      <div className="actions"><button type="button" onClick={download}>{c.download}</button><a href={prepared.url} target="_blank" rel="noopener noreferrer">{c.open}</a></div>
     </>}
    </fieldset>
   </section>
  </div>
 </details>
 <FailureNotice failure={error} id="transfer-error"/>{notice && <p role="status">{c[notice]}</p>}
 <dialog ref={replaceDialog} className="delete-dialog" aria-labelledby="discipline-replace-title">
  <h2 id="discipline-replace-title">{c.replaceTitle}</h2>
  <p>{c.replaceBody}</p>
  <div className="actions">
   <button type="button" className="secondary" autoFocus onClick={() => replaceDialog.current?.close()}>{c.cancel}</button>
   <button type="button" className="danger-button" onClick={() => { replaceDialog.current?.close(); importRows(); }}>{c.replaceConfirm}</button>
  </div>
 </dialog>
 </section>;
}
