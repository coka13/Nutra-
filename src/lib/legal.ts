/** Bump when the Terms of Use change; recorded in the audit log at sign-up. */
export const termsVersion = '2026-11-28';
export const minimumAge = 18;
/** Bump when the Privacy Policy changes. */
export const privacyVersion = '2026-11-28';
/** What a user accepts in one step: the later of the two documents. Users on an older version are asked again. */
export const consentVersion = termsVersion > privacyVersion ? termsVersion : privacyVersion;
/** Shown on the Privacy Policy as the contact for data requests. Set at build time. */
export const privacyContact = process.env.NEXT_PUBLIC_PRIVACY_EMAIL || '';
/** Bump when the Accessibility Statement changes. */
export const accessibilityVersion = '2026-11-28';
/**
 * Accessibility coordinator shown on the Accessibility Statement, as Israeli service
 * accessibility regulations require (name and at least one direct contact). Set at build time.
 */
export const accessibilityContact = {
  name: process.env.NEXT_PUBLIC_ACCESSIBILITY_NAME || '',
  phone: process.env.NEXT_PUBLIC_ACCESSIBILITY_PHONE || '',
  email: process.env.NEXT_PUBLIC_ACCESSIBILITY_EMAIL || process.env.NEXT_PUBLIC_PRIVACY_EMAIL || '',
};
