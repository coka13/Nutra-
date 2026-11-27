/** Initializes the persistent SQLite database before Next.js serves production requests. */
export async function register() {
  // Node-only setup lives in its own module so the Edge bundle never sees node:* imports.
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { setupDatabase } = await import('./instrumentation-node');
    setupDatabase();
  }
}
