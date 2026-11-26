import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { ApiError, rateLimit, requireUser } from '@/lib/auth';
import { acceptsOrigin } from '@/lib/request-origin';
export const runtime = 'nodejs';
const headers = { 'Cache-Control': 'private, no-store' };

function failure(error: unknown) {
  const status = error instanceof ApiError ? error.status : error instanceof z.ZodError || error instanceof SyntaxError ? 400 : 500;
  const code = error instanceof ApiError ? error.code : status === 400 ? 'invalid' : 'serverError';
  return NextResponse.json({ error: code }, { status, headers });
}

/** The signed-in user's own tickets; internal administrator notes are never included. */
export async function GET() {
  try {
    const user = await requireUser();
    const tickets = await db.supportTicket.findMany({
      where: { userId: user.id },
      orderBy: { updatedAt: 'desc' },
      take: 50,
      select: {
        id: true,
        category: true,
        subject: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        messages: { where: { internal: false }, orderBy: { createdAt: 'asc' }, select: { id: true, authorType: true, body: true, createdAt: true } },
      },
    });
    return NextResponse.json({ tickets }, { headers });
  } catch (error) {
    return failure(error);
  }
}

const input = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('create'),
    category: z.enum(['SUPPORT', 'BUG', 'FEATURE', 'COMPLAINT', 'REPORT']),
    subject: z.string().trim().min(3).max(160),
    body: z.string().trim().min(5).max(5000),
    reportedUserId: z.string().max(100).nullable().optional(),
  }),
  z.object({ action: z.literal('reply'), ticketId: z.string().max(100), body: z.string().trim().min(1).max(5000) }),
]);

export async function POST(req: NextRequest) {
  try {
    if (!acceptsOrigin(req)) throw new ApiError('forbidden', 403);
    if (Number(req.headers.get('content-length') || 0) > 20000) throw new ApiError('invalid', 413);
    const user = await requireUser();
    await rateLimit(`support:${user.id}`, 6);
    const data = input.parse(await req.json());
    if (data.action === 'create') {
      if (data.reportedUserId) {
        // Reports are only accepted about accounts the reporter actually interacts with.
        const linked = await db.coachRelationship.findFirst({
          where: { OR: [{ coachId: user.id, clientId: data.reportedUserId }, { clientId: user.id, coachId: data.reportedUserId }] },
        });
        if (!linked) throw new ApiError('forbidden', 403);
      }
      const ticket = await db.supportTicket.create({
        data: {
          userId: user.id,
          email: user.email,
          category: data.category,
          subject: data.subject,
          reportedUserId: data.reportedUserId ?? null,
          priority: data.category === 'REPORT' || data.category === 'COMPLAINT' ? 'HIGH' : 'NORMAL',
          messages: { create: { authorType: 'USER', body: data.body } },
        },
        select: { id: true },
      });
      return NextResponse.json({ ticket }, { headers });
    }
    const ticket = await db.supportTicket.findFirst({ where: { id: data.ticketId, userId: user.id } });
    if (!ticket) throw new ApiError('notFound', 404);
    await db.$transaction([
      db.ticketMessage.create({ data: { ticketId: ticket.id, authorType: 'USER', body: data.body } }),
      db.supportTicket.update({
        where: { id: ticket.id },
        data: { updatedAt: new Date(), ...(['WAITING', 'RESOLVED'].includes(ticket.status) && { status: 'OPEN' }) },
      }),
    ]);
    return NextResponse.json({ ok: true }, { headers });
  } catch (error) {
    return failure(error);
  }
}
