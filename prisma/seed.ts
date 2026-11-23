import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../src/lib/security';
const db = new PrismaClient();
try {
  process.loadEnvFile();
} catch {
  /* Container environments supply variables directly. */
}
async function main() {
  const exerciseRows = [
    [
      'squat',
      'Bodyweight squat',
      'סקוואט משקל גוף',
      'legs',
      'bodyweight',
      'beginner',
      'Stand with feet comfortably apart. Sit back and down within a comfortable range, then stand. Keep your knees tracking with your toes.',
      'עמדו בפישוק נוח. רדו לטווח תנועה נוח ועלו לעמידה. שמרו על הברכיים בכיוון האצבעות.',
    ],
    [
      'pushup',
      'Incline push-up',
      'שכיבות סמיכה בשיפוע',
      'chest',
      'bodyweight',
      'beginner',
      'Place hands on a sturdy raised surface. Keep a straight body, lower your chest with control and press away.',
      'הניחו ידיים על משטח מוגבה ויציב. שמרו על גוף ישר, הורידו חזה בשליטה ודחפו חזרה.',
    ],
    [
      'row',
      'Dumbbell row',
      'חתירה עם משקולת',
      'back',
      'dumbbells',
      'beginner',
      'Support one hand on a stable bench. With a neutral back, draw the dumbbell toward your hip. Lower slowly.',
      'הישענו ביד אחת על ספסל יציב. בגב ניטרלי משכו את המשקולת לכיוון האגן והורידו לאט.',
    ],
    [
      'rdl',
      'Romanian deadlift',
      'דדליפט רומני',
      'legs',
      'dumbbells',
      'intermediate',
      'Hold weights near your thighs. Hinge at the hips with soft knees. Stop at a comfortable hamstring stretch and stand.',
      'החזיקו משקולות ליד הירכיים. כופפו מעט ברכיים והניעו אגן לאחור. חזרו לעמידה בטווח נוח.',
    ],
    [
      'press',
      'Shoulder press',
      'לחיצת כתפיים',
      'shoulders',
      'dumbbells',
      'intermediate',
      'Start with light weights at shoulder height. Press overhead only through a comfortable range. Lower with control.',
      'התחילו במשקל קל בגובה הכתפיים. לחצו מעלה בטווח נוח והורידו בשליטה.',
    ],
    [
      'bridge',
      'Glute bridge',
      'גשר ישבן',
      'legs',
      'bodyweight',
      'beginner',
      'Lie on your back with knees bent. Press through your feet and lift your hips. Pause, then lower gently.',
      'שכבו על הגב עם ברכיים כפופות. דחפו דרך כפות הרגליים והרימו אגן. השהו והורידו בעדינות.',
    ],
    [
      'deadbug',
      'Dead bug',
      'דד באג',
      'core',
      'bodyweight',
      'beginner',
      'Lie on your back, arms up and knees bent. Slowly extend opposite arm and leg, keeping your back comfortable. Alternate.',
      'שכבו על הגב, ידיים מעלה וברכיים כפופות. ישרו לאט יד ורגל נגדית בטווח נוח והחליפו צד.',
    ],
    [
      'lunge',
      'Reverse lunge',
      'מכרע לאחור',
      'legs',
      'bodyweight',
      'intermediate',
      'Step back and bend both knees within a comfortable range. Push through the front foot to return. Use support if needed.',
      'צעדו לאחור וכופפו ברכיים בטווח נוח. דחפו דרך הרגל הקדמית לחזרה. היעזרו בתמיכה במידת הצורך.',
    ],
    [
      'pulldown',
      'Lat pulldown',
      'משיכת פולי עליון',
      'back',
      'gym',
      'beginner',
      'Sit upright and pull the bar toward your upper chest. Avoid swinging. Return slowly.',
      'שבו זקוף ומשכו את המוט לכיוון החזה העליון ללא תנופה. החזירו לאט.',
    ],
    [
      'chestpress',
      'Chest press',
      'לחיצת חזה',
      'chest',
      'gym',
      'beginner',
      'Adjust the seat so handles align with your chest. Press forward without locking elbows and return with control.',
      'כוונו מושב כך שהידיות בגובה החזה. דחפו לפנים בלי לנעול מרפקים וחזרו בשליטה.',
    ],
    [
      'calf',
      'Standing calf raise',
      'הרמת עקבים בעמידה',
      'legs',
      'bodyweight',
      'beginner',
      'Hold a stable support. Rise onto the balls of your feet and lower slowly.',
      'אחזו בתמיכה יציבה. עלו על כריות כפות הרגליים והורידו לאט.',
    ],
    [
      'walk',
      'Comfortable walk',
      'הליכה נוחה',
      'cardio',
      'bodyweight',
      'beginner',
      'Walk at a pace that allows conversation. Choose an accessible route and pause when needed.',
      'לכו בקצב שמאפשר שיחה. בחרו מסלול נגיש ועצרו למנוחה לפי הצורך.',
    ],
  ];
  for (const [
    id,
    nameEn,
    nameHe,
    muscle,
    equipment,
    difficulty,
    instructionsEn,
    instructionsHe,
  ] of exerciseRows)
    await db.exercise.upsert({
      where: { id },
      update: {},
      create: { id, nameEn, nameHe, muscle, equipment, difficulty, instructionsEn, instructionsHe },
    });
  const foods = [
    ['oats', 'Rolled oats', 'שיבולת שועל', 389, 17, 66, 7, 10],
    ['yogurt', 'Plain Greek yogurt', 'יוגורט יווני טבעי', 73, 10, 4, 2, 0],
    ['banana', 'Banana', 'בננה', 89, 1.1, 23, 0.3, 2.6],
    ['chicken', 'Grilled chicken breast', 'חזה עוף בגריל', 165, 31, 0, 3.6, 0],
    ['rice', 'Cooked brown rice', 'אורז מלא מבושל', 123, 2.7, 26, 1, 1.6],
    ['salad', 'Tomato and cucumber salad', 'סלט עגבנייה ומלפפון', 20, 1, 4, 0.2, 1.2],
    ['tahini', 'Raw tahini', 'טחינה גולמית', 595, 17, 21, 54, 9],
    ['hummus', 'Prepared hummus', 'חומוס מוכן', 166, 8, 14, 10, 6],
    ['pita', 'Whole wheat pita', 'פיתה מחיטה מלאה', 262, 10, 55, 1.7, 6],
    ['egg', 'Boiled egg', 'ביצה קשה', 155, 13, 1.1, 11, 0],
    ['tofu', 'Firm tofu', 'טופו קשה', 144, 17, 3, 9, 2],
    ['apple', 'Apple', 'תפוח', 52, 0.3, 14, 0.2, 2.4],
    ['salmon', 'Baked salmon', 'סלמון אפוי', 208, 20, 0, 13, 0],
    ['lentils', 'Cooked lentils', 'עדשים מבושלות', 116, 9, 20, 0.4, 8],
    ['avocado', 'Avocado', 'אבוקדו', 160, 2, 9, 15, 7],
    ['cottage', 'Cottage cheese 5%', 'גבינת קוטג׳ 5%', 98, 11, 3, 5, 0],
  ] as const;
  for (const [id, nameEn, nameHe, calories, protein, carbs, fat, fiber] of foods)
    await db.food.upsert({
      where: { id },
      update: {},
      create: { id, nameEn, nameHe, calories, protein, carbs, fat, fiber },
    });
  await db.featureFlag.upsert({
    where: { key: 'marketplace' },
    create: { key: 'marketplace', enabled: false },
    update: {},
  });
  // Demo data is explicit and development-only. Never run this branch against production.
  if (process.env.DEMO_ENABLED === 'true' && process.env.NODE_ENV !== 'production') {
    const alex = await db.user.upsert({
      where: { email: 'alex@nutri.local' },
      update: {},
      create: {
        email: 'alex@nutri.local',
        name: 'Alex Morgan',
        passwordHash: hashPassword('NutriDemo2026!'),
        profile: {
          create: {
            adult: true,
            onboarded: true,
            goal: 'strength',
            experience: 'intermediate',
            equipment: 'dumbbells',
          },
        },
        subscription: { create: {} },
      },
    });
    const coach = await db.user.upsert({
      where: { email: 'coach@nutri.local' },
      update: {},
      create: {
        email: 'coach@nutri.local',
        name: 'Noa Cohen',
        role: 'COACH',
        passwordHash: hashPassword('NutriCoach2026!'),
        profile: { create: { adult: true, onboarded: true } },
        subscription: { create: {} },
        branding: {
          create: {
            businessName: 'Noa · Move well',
            welcome: 'Welcome. Let’s build a routine that fits your life.',
          },
        },
      },
    });
    await db.coachRelationship.upsert({
      where: { coachId_clientId: { coachId: coach.id, clientId: alex.id } },
      create: {
        coachId: coach.id,
        clientId: alex.id,
        status: 'ACTIVE',
        tags: 'strength, consistency',
      },
      update: {},
    });
    if (!(await db.program.count({ where: { ownerId: alex.id } }))) {
      await db.program.create({
        data: {
          ownerId: alex.id,
          name: 'Full body · Foundation',
          description: 'A little stronger, one session at a time.',
          weeks: 4,
          days: '1,3,5',
          exercises: {
            create: [
              { exerciseId: 'squat', position: 0, sets: 3, reps: 12, rest: 60 },
              { exerciseId: 'row', position: 1, sets: 3, reps: 10, rest: 60, weight: 12 },
              { exerciseId: 'rdl', position: 2, sets: 3, reps: 10, rest: 90, weight: 16 },
              { exerciseId: 'pushup', position: 3, sets: 3, reps: 8, rest: 60 },
              { exerciseId: 'deadbug', position: 4, sets: 3, reps: 10, rest: 45 },
            ],
          },
        },
      });
      await db.program.create({
        data: {
          ownerId: alex.id,
          name: 'Move & recharge',
          description: 'Gentle movement for your recovery days.',
          weeks: 4,
          days: '2,6',
          exercises: {
            create: [
              { exerciseId: 'bridge', position: 0, sets: 2, reps: 12, rest: 45 },
              { exerciseId: 'deadbug', position: 1, sets: 2, reps: 8, rest: 45 },
              { exerciseId: 'calf', position: 2, sets: 2, reps: 12, rest: 45 },
            ],
          },
        },
      });
    }
    if (!(await db.workoutSession.count({ where: { userId: alex.id } }))) {
      for (let i = 24; i >= 1; i--) {
        if (i % 7 === 0 || i % 7 === 3 || i % 7 === 5) {
          const startedAt = new Date(Date.now() - i * 86400000);
          const finishedAt = new Date(startedAt.getTime() + 38 * 60000);
          await db.workoutSession.create({
            data: {
              userId: alex.id,
              name: 'Full body · Foundation',
              status: 'FINISHED',
              startedAt,
              finishedAt,
              elapsedSeconds: 38 * 60,
              lastResumedAt: startedAt,
              sets: {
                create: [
                  {
                    exerciseId: 'row',
                    setIndex: 0,
                    reps: 10,
                    weight: 10 + Math.floor((24 - i) / 8),
                    completed: true,
                  },
                  { exerciseId: 'squat', setIndex: 0, reps: 12, weight: 0, completed: true },
                ],
              },
            },
          });
        }
      }
    }
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(
      new Date(),
    );
    if (!(await db.mealEntry.count({ where: { userId: alex.id, date: today } }))) {
      await db.mealEntry.createMany({
        data: [
          { userId: alex.id, foodId: 'oats', grams: 60, meal: 'breakfast', date: today },
          { userId: alex.id, foodId: 'yogurt', grams: 200, meal: 'breakfast', date: today },
          { userId: alex.id, foodId: 'banana', grams: 120, meal: 'breakfast', date: today },
          { userId: alex.id, foodId: 'chicken', grams: 150, meal: 'lunch', date: today },
          { userId: alex.id, foodId: 'rice', grams: 180, meal: 'lunch', date: today },
          { userId: alex.id, foodId: 'salad', grams: 200, meal: 'lunch', date: today },
        ],
      });
      await db.waterEntry.create({ data: { userId: alex.id, ml: 750, date: today } });
    }
    if (!(await db.progressRecord.count({ where: { userId: alex.id } })))
      for (let i = 20; i >= 0; i -= 2)
        await db.progressRecord.create({
          data: {
            userId: alex.id,
            kind: 'energy',
            value: 5 + Math.floor((20 - i) / 6),
            unit: 'score',
            date: new Date(Date.now() - i * 86400000).toISOString().slice(0, 10),
          },
        });
    if (!(await db.message.count({ where: { recipientId: alex.id } })))
      await db.message.create({
        data: {
          senderId: coach.id,
          recipientId: alex.id,
          body: 'Great to see you making time for yourself. How did your last session feel?',
        },
      });
  }
}
main().finally(() => db.$disconnect());
