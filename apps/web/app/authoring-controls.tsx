import { type ReactNode } from 'react';
import { useUi } from './ui';
import './authoring.css';

/**
 * Controls shared by the two authoring paths (`/diaries/quick`, the Cmd/Ctrl+J
 * dialog and `/diaries/new`). Presentation only: each path keeps its own write
 * machine, and passes state in and out through these props.
 */
export const authoringCopy = {
 en: { tags: 'Tags (one per line or comma)', recentTags: 'Recent tags', preview: 'Preview Markdown', writing: 'Back to writing', previewRegion: 'Markdown preview' },
 'zh-TW': { tags: '標籤（每行一個，或以逗號分隔）', recentTags: '最近使用的標籤', preview: '預覽 Markdown', writing: '回到編寫', previewRegion: 'Markdown 預覽' },
 'zh-CN': { tags: '标签（每行一个，或以逗号分隔）', recentTags: '最近使用的标签', preview: '预览 Markdown', writing: '回到编写', previewRegion: 'Markdown 预览' },
};

/**
 * One tag model for both paths. A person typing `growth, china` means two tags;
 * splitting on newlines alone stored that literally as one, and offered it back
 * as a suggestion forever.
 */
export function splitTags(value: string) {
 return value.split(/[\n,，、]/).map(tag => tag.trim()).filter(Boolean);
}
export function joinTags(tags: readonly string[]) {
 return tags.filter(tag => tag.trim()).join('\n');
}

export function TagField({ id, value, onChange, recent, selected, onToggle, invalid, errorId }: { id: string; value: string; onChange: (value: string) => void; recent: readonly string[]; selected: readonly string[]; onToggle: (tag: string) => void; invalid?: boolean; errorId?: string }) {
 const { locale } = useUi(), c = authoringCopy[locale];
 return <div className="authoring-tags">
  <div className="authoring-field">
   <label htmlFor={id}>{c.tags}</label>
   <textarea id={id} rows={2} maxLength={2000} value={value} onChange={event => onChange(event.target.value)} aria-invalid={invalid} aria-describedby={errorId}/>
  </div>
  {recent.length > 0 && <fieldset className="recent-tags"><legend>{c.recentTags}</legend><div className="recent-tag-list">{recent.map(tag => <button type="button" className="secondary button-compact" key={tag} aria-pressed={selected.includes(tag)} onClick={() => onToggle(tag)}>{tag}</button>)}</div></fieldset>}
 </div>;
}

/** The row bound to the writing area: the same tools in the same place on both paths. */
export function WritingToolbar({ preview, onTogglePreview, children, status }: { preview: boolean; onTogglePreview: () => void; children?: ReactNode; status?: ReactNode }) {
 const { locale } = useUi(), c = authoringCopy[locale];
 return <div className="writing-toolbar">
  <button type="button" className="quiet-button button-compact" aria-pressed={preview} onClick={onTogglePreview}>{preview ? c.writing : c.preview}</button>
  {children}
  {status}
 </div>;
}

