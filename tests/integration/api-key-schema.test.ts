import { beforeAll, afterAll, expect, it } from 'vitest'
import { provisionTestDatabase } from '../support/database'
let database: Awaited<ReturnType<typeof provisionTestDatabase>>
beforeAll(async () => { database = await provisionTestDatabase('api_key_schema') })
afterAll(async () => { await database?.dispose() })
it('enforces digest-only credential shape, uniqueness, scope and owner cascade', async () => {
 const { rows: [user] } = await database.pool.query("insert into users(email,password) values ('key-owner@example.test','synthetic') returning id")
 const insert = (hash: string, label = 'Research agent', prefix = 'dva_12345678', scope = 'DIARY_CREATE') => database.pool.query('insert into api_key_credentials(user_id,label,key_hash,key_prefix,scope) values ($1,$2,$3,$4,$5) returning *', [user.id,label,hash,prefix,scope])
 await expect(insert('dva_' + 'a'.repeat(48))).rejects.toMatchObject({ code: '23514' })
 await expect(insert('a'.repeat(64),' ')).rejects.toMatchObject({ code: '23514' })
 await expect(insert('a'.repeat(64),'Agent','raw-secret')).rejects.toMatchObject({ code: '23514' })
 await expect(insert('a'.repeat(64),'Agent','dva_12345678','ADMIN')).rejects.toMatchObject({ code: '22P02' })
 const attempts = await Promise.allSettled([insert('a'.repeat(64)),insert('a'.repeat(64))])
 expect(attempts.filter(result => result.status === 'fulfilled')).toHaveLength(1)
 expect(attempts.find(result => result.status === 'rejected')).toMatchObject({ reason: { code: '23505' } })
 const { rows: [key] } = await database.pool.query('select * from api_key_credentials where user_id=$1', [user.id])
 expect(key).toMatchObject({ scope: 'DIARY_CREATE', last_used_at: null, revoked_at: null })
 expect(key).not.toHaveProperty('raw_key')
 await database.pool.query("update api_key_credentials set revoked_at='2026-09-05T00:00:00.123Z' where id=$1", [key.id])
 expect((await database.pool.query('select revoked_at from api_key_credentials where id=$1', [key.id])).rows[0].revoked_at.toISOString()).toBe('2026-09-05T00:00:00.123Z')
 await insert('b'.repeat(64),'Research','dva_87654321','AGENT_WRITE')
 await database.pool.query('delete from users where id=$1', [user.id])
 expect((await database.pool.query('select count(*)::int as count from api_key_credentials')).rows[0].count).toBe(0)
})
