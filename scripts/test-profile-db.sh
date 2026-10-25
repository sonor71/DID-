#!/usr/bin/env bash
set -euo pipefail
# Isolated PostgreSQL fixture: no host port, no network, no production credentials.
repository_root="$(cd "$(dirname "$0")/.." && pwd)"
container_name="fraktum-profile-regression-$$"
image='postgres:17-alpine@sha256:eee6c6e1b0894fa4fe0075eb054af9fd1cf39a35321c2d4110626cfe506411fb'
cleanup() { docker rm -f "$container_name" >/dev/null 2>&1 || true; }
trap cleanup EXIT
docker run --name "$container_name" --rm --detach --network none \
  --env POSTGRES_HOST_AUTH_METHOD=trust --mount "type=bind,source=$repository_root,target=/repo,readonly" \
  "$image" >/dev/null
for attempt in {1..60}; do
  if docker exec "$container_name" pg_isready -U postgres >/dev/null 2>&1; then break; fi
  sleep 0.5
done
docker exec "$container_name" psql -U postgres --no-psqlrc --set=ON_ERROR_STOP=1 --file=/repo/tests/database/profile-stabilization.test.sql
docker exec "$container_name" psql -U postgres --no-psqlrc --set=ON_ERROR_STOP=1 --file=/repo/supabase/audits/profile_security.sql
