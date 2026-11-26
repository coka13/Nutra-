import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
export const runtime = 'nodejs';

/** Published FAQs and educational articles, in the requested language. */
export async function GET(req: NextRequest) {
  const type = req.nextUrl.searchParams.get('type') === 'ARTICLE' ? 'ARTICLE' : 'FAQ';
  const he = req.nextUrl.searchParams.get('lang') === 'he';
  const items = await db.contentItem.findMany({
    where: { type, status: 'PUBLISHED' },
    orderBy: [{ position: 'asc' }, { updatedAt: 'desc' }],
    take: 200,
  });
  return NextResponse.json(
    {
      items: items.map((i) => ({
        id: i.id,
        slug: i.slug,
        category: i.category,
        title: he ? i.titleHe : i.titleEn,
        body: he ? i.bodyHe : i.bodyEn,
        updatedAt: i.updatedAt,
      })),
    },
    { headers: { 'Cache-Control': 'public, max-age=60' } },
  );
}
