import { z } from 'zod'

export const sourceKindSchema = z.enum(['rss', 'youtube', 'royalroad'])
export type SourceKind = z.infer<typeof sourceKindSchema>

export const normalizedItemSchema = z.object({
  externalId: z.string().min(1),
  title: z.string().min(1),
  url: z.string().url(),
  excerpt: z.string().max(400).optional(),
  imageUrl: z.string().url().optional(),
  author: z.string().optional(),
  publishedAt: z.coerce.date(),
  meta: z.record(z.string(), z.unknown()).optional(),
})

export type NormalizedItem = z.infer<typeof normalizedItemSchema>
