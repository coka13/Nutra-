import { z } from 'zod';
import QRCode from 'qrcode';
import { db } from '@/lib/db';
import { ApiError, rateLimit } from '@/lib/auth';
import { tokenHash, verifyPassword } from '@/lib/security';
import {
  beginAdminLogin,
  completeAdminLogin,
  endAdminSession,
  hashAdminPassword,
  publicAdmin,
  stepUp,
  validAdminPassword,
} from '../auth';
import {
  decryptSecret,
  encryptSecret,
  generateRecoveryCodes,
  generateTotpSecret,
  otpauthUri,
  verifyTotp,
} from '../crypto';
import { adminAudit } from '../audit';
import type { Endpoint } from './types';

const code = z.string().trim().min(6).max(20);

async function invitedAccount(token: string) {
  await rateLimit('admin-invite:global', 30);
  const admin = await db.adminAccount.findUnique({ where: { inviteTokenHash: tokenHash(token) } });
  if (!admin || admin.status !== 'INVITED' || !admin.inviteExpiresAt || admin.inviteExpiresAt < new Date())
    throw new ApiError('inviteInvalid', 400);
  return admin;
}

export const authEndpoints: Endpoint[] = [
  {
    method: 'POST',
    pattern: 'auth/login',
    public: true,
    async handler({ body }) {
      const input = z.object({ email: z.email().max(200), password: z.string().min(1).max(128) }).parse(body);
      try {
        const { challenge } = await beginAdminLogin(input.email, input.password);
        return { challenge, next: 'mfa' };
      } catch (error) {
        await adminAudit({
          admin: null,
          action: 'auth.login',
          resourceType: 'admin',
          details: { email: input.email.toLowerCase().slice(0, 200), reason: error instanceof ApiError ? error.code : 'error' },
          result: 'FAILURE',
        });
        throw error;
      }
    },
  },
  {
    method: 'POST',
    pattern: 'auth/mfa',
    public: true,
    async handler({ body, req }) {
      const input = z.object({ challenge: z.string().regex(/^[0-9a-f]{64}$/), code }).parse(body);
      try {
        const { admin, usedRecovery } = await completeAdminLogin(input.challenge, input.code, req.headers.get('user-agent') || '');
        await adminAudit({ admin, action: 'auth.signIn', resourceType: 'admin', resourceId: admin.id, details: { usedRecovery }, result: 'SUCCESS' });
        return { admin: publicAdmin(admin), usedRecovery };
      } catch (error) {
        await adminAudit({ admin: null, action: 'auth.mfa', resourceType: 'admin', details: { reason: error instanceof ApiError ? error.code : 'error' }, result: 'FAILURE' });
        throw error;
      }
    },
  },
  {
    method: 'GET',
    pattern: 'auth/invite',
    public: true,
    async handler({ query }) {
      const token = z.string().regex(/^[0-9a-f]{64}$/).parse(query.get('token'));
      let admin = await invitedAccount(token);
      if (!admin.totpSecret)
        admin = await db.adminAccount.update({ where: { id: admin.id }, data: { totpSecret: encryptSecret(generateTotpSecret()) } });
      const secret = decryptSecret(admin.totpSecret!);
      const uri = otpauthUri(secret, admin.email);
      return {
        email: admin.email,
        name: admin.name,
        role: admin.role,
        secret,
        otpauth: uri,
        qr: await QRCode.toDataURL(uri, { margin: 1, width: 220 }),
      };
    },
  },
  {
    method: 'POST',
    pattern: 'auth/invite',
    public: true,
    async handler({ body }) {
      const input = z
        .object({ token: z.string().regex(/^[0-9a-f]{64}$/), password: z.string().max(128), code: z.string().regex(/^\d{6}$/) })
        .parse(body);
      const admin = await invitedAccount(input.token);
      if (!validAdminPassword(input.password)) throw new ApiError('weakPassword', 400);
      if (!admin.totpSecret) throw new ApiError('inviteInvalid', 400);
      const step = verifyTotp(decryptSecret(admin.totpSecret), input.code);
      if (step == null) throw new ApiError('invalidCode', 401);
      const recovery = generateRecoveryCodes();
      await db.adminAccount.update({
        where: { id: admin.id },
        data: {
          passwordHash: hashAdminPassword(input.password),
          totpEnabledAt: new Date(),
          lastTotpStep: step,
          recoveryCodes: recovery.stored,
          status: 'ACTIVE',
          inviteTokenHash: null,
          inviteExpiresAt: null,
          failedAttempts: 0,
          lockedUntil: null,
        },
      });
      await adminAudit({ admin, action: 'auth.inviteAccepted', resourceType: 'admin', resourceId: admin.id, result: 'SUCCESS' });
      return { recoveryCodes: recovery.codes };
    },
  },
  {
    method: 'GET',
    pattern: 'auth/me',
    async handler({ admin, session }) {
      return { admin: publicAdmin(admin, session) };
    },
  },
  {
    method: 'POST',
    pattern: 'auth/logout',
    async handler() {
      await endAdminSession();
      return { ok: true };
    },
  },
  {
    method: 'POST',
    pattern: 'auth/step-up',
    async handler({ body, session, admin }) {
      const input = z.object({ code: z.string().regex(/^\d{6}$/) }).parse(body);
      await stepUp(session.id, input.code);
      const fresh = await db.adminSession.findUniqueOrThrow({ where: { id: session.id } });
      return { admin: publicAdmin(admin, fresh) };
    },
  },
  {
    method: 'POST',
    pattern: 'auth/password',
    stepUp: true,
    async handler({ body, admin, session }) {
      const input = z.object({ current: z.string().max(128), next: z.string().max(128) }).parse(body);
      if (!admin.passwordHash || !verifyPassword(input.current, admin.passwordHash)) throw new ApiError('credentials', 401);
      if (!validAdminPassword(input.next)) throw new ApiError('weakPassword', 400);
      await db.$transaction([
        db.adminAccount.update({ where: { id: admin.id }, data: { passwordHash: hashAdminPassword(input.next) } }),
        // Every other session ends when the password changes.
        db.adminSession.deleteMany({ where: { adminId: admin.id, id: { not: session.id } } }),
      ]);
      return { ok: true };
    },
  },
  {
    method: 'POST',
    pattern: 'auth/recovery-codes',
    stepUp: true,
    async handler({ admin }) {
      const recovery = generateRecoveryCodes();
      await db.adminAccount.update({ where: { id: admin.id }, data: { recoveryCodes: recovery.stored } });
      return { recoveryCodes: recovery.codes };
    },
  },
];
