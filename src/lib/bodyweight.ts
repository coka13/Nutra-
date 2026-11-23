import type { Prisma } from '@prisma/client';

// Reuse today's entry, including weights entered in onboarding or the generic check-in form.
export async function saveBodyweight(
  tx: Prisma.TransactionClient,
  userId: string,
  data: { value: number; date: string; note?: string },
) {
  const values = { value: data.value, date: data.date, note: data.note, unit: 'kg' };
  const existing = await tx.progressRecord.findFirst({
    where: { userId, kind: 'weight', date: data.date },
    orderBy: { id: 'desc' },
  });
  return existing
    ? tx.progressRecord.update({ where: { id: existing.id }, data: values })
    : tx.progressRecord.create({ data: { ...values, userId, kind: 'weight' } });
}

export async function prepareProgressPhoto(encoded: string) {
  const { default: sharp } = await import('sharp');
  return sharp(Buffer.from(encoded, 'base64'), { limitInputPixels: 2_000_000 })
    .rotate()
    .resize({ width: 768, height: 768, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 80 })
    .toBuffer();
}

/** Wide cover image for a coach's brand, shown behind the coach card. */
export async function prepareBrandBackground(encoded: string) {
  const { default: sharp } = await import('sharp');
  return sharp(Buffer.from(encoded, 'base64'), { limitInputPixels: 4_000_000 })
    .rotate()
    .resize({ width: 1600, height: 900, fit: 'inside', withoutEnlargement: true })
    .flatten({ background: '#ffffff' })
    .jpeg({ quality: 80 })
    .toBuffer();
}

/** Square-ish logo, flattened onto white so transparent PNGs don't turn black as JPEG. */
export async function prepareBrandLogo(encoded: string) {
  const { default: sharp } = await import('sharp');
  return sharp(Buffer.from(encoded, 'base64'), { limitInputPixels: 2_000_000 })
    .rotate()
    .resize({ width: 400, height: 400, fit: 'inside', withoutEnlargement: true })
    .flatten({ background: '#ffffff' })
    .jpeg({ quality: 85 })
    .toBuffer();
}
