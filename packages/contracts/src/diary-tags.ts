import { z } from 'zod'

/** Suggestions are derived from the account's own diaries, so the list is capped
 *  where the authoring surfaces display it rather than where it is stored. */
export const RECENT_DIARY_TAG_LIMIT = 8

export const recentDiaryTagsResponseSchema = z.object({
  tags: z.array(z.string().min(1).max(100)).max(RECENT_DIARY_TAG_LIMIT),
}).strict()
export type RecentDiaryTagsResponse = z.infer<typeof recentDiaryTagsResponseSchema>
