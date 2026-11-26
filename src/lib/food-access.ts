import type { Prisma } from '@prisma/client';

export const privateFoodSources = ['private-retained', 'user-estimate', 'ai-photo-estimate'];

/** Retained diary foods stay readable by their consumers, never by the public catalog. */
export function foodAccess(userId: string): Prisma.FoodWhereInput {
  return {
    OR: [
      { ownerId: userId },
      { ownerId: null, source: { notIn: privateFoodSources } },
      { meals: { some: { userId } } },
      { ingredients: { some: { recipe: { userId } } } },
      {
        planItems: {
          some: {
            plan: {
              OR: [
                { userId },
                {
                  assignedClientId: userId,
                  user: { coachLinks: { some: { clientId: userId, status: 'ACTIVE' } } },
                },
              ],
            },
          },
        },
      },
    ],
  };
}
