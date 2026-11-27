/**
 * One-time migration: encrypts progress photos stored before at-rest encryption existed.
 * Safe to run repeatedly; rows that are already encrypted are skipped.
 * Requires the same ADMIN_ENCRYPTION_KEY the app runs with (back it up: without it the
 * photos cannot be read).
 *   npm run photos:encrypt
 */
import { PrismaClient } from '@prisma/client';
import { isSealedBytes, openBytes, sealBytes } from '../src/lib/admin/crypto';
try {
  process.loadEnvFile();
} catch {
  /* Variables may be injected by an operator. */
}
// Without an explicit key, crypto falls back to a development key. Encrypting a real
// database with it would make the photos unreadable by the app, so refuse.
if (!process.env.ADMIN_ENCRYPTION_KEY?.trim() && process.env.DATABASE_URL !== 'file:./dev.db') {
  console.error('ADMIN_ENCRYPTION_KEY is not set; refusing to encrypt a non-development database.');
  process.exit(1);
}
const db = new PrismaClient();
async function main() {
  let encrypted = 0,
    skipped = 0,
    cursor: string | undefined;
  try {
    for (;;) {
      const batch = await db.progressPhoto.findMany({
        take: 50,
        orderBy: { id: 'asc' },
        ...(cursor && { cursor: { id: cursor }, skip: 1 }),
        select: { id: true, image: true },
      });
      if (!batch.length) break;
      cursor = batch[batch.length - 1].id;
      for (const photo of batch) {
        if (isSealedBytes(photo.image)) {
          skipped++;
          continue;
        }
        const sealed = sealBytes(photo.image);
        // Verify the round trip before replacing the original.
        if (!openBytes(sealed).equals(Buffer.from(photo.image)))
          throw new Error(`verify failed: ${photo.id}`);
        await db.progressPhoto.update({ where: { id: photo.id }, data: { image: sealed } });
        encrypted++;
      }
    }
    console.log(JSON.stringify({ encrypted, alreadyEncrypted: skipped }));
  } finally {
    await db.$disconnect();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
