import {beforeAll,afterAll,it,expect} from 'vitest';
import {marketRotationSnapshots} from '../../packages/db/src/schema';
import {getCoreUniverse,getIndexesUniverse,getSectorsUniverse} from '../../packages/domain/src/market-rotation/universe';
import {readRotationMonitor} from '../../apps/api/src/rotation-monitor';
import {provisionTestDatabase} from '../support/database';
let database:Awaited<ReturnType<typeof provisionTestDatabase>>;
beforeAll(async()=>{database=await provisionTestDatabase('rotation_monitor');});afterAll(async()=>{await database?.dispose();});
it('reads canonical snapshots, qualified trends and sector-only summary in one consistent view',async()=>{
 expect(await readRotationMonitor(database.db,'indexes','2026-09-05')).toBeNull();
 const indexes=getIndexesUniverse(),sectors=getSectorsUniverse();
 const rows=Array.from({length:11},(_,i)=>indexes.map(entry=>({symbol:entry.symbol,date:`2026-08-${String(i+1).padStart(2,'0')}`,rankScope:'indexes',groupType:'index',lastPrice:i===5?null:String(100+i),adjustedClose:i===5?null:String(100+i),rsi14:'80',above20d:true,above50d:true,maStatus:'bullish_stack',rotationRank:i===10&&entry.symbol==='SPY'?1:i===10&&entry.symbol==='QQQ'?2:null,rankDelta2W:i===10&&entry.symbol==='SPY'?2:i===10&&entry.symbol==='QQQ'?-2:null,rotationScoreDelta2W:i===10&&entry.symbol==='SPY'?'4':i===10&&entry.symbol==='QQQ'?'-4':null,signalStatus:'insufficient_data'}))).flat();
 await database.db.insert(marketRotationSnapshots).values(rows);
 await database.db.insert(marketRotationSnapshots).values([
  ...sectors.map(entry=>({symbol:entry.symbol,date:'2026-08-12',rankScope:'sectors',groupType:'sector',rsi14:'70',above20d:true,above50d:true,signalStatus:'insufficient_data'})),
  ...sectors.map(entry=>({symbol:entry.symbol,date:'2026-08-10',rankScope:'sectors',groupType:'sector',rsi14:'30',above20d:false,above50d:false,signalStatus:'insufficient_data'})),
 ]);
 await database.db.insert(marketRotationSnapshots).values({symbol:'EXTRA',date:'2026-08-11',rankScope:'indexes',groupType:'index',signalStatus:'complete',rotationRank:1});
 const result=await readRotationMonitor(database.db,'indexes','2026-09-05');expect(result?.payload.rows).toHaveLength(8);expect(result?.payload.summary).toMatchObject({marketState:'unknown',above50d:{count:11,total:11,ratio:1},averageRsi:70});expect(result?.payload.summaryAsOfDate).toBe('2026-08-12');expect(result?.payload.comparisonDate).toBe('2026-08-01');expect(result?.payload.dataQuality).toMatchObject({actualSymbolCount:8,expectedSymbolCount:8,coverageRatio:1});
 expect(result?.payload.currentMarketSummary).toContain('Leaders');expect(result?.payload.currentMarketSummary).toContain('Weakening groups');expect(result?.payload.currentMarketSummary).not.toContain('Leading sectors');
 const spy=result!.payload.rows.find(row=>row.symbol==='SPY')!;expect(spy.name).toBe('S&P 500');expect(spy.twoWeekTrend).toHaveLength(11);expect(spy.twoWeekTrend[0]?.value).toBe(100);expect(spy.twoWeekTrend[5]?.value).toBeNull();expect(spy.twoWeekTrend[10]?.value).toBe(110);
 expect(result?.payload.currentMarketSummary).toContain('insufficient data');expect(result?.lastUpdated?.toISOString()).toBe('2026-08-11T00:00:00.000Z');
 const priorResult=await readRotationMonitor(database.db,'indexes','2026-08-11');expect(priorResult?.payload.asOfDate).toBe('2026-08-11');expect(priorResult?.payload.summaryAsOfDate).toBe('2026-08-10');expect(priorResult?.payload.summary.above50d).toEqual({count:0,total:11,ratio:0});expect(priorResult?.payload.summary.averageRsi).toBe(30);
 const sectorsResult=await readRotationMonitor(database.db,'sectors','2026-08-12');expect(sectorsResult?.payload.summaryAsOfDate).toBe('2026-08-12');expect(sectorsResult?.payload.asOfDate).toBe('2026-08-12');
 const core=getCoreUniverse();await database.db.insert(marketRotationSnapshots).values(core.map((entry,index)=>({symbol:entry.symbol,date:'2026-08-11',rankScope:'core',groupType:entry.groupType,lastPrice:'100',adjustedClose:'100',rsi14:'55',above20d:true,above50d:true,maStatus:'bullish_stack',rotationRank:index+1,rankDelta2W:index===0?2:index===1?-2:0,rotationScoreDelta2W:index===0?'3':index===1?'-3':'0',signalStatus:'complete'})));
 const coreResult=await readRotationMonitor(database.db,'core','2026-09-05');expect(coreResult?.payload.rows).toHaveLength(core.length);expect(coreResult?.payload.summaryAsOfDate).toBe('2026-08-12');expect(coreResult?.payload.currentMarketSummary).toContain('Leaders');expect(coreResult?.payload.currentMarketSummary).toContain('Weakening groups');expect(coreResult?.payload.currentMarketSummary).not.toContain('Leading sectors');
});

it('returns a null summary date when no sector snapshot exists',async()=>{
 const isolated=await provisionTestDatabase('rotation_monitor_empty');
 try {
  const indexes=getIndexesUniverse();await isolated.db.insert(marketRotationSnapshots).values(indexes.map(entry=>({symbol:entry.symbol,date:'2026-08-11',rankScope:'indexes',groupType:'index',lastPrice:'100',adjustedClose:'100',rsi14:'50',above20d:true,above50d:true,maStatus:'bullish_stack',signalStatus:'insufficient_data'})));
  const result=await readRotationMonitor(isolated.db,'indexes','2026-09-05');expect(result?.payload.summaryAsOfDate).toBeNull();expect(result?.payload.summary.above50d).toEqual({count:0,total:0,ratio:null});
 } finally { await isolated.dispose(); }
});
