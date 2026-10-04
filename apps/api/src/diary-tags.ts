import { RECENT_DIARY_TAG_LIMIT, recentDiaryTagsResponseSchema } from '@diary/contracts/diary-tags'
import { type Database } from '@diary/db'
import { sql } from 'drizzle-orm'

/**
 * Tag suggestions derived from the account's own diaries, newest use first.
 * Nothing is stored for this: `diaries.tags` already holds every value, scoped
 * to its owner, so the same suggestions follow the account to any device.
 */
export async function recentDiaryTags(db: Database, userId: bigint) {
  const result = await db.execute(sql`
    select tag from (
      select t.tag as tag, max(d.date) as last_used, max(d.id) as last_id
      from diaries d, unnest(d.tags) as t(tag)
      where d.user_id = ${userId} and length(btrim(t.tag)) > 0
      group by t.tag
    ) ranked
    order by last_used desc, last_id desc, tag asc
    limit ${RECENT_DIARY_TAG_LIMIT}
  `)
  return recentDiaryTagsResponseSchema.parse({ tags: (result.rows as Array<{ tag: string }>).map(row => row.tag) })
}
