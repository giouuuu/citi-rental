#!/usr/bin/env bash
# Apply every Supabase migration to a throwaway local Postgres and run the SQL
# test suite against it. Never touches the hosted project.
#
#   bash scripts/verify-migrations.sh
#
# Steps:
#   1. start a disposable `supabase/postgres` container (random name, --rm)
#   2. apply supabase/tests/_local_stubs.sql as supabase_admin (local-only gaps)
#   3. apply supabase/migrations/*.sql in filename order as `postgres`
#      (the role hosted migrations run as), ON_ERROR_STOP
#   4. apply supabase/tests/_seed.sql (committed fixture data)
#   5. run supabase/tests/*.test.sql (pgTAP; each file ends with finish(true),
#      so any failed assertion aborts with a non-zero exit)
#   6. remove the container (also on failure / Ctrl-C)
#
# Env:
#   SUPABASE_PG_IMAGE  image to use (default public.ecr.aws/supabase/postgres:17.6.1.167)
#   KEEP_CONTAINER=1   leave the container running for debugging (prints its name)

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
IMAGE="${SUPABASE_PG_IMAGE:-public.ecr.aws/supabase/postgres:17.6.1.167}"
NAME="citi-verify-$(date +%s)-$RANDOM"
PASSWORD="verify-$RANDOM$RANDOM"

cleanup() {
  if [[ "${KEEP_CONTAINER:-0}" == "1" ]]; then
    echo "KEEP_CONTAINER=1 -> container left running: $NAME"
    echo "  docker exec -it $NAME psql -U postgres -h localhost -d postgres"
    echo "  docker stop $NAME"
    return
  fi
  docker rm -f "$NAME" >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

command -v docker >/dev/null || { echo "docker is required" >&2; exit 1; }

echo "==> Starting $IMAGE as $NAME"
docker run -d --rm \
  --name "$NAME" \
  -e POSTGRES_PASSWORD="$PASSWORD" \
  "$IMAGE" >/dev/null

echo "==> Waiting for Postgres"
ready=0
for _ in $(seq 1 90); do
  # The image restarts Postgres once after its init scripts; require two
  # consecutive successful queries as supabase_admin before continuing.
  if docker exec "$NAME" psql -U supabase_admin -h localhost -d postgres -Atqc "select 1" >/dev/null 2>&1; then
    sleep 1
    if docker exec "$NAME" psql -U supabase_admin -h localhost -d postgres -Atqc "select 1" >/dev/null 2>&1; then
      ready=1
      break
    fi
  fi
  sleep 1
done
if [[ "$ready" != "1" ]]; then
  echo "Postgres did not become ready" >&2
  docker logs "$NAME" 2>&1 | tail -40 >&2
  exit 1
fi

# SQL is streamed over stdin (no bind mount: Docker Desktop may not be allowed
# to read the checkout, e.g. under ~/Desktop on macOS).
run_sql() {
  local user="$1" file="$2"
  shift 2
  docker exec -i -e PGOPTIONS="-c client_min_messages=warning" "$NAME" \
    psql -U "$user" -h localhost -d postgres \
      -v ON_ERROR_STOP=1 -X -q --pset=pager=off "$@" -f - < "$file"
}

echo "==> Applying local stubs"
run_sql supabase_admin "$ROOT/supabase/tests/_local_stubs.sql" >/dev/null

echo "==> Applying migrations"
count=0
for f in "$ROOT"/supabase/migrations/*.sql; do
  base="$(basename "$f")"
  printf '    %s\n' "$base"
  run_sql postgres "$f" >/dev/null
  count=$((count + 1))
done
echo "    $count migrations applied"

echo "==> Seeding fixtures"
docker exec "$NAME" psql -U supabase_admin -h localhost -d postgres -X -q \
  -c "create extension if not exists pgtap with schema extensions;" >/dev/null
run_sql postgres "$ROOT/supabase/tests/_seed.sql" >/dev/null

echo "==> Running tests"
failed=0
shopt -s nullglob
tests=("$ROOT"/supabase/tests/*.test.sql)
if [[ ${#tests[@]} -eq 0 ]]; then
  echo "No supabase/tests/*.test.sql files found" >&2
  exit 1
fi
for t in "${tests[@]}"; do
  base="$(basename "$t")"
  echo "--- $base"
  if ! out="$(run_sql postgres "$t" -At 2>&1)"; then
    echo "$out"
    echo "FAILED: $base" >&2
    failed=1
    continue
  fi
  echo "$out" | grep -E '^ *(ok|not ok|1\.\.|#)' | sed 's/^ *//' || true
  if echo "$out" | grep -qE '^ *(not ok|# Looks like)'; then
    echo "FAILED: $base" >&2
    failed=1
  fi
done

if [[ "$failed" != "0" ]]; then
  echo "==> Verification FAILED" >&2
  exit 1
fi
echo "==> All migrations applied and all tests passed"
