import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { provisionTestDatabase } from '../support/database'

let database: Awaited<ReturnType<typeof provisionTestDatabase>>

beforeAll(async () => { database = await provisionTestDatabase('mail_schema') })
afterAll(async () => { await database?.dispose() })

describe('SMTP and account email schema', () => {
  it('seeds one disabled singleton without changing existing users', async () => {
    const settings = await database.pool.query('select singleton, enabled, revision from smtp_settings')
    expect(settings.rows).toEqual([{ singleton: 'default', enabled: false, revision: 1 }])

    const userColumns = await database.pool.query<{ column_name: string }>(`
      select column_name
      from information_schema.columns
      where table_schema = 'public' and table_name = 'users'
        and column_name like '%verif%'
    `)
    expect(userColumns.rows).toEqual([])
  })

  it('allows one active token per purpose and normalized email', async () => {
    const { rows: [user] } = await database.pool.query(
      "insert into users(email,password) values ('mail-schema@example.test','synthetic') returning id",
    )
    const expiry = '2099-01-01T00:00:00.000Z'
    const digestA = 'a'.repeat(64)
    const digestB = 'b'.repeat(64)
    await database.pool.query(
      `insert into account_email_token(purpose,normalized_email,token_digest,expires_at)
       values ('registration','mail-schema@example.test',$1,$2)`,
      [digestA, expiry],
    )
    await expect(database.pool.query(
      `insert into account_email_token(purpose,normalized_email,token_digest,expires_at)
       values ('registration','mail-schema@example.test',$1,$2)`,
      [digestB, expiry],
    )).rejects.toMatchObject({ code: '23505' })

    await database.pool.query(
      'update account_email_token set consumed_at = $1 where token_digest = $2',
      ['2026-09-26T00:00:00.000Z', digestA],
    )
    await database.pool.query(
      `insert into account_email_token(purpose,normalized_email,token_digest,expires_at)
       values ('registration','mail-schema@example.test',$1,$2)`,
      [digestB, expiry],
    )

    await expect(database.pool.query(
      `insert into account_email_token(purpose,normalized_email,token_digest,expires_at)
       values ('registration','MAIL-SCHEMA@EXAMPLE.TEST',$1,$2)`,
      ['c'.repeat(64), expiry],
    )).rejects.toMatchObject({ code: '23514' })

    await database.pool.query(
      `insert into account_email_token(purpose,normalized_email,user_id,token_digest,expires_at)
       values ('password_reset','mail-schema@example.test',$1,$2,$3)`,
      [user.id, 'd'.repeat(64), expiry],
    )
    await database.pool.query('delete from users where id = $1', [user.id])
  })

  it('supports leased outbox work and clears encrypted payload at terminal state', async () => {
    const token = await database.pool.query<{ id: string }>(
      `insert into account_email_token(purpose,normalized_email,token_digest,expires_at)
       values ('registration','outbox-schema@example.test',$1,$2) returning id`,
      ['e'.repeat(64), '2099-01-01T00:00:00.000Z'],
    )
    const created = await database.pool.query<{ id: string }>(
      `insert into mail_outbox(kind,recipient_email,locale,encrypted_payload,token_id,expires_at)
       values ('registration_verification','outbox-schema@example.test','en','encrypted-synthetic-link',$1,$2)
       returning id`,
      [token.rows[0]!.id, '2099-01-01T00:00:00.000Z'],
    )
    const id = created.rows[0]!.id

    await database.pool.query(
      `update mail_outbox
       set status = 'running', lease_token = 'lease-synthetic', worker_id = 'worker-synthetic',
           lease_expires_at = '2026-09-26T00:10:00.000Z', started_at = '2026-09-26T00:00:00.000Z'
       where id = $1`,
      [id],
    )
    const running = await database.pool.query('select status, encrypted_payload from mail_outbox where id = $1', [id])
    expect(running.rows[0]).toEqual({ status: 'running', encrypted_payload: 'encrypted-synthetic-link' })

    await database.pool.query(
      `update mail_outbox
       set status = 'sent', encrypted_payload = null, config_revision_used = 1,
           lease_token = null, worker_id = null, lease_expires_at = null,
           started_at = '2026-09-26T00:00:00.000Z', sent_at = '2026-09-26T00:01:00.000Z',
           finished_at = '2026-09-26T00:01:00.000Z'
       where id = $1`,
      [id],
    )
    const sent = await database.pool.query('select status, encrypted_payload from mail_outbox where id = $1', [id])
    expect(sent.rows[0]).toEqual({ status: 'sent', encrypted_payload: null })
    await expect(database.pool.query(
      `insert into mail_outbox(kind,recipient_email,locale,expires_at)
       values ('admin_test','admin@example.test','en','2099-01-01T00:00:00.000Z')`,
    )).rejects.toMatchObject({ code: '23514' })
  })
})
