import { NextResponse } from 'next/server';
import { ApiError, rateLimit, requireUser } from '@/lib/auth';
import { freeExerciseDemonstration } from '@/lib/free-exercises';
import { db } from '@/lib/db';

export const runtime = 'nodejs';
export async function GET(
  request: Request,
  { params }: { params: Promise<{ exerciseId: string }> },
) {
  const headers = { 'Cache-Control': 'no-store' };
  try {
    const user = await requireUser();
    await rateLimit(`exercise-demo:${user.id}`, 40);
    const { exerciseId } = await params;
    const saved = await db.exercise.findUnique({
      where: { id: exerciseId },
      select: { nameEn: true },
    });
    return NextResponse.json(freeExerciseDemonstration(exerciseId, saved?.nameEn), { headers });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof ApiError ? error.code : 'serverError' },
      { status: error instanceof ApiError ? error.status : 500, headers },
    );
  }
}
