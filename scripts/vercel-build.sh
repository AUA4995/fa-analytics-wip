#!/bin/sh
# Vercel build (npm run vercel-build, set in vercel.json). See docs/DEPLOY-VERCEL.md.
#   1. prisma generate                      — always (the Prisma client is not committed)
#   2. prisma migrate deploy + the seed     — ONLY for Production deployments (VERCEL_ENV=production): new tables, then
#                                             missing defaults; the seed never overwrites users or anything changed in Settings
#   3. next build
set -e

echo "[vercel-build] prisma generate"
npx prisma generate

if [ "$VERCEL_ENV" = "production" ]; then
  if [ -z "$DATABASE_URL" ]; then
    echo "[vercel-build] DATABASE_URL is not set for Production — add it in Vercel → Settings → Environment Variables" >&2
    exit 1
  fi
  echo "[vercel-build] production: prisma migrate deploy"
  npx prisma migrate deploy
  echo "[vercel-build] production: seed defaults (safe to re-run)"
  npx tsx prisma/seed.ts
else
  echo "[vercel-build] VERCEL_ENV=${VERCEL_ENV:-not set} — migrations and seed skipped (Production only)"
fi

echo "[vercel-build] next build"
npx next build
