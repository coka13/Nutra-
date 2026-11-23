import { NextResponse } from 'next/server';
import { ApiError, rateLimit, requireUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { freeExerciseDemonstration } from '@/lib/free-exercises';
import { exerciseGif } from '@/lib/exercise-gifs';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ exerciseId: string }> },
) {
  try {
    const user = await requireUser();
    await rateLimit(`exercise-gif:${user.id}`, 40);
    const { exerciseId } = await params;
    const saved = await db.exercise.findUnique({
      where: { id: exerciseId },
      select: { nameEn: true },
    });
    const media = freeExerciseDemonstration(exerciseId, saved?.nameEn).media;
    if (!media) throw new ApiError('notFound', 404);
    const gif = await exerciseGif(media.mp4);
    return new Response(new Uint8Array(gif), {
      headers: { 'Content-Type': 'image/gif', 'Cache-Control': 'private, max-age=86400' },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof ApiError ? error.code : 'serverError' },
      {
        status: error instanceof ApiError ? error.status : 500,
        headers: { 'Cache-Control': 'no-store' },
      },
    );
  }
}
