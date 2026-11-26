import { db } from '@/lib/db';

const SENSITIVE = /pass(word)?|token|secret|apikey|api_key|key$|code|hash|totp|recovery|cookie|authorization/i;

/** Keeps audit details useful but free of secrets and oversized payloads. */
export function sanitizeDetails(value: unknown, depth = 0): unknown {
  if (value == null || typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'string') return value.length > 200 ? value.slice(0, 200) + '…' : value;
  if (value instanceof Date) return value.toISOString();
  if (depth > 3) return '[truncated]';
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => sanitizeDetails(v, depth + 1));
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>).slice(0, 40))
      out[key] = SENSITIVE.test(key) ? '[redacted]' : sanitizeDetails(entry, depth + 1);
    return out;
  }
  return String(value);
}

export async function adminAudit(entry: {
  admin: { id: string; email: string } | null;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  details?: unknown;
  result: 'SUCCESS' | 'FAILURE' | 'DENIED';
}) {
  try {
    await db.adminAuditLog.create({
      data: {
        adminId: entry.admin?.id || 'anonymous',
        adminEmail: entry.admin?.email || '',
        action: entry.action.slice(0, 100),
        resourceType: entry.resourceType.slice(0, 60),
        resourceId: entry.resourceId?.slice(0, 120) ?? null,
        details: JSON.stringify(sanitizeDetails(entry.details ?? {})).slice(0, 4000),
        result: entry.result,
      },
    });
  } catch (error) {
    // Audit failure must be visible to operators but never leak request data.
    console.error(JSON.stringify({ event: 'admin_audit_failed', action: entry.action, type: error instanceof Error ? error.name : 'unknown' }));
  }
}
