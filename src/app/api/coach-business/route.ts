import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { ApiError, requireUser, rateLimit } from '@/lib/auth';
import { acceptsOrigin } from '@/lib/request-origin';
import { activityDate } from '@/lib/activity';
const headers = { 'Cache-Control': 'private, no-store' };
const id = z.string().min(1).max(100);
const notes = z.string().trim().max(1000).default('');
const money = z.number().int().min(1).max(100000000);
const status = z.enum(['PLANNED', 'COMPLETED', 'CANCELLED']);
const input = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('package'),
    relationshipId: id,
    size: z.union([z.literal(4), z.literal(8), z.literal(12)]),
    price: money,
    date: activityDate,
  }),
  z.object({ action: z.literal('training'), packageId: id, date: activityDate, status, notes }),
  z.object({ action: z.literal('status'), packageId: id, trainingId: id, status }),
  z.object({
    action: z.literal('receipt'),
    packageId: id,
    date: activityDate,
    amount: money,
    method: z.enum(['cash', 'transfer', 'card', 'other']),
    notes,
  }),
  z.object({ action: z.literal('removeReceipt'), packageId: id, receiptId: id }),
]);
function failure(error: unknown) {
  return NextResponse.json(
    {
      error:
        error instanceof ApiError
          ? error.code
          : error instanceof z.ZodError || error instanceof SyntaxError
            ? 'invalid'
            : 'serverError',
    },
    {
      status:
        error instanceof ApiError
          ? error.status
          : error instanceof z.ZodError || error instanceof SyntaxError
            ? 400
            : 500,
      headers,
    },
  );
}
async function coach() {
  const user = await requireUser();
  if (user.role !== 'COACH') throw new ApiError('forbidden', 403);
  return user;
}
export async function GET() {
  try {
    const user = await coach();
    const packages = await db.coachPackage.findMany({
      where: { relationship: { coachId: user.id } },
      include: {
        relationship: { select: { status: true, client: { select: { id: true, name: true } } } },
        sessions: { orderBy: { date: 'desc' } },
        receipts: { orderBy: { date: 'desc' } },
      },
      orderBy: { date: 'desc' },
    });
    return NextResponse.json({ packages }, { headers });
  } catch (error) {
    return failure(error);
  }
}
export async function POST(req: NextRequest) {
  try {
    if (!acceptsOrigin(req)) throw new ApiError('forbidden', 403);
    const user = await coach();
    await rateLimit(`business:${user.id}`, 60);
    if (Number(req.headers.get('content-length')) > 10000) throw new ApiError('invalid', 413);
    const data = input.parse(await req.json());
    await db.$transaction(async (tx) => {
      if (data.action === 'package') {
        const link = await tx.coachRelationship.findFirst({
          where: { id: data.relationshipId, coachId: user.id, status: 'ACTIVE' },
        });
        if (!link) throw new ApiError('forbidden', 403);
        const { action: _action, ...fields } = data;
        await tx.coachPackage.create({ data: fields });
        return;
      }
      const pack = await tx.coachPackage.findFirst({
        where: { id: data.packageId, relationship: { coachId: user.id } },
        include: {
          sessions: true,
          receipts: true,
          relationship: { include: { client: { select: { name: true } } } },
        },
      });
      if (!pack) throw new ApiError('forbidden', 403);
      if (data.action === 'receipt') {
        if (
          data.date < pack.date ||
          pack.receipts.reduce((a, r) => a + r.amount, 0) + data.amount > pack.price
        )
          throw new ApiError('invalid', 400);
        await tx.coachReceipt.create({
          data: {
            packageId: pack.id,
            date: data.date,
            amount: data.amount,
            method: data.method,
            notes: data.notes,
          },
        });
      } else if (data.action === 'removeReceipt') {
        const result = await tx.coachReceipt.deleteMany({
          where: { id: data.receiptId, packageId: pack.id },
        });
        if (!result.count) throw new ApiError('notFound', 404);
      } else {
        const existing =
          data.action === 'status' ? pack.sessions.find((s) => s.id === data.trainingId) : null;
        if (data.action === 'status' && !existing) throw new ApiError('notFound', 404);
        const sessionDate = data.action === 'training' ? data.date : existing!.date;
        const today = new Intl.DateTimeFormat('en-CA', {
          timeZone: user.profile?.timezone || 'Asia/Jerusalem',
        }).format(new Date());
        if (sessionDate < pack.date || (data.status === 'COMPLETED' && sessionDate > today))
          throw new ApiError('invalid', 400);
        const used =
          pack.sessions.filter((s) => s.status === 'COMPLETED' && s.id !== existing?.id).length +
          (data.status === 'COMPLETED' ? 1 : 0);
        if (used > pack.size) throw new ApiError('packageExhausted', 409);
        if (data.action === 'training')
          await tx.coachTraining.create({
            data: { packageId: pack.id, date: data.date, status: data.status, notes: data.notes },
          });
        else
          await tx.coachTraining.update({
            where: { id: data.trainingId },
            data: { status: data.status },
          });
        if (pack.size - used === 2 && !pack.lowBalanceNotified) {
          await tx.notification.create({
            data: {
              userId: user.id,
              key: 'twoSessionsLeft',
              detail: `${pack.relationship.client.name} · ${pack.size}`,
            },
          });
          await tx.coachPackage.update({
            where: { id: pack.id },
            data: { lowBalanceNotified: true },
          });
        }
      }
    });
    return NextResponse.json({ ok: true }, { headers });
  } catch (error) {
    return failure(error);
  }
}
