/** Bump when the Terms of Use change; recorded in the audit log at sign-up. */
export const termsVersion = '2026-11-26';
export const minimumAge = 18;
/** Bump when the Privacy Policy changes. */
export const privacyVersion = '2026-11-26';
/** Shown on the Privacy Policy as the contact for data requests. Set at build time. */
export const privacyContact = process.env.NEXT_PUBLIC_PRIVACY_EMAIL || '';
