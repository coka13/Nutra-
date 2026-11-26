import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { db } from '@/lib/db';
import { ApiError } from '@/lib/auth';
import { catalogExercises, freeExerciseDemonstration } from '@/lib/free-exercises';
import { invalidateContentCaches, overlayExercise } from '@/lib/content-overrides';
import { foodNameKey } from '@/lib/food-dedupe';
import { messages } from '@/lib/i18n';
import { AUDIENCES, audienceWhere, deliverAnnouncement, parseUserIds, type Audience } from '@/lib/announcements';
import { pagination, text, type Endpoint } from './types';

async function revision(entityType: string, entityId: string, version: number, data: unknown, createdBy: string) {
  await db.contentRevision.create({ data: { entityType, entityId, version, data: JSON.stringify(data), createdBy } });
}
async function history(entityType: string, entityId: string) {
  return db.contentRevision.findMany({
    where: { entityType, entityId },
    orderBy: { version: 'desc' },
    take: 50,
    select: { id: true, version: true, data: true, createdBy: true, createdAt: true },
  });
}

const exerciseEdit = z.object({
  nameEn: text(120).min(2),
  nameHe: text(120).min(2),
  instructionsEn: text(6000),
  instructionsHe: text(6000),
  muscle: text(40).min(2),
  difficulty: z.enum(['beginner', 'intermediate', 'expert']),
  hidden: z.boolean(),
});

const food = z.object({
  nameEn: text(160).min(2),
  nameHe: text(160).min(2),
  calories: z.number().min(0).max(900),
  protein: z.number().min(0).max(100),
  carbs: z.number().min(0).max(100),
  fat: z.number().min(0).max(100),
  fiber: z.number().min(0).max(100).default(0),
  brand: text(100).nullable().default(null),
});
type FoodInput = z.infer<typeof food>;

/** Per 100 g: macros cannot exceed 100 g and energy should roughly match 4/4/9 kcal per gram. */
export function foodWarnings(f: FoodInput) {
  const warnings: string[] = [];
  if (f.protein + f.carbs + f.fat > 100.5) warnings.push('macrosExceed100g');
  const expected = f.protein * 4 + f.carbs * 4 + f.fat * 9;
  if (Math.abs(expected - f.calories) > Math.max(40, f.calories * 0.25)) warnings.push('caloriesMismatch');
  if (f.fiber > f.carbs + 0.5) warnings.push('fiberExceedsCarbs');
  return warnings;
}

async function duplicates(f: Pick<FoodInput, 'nameEn' | 'nameHe'>, excludeId?: string) {
  const rows = await db.$queryRaw<{ id: string; nameEn: string; nameHe: string; source: string }[]>`
    SELECT id, nameEn, nameHe, source FROM Food
    WHERE ownerId IS NULL AND (lower(nameEn) = lower(${f.nameEn}) OR nameHe = ${f.nameHe})
    LIMIT 5`;
  return rows.filter((r) => r.id !== excludeId);
}

const sharedFoodWhere = (query: URLSearchParams): Prisma.FoodWhereInput => {
  const q = (query.get('q') || '').trim().slice(0, 80);
  const source = query.get('source');
  return {
    ownerId: null,
    ...(source && { source }),
    ...(q && { OR: [{ nameEn: { contains: q } }, { nameHe: { contains: q } }] }),
  };
};

export const contentEndpoints: Endpoint[] = [
  {
    method: 'GET',
    pattern: 'content/exercises',
    permission: 'content.view',
    async handler({ query }) {
      const { skip, take, page, pageSize } = pagination(query);
      const q = (query.get('q') || '').trim().toLowerCase();
      const muscle = query.get('muscle') || '';
      const overrides = new Map((await db.exerciseOverride.findMany()).map((o) => [o.exerciseId, o]));
      const filter = query.get('filter');
      const rows = catalogExercises
        .map((row) => ({ row: overlayExercise(row, overrides.get(row.id)), override: overrides.get(row.id) }))
        .filter(({ row, override }) =>
          (!q || row.nameEn.toLowerCase().includes(q) || row.nameHe.includes(q) || row.id === q) &&
          (!muscle || row.muscle === muscle) &&
          (filter !== 'edited' || !!override) &&
          (filter !== 'hidden' || !!override?.hidden) &&
          (filter !== 'missingHe' || !/[֐-׿]/.test(row.instructionsHe)),
        );
      return {
        total: rows.length,
        page,
        pageSize,
        muscles: [...new Set(catalogExercises.map((e) => e.muscle))].sort(),
        items: rows.slice(skip, skip + take).map(({ row, override }) => ({
          ...row,
          hidden: !!override?.hidden,
          edited: !!override,
          version: override?.version ?? 0,
          media: freeExerciseDemonstration(row.id, row.nameEn).media,
        })),
      };
    },
  },
  {
    method: 'GET',
    pattern: 'content/exercises/:id/history',
    permission: 'content.view',
    async handler({ params }) {
      return { history: await history('exercise', params.id) };
    },
  },
  {
    method: 'POST',
    pattern: 'content/exercises/:id',
    permission: 'content.manage',
    async handler({ params, body, admin }) {
      const base = catalogExercises.find((e) => e.id === params.id);
      if (!base) throw new ApiError('notFound', 404);
      const input = exerciseEdit.parse(body);
      const existing = await db.exerciseOverride.findUnique({ where: { exerciseId: base.id } });
      // Only fields that differ from the bundled catalog are stored.
      const diff = (key: keyof typeof input & keyof typeof base) => (input[key] !== base[key] ? (input[key] as string) : null);
      const data = {
        nameEn: diff('nameEn'),
        nameHe: diff('nameHe'),
        instructionsEn: diff('instructionsEn'),
        instructionsHe: diff('instructionsHe'),
        muscle: diff('muscle'),
        difficulty: diff('difficulty'),
        hidden: input.hidden,
        version: (existing?.version ?? 0) + 1,
        updatedBy: admin.id,
        updatedAt: new Date(),
      };
      await db.exerciseOverride.upsert({ where: { exerciseId: base.id }, create: { exerciseId: base.id, ...data }, update: data });
      await revision('exercise', base.id, data.version, input, admin.id);
      invalidateContentCaches();
      return { ok: true, version: data.version };
    },
  },
  {
    method: 'POST',
    pattern: 'content/exercises/:id/revert',
    permission: 'content.manage',
    async handler({ params, admin }) {
      const existing = await db.exerciseOverride.findUnique({ where: { exerciseId: params.id } });
      if (!existing) return { ok: true };
      await db.exerciseOverride.delete({ where: { exerciseId: params.id } });
      await revision('exercise', params.id, existing.version + 1, { reverted: true }, admin.id);
      invalidateContentCaches();
      return { ok: true };
    },
  },
  {
    method: 'GET',
    pattern: 'content/foods',
    permission: 'content.view',
    async handler({ query }) {
      const { skip, take, page, pageSize } = pagination(query);
      const where = sharedFoodWhere(query);
      const [items, total, sources] = await Promise.all([
        db.food.findMany({
          where,
          skip,
          take,
          orderBy: { nameEn: 'asc' },
          select: { id: true, nameEn: true, nameHe: true, calories: true, protein: true, carbs: true, fat: true, fiber: true, brand: true, source: true, _count: { select: { meals: true, planItems: true, ingredients: true } } },
        }),
        db.food.count({ where }),
        db.food.groupBy({ by: ['source'], where: { ownerId: null }, _count: true }),
      ]);
      return {
        items: items.map(({ _count, ...f }) => ({ ...f, uses: _count.meals + _count.planItems + _count.ingredients, warnings: foodWarnings({ ...f, brand: f.brand }) })),
        total,
        page,
        pageSize,
        sources: sources.map((s) => ({ source: s.source, count: s._count })),
      };
    },
  },
  {
    method: 'POST',
    pattern: 'content/foods',
    permission: 'content.manage',
    async handler({ body, admin }) {
      const input = food.extend({ id: z.string().max(100).optional(), acknowledgeWarnings: z.boolean().default(false), allowDuplicate: z.boolean().default(false) }).parse(body);
      const { id: foodId, acknowledgeWarnings, allowDuplicate, ...data } = input;
      const warnings = foodWarnings(data);
      if (warnings.length && !acknowledgeWarnings) return { saved: false, warnings };
      const dupes = await duplicates(data, foodId);
      if (dupes.length && !allowDuplicate) return { saved: false, duplicates: dupes };
      let saved;
      if (foodId) {
        const existing = await db.food.findUnique({ where: { id: foodId } });
        if (!existing || existing.ownerId) throw new ApiError('notFound', 404);
        saved = await db.food.update({ where: { id: foodId }, data });
      } else saved = await db.food.create({ data: { ...data, source: 'admin' } });
      const count = await db.contentRevision.count({ where: { entityType: 'food', entityId: saved.id } });
      await revision('food', saved.id, count + 1, data, admin.id);
      return { saved: true, food: saved };
    },
  },
  {
    method: 'POST',
    pattern: 'content/foods/:id/delete',
    permission: 'content.manage',
    async handler({ params }) {
      const existing = await db.food.findUnique({
        where: { id: params.id },
        include: { _count: { select: { meals: true, planItems: true, ingredients: true } } },
      });
      if (!existing || existing.ownerId) throw new ApiError('notFound', 404);
      // Foods referenced by diaries, plans or recipes are kept so history stays correct.
      if (existing._count.meals + existing._count.planItems + existing._count.ingredients > 0) throw new ApiError('foodInUse', 409);
      await db.food.delete({ where: { id: existing.id } });
      return { ok: true, nameEn: existing.nameEn };
    },
  },
  {
    method: 'POST',
    pattern: 'content/foods/import',
    permission: 'content.manage',
    async handler({ body, admin }) {
      const input = z.object({ rows: z.array(z.record(z.string(), z.unknown())).min(1).max(2000), dryRun: z.boolean().default(true) }).parse(body);
      const seen = new Set<string>();
      const report: { row: number; status: 'valid' | 'invalid' | 'duplicate' | 'warning'; name: string; detail?: string }[] = [];
      const valid: FoodInput[] = [];
      for (const [index, raw] of input.rows.entries()) {
        const coerce = (k: string) => (typeof raw[k] === 'string' && raw[k] !== '' ? Number(raw[k]) : raw[k]);
        const parsed = food.safeParse({ ...raw, calories: coerce('calories'), protein: coerce('protein'), carbs: coerce('carbs'), fat: coerce('fat'), fiber: coerce('fiber') ?? 0, brand: raw.brand || null });
        const name = String(raw.nameEn ?? raw.nameHe ?? '').slice(0, 80);
        if (!parsed.success) {
          report.push({ row: index + 1, status: 'invalid', name, detail: parsed.error.issues.map((i) => i.path.join('.')).join(', ') });
          continue;
        }
        const key = foodNameKey(parsed.data.nameEn);
        if (seen.has(key) || (await duplicates(parsed.data)).length) {
          report.push({ row: index + 1, status: 'duplicate', name });
          continue;
        }
        seen.add(key);
        const warnings = foodWarnings(parsed.data);
        if (warnings.length) {
          report.push({ row: index + 1, status: 'warning', name, detail: warnings.join(', ') });
          continue;
        }
        report.push({ row: index + 1, status: 'valid', name });
        valid.push(parsed.data);
      }
      let imported = 0;
      if (!input.dryRun && valid.length) {
        const created = await db.$transaction(valid.map((data) => db.food.create({ data: { ...data, source: 'admin' } })));
        await db.contentRevision.createMany({
          data: created.map((f) => ({ entityType: 'food', entityId: f.id, version: 1, data: JSON.stringify({ imported: true }), createdBy: admin.id })),
        });
        imported = created.length;
      }
      return { dryRun: input.dryRun, imported, summary: Object.fromEntries(['valid', 'invalid', 'duplicate', 'warning'].map((s) => [s, report.filter((r) => r.status === s).length])), report: report.slice(0, 500) };
    },
  },
  {
    method: 'GET',
    pattern: 'content/items',
    permission: 'content.view',
    async handler({ query }) {
      const type = z.enum(['ARTICLE', 'FAQ']).catch('FAQ').parse(query.get('type'));
      return { items: await db.contentItem.findMany({ where: { type }, orderBy: [{ position: 'asc' }, { updatedAt: 'desc' }] }) };
    },
  },
  {
    method: 'POST',
    pattern: 'content/items',
    permission: 'content.manage',
    async handler({ body, admin }) {
      const input = z
        .object({
          id: z.string().max(100).optional(),
          type: z.enum(['ARTICLE', 'FAQ']),
          slug: z.string().trim().toLowerCase().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/).max(80),
          category: text(60).default(''),
          titleEn: text(200).min(2),
          titleHe: text(200).min(2),
          bodyEn: text(20000).min(1),
          bodyHe: text(20000).min(1),
          status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']),
          position: z.number().int().min(0).max(10000).default(0),
        })
        .parse(body);
      const { id: itemId, ...data } = input;
      let item;
      if (itemId) {
        const existing = await db.contentItem.findUnique({ where: { id: itemId } });
        if (!existing) throw new ApiError('notFound', 404);
        item = await db.contentItem.update({ where: { id: itemId }, data: { ...data, version: existing.version + 1, updatedBy: admin.id, updatedAt: new Date() } });
      } else item = await db.contentItem.create({ data: { ...data, updatedBy: admin.id } });
      await revision('content', item.id, item.version, data, admin.id);
      return { item };
    },
  },
  {
    method: 'GET',
    pattern: 'content/items/:id/history',
    permission: 'content.view',
    async handler({ params }) {
      return { history: await history('content', params.id) };
    },
  },
  {
    method: 'POST',
    pattern: 'content/items/:id/restore',
    permission: 'content.manage',
    async handler({ params, body, admin }) {
      const { version } = z.object({ version: z.number().int().min(1) }).parse(body);
      const [item, rev] = await Promise.all([
        db.contentItem.findUnique({ where: { id: params.id } }),
        db.contentRevision.findFirst({ where: { entityType: 'content', entityId: params.id, version } }),
      ]);
      if (!item || !rev) throw new ApiError('notFound', 404);
      const data = z.object({ titleEn: z.string(), titleHe: z.string(), bodyEn: z.string(), bodyHe: z.string(), category: z.string(), slug: z.string(), status: z.string() }).parse(JSON.parse(rev.data));
      const updated = await db.contentItem.update({ where: { id: item.id }, data: { ...data, version: item.version + 1, updatedBy: admin.id, updatedAt: new Date() } });
      await revision('content', item.id, updated.version, { ...data, restoredFrom: version }, admin.id);
      return { item: updated };
    },
  },
  {
    method: 'GET',
    pattern: 'content/translations',
    permission: 'content.view',
    async handler({ query }) {
      const { skip, take, page, pageSize } = pagination(query, 50);
      const q = (query.get('q') || '').trim().toLowerCase();
      const overrides = new Map((await db.translationOverride.findMany()).map((o) => [o.key, o]));
      const rows = Object.entries(messages as Record<string, readonly [string, string]>)
        .map(([key, [en, he]]) => {
          const o = overrides.get(key);
          return { key, en: o?.en || en, he: o?.he || he, defaultEn: en, defaultHe: he, overridden: !!o };
        })
        .filter((r) =>
          (!q || r.key.toLowerCase().includes(q) || r.en.toLowerCase().includes(q) || r.he.includes(q)) &&
          (query.get('filter') !== 'overridden' || r.overridden) &&
          (query.get('filter') !== 'missingHe' || !/[֐-׿]/.test(r.he)),
        );
      return { total: rows.length, page, pageSize, items: rows.slice(skip, skip + take) };
    },
  },
  {
    method: 'POST',
    pattern: 'content/translations/:key',
    permission: 'content.manage',
    async handler({ params, body, admin }) {
      if (!Object.hasOwn(messages, params.key)) throw new ApiError('notFound', 404);
      const input = z.object({ en: text(2000), he: text(2000) }).parse(body);
      const [defEn, defHe] = (messages as Record<string, readonly [string, string]>)[params.key];
      // Placeholders such as {app} must survive translation.
      const placeholders = (s: string) => (s.match(/\{\w+\}/g) || []).sort().join();
      if ((input.en && placeholders(input.en) !== placeholders(defEn)) || (input.he && placeholders(input.he) !== placeholders(defHe)))
        throw new ApiError('placeholderMismatch', 400);
      const en = input.en && input.en !== defEn ? input.en : null,
        he = input.he && input.he !== defHe ? input.he : null;
      if (!en && !he) await db.translationOverride.deleteMany({ where: { key: params.key } });
      else
        await db.translationOverride.upsert({
          where: { key: params.key },
          create: { key: params.key, en, he, updatedBy: admin.id },
          update: { en, he, updatedBy: admin.id, updatedAt: new Date() },
        });
      const count = await db.contentRevision.count({ where: { entityType: 'translation', entityId: params.key } });
      await revision('translation', params.key, count + 1, { en, he }, admin.id);
      invalidateContentCaches();
      return { ok: true };
    },
  },
  {
    method: 'GET',
    pattern: 'content/templates',
    permission: 'content.view',
    async handler({ query }) {
      const { skip, take, page, pageSize } = pagination(query);
      const where = { template: true };
      const [items, total] = await Promise.all([
        db.program.findMany({ where, skip, take, orderBy: { createdAt: 'desc' }, select: { id: true, name: true, description: true, weeks: true, days: true, createdAt: true, owner: { select: { id: true, name: true, role: true } }, _count: { select: { exercises: true } } } }),
        db.program.count({ where }),
      ]);
      return { items, total, page, pageSize };
    },
  },
  {
    method: 'POST',
    pattern: 'content/templates/:id/delete',
    permission: 'content.manage',
    async handler({ params }) {
      const program = await db.program.findUnique({ where: { id: params.id } });
      if (!program?.template) throw new ApiError('notFound', 404);
      await db.program.delete({ where: { id: program.id } });
      return { ok: true, name: program.name };
    },
  },
];

const announcementInput = z.object({
  titleEn: text(120).min(2),
  titleHe: text(120).min(2),
  bodyEn: text(1000).min(2),
  bodyHe: text(1000).min(2),
  audience: z.enum(AUDIENCES),
  userIds: z.array(z.string().max(100)).max(1000).default([]),
  inApp: z.boolean().default(true),
  push: z.boolean().default(false),
});

async function reach(audience: Audience, userIds: string[]) {
  const where = audienceWhere(audience, userIds);
  const [recipients, pushReachable] = await Promise.all([
    db.user.count({ where }),
    db.user.count({ where: { ...where, pushTokens: { some: {} }, profile: { reminders: true } } }),
  ]);
  return { recipients, pushReachable };
}

/** Mass sends must echo the previewed recipient count, so nothing goes out unconfirmed. */
function confirmSend(confirmed: { confirm?: boolean; expectedRecipients?: number }, actual: number) {
  if (confirmed.confirm !== true || confirmed.expectedRecipients !== actual) throw new ApiError('confirmationRequired', 409);
}

export const announcementEndpoints: Endpoint[] = [
  {
    method: 'GET',
    pattern: 'announcements',
    permission: 'notifications.view',
    async handler({ query }) {
      const { skip, take, page, pageSize } = pagination(query, 20);
      const [items, total] = await Promise.all([db.announcement.findMany({ orderBy: { createdAt: 'desc' }, skip, take }), db.announcement.count()]);
      const reads = await db.notification.groupBy({
        by: ['detail'],
        where: { key: 'announcement', read: true, detail: { in: items.map((i) => i.id) } },
        _count: true,
      });
      const readMap = new Map(reads.map((r) => [r.detail, r._count]));
      return { items: items.map((i) => ({ ...i, reads: readMap.get(i.id) ?? 0 })), total, page, pageSize };
    },
  },
  {
    method: 'POST',
    pattern: 'announcements/preview',
    permission: 'notifications.view',
    async handler({ body }) {
      const input = z.object({ audience: z.enum(AUDIENCES), userIds: z.array(z.string().max(100)).max(1000).default([]) }).parse(body);
      return reach(input.audience, input.userIds);
    },
  },
  {
    method: 'POST',
    pattern: 'announcements',
    permission: 'notifications.send',
    async handler({ body, admin }) {
      const input = announcementInput
        .extend({
          mode: z.enum(['draft', 'schedule', 'now']),
          scheduledAt: z.iso.datetime({ offset: true }).optional(),
          confirm: z.boolean().optional(),
          expectedRecipients: z.number().int().optional(),
        })
        .parse(body);
      if (!input.inApp && !input.push) throw new ApiError('channelRequired', 400);
      if (input.audience === 'USERS' && !input.userIds.length) throw new ApiError('recipientsRequired', 400);
      const scheduledAt = input.mode === 'schedule' ? new Date(input.scheduledAt || '') : null;
      if (scheduledAt && (Number.isNaN(+scheduledAt) || +scheduledAt < Date.now() + 60000)) throw new ApiError('scheduleInPast', 400);
      if (input.mode !== 'draft') confirmSend(input, (await reach(input.audience, input.userIds)).recipients);
      const item = await db.announcement.create({
        data: {
          titleEn: input.titleEn,
          titleHe: input.titleHe,
          bodyEn: input.bodyEn,
          bodyHe: input.bodyHe,
          audience: input.audience,
          userIds: input.userIds.join(','),
          inApp: input.inApp,
          push: input.push,
          status: input.mode === 'schedule' ? 'SCHEDULED' : 'DRAFT',
          scheduledAt,
          createdBy: admin.id,
        },
      });
      const sent = input.mode === 'now' ? await deliverAnnouncement(item.id) : null;
      return { announcement: sent ?? item };
    },
  },
  {
    method: 'POST',
    pattern: 'announcements/:id/send',
    permission: 'notifications.send',
    async handler({ params, body }) {
      const input = z.object({ confirm: z.boolean(), expectedRecipients: z.number().int() }).parse(body);
      const item = await db.announcement.findUnique({ where: { id: params.id } });
      if (!item || !['DRAFT', 'SCHEDULED'].includes(item.status)) throw new ApiError('notFound', 404);
      confirmSend(input, (await reach(item.audience as Audience, parseUserIds(item.userIds))).recipients);
      return { announcement: await deliverAnnouncement(item.id) };
    },
  },
  {
    method: 'POST',
    pattern: 'announcements/:id/cancel',
    permission: 'notifications.send',
    async handler({ params }) {
      const { count } = await db.announcement.updateMany({ where: { id: params.id, status: { in: ['DRAFT', 'SCHEDULED'] } }, data: { status: 'CANCELLED' } });
      if (!count) throw new ApiError('notFound', 404);
      return { ok: true };
    },
  },
];
