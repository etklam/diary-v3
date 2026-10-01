/** Pure composition rules, usable by Web and native clients. */
// Audit UI-005: untitled quick entries keep the dated fallback label only. Baking the
// first content line into the title made every surface show truncated content plus an
// ellipsis beside the full excerpt (audit: docs/ui-ux-audit.md UI-002/UI-005).
export function deriveQuickTitle(_content:string,fallback:string){return fallback;}
export function mergeQuickTemplate(current:string,next:string,previous:string){const text=current.trim(),replacement=next.trim(),old=previous.trim();if(!text)return replacement;if(old&&text.includes(old))return text.replace(old,replacement).trim()||text;if(!replacement||text===replacement)return text;return [text,replacement].join('\n\n');}
