import {z} from 'zod';
import {calendarDateSchema,serializedIdSchema} from './common.js';
export const rotationBatchRequestSchema=z.object({scope:z.enum(['sectors','indexes','core','all']).default('all')}).strict();
export const rotationBatchResultSchema=z.object({runId:serializedIdSchema,rankScope:z.enum(['sectors','indexes','core']),status:z.enum(['success','partial']),symbolCount:z.number().int().nonnegative(),upsertedCount:z.number().int().nonnegative(),comparisonDate:calendarDateSchema.nullable(),errors:z.array(z.object({symbol:z.string(),error:z.string()}).strict())}).strict();
export const rotationBatchResponseSchema=z.union([z.object({success:z.literal(true),result:rotationBatchResultSchema}).strict(),z.object({success:z.literal(true),results:z.array(rotationBatchResultSchema),totalUpserted:z.number().int().nonnegative(),totalErrors:z.number().int().nonnegative()}).strict()]);
