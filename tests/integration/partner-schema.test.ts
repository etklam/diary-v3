import { beforeAll, afterAll, expect, it } from 'vitest'
import { provisionTestDatabase } from '../support/database'
let database: Awaited<ReturnType<typeof provisionTestDatabase>>
beforeAll(async () => { database = await provisionTestDatabase('partner_schema') })
afterAll(async () => { await database?.dispose() })
it('enforces canonical pairs, participant initiation, private pending state and cascade', async () => {
 const { rows } = await database.pool.query("insert into users(email,password) values ('partner-a@example.test','synthetic'),('partner-b@example.test','synthetic'),('partner-c@example.test','synthetic') returning id")
 const [a,b,c] = rows.map(row => row.id)
 const insert = (left: string, right: string, initiator: string) => database.pool.query('insert into partner_links(user_a_id,user_b_id,initiated_by_user_id) values ($1,$2,$3) returning *', [left,right,initiator])
 await expect(insert(a,a,a)).rejects.toMatchObject({ code: '23514' })
 await expect(insert(b,a,a)).rejects.toMatchObject({ code: '23514' })
 await expect(insert(a,b,c)).rejects.toMatchObject({ code: '23514' })
 const results = await Promise.allSettled([insert(a,b,a), insert(a,b,b)])
 expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
 expect(results.find(result => result.status === 'rejected')).toMatchObject({ reason: { code: '23505' } })
 const { rows: [link] } = await database.pool.query('select * from partner_links where user_a_id=$1', [a])
 expect(link).toMatchObject({ accepted_at: null, user_a_shares_diaries: false, user_b_shares_diaries: false, user_a_shares_stock_notes: false, user_b_shares_stock_notes: false })
 await expect(database.pool.query('update partner_links set user_a_shares_diaries=true where id=$1', [link.id])).rejects.toMatchObject({ code: '23514' })
 await database.pool.query("update partner_links set accepted_at='2026-01-01T00:00:00.123Z',user_a_shares_diaries=true where id=$1", [link.id])
 expect((await database.pool.query('select accepted_at from partner_links where id=$1', [link.id])).rows[0].accepted_at.toISOString()).toBe('2026-01-01T00:00:00.123Z')
 await database.pool.query('delete from users where id=$1', [b])
 expect((await database.pool.query('select count(*)::int as count from partner_links')).rows[0].count).toBe(0)
})
