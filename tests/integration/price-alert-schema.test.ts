import { beforeAll, afterAll, expect, it } from 'vitest'
import { provisionTestDatabase } from '../support/database'
let database: Awaited<ReturnType<typeof provisionTestDatabase>>
beforeAll(async () => { database = await provisionTestDatabase('price_alert_schema') })
afterAll(async () => { await database?.dispose() })
it('migrates exact thresholds, coherent trigger state and owner cascade', async () => {
  const user = await database.pool.query("insert into users(email,password) values ('price-schema@example.test','synthetic-not-login') returning id")
  const id = user.rows[0].id
  const created = await database.pool.query("insert into price_alerts(user_id,symbol,type,threshold,message) values ($1,'AAPL','PRICE_ABOVE','999999.9999','Synthetic') returning id,threshold,is_triggered,triggered_at,moving_average_direction", [id])
  expect(created.rows[0]).toMatchObject({ threshold: '999999.9999', is_triggered: false, triggered_at: null, moving_average_direction: null })
  const average = await database.pool.query("insert into price_alerts(user_id,symbol,type,threshold,moving_average_direction,message) values ($1,'AAPL','MOVING_AVG','20','above','Synthetic average') returning moving_average_direction", [id])
  expect(average.rows[0].moving_average_direction).toBe('above')
  await expect(database.pool.query("insert into price_alerts(user_id,symbol,type,threshold,message) values ($1,'AAPL','MOVING_AVG','20','Missing direction')", [id])).rejects.toMatchObject({ code: '23514' })
  await expect(database.pool.query("insert into price_alerts(user_id,symbol,type,threshold,moving_average_direction,message) values ($1,'AAPL','PRICE_ABOVE','20','above','Invalid direction')", [id])).rejects.toMatchObject({ code: '23514' })
  await expect(database.pool.query("insert into price_alerts(user_id,symbol,type,threshold,moving_average_direction,message) values ($1,'AAPL','MOVING_AVG','21','above','Invalid period')", [id])).rejects.toMatchObject({ code: '23514' })
  await expect(database.pool.query("insert into price_alerts(user_id,symbol,type,threshold,message) values ($1,'AAPL','PRICE_BELOW',-1,'Invalid')", [id])).rejects.toMatchObject({ code: '23514' })
  await expect(database.pool.query("update price_alerts set is_triggered=true where id=$1", [created.rows[0].id])).rejects.toMatchObject({ code: '23514' })
  await database.pool.query("update price_alerts set is_triggered=true,triggered_at='2026-01-01T00:00:00.123Z' where id=$1", [created.rows[0].id])
  expect((await database.pool.query('select triggered_at from price_alerts where id=$1', [created.rows[0].id])).rows[0].triggered_at.toISOString()).toBe('2026-01-01T00:00:00.123Z')
  await database.pool.query('delete from users where id=$1', [id])
  expect((await database.pool.query('select count(*)::int as count from price_alerts where user_id=$1', [id])).rows[0].count).toBe(0)
})
