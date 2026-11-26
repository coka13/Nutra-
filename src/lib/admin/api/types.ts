import type { NextRequest } from 'next/server';
import { z } from 'zod';
import type { AdminSession, AdminAccount } from '@prisma/client';
import type { Permission } from '../rbac';

export type AdminRequestContext = {
  req: NextRequest;
  admin: AdminAccount;
  session: AdminSession;
  body: Record<string, unknown>;
  query: URLSearchParams;
  params: Record<string, string>;
};
export type PublicRequestContext = Omit<AdminRequestContext, 'admin' | 'session'>;

export type EndpointResult =
  | Record<string, unknown>
  | { __csv: string; filename: string }
  | null
  | undefined;

export type Endpoint =
  | {
      method: 'GET' | 'POST';
      pattern: string;
      /** Public endpoints (sign-in flow) run without a session. */
      public: true;
      handler: (ctx: PublicRequestContext) => Promise<EndpointResult>;
    }
  | {
      method: 'GET' | 'POST';
      pattern: string;
      public?: false;
      /** Omitted only for endpoints every signed-in administrator may use (own session). */
      permission?: Permission;
      stepUp?: boolean;
      /** Also audit successful reads of sensitive data (exports, account detail). */
      auditRead?: boolean;
      handler: (ctx: AdminRequestContext) => Promise<EndpointResult>;
    };

export const id = z.string().min(1).max(100);
export const text = (max = 200) => z.string().trim().max(max);

export function pagination(query: URLSearchParams, defaultSize = 25) {
  const page = Math.max(1, Math.min(10000, Number(query.get('page')) || 1));
  const pageSize = Math.max(5, Math.min(100, Number(query.get('pageSize')) || defaultSize));
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}

export function dateRange(query: URLSearchParams, defaultDays = 30) {
  const parse = (value: string | null) => {
    if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const date = new Date(value + 'T00:00:00.000Z');
    return Number.isNaN(+date) ? null : date;
  };
  const toDay = parse(query.get('to')) ?? new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00.000Z');
  const to = new Date(+toDay + 86400000 - 1);
  let from = parse(query.get('from')) ?? new Date(+toDay - (defaultDays - 1) * 86400000);
  if (+from > +to) from = new Date(+toDay);
  // Cap at roughly a year so a single request stays cheap.
  if (+to - +from > 366 * 86400000) from = new Date(+to - 366 * 86400000 + 1);
  return { from, to };
}

/** RFC 4180 CSV; cells starting with = + - @ are prefixed to prevent spreadsheet injection. */
export function toCsv(rows: Record<string, unknown>[], columns: string[]) {
  const cell = (value: unknown) => {
    let s = value == null ? '' : value instanceof Date ? value.toISOString() : String(value);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [columns.join(','), ...rows.map((row) => columns.map((c) => cell(row[c])).join(','))].join('\r\n');
}

export const maskEmail = (email: string) => {
  const [local, domain] = email.split('@');
  return `${local.slice(0, 1)}***@${domain ?? ''}`;
};

export const isoDayOf = (date: Date) => date.toISOString().slice(0, 10);
