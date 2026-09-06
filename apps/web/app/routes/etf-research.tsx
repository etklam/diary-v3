import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import type { z } from 'zod';
import { etfProfileSchema, etfProfileQuerySchema } from '@diary/contracts/etf-profile';
import { marketSymbolSchema } from '@diary/contracts/market';
import { api, useUi } from '../ui';
import { apiFailure, FailureNotice, invalidField, type Failure } from '../api-error';
import { signInPath, useSessionState } from '../session'
import { formatMarketValue, formatNeutralValue, marketClass } from '../market-display';
import '../trade-plan.css';
import '../etf.css';
type MetricGuide={definition:string;interpretation:string;limitations:string};
const guideNotes:Record<'en'|'zh-TW'|'zh-CN',MetricGuide[]>= {
 en:[
  {definition:'Highest daily high observed in the latest 252 valid trading observations, an approximate one-year window.',interpretation:'A reference for the recent price ceiling; a smaller absolute distance usually means price is nearer that high.',limitations:'It is historical, not a forecast, and depends on the available high prices and trading observations.'},
  {definition:'Lowest daily low observed in the latest 252 valid trading observations, an approximate one-year window.',interpretation:'A reference for the recent price floor; a larger distance from it means more recovery from that low.',limitations:'It is historical, not a guaranteed support level, and depends on the available low prices and trading observations.'},
  {definition:'Latest close relative to the high, expressed as (close / high − 1) × 100.',interpretation:'Zero means the close equals the high; a negative 10% means the close is 10% below the high.',limitations:'It does not explain why price moved or predict the next move, and depends on valid high data.'},
  {definition:'Latest close relative to the low, expressed as (close / low − 1) × 100.',interpretation:'Zero means the close equals the low; a positive value means the close is above the low.',limitations:'It does not measure the path or the risk of another drawdown, and depends on valid low data.'},
  {definition:'Sample standard deviation of the latest 20 daily log returns, annualized with √252.',interpretation:'Higher values indicate more variable recent daily returns.',limitations:'Short windows can be noisy and annualization does not make the estimate a prediction.'},
  {definition:'Sample standard deviation of the latest 60 daily log returns, annualized with √252.',interpretation:'A medium-term view of how widely daily returns have varied.',limitations:'It can lag a regime change and requires enough valid closes.'},
  {definition:'Sample standard deviation of the latest 252 daily log returns, annualized with √252.',interpretation:'A longer-term view of the dispersion of daily returns.',limitations:'It describes observed history and is sensitive to the chosen observation window.'},
  {definition:'Largest peak-to-trough decline within the latest 252 valid trading observations.',interpretation:'More negative values represent a deeper historical loss from a prior peak.',limitations:'It is backward-looking and does not describe recovery time or future loss.'},
  {definition:'Current volume divided by the average of the prior 20 trading observations.',interpretation:'Values above one indicate more volume than that recent baseline.',limitations:'If any required volume is missing the ratio is unavailable; it does not identify the reason for activity.'},
  {definition:'Reported assets managed by the fund.',interpretation:'Larger assets can indicate a more established fund, but size alone is not quality.',limitations:'Provider timing and currency are not normalized into an investment recommendation.'},
  {definition:'Reported annual fund expense ratio in percentage points.',interpretation:'Lower ongoing expenses leave more of gross return before other costs.',limitations:'It may be stale or exclude trading, tax, spread, or other investor costs.'},
  {definition:'Reported price-to-earnings ratio for the fund holdings or aggregate.',interpretation:'It compares price with reported earnings; higher values imply a higher valuation on this measure.',limitations:'The aggregate can hide holdings, sector mix, negative earnings, and provider methodology.'},
  {definition:'Reported price-to-book ratio for the fund holdings or aggregate.',interpretation:'It compares price with reported book value; interpretation depends heavily on the fund composition.',limitations:'Book value is not equally informative across sectors and can change with provider data.'},
  {definition:'Reported annual dividend yield in percentage points.',interpretation:'It estimates recent income relative to price, where available.',limitations:'It can change with distributions and price; it is not a promised future yield.'},
  {definition:'ETF simple return over the selected common-date period.',interpretation:'Positive values indicate the ETF ended above its starting common-date close.',limitations:'It excludes fees, distributions, and intraperiod volatility unless reflected by the source close.'},
  {definition:'Benchmark simple return over the same common-date period.',interpretation:'It provides the comparison context for the ETF return.',limitations:'A benchmark is not a complete risk-adjusted peer comparison.'},
  {definition:'ETF return minus benchmark return, in percentage points.',interpretation:'Positive values mean the ETF outperformed the selected benchmark over the period.',limitations:'It is period-specific, unadjusted for risk, and does not imply persistence.'},
 ],
 'zh-TW':[
  {definition:'最近 252 個有效交易觀察（約一年）中的最高每日高位。',interpretation:'可作為近期價格上限參考；絕對距離越小通常代表現價越接近高位。',limitations:'只反映歷史，並非預測；結果取決於可用的高位資料及交易觀察。'},
  {definition:'最近 252 個有效交易觀察（約一年）中的最低每日低位。',interpretation:'可作為近期價格下限參考；距離越大代表現價較低位有較多回升。',limitations:'不是保證的支持位，並取決於可用的低位資料及交易觀察。'},
  {definition:'現時收市價相對高位：(收市價／高位 − 1) × 100。',interpretation:'零代表收市價等於高位；負 10% 代表收市價低於高位 10%。',limitations:'不能解釋價格原因，也不能預測下一步走勢，並取決於有效高位資料。'},
  {definition:'現時收市價相對低位：(收市價／低位 − 1) × 100。',interpretation:'零代表收市價等於低位；正值代表收市價高於低位。',limitations:'不表示回升路徑，也不代表未來不會再次回撤，並取決於有效低位資料。'},
  {definition:'最近 20 個每日對數回報的樣本標準差，以 √252 年化。',interpretation:'數值越高代表近期每日回報變化越大。',limitations:'短期窗口可能較嘈雜；年化並不等於預測。'},
  {definition:'最近 60 個每日對數回報的樣本標準差，以 √252 年化。',interpretation:'提供中期每日回報變動幅度。',limitations:'可能滯後於市場狀態轉變，並需要足夠有效收市價。'},
  {definition:'最近 252 個每日對數回報的樣本標準差，以 √252 年化。',interpretation:'提供較長期的每日回報分散程度。',limitations:'只描述歷史，亦會受觀察窗口選擇影響。'},
  {definition:'最近 252 個有效交易觀察中的最大峰值至谷值跌幅。',interpretation:'越負代表由過往高位下跌的幅度越深。',limitations:'只反映過往，不表示回復所需時間或未來損失。'},
  {definition:'現時成交量除以前 20 筆交易觀察的平均值。',interpretation:'高於 1 代表成交量高於近期基線。',limitations:'任何所需成交量缺失時會顯示無資料；比率不說明活動原因。'},
  {definition:'基金披露的管理資產。',interpretation:'較大的資產規模可能代表基金較成熟，但規模本身不代表品質。',limitations:'資料時間及貨幣未作投資建議式標準化。'},
  {definition:'基金披露的年度費用率，以百分點表示。',interpretation:'持續費用較低，扣除其他成本前保留的毛回報通常較多。',limitations:'可能過時，也可能未包括交易、稅項、買賣差價或其他投資者成本。'},
  {definition:'基金持倉或合計資料披露的市盈率。',interpretation:'比較價格與盈利；數值較高代表此指標下估值較高。',limitations:'合計數值可能掩蓋持倉、行業比例、負盈利及供應商方法。'},
  {definition:'基金持倉或合計資料披露的市帳率。',interpretation:'比較價格與帳面值；解讀高度取決於基金組合。',limitations:'帳面值對不同行業的參考性不同，也會受供應商資料影響。'},
  {definition:'基金披露的年度股息率，以百分點表示。',interpretation:'在資料可用時，估算近期收入相對於價格的比例。',limitations:'會隨派息及價格變動，並非承諾的未來收益。'},
  {definition:'ETF 在所選共同日期區間的簡單回報。',interpretation:'正值代表 ETF 在共同起始日收市價之上結束。',limitations:'除非資料收市價已反映，否則不包括費用、分派及區間內波動。'},
  {definition:'基準在同一共同日期區間的簡單回報。',interpretation:'提供 ETF 回報的比較背景。',limitations:'基準不是完整的風險調整同類比較。'},
  {definition:'ETF 回報減去基準回報，以百分點表示。',interpretation:'正值代表 ETF 在該區間跑贏所選基準。',limitations:'只適用於該期間，未按風險調整，也不代表會持續。'},
 ],
 'zh-CN':[
  {definition:'最近 252 个有效交易观察（约一年）中的最高每日高位。',interpretation:'可作为近期价格上限参考；绝对距离越小通常表示现价越接近高位。',limitations:'只反映历史，并非预测；结果取决于可用的高位数据及交易观察。'},
  {definition:'最近 252 个有效交易观察（约一年）中的最低每日低位。',interpretation:'可作为近期价格下限参考；距离越大表示现价较低位有更多回升。',limitations:'不是保证的支撑位，并取决于可用的低位数据及交易观察。'},
  {definition:'现时收盘价相对高位：(收盘价／高位 − 1) × 100。',interpretation:'零表示收盘价等于高位；负 10% 表示收盘价低于高位 10%。',limitations:'不能解释价格原因，也不能预测下一步走势，并取决于有效高位数据。'},
  {definition:'现时收盘价相对低位：(收盘价／低位 − 1) × 100。',interpretation:'零表示收盘价等于低位；正值表示收盘价高于低位。',limitations:'不表示回升路径，也不代表未来不会再次回撤，并取决于有效低位数据。'},
  {definition:'最近 20 个每日对数回报的样本标准差，以 √252 年化。',interpretation:'数值越高表示近期每日回报变化越大。',limitations:'短期窗口可能较嘈杂；年化并不等于预测。'},
  {definition:'最近 60 个每日对数回报的样本标准差，以 √252 年化。',interpretation:'提供中期每日回报变动幅度。',limitations:'可能滞后于市场状态转变，并需要足够有效收盘价。'},
  {definition:'最近 252 个每日对数回报的样本标准差，以 √252 年化。',interpretation:'提供较长期的每日回报分散程度。',limitations:'只描述历史，也会受观察窗口选择影响。'},
  {definition:'最近 252 个有效交易观察中的最大峰值至谷值跌幅。',interpretation:'越负表示由过往高位下跌的幅度越深。',limitations:'只反映过去，不表示恢复所需时间或未来损失。'},
  {definition:'现时成交量除以前 20 笔交易观察的平均值。',interpretation:'高于 1 表示成交量高于近期基线。',limitations:'任何所需成交量缺失时会显示无数据；比率不说明活动原因。'},
  {definition:'基金披露的管理资产。',interpretation:'较大的资产规模可能表示基金较成熟，但规模本身不代表质量。',limitations:'数据时间及货币未作投资建议式标准化。'},
  {definition:'基金披露的年度费用率，以百分点表示。',interpretation:'持续费用较低，扣除其他成本前保留的毛回报通常较多。',limitations:'可能过时，也可能未包括交易、税项、买卖价差或其他投资者成本。'},
  {definition:'基金持仓或合计数据披露的市盈率。',interpretation:'比较价格与盈利；数值较高代表此指标下估值较高。',limitations:'合计数值可能掩盖持仓、行业比例、负盈利及供应商方法。'},
  {definition:'基金持仓或合计数据披露的市净率。',interpretation:'比较价格与账面值；解读高度取决于基金组合。',limitations:'账面值对不同行业的参考性不同，也会受供应商数据影响。'},
  {definition:'基金披露的年度股息率，以百分点表示。',interpretation:'在数据可用时，估算近期收入相对价格的比例。',limitations:'会随派息及价格变动，并非承诺的未来收益。'},
  {definition:'ETF 在所选共同日期区间的简单回报。',interpretation:'正值表示 ETF 在共同起始日收盘价之上结束。',limitations:'除非数据收盘价已反映，否则不包括费用、分派及区间内波动。'},
  {definition:'基准在同一共同日期区间的简单回报。',interpretation:'提供 ETF 回报的比较背景。',limitations:'基准不是完整的风险调整同类比较。'},
  {definition:'ETF 回报减去基准回报，以百分点表示。',interpretation:'正值表示 ETF 在该区间跑赢所选基准。',limitations:'只适用于该期间，未按风险调整，也不代表会持续。'},
 ],
};
const copy={
 en:{title:'ETF research',intro:'Read risk, fund details and relative returns together, with their data dates.',symbol:'ETF symbol',benchmark:'Compare with',period:'Period',open:'Read ETF',watch:'ETF watchlist',risk:'Price risk',valuation:'Fund details',rs:'Relative returns',quote:'Latest price',unknown:'Unavailable',partial:'Some data is unavailable.',unavailable:'Research data is unavailable for this symbol.',stale:'Showing previously fetched data because a source could not be refreshed.',complete:'Available metrics loaded.',asOf:'Observation date',fetched:'Fetched',source:'Source',method:'Risk uses daily closes: sample volatility annualized over 252 trading days, drawdown over 252 observations, and current volume versus the previous 20 observations. Returns use common trading dates; relative return is the difference in percentage points.',guide:'Metric definitions, interpretation and limits',definition:'Definition',interpretation:'How to read it',limitations:'Limitations',invalid:'Check the ETF symbol, benchmark and period.',labels:['52-week high','52-week low','Distance to high','Distance to low','20-day volatility','60-day volatility','252-day volatility','1-year maximum drawdown','Volume / prior 20-day average','Assets under management','Expense ratio','P/E','P/B','Dividend yield','ETF return','Benchmark return','Relative return (pp)'],months:['1 month','3 months','6 months','1 year']},
 'zh-TW':{title:'ETF 研究',intro:'連同資料日期，閱讀風險、基金資料及相對回報。',symbol:'ETF 代號',benchmark:'比較基準',period:'期間',open:'閱讀 ETF',watch:'ETF 關注清單',risk:'價格風險',valuation:'基金資料',rs:'相對回報',quote:'最新價格',unknown:'無資料',partial:'部分資料暫時無法取得。',unavailable:'此代號暫時沒有研究資料。',stale:'來源未能更新，現正顯示之前取得的資料。',complete:'已載入可用指標。',asOf:'觀察日期',fetched:'取得時間',source:'來源',method:'風險採用每日收市價：樣本波動率以 252 個交易日年化，回撤使用 252 筆觀察，成交量與之前 20 筆平均比較。回報採用共同交易日期；相對回報為百分點差額。',guide:'指標定義、解讀及限制',definition:'定義',interpretation:'如何解讀',limitations:'限制',invalid:'請檢查 ETF 代號、基準及期間。',labels:['52 週高位','52 週低位','距高位','距低位','20 日波動率','60 日波動率','252 日波動率','1 年最大回撤','成交量／前 20 日平均','管理資產','費用率','本益比','股價淨值比','股息率','ETF 回報','基準回報','相對回報（百分點）'],months:['1 個月','3 個月','6 個月','1 年']},
 'zh-CN':{title:'ETF 研究',intro:'连同数据日期，阅读风险、基金资料及相对回报。',symbol:'ETF 代码',benchmark:'比较基准',period:'期间',open:'阅读 ETF',watch:'ETF 关注清单',risk:'价格风险',valuation:'基金资料',rs:'相对回报',quote:'最新价格',unknown:'无数据',partial:'部分数据暂时无法获取。',unavailable:'此代码暂时没有研究数据。',stale:'来源未能更新，现正显示之前获取的数据。',complete:'已加载可用指标。',asOf:'观察日期',fetched:'获取时间',source:'来源',method:'风险采用每日收盘价：样本波动率以 252 个交易日年化，回撤使用 252 笔观察，成交量与之前 20 笔平均比较。回报采用共同交易日期；相对回报为百分点差额。',guide:'指标定义、解读及限制',definition:'定义',interpretation:'如何解读',limitations:'限制',invalid:'请检查 ETF 代码、基准及期间。',labels:['52 周高位','52 周低位','距高位','距低位','20 日波动率','60 日波动率','252 日波动率','1 年最大回撤','成交量／前 20 日平均','管理资产','费用率','市盈率','市净率','股息率','ETF 回报','基准回报','相对回报（百分点）'],months:['1 个月','3 个月','6 个月','1 年']}
};
export default function EtfResearch(){
 const {locale,t}=useUi(),c=copy[locale], [params,setParams]=useSearchParams();
 const session = useSessionState()
 const symbol=params.get('symbol')??'SPY',benchmark=params.get('benchmark')??'SPY',period=params.get('period')??'3m';
 const [data,setData]=useState<z.infer<typeof etfProfileSchema>|null>(null),[error,setError]=useState<Failure|null>(null),[attempt,retry]=useState(0);
 const messages=useRef({t,c});messages.current={t,c};
 useEffect(()=>{
  const controller=new AbortController();setData(null);setError(null);
  const parsedSymbol=marketSymbolSchema.safeParse(symbol),query=etfProfileQuerySchema.safeParse({benchmark,period});
  if(!parsedSymbol.success||!query.success){setError({message:messages.current.c.invalid,fields:[...(parsedSymbol.success?[]:['symbol']),...(query.success?[]:['benchmark','period'])]});return;}
  api.GET('/api/etf/{symbol}/profile',{params:{path:{symbol:parsedSymbol.data},query:query.data},signal:controller.signal}).then(result=>{
   if(controller.signal.aborted)return;const parsed=etfProfileSchema.safeParse(result.data);
   if(!result.response.ok||!parsed.success)setError(apiFailure(result.error,messages.current.t('failed')));else setData(parsed.data);
  }).catch(()=>{if(!controller.signal.aborted)setError(apiFailure(null,messages.current.t('connection')));});return()=>controller.abort();
 },[symbol,benchmark,period,attempt]);
 const withSuffix=(value:string,suffix:string)=>value==='—'?value:`${value}${suffix}`;
 const number=(value:number|null,suffix='')=>withSuffix(formatNeutralValue(locale,value,2),suffix);
 const signed=(value:number|null,suffix='')=>withSuffix(formatMarketValue(locale,value,2),suffix);
 const instant=(value:string)=>new Intl.DateTimeFormat(locale,{dateStyle:'medium',timeStyle:'short',timeZone:'UTC'}).format(new Date(value))+' UTC';
 const metricKeys=['risk.high52w','risk.low52w','risk.distanceToHighPct','risk.distanceToLowPct','risk.volatility20d','risk.volatility60d','risk.volatility252d','risk.maxDrawdown1y','risk.volumeSpikeRatio','valuation.aum','valuation.expenseRatioPct','valuation.pe','valuation.pb','valuation.dividendYieldPct','rs.symbolReturnPct','rs.benchmarkReturnPct','rs.relativeReturnPct'];
 const metrics=data?[data.risk.high52w,data.risk.low52w,data.risk.distanceToHighPct,data.risk.distanceToLowPct,data.risk.volatility20d,data.risk.volatility60d,data.risk.volatility252d,data.risk.maxDrawdown1y,data.risk.volumeSpikeRatio,data.valuation.aum,data.valuation.expenseRatioPct,data.valuation.pe,data.valuation.pb,data.valuation.dividendYieldPct,data.rs.symbolReturnPct,data.rs.benchmarkReturnPct,data.rs.relativeReturnPct]:[];
 return <section className="plan-page"><header className="plan-header"><div><h1>{c.title}</h1><p className="lede">{c.intro}</p></div>{session.authenticated === true ? <Link to="/etf/watchlist">{c.watch}</Link> : <a href={signInPath('/tools/etf')}>{c.watch} · {locale === 'en' ? 'Sign in to save' : locale === 'zh-CN' ? '登录后保存' : '登入後保存'}</a>}</header>
 <form className="plan-filters" key={`${symbol}/${benchmark}/${period}`} onSubmit={event=>{event.preventDefault();const input=new FormData(event.currentTarget);setParams({symbol:String(input.get('symbol')).trim().toUpperCase(),benchmark:String(input.get('benchmark')),period:String(input.get('period'))});}}>
 <label>{c.symbol}<input id="etf-research-symbol" name="symbol" defaultValue={symbol} maxLength={32} required spellCheck={false} autoCapitalize="characters" aria-invalid={invalidField(error,'symbol')} aria-describedby={error?'etf-research-error':undefined}/></label><label>{c.benchmark}<select id="etf-research-benchmark" name="benchmark" defaultValue={benchmark} aria-invalid={invalidField(error,'benchmark')} aria-describedby={error?'etf-research-error':undefined}><option>SPY</option><option>QQQ</option></select></label><label>{c.period}<select id="etf-research-period" name="period" defaultValue={period} aria-invalid={invalidField(error,'period')} aria-describedby={error?'etf-research-error':undefined}>{(['1m','3m','6m','1y'] as const).map((value,i)=><option key={value} value={value}>{c.months[i]}</option>)}</select></label><button type="submit">{c.open}</button></form>
 {error?<><FailureNotice failure={error} id="etf-research-error"/><button onClick={()=>retry(n=>n+1)}>{t('retry')}</button></>:!data?<p role="status">{t('loading')}</p>:<article data-testid="etf-profile"><h2>{data.symbol}</h2><p role="status">{c[data.meta.status]} {data.meta.isStale?c.stale:''}</p><p>{c.quote}: {number(data.quote?.regularMarketPrice??null)} {data.quote?.currency??''}</p><p>{c.asOf}: {data.meta.asOf?<time dateTime={data.meta.asOf}>{instant(data.meta.asOf)}</time>:c.unknown} · {c.fetched}: <time dateTime={data.meta.fetchedAt}>{instant(data.meta.fetchedAt)}</time></p>
 {[[c.risk,0,9],[c.valuation,9,14],[c.rs,14,17]].map(([title,start,end])=><section className="etf-section" key={title}><h3>{title}</h3><dl className="etf-metrics">{metrics.slice(Number(start),Number(end)).map((value,i)=>{const index=Number(start)+i;const suffix=[2,3,4,5,6,7,10,13,14,15].includes(index)?'%':'';const isDirectional=index===7||index>=14;return <div key={index}><dt>{c.labels[index]}</dt><dd className={isDirectional?marketClass(value):undefined}>{isDirectional?signed(value??null,suffix):number(value??null,suffix)}{index===9&&data.valuation.currency?` ${data.valuation.currency}`:''}</dd></div>;})}</dl>{start===14&&<p>{data.benchmark} · {data.rs.from??c.unknown} – {data.rs.to??c.unknown}</p>}</section>)}
 <p>{c.method}</p><details className="etf-guidance" data-testid="etf-metric-guidance"><summary>{c.guide}</summary><ol>{guideNotes[locale].map((note,index)=><li key={index}><strong>{c.labels[index]}</strong><dl><div><dt>{c.definition}</dt><dd>{note.definition}</dd></div><div><dt>{c.interpretation}</dt><dd>{note.interpretation}</dd></div><div><dt>{c.limitations}</dt><dd>{note.limitations}</dd></div></dl></li>)}</ol></details><details><summary>{c.source}: Yahoo</summary><ul>{Object.entries(data.meta.sources).filter(([key])=>metricKeys.includes(key)||key==='quote.regularMarketPrice').map(([key,value])=><li key={key}>{key==='quote.regularMarketPrice'?c.quote:c.labels[metricKeys.indexOf(key)]}: <time dateTime={value.fetchedAt}>{instant(value.fetchedAt)}</time>{value.isStale?` · ${c.stale}`:''}</li>)}</ul></details></article>}
 </section>;
}
