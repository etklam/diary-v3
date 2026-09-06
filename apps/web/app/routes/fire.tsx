import { useState } from 'react';
import { calculateFinancialFreedom, withdrawalRatePresets } from '@diary/domain';
import { useUi } from '../ui';
import { fireCopy } from './fire-copy';
import { ToolShell, toolByHref } from '../tool-shell';
import './fire.css';

const defaults = { annualExpenses:'600000',currentAssets:'1000000',monthlyContribution:'20000',expectedReturn:'8',currentAge:'30',withdrawalRate:'4' };
type Field = keyof typeof defaults;
export function meta() { return [{title:'FIRE — diary-v3'}]; }
export default function Fire() {
  const {locale,ready}=useUi(); const t=fireCopy[locale];
  const [values,setValues]=useState(defaults); const [preset,setPreset]=useState('moderate');
  const [allYears,setAllYears]=useState(false); const [copyState,setCopyState]=useState<'idle'|'copied'|'failed'>('idle');
  const invalidFields = new Set<Field>();
  for (const field of Object.keys(values) as Field[]) {
    if(field==='currentAge'&&values[field]==='') continue;
    const n=Number(values[field]);
    if(values[field]===''||!Number.isFinite(n)||n<0||((field==='annualExpenses'||field==='withdrawalRate')&&n===0)||(field==='expectedReturn'&&n>30)||(field==='withdrawalRate'&&n>100)||(field==='currentAge'&&(n>120||!Number.isInteger(n)))) invalidFields.add(field);
  }
  let result: ReturnType<typeof calculateFinancialFreedom>|null=null;
  try { if(!invalidFields.size) result=calculateFinancialFreedom({annualExpenses:Number(values.annualExpenses),currentAssets:Number(values.currentAssets),monthlyContribution:Number(values.monthlyContribution),expectedReturn:Number(values.expectedReturn),withdrawalRate:Number(values.withdrawalRate),currentAge:values.currentAge===''?null:Number(values.currentAge)}); } catch { /* Domain rejects overflowing calculations as well as invalid inputs. */ }
  const money=(n:number)=>new Intl.NumberFormat(locale,{maximumFractionDigits:0}).format(n);
  const years=result?.yearsToFreedom===null?t.unreachable:result?.yearsToFreedom===0?t.achieved:result?.yearsToFreedom.toFixed(1)??'—';
  const date=result?.freedomDate?new Intl.DateTimeFormat(locale,{year:'numeric',month:'long',timeZone:'UTC'}).format(result.freedomDate):'—';
  function change(field:Field,value:string){setValues(current=>({...current,[field]:value}));setCopyState('idle');}
  function input(field:Field,label:string,min=0,max?:number){return <label>{label}<input data-testid={`fire-${field}`} name={field} type="number" min={min} max={max} step={field==='currentAge'?1:'any'} value={values[field]} onChange={event=>change(field,event.target.value)} disabled={!ready} aria-invalid={invalidFields.has(field)||undefined} aria-describedby={!result?'fire-error':undefined}/></label>;}
  const text=result?[
    `# ${t.title}`,`## ${t.assumptions}`,
    ...(['annualExpenses','currentAssets','monthlyContribution','expectedReturn','currentAge'] as const).map(field=>`${t[field]}: ${values[field]||'—'}`),`${t.withdrawalRate}: ${values.withdrawalRate}%`,
    `## ${t.results}`,`${t.target}: ${money(result.fireNumber)}`,`${t.progress}: ${result.currentProgress.toFixed(1)}%`,`${t.remaining}: ${money(result.amountNeeded)}`,`${t.years}: ${years}`,`${t.date}: ${date}`,
    `## ${t.withdrawals}`,`${t.monthly}: ${money(result.monthlyWithdrawal)}`,`${t.weekly}: ${money(result.weeklyWithdrawal)}`,`${t.daily}: ${money(result.dailyWithdrawal)}`,
    `## ${t.firstTen}`,`| ${t.year} | ${t.starting} | ${t.contribution} | ${t.returns} | ${t.ending} | ${t.status} |`,'|---|---|---|---|---|---|',
    ...result.yearlyProjection.slice(0,10).map(row=>`| ${row.year} | ${money(row.startingAssets)} | ${money(row.contribution)} | ${money(row.returns)} | ${money(row.endingAssets)} | ${row.isFreed?t.achieved:t.building} |`),t.model,
  ].join('\n'):'';
  async function copy(){try{await navigator.clipboard.writeText(text);setCopyState('copied');}catch{setCopyState('failed');}}
  return <section className="fire-page"><ToolShell tool={toolByHref('/tools/financial-freedom')} title={t.title} intro={t.intro} /><div className="fire-grid"><section className="fire-inputs" aria-labelledby="fire-assumptions"><h2 id="fire-assumptions">{t.assumptions}</h2><div className="fire-fields">{input('annualExpenses',t.annualExpenses,0)}{input('currentAssets',t.currentAssets)}{input('monthlyContribution',t.monthlyContribution)}{input('expectedReturn',t.expectedReturn,0,30)}<p className="muted">{Number(values.expectedReturn)<=4?t.lowReturn:Number(values.expectedReturn)<=10?t.midReturn:t.highReturn}</p>{input('currentAge',t.currentAge,0,120)}<label>{t.withdrawalRate}<select data-testid="fire-preset" value={preset} disabled={!ready} onChange={event=>{const id=event.target.value;setPreset(id);const entry=withdrawalRatePresets.find(p=>p.id===id);if(entry)change('withdrawalRate',String(entry.rate));}}>{withdrawalRatePresets.map(p=><option key={p.id} value={p.id}>{t[p.id]} · {p.rate}%</option>)}<option value="custom">{t.custom}</option></select></label>{preset==='custom'&&input('withdrawalRate',t.customRate,0,100)}<p className="muted">{t.rateNote}</p></div></section><section className="fire-results" aria-labelledby="fire-result-title"><h2 id="fire-result-title">{t.results}</h2>{!result?<p id="fire-error" role="alert" className="error">{t.invalid}</p>:<><dl className="fire-summary"><div><dt>{t.target}</dt><dd data-testid="fire-target">{money(result.fireNumber)}</dd></div><div><dt>{t.remaining}</dt><dd>{money(result.amountNeeded)}</dd></div><div><dt>{t.progress}</dt><dd>{result.currentProgress.toFixed(1)}%</dd></div><div><dt>{t.years}</dt><dd data-testid="fire-years">{years}</dd></div><div><dt>{t.date}</dt><dd>{date}</dd></div></dl><h3>{t.withdrawals}</h3><dl className="fire-withdrawals"><div><dt>{t.monthly}</dt><dd>{money(result.monthlyWithdrawal)}</dd></div><div><dt>{t.weekly}</dt><dd>{money(result.weeklyWithdrawal)}</dd></div><div><dt>{t.daily}</dt><dd>{money(result.dailyWithdrawal)}</dd></div></dl></>}<p className="muted">{t.model}</p><p className="muted">{t.notPersisted}</p><button disabled={!ready||!result} data-testid="fire-copy" onClick={()=>void copy()}>{t.copy}</button>{copyState!=='idle'&&<p role="status">{copyState==='copied'?t.copied:t.copyFailed}</p>}</section></div>{result&&<section className="fire-projection"><h2>{t.projection}</h2><p className="fire-scroll-hint muted">{t.scroll}</p><div className="table-scroll" tabIndex={0} role="region" aria-label={t.projection}><table data-testid="fire-projection"><thead><tr>{[t.year,t.age,t.starting,t.contribution,t.returns,t.ending,t.status].map(label=><th key={label}>{label}</th>)}</tr></thead><tbody>{result.yearlyProjection.slice(0,allYears?undefined:10).map(row=><tr key={row.year}><th scope="row">{row.year}</th><td>{row.age??'—'}</td><td>{money(row.startingAssets)}</td><td>{money(row.contribution)}</td><td>{money(row.returns)}</td><td>{money(row.endingAssets)}</td><td>{row.isFreed?t.achieved:t.building}</td></tr>)}</tbody></table></div>{result.yearlyProjection.length>10&&<button className="secondary" onClick={()=>setAllYears(!allYears)}>{allYears?t.showTen:t.showAll}</button>}<details open={copyState==='failed'}><summary>{t.export}</summary><textarea readOnly rows={12} aria-label={t.export} value={text} onFocus={event=>event.currentTarget.select()}/></details></section>}</section>;
}
