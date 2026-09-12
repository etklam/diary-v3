import { useUi } from './ui';
import type { CaptureContext, CaptureContextIssue } from './capture-context';

const captureNoticeCopy = {
 en: {
  source: (symbol: string) => `Recording from ${symbol} company research. The writing stays yours.`,
  unsupported: 'This company symbol is unsupported for diary association. You can still write without it.',
 },
 'zh-TW': {
  source: (symbol: string) => `從 ${symbol} 公司研究進入記錄。內容仍屬於你。`,
  unsupported: '此公司代號不支援日記關聯，你仍然可以書寫。',
 },
 'zh-CN': {
  source: (symbol: string) => `从 ${symbol} 公司研究进入记录。内容仍属于你。`,
  unsupported: '此公司代码不支持日记关联，你仍然可以书写。',
 },
} as const;

/** One low-emphasis line naming the research source, or explaining an unusable handoff. */
export function CaptureNotice({ context, issue }: { context?: CaptureContext | null; issue?: CaptureContextIssue | null }) {
 const { locale } = useUi();
 const copy = captureNoticeCopy[locale];
 if (context) return <p className="muted capture-context-note">{copy.source(context.symbol)}</p>;
 if (issue === 'invalid-symbol' || issue === 'invalid-source') return <p className="muted capture-context-note">{copy.unsupported}</p>;
 return null;
}
