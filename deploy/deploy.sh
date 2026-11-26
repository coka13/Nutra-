#!/usr/bin/env sh
# Zero-surprise deploy on the VPS: build the new image, back up the database, start it,
# wait for /api/health and roll back to the previous image if it never becomes healthy.
#   ./deploy/deploy.sh            (run from the repository checkout on the server)
set -eu
cd "$(dirname "$0")/.."
COMPOSE="docker compose -f deploy/compose.production.yaml --env-file deploy/.env.production"
NEW_TAG="$(git rev-parse --short=12 HEAD)"
PREVIOUS_TAG="$(cat deploy/.current-tag 2>/dev/null || echo '')"

echo "Building nutra-app:$NEW_TAG"
IMAGE_TAG="$NEW_TAG" $COMPOSE build app

if [ -n "$PREVIOUS_TAG" ]; then
  echo "Backing up the database before migrating"
  CRON_SECRET="$(grep '^CRON_SECRET=' deploy/.env.production | cut -d= -f2-)"
  if ! $COMPOSE exec -T app node -e "fetch('http://127.0.0.1:3000/api/jobs/run?job=backup',{method:'POST',headers:{Authorization:'Bearer '+process.argv[1]}}).then(async r=>{const t=await r.text();console.log(t);process.exit(r.ok&&t.includes('SUCCESS')?0:1)}).catch(()=>process.exit(1))" "$CRON_SECRET"; then
    echo "Pre-deploy backup failed. Set FORCE_DEPLOY=1 to continue anyway." >&2
    [ -n "${FORCE_DEPLOY:-}" ] || exit 1
  fi
fi

IMAGE_TAG="$NEW_TAG" $COMPOSE up -d app scheduler caddy

echo "Waiting for health"
for i in $(seq 1 40); do
  STATUS="$(docker inspect --format '{{.State.Health.Status}}' "$($COMPOSE ps -q app)" 2>/dev/null || echo starting)"
  if [ "$STATUS" = "healthy" ]; then
    echo "$NEW_TAG" > deploy/.current-tag
    echo "Deployed $NEW_TAG"
    exit 0
  fi
  sleep 5
done

echo "New version is unhealthy" >&2
if [ -n "$PREVIOUS_TAG" ]; then
  echo "Rolling back to $PREVIOUS_TAG" >&2
  IMAGE_TAG="$PREVIOUS_TAG" $COMPOSE up -d app
  echo "Database migrations are forward-only: if the new release migrated the schema, restore the" >&2
  echo "pre-deploy backup from the data volume's backups/ directory (see docs/ADMIN.md)." >&2
fi
exit 1
