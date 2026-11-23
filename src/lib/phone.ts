// Store international numbers so WhatsApp and the dialer use the same destination.
export function normalizePhone(value: string): string {
  const compact = value.trim().replace(/[\s().-]/g, '');
  return compact.startsWith('00') ? '+' + compact.slice(2) : compact;
}

export function isInternationalPhone(value: string): boolean {
  return /^\+[1-9]\d{7,14}$/.test(normalizePhone(value));
}
