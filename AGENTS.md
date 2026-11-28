<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Keep README.md current

Every commit that changes something a user, trainer or developer would notice (a feature, a screen, a command or npm script, an environment variable, a setup or deployment step) must update the matching section of `README.md` in the same commit. If a screen shown in the README changed visibly, regenerate the images with `npm run docs:screenshots` (dev server running) and commit the updated files in `docs/images/`. Pure refactors, internal fixes and test-only changes don't need README edits.
