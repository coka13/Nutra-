import { z } from 'zod';
import type { Exercise } from '@prisma/client';
import { loadFreeCatalog } from './free-exercises';

export const catalogQuery = z.object({
  provider: z.literal('free').default('free'),
  name: z.string().trim().max(100).default(''),
  category: z.enum(['', 'cardio', 'strength', 'stretching', 'plyometric', 'yoga']).default(''),
  bodyPart: z.string().max(60).default(''),
  muscle: z.string().max(60).default(''),
  demonstration: z.enum(['all', 'video']).default('all'),
  equipment: z.string().max(60).default(''),
  offset: z.coerce.number().int().min(0).max(10000).default(0),
});
export type CatalogPage = {
  total: number;
  offset: number;
  limit: number;
  results: (Exercise & { thumbnail?: string; animation?: string; hasVideo?: boolean })[];
};

export async function loadCatalog(query: z.infer<typeof catalogQuery>): Promise<CatalogPage> {
  return loadFreeCatalog(query);
}
