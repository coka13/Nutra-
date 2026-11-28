/** Only same-site paths are allowed as a post-login destination (no open redirects). */
export function safeNext(value: string | null | undefined) {
  return value && /^\/(?![/\\])/.test(value) ? value : null;
}
