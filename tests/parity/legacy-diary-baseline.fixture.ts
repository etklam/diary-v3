// Executed only inside the isolated legacy snapshot by scripts/parity/run-old-baseline.sh.
// @vitest-environment node
import { PrismaMariaDb } from '@prisma/adapter-mariadb'
import { PrismaClient } from '@prisma/client'
import { fetch, setup } from '@nuxt/test-utils/e2e'
import bcrypt from 'bcryptjs'
import { resolve } from 'node:path'
import { writeFileSync } from 'node:fs'
import { expect, it } from 'vitest'
const databaseUrl = process.env.BACKEND_HTTP_TEST_DATABASE_URL!
if (!/^mysql:\/\/root:test-password@127\.0\.0\.1:\d+\/backend_http_test$/.test(databaseUrl)) throw new Error('Disposable DB required')
await setup({ rootDir: process.cwd(), browser: false, server: true, build: true, setupTimeout: 240_000, env: { NODE_ENV: 'test', DATABASE_URL: databaseUrl, JWT_SECRET: 'baseline-only-isolated-jwt-secret-not-production', NUXT_PUBLIC_SITE_URL: 'http://127.0.0.1', NODE_PATH: resolve(process.cwd(), 'node_modules') } })
it('real legacy login → create → read → delete → missing; synthetic no-transaction Diary', async () => {
 const prisma=new PrismaClient({adapter:new PrismaMariaDb(databaseUrl)})
 const timings: Record<string,number>={}
 async function request(label:string,url:string,options:RequestInit={}) {const start=performance.now();const response=await fetch(url,options); const body=await response.json();timings[label]=Math.round((performance.now()-start)*100)/100;return {response,body}}
 try {
  await prisma.user.create({data:{email:'baseline@example.invalid',name:'Synthetic parity fixture',password:await bcrypt.hash('Synthetic-baseline-123!',4)}})
  const login=await request('login','/api/auth/native/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:'baseline@example.invalid',password:'Synthetic-baseline-123!',deviceName:'Parity test'})})
  expect(login.response.status).toBe(200)
  const headers={'content-type':'application/json',authorization:`Bearer ${login.body.data.accessToken}`}
  const created=await request('create','/api/diaries',{method:'POST',headers,body:JSON.stringify({title:'Synthetic diary',content:'## Baseline\nNo transaction. 測試內容',date:'2026-08-10',tags:['baseline']})})
  expect(created.response.status).toBe(201)
  const id=created.body.id
  const read=await request('read',`/api/diaries/${id}`,{headers})
  expect(read.response.status).toBe(200);expect(read.body.title).toBe('Synthetic diary');expect(read.body.date).toBe('2026-08-10')
  const deleted=await request('delete',`/api/diaries/${id}`,{method:'DELETE',headers})
  expect(deleted.response.status).toBe(200)
  const missing=await request('readDeleted',`/api/diaries/${id}`,{headers});expect(missing.response.status).toBe(404)
  const knownDeltas=[]
  for (const length of [255,256,500]) {
   const result=await request(`title${length}`,'/api/diaries',{method:'POST',headers,body:JSON.stringify({title:'x'.repeat(length),content:'Synthetic title bound probe',date:`2026-08-${length===255?'11':length===256?'12':'13'}`})})
   knownDeltas.push({probe:'Diary title length',length,status:result.response.status,errorCode:result.body?.data?.code??result.body?.data?.data?.code??null})
  }
  const owner=await prisma.user.findUniqueOrThrow({where:{email:'baseline@example.invalid'}})
  await prisma.post.createMany({data:[{title:'Investment the AI 投資策略',slug:'baseline-search',excerpt:'Longterm investment evidence',content:'bodyonly',authorId:owner.id,category:'market',status:'PUBLISHED',publishedAt:new Date()},{title:'Hidden Investment',slug:'baseline-draft',excerpt:'investment',content:'bodyonly',authorId:owner.id,category:'market',status:'DRAFT'}]})
  const search=[]
  for(const term of ['investment','vest','the','AI','投資','投資策略','investment 投資','bodyonly']) {
   const result=await request(`search${term}`,`/api/blog?search=${encodeURIComponent(term)}`)
   search.push({term,status:result.response.status,total:result.body?.pagination?.total??null,errorCode:result.body?.data?.code??null})
  }
  writeFileSync(process.env.BASELINE_EVIDENCE_PATH!,JSON.stringify({environment:'isolated frozen Nuxt/Nitro + disposable MariaDB 11.4',synthetic:true,knownDeltas,search,flow:['login:200','create:201','read:200','delete:200','readDeleted:404'],timingsMs:timings,note:'Single cold-flow observation; not a percentile or capacity benchmark. Native login used to avoid browser-cookie simulation.'},null,2)+'\n')
 } finally {await prisma.$disconnect()}
})
