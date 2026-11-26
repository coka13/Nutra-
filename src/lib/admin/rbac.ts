/** Administrative roles and the least-privilege permissions each one carries. */
export const ADMIN_ROLES = [
  'SUPER_ADMIN',
  'SUPPORT_ADMIN',
  'CONTENT_MANAGER',
  'FINANCE_ADMIN',
  'TECHNICAL_ADMIN',
] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

export const PERMISSIONS = [
  'dashboard.view',
  'users.view',
  'users.manage',
  'users.delete',
  'users.export',
  'entitlements.manage',
  'coaches.view',
  'coaches.manage',
  'billing.view',
  'billing.manage',
  'ai.view',
  'ai.manage',
  'ads.view',
  'ads.manage',
  'content.view',
  'content.manage',
  'notifications.view',
  'notifications.send',
  'config.view',
  'config.manage',
  'support.view',
  'support.manage',
  'system.view',
  'system.manage',
  'audit.view',
  'admins.manage',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const grants: Record<AdminRole, readonly Permission[]> = {
  SUPER_ADMIN: PERMISSIONS,
  SUPPORT_ADMIN: [
    'dashboard.view',
    'users.view',
    'users.manage',
    'coaches.view',
    'coaches.manage',
    'support.view',
    'support.manage',
    'notifications.view',
    'content.view',
  ],
  CONTENT_MANAGER: [
    'dashboard.view',
    'content.view',
    'content.manage',
    'notifications.view',
    'notifications.send',
  ],
  FINANCE_ADMIN: [
    'dashboard.view',
    'users.view',
    'users.export',
    'entitlements.manage',
    'coaches.view',
    'billing.view',
    'billing.manage',
    'ads.view',
    'ads.manage',
    'ai.view',
  ],
  TECHNICAL_ADMIN: [
    'dashboard.view',
    'system.view',
    'system.manage',
    'config.view',
    'config.manage',
    'ai.view',
    'ai.manage',
    'ads.view',
    'audit.view',
  ],
};

export const isAdminRole = (role: string): role is AdminRole =>
  (ADMIN_ROLES as readonly string[]).includes(role);

export function permissionsFor(role: string): Permission[] {
  return isAdminRole(role) ? [...grants[role]] : [];
}
export function can(role: string, permission: Permission) {
  return isAdminRole(role) && grants[role].includes(permission);
}

/** Operations that also need a fresh second factor (step-up) within STEP_UP_WINDOW_MS. */
export const STEP_UP_WINDOW_MS = 10 * 60 * 1000;
