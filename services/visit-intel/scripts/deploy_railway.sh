#!/bin/zsh
# Deploy the Visit Intelligence service to Railway (project TerritoryIQ, workspace indiafoils's Projects), connected to
# the TerritoryIQ Supabase database, with a public address for Frontier (port 8000). TerritoryIQ calls it at that
# public HTTPS address with the full key. (Binding :: would accept IPv6 only, and Railway's public edge uses IPv4.)
#   zsh scripts/deploy_railway.sh
# Keys come from .env.production (this folder) and the database URL from ../../.env.supabase; none is printed.
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; source .env.production; set +a
DB=$(sed -n 's/^DATABASE_URL=//p' ../../.env.supabase)
PROJECT=1f8a8885-0f33-430e-bfc8-8df856b51f03

railway link -p "$PROJECT" -e production
railway service status --service visit-intel >/dev/null 2>&1 || railway add --service visit-intel \
  -v "VISIT_INTEL_API_KEY=$VISIT_INTEL_API_KEY" -v "VISIT_INTEL_INGEST_KEY=$VISIT_INTEL_INGEST_KEY" -v "DATABASE_URL=$DB" \
  -v "PUBLIC_BASE_URL=https://territoryiq-production.up.railway.app" -v "PORT=8000" \
  -v 'RAILPACK_START_CMD=uvicorn visit_intel.api:app --app-dir src --host 0.0.0.0 --port 8000' >/dev/null
railway link -p "$PROJECT" -e production -s visit-intel
# --no-gitignore: models/ is git-ignored (never on GitHub) but must be uploaded; .railwayignore keeps data and keys out.
railway up --no-gitignore --service visit-intel --detach
railway domain list --service visit-intel
echo "When the build finishes, check: curl https://<the domain above>/health"
