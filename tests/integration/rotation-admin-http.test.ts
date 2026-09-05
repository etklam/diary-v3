import {marketRotationMonitorResponseSchema} from '@diary/contracts/rotation-monitor';
import {randomUUID} from 'node:crypto';
import {once} from 'node:events';
import type {AddressInfo} from 'node:net';
import {serve} from '@hono/node-server';
import {beforeAll,afterAll,it,expect} from 'vitest';
import {createApp} from '../../apps/api/src/app';
import {createMarketData} from '../../apps/api/src/market-data';
import {BrowserSession} from '../support/browser-session';
import {provisionTestDatabase} from '../support/database';
let chartCalls=0;
let database:Awaited<ReturnType<typeof provisionTestDatabase>>,server:ReturnType<typeof serve>,baseUrl:string;
beforeAll(async()=>{
 database=await provisionTestDatabase('rotation_admin');const now=()=>new Date('2026-09-05T12:00:00Z');
 const app=createApp({db:database.db,databasePool:database.pool,now,marketData:createMarketData({now,upstream:{quote:async()=>({}),chart:async()=>{chartCalls++;return {quotes:[{date:new Date('2026-09-04'),open:100,high:101,low:99,close:100,volume:100}]};}}}),config:{jwtSecret:'synthetic-review-key-with-at-least-32-characters',nodeEnv:'test',trustProxy:false,webOrigin:'http://127.0.0.1'}});
 server=serve({fetch:app.fetch,hostname:'127.0.0.1',port:0});await once(server,'listening');baseUrl=`http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async()=>{server?.close();if(server)await once(server,'close');await database?.dispose();});
async function login(admin:boolean){const browser=new BrowserSession(baseUrl),credentials={email:`${randomUUID()}@example.test`,password:'synthetic-rotation-password'};await browser.post('/api/auth/register',credentials);if(admin)await database.pool.query("update users set role='ADMIN' where email=$1",[credentials.email]);await browser.post('/api/auth/login',credentials);await browser.request('/api/auth/me');return browser;}
it('protects batch mutations and exposes canonical scoped results and conflict recovery',async()=>{
 const emptyMonitor=await fetch(`${baseUrl}/api/market/rotation-monitor`);expect(emptyMonitor.status).toBe(404);expect(emptyMonitor.headers.get('cache-control')).toBe('no-store');
 expect((await fetch(`${baseUrl}/api/market/rotation-monitor?scope=all`)).status).toBe(400);
 expect((await fetch(`${baseUrl}/api/market/rotation-monitor`,{headers:{authorization:'Bearer invalid'}})).status).toBe(401);
 expect((await fetch(`${baseUrl}/api/admin/market/rotation-batch`,{method:'POST',headers:{'content-type':'application/json'},body:'{}'})).status).toBe(403);
 const user=await login(false);expect((await user.post('/api/admin/market/rotation-batch',{scope:'indexes'})).status).toBe(403);
 const admin=await login(true);expect((await admin.post('/api/admin/market/rotation-batch',{scope:'indexes'},false)).status).toBe(403);expect((await admin.post('/api/admin/market/rotation-batch',{scope:'indexes'},true,{authorization:'Bearer invalid'})).status).toBe(401);expect((await admin.post('/api/admin/market/rotation-batch',{scope:'bad'})).status).toBe(400);
 const response=await admin.post('/api/admin/market/rotation-batch',{scope:'indexes'});expect(response.status).toBe(200);expect(response.headers.get('cache-control')).toBe('no-store');expect(await response.json()).toMatchObject({success:true,result:{rankScope:'indexes',symbolCount:8,upsertedCount:8,status:'success',errors:[]}});
 const callsBeforeRead=chartCalls;
 const monitor=await fetch(`${baseUrl}/api/market/rotation-monitor?scope=indexes`);expect(monitor.status).toBe(200);expect(monitor.headers.get('cache-control')).toBe('no-store');
 const payload=marketRotationMonitorResponseSchema.parse(await monitor.json());expect(payload.rankScope).toBe('indexes');expect(payload.rows).toHaveLength(8);expect(payload.comparisonDate).toBeNull();expect(payload.rows.every(row=>row.signalStatus==='insufficient_data')).toBe(true);expect(chartCalls).toBe(callsBeforeRead);
 const lock=await database.pool.connect();await lock.query("select pg_advisory_lock(hashtextextended('diary:rotation:indexes',0))");
 try{const busy=await admin.post('/api/admin/market/rotation-batch',{scope:'indexes'});expect(busy.status).toBe(409);expect(await busy.json()).toMatchObject({data:{code:'ROTATION_BATCH_BUSY'}});}finally{await lock.query("select pg_advisory_unlock(hashtextextended('diary:rotation:indexes',0))");lock.release();}
 const all=await admin.post('/api/admin/market/rotation-batch',{});expect(all.status).toBe(200);expect(await all.json()).toMatchObject({success:true,totalUpserted:42,totalErrors:0});
});
