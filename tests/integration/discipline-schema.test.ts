import { beforeAll, afterAll, expect, it } from 'vitest'
import { provisionTestDatabase } from '../support/database'
let database: Awaited<ReturnType<typeof provisionTestDatabase>>
beforeAll(async () => { database = await provisionTestDatabase('discipline_schema') })
afterAll(async () => { await database?.dispose() })
it('migrates discipline content, signed order and owner cascade', async () => {
  const { rows: [user] } = await database.pool.query("insert into users(email,password) values ('discipline-schema@example.test','synthetic') returning id")
  const { rows: [row] } = await database.pool.query('insert into disciplines(user_id,content,display_order) values ($1,$2,-1) returning *', [user.id, '原'.repeat(255)])
  expect(row.display_order).toBe(-1); expect(row.content).toHaveLength(255)
  expect(row.created_at).toBeInstanceOf(Date)
  await expect(database.pool.query("insert into disciplines(user_id,content) values ($1,'   ')", [user.id])).rejects.toMatchObject({ code: '23514' })
  await expect(database.pool.query('insert into disciplines(user_id,content) values ($1,$2)', [user.id, 'x'.repeat(256)])).rejects.toMatchObject({ code: '22001' })
  await database.pool.query('delete from users where id=$1', [user.id])
  expect((await database.pool.query('select count(*)::int as count from disciplines where user_id=$1', [user.id])).rows[0].count).toBe(0)
})
