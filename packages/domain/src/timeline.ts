/** Keep the first received record, deduplicating within and across response pages. */
export function mergeTimelineEntries<T extends {id:string}>(existing:readonly T[],incoming:readonly T[]):T[]{const seen=new Set<string>();return [...existing,...incoming].filter(entry=>{if(seen.has(entry.id))return false;seen.add(entry.id);return true;});}
export function groupTimelineEntries<T extends {id:string;date:string}>(entries:readonly T[]):Array<{period:string;entries:T[]}>{const sorted=[...entries].sort((a,b)=>b.date.localeCompare(a.date)||(BigInt(a.id)>BigInt(b.id)?-1:BigInt(a.id)<BigInt(b.id)?1:0)),groups=new Map<string,T[]>();for(const entry of sorted){const month=entry.date.slice(0,7);const group=groups.get(month);if(group)group.push(entry);else groups.set(month,[entry]);}return [...groups].map(([period,entries])=>({period,entries}));}
/** This compact projection explicitly excludes every private Review text field. */
export function projectTimelineEntry(diary:{id:string;date:string;title:string;content:string|null;tags:string[];stockSymbols?:readonly string[];transactions?:readonly unknown[];alerts?:readonly {isDismissed?:boolean}[];reviewStatus?:string|null;reviewOutcome?:string|null}){return {id:diary.id,date:diary.date,title:diary.title,content:diary.content,tags:diary.tags.slice(0,2),stockSymbols:(diary.stockSymbols??[]).slice(0,3),transactionCount:diary.transactions?.length??0,alertCount:diary.alerts?.filter(alert=>!alert.isDismissed).length??0,reviewed:diary.reviewStatus==='reviewed',reviewOutcome:diary.reviewOutcome??null};}
/** Plain-text summary for scanning: Markdown structure, code fences and bare
 * URLs never dominate; truncation breaks on a word boundary when one exists. */
export function diaryExcerpt(content:string|null,maxLength=240){
 const plain=(content??'')
  .replace(/```[\s\S]*?(```|$)/g,' ')
  .replace(/!\[[^\]]*\]\([^)]*\)/g,' ')
  .replace(/\[([^\]]*)\]\([^)\s]*\)/g,'$1')
  .replace(/\bhttps?:\/\/\S+/g,' ')
  .replace(/^[>\t ]*[-*+]\s+/gm,'')
  .replace(/[#*_`~|]/g,' ')
  .replace(/\s+/g,' ').trim();
 if(plain.length<=maxLength)return plain;
 const slice=plain.slice(0,maxLength);
 const boundary=slice.lastIndexOf(' ');
 return `${(boundary>maxLength*0.6?slice.slice(0,boundary):slice).trimEnd()}…`;
}
