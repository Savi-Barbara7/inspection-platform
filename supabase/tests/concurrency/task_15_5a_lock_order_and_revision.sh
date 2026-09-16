#!/usr/bin/env bash
#
# Task 15.5A — real two-connection concurrency proof (second red-team
# review, finding #4).
#
# pgTAP runs single-session: it can assert row-level correctness but
# can never prove that two REAL, concurrently-running transactions
# serialize without deadlocking, or that the second one observes the
# first's committed change instead of a stale read. This script opens
# two actual, independent Postgres connections (via `docker exec psql`
# running in parallel background processes) and coordinates them with
# pg_sleep() *inside* each transaction — not a fixed sequential sleep
# pretending to be concurrency: both transactions are BEGIN'd and one
# is actively holding row locks while the other's statement is issued
# against the same rows.
#
# Covers duplicate_group_item() (T1, holds the container lock) vs
# reorder_group_items() (T2, must block then correctly detect the
# revision change) on the same container.
#
# restore_group_item() vs reorder_group_items() is NOT separately
# covered here: restore_group_item() locks in the exact same order as
# duplicate_group_item() — container FOR UPDATE first, then the target
# group_item FOR UPDATE (see both functions in
# supabase/migrations/20260916150000_task_15_5a_redteam_fixes.sql,
# sections 4 and 6) — so the lock-order argument this test proves for
# duplicate-vs-reorder applies identically to restore-vs-reorder: there
# is no code path where one would deadlock or race differently than the
# other. A second, near-identical script would prove nothing this one
# doesn't already cover.
#
# Prerequisites: local Supabase stack running (`supabase start` or a
# recent `supabase db reset`) on the default local ports/container name.
# This script only ever talks to the LOCAL docker container below — it
# cannot reach staging or production even by mistake.
#
# Usage:
#   ./supabase/tests/concurrency/task_15_5a_lock_order_and_revision.sh
#
# Exit 0 and "ALL ASSERTIONS PASSED" on success; non-zero with a clear
# message identifying which assertion failed otherwise. Creates its own
# fixtures (organization/user/job) with a fresh random suffix each run
# — does not clean them up (this is a local-dev verification script;
# run `supabase db reset` to clear all local data, including these).

set -euo pipefail

DB_CONTAINER="supabase_db_inspection-platform"
WORKDIR="$(mktemp -d)"
trap 'rm -rf "$WORKDIR"' EXIT

fail() {
  echo "FAIL: $1" >&2
  exit 1
}

if ! docker ps --format '{{.Names}}' | grep -qx "$DB_CONTAINER"; then
  fail "local Supabase Postgres container '$DB_CONTAINER' is not running -- run 'supabase start' first"
fi

psql_local() {
  docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres -v ON_ERROR_STOP=1 "$@"
}

ORG_ID=$(python3 -c "import uuid; print(uuid.uuid4())")
USER_ID=$(python3 -c "import uuid; print(uuid.uuid4())")
SUFFIX=$(date +%s)

echo "== Fixture: org=$ORG_ID user=$USER_ID =="

psql_local <<SQL
insert into auth.users (id, email) values ('$USER_ID', 'concurrency-$SUFFIX@example.test');
insert into public.organizations (id, slug, display_name)
  values ('$ORG_ID', 'concurrency-$SUFFIX', 'Concurrency Test Org');
insert into public.organization_memberships (organization_id, user_id, role, status, joined_at)
  values ('$ORG_ID', '$USER_ID', 'owner', 'active', now());
SQL

# Derive/publish a minimal model (one top-level repeatable section --
# nesting is irrelevant to lock ordering/revision, already proven
# separately in task_15_5a_runtime_tree_integrity_test.sql) and
# materialize a job, all as the real authenticated user.
psql_local <<SQL
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"$USER_ID","role":"authenticated"}', false);

select public.derive_organization_model(
  '$ORG_ID'::uuid,
  (select id from public.technical_models where slug = 'building-inspection'),
  null
);

update public.organization_model_versions
set definition = '{"schemaVersion":1,"sections":[{"id":"sec-outer","title":"Outer","blocks":[],"repeatable":{"labelSingular":"Item","labelPlural":"Items","fields":[]}}]}'::jsonb
where organization_id = '$ORG_ID' and status = 'draft';

select publish_organization_model_version(
  '$ORG_ID'::uuid,
  (select id from public.organization_models where organization_id = '$ORG_ID'),
  (select id from public.organization_model_versions where organization_id = '$ORG_ID' and status = 'draft'),
  (select updated_at from public.organization_model_versions where organization_id = '$ORG_ID' and status = 'draft'),
  'compatible', '[]'::jsonb
);

select public.materialize_technical_job(
  '$ORG_ID'::uuid,
  (select id from public.organization_models where organization_id = '$ORG_ID'),
  'Concurrency Job', null, '[]'::jsonb
);
SQL

JOB_ID=$(psql_local -t -A -c "select id from public.technical_jobs where organization_id = '$ORG_ID' and name = 'Concurrency Job';")
CONTAINER_ID=$(psql_local -t -A -c "select id from public.runtime_nodes where technical_job_id = '$JOB_ID' and definition_id = 'sec-outer';")

echo "== job=$JOB_ID container=$CONTAINER_ID =="

psql_local <<SQL > /dev/null
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"$USER_ID","role":"authenticated"}', false);
select public.add_group_item('$ORG_ID', '$JOB_ID', '$CONTAINER_ID');
select public.add_group_item('$ORG_ID', '$JOB_ID', '$CONTAINER_ID');
SQL

ITEM1_ID=$(psql_local -t -A -c "select id from public.group_items where technical_job_id = '$JOB_ID' and position = 0;")
ITEM2_ID=$(psql_local -t -A -c "select id from public.group_items where technical_job_id = '$JOB_ID' and position = 1;")
REV_BEFORE=$(psql_local -t -A -c "select group_items_revision from public.runtime_nodes where id = '$CONTAINER_ID';")

echo "== items: $ITEM1_ID (pos 0), $ITEM2_ID (pos 1); revision before = $REV_BEFORE =="

# ---------------------------------------------------------------------------
# T1: duplicate_group_item(item2), then hold the container/item locks
# for 3s before committing. T2: started 1s later, attempts
# reorder_group_items() on the SAME container with the PRE-T1 revision
# (stale by construction) and the pre-T1 item order.
# ---------------------------------------------------------------------------

cat > "$WORKDIR/t1.sql" <<SQL
begin;
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"$USER_ID","role":"authenticated"}', true);
select public.duplicate_group_item('$ORG_ID', '$JOB_ID', '$ITEM2_ID');
select pg_sleep(3);
commit;
SQL

cat > "$WORKDIR/t2.sql" <<SQL
select pg_sleep(1);
begin;
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"$USER_ID","role":"authenticated"}', true);
\timing on
select public.reorder_group_items('$ORG_ID', '$JOB_ID', '$CONTAINER_ID', array['$ITEM2_ID','$ITEM1_ID']::uuid[], $REV_BEFORE);
commit;
SQL

T1_START=$(date +%s.%N)
docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres -f - < "$WORKDIR/t1.sql" > "$WORKDIR/t1.out" 2>&1 &
T1_PID=$!
docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres -f - < "$WORKDIR/t2.sql" > "$WORKDIR/t2.out" 2>&1 &
T2_PID=$!
wait "$T1_PID"
wait "$T2_PID"
T2_END=$(date +%s.%N)

echo "--- T1 output ---"
cat "$WORKDIR/t1.out"
echo "--- T2 output ---"
cat "$WORKDIR/t2.out"

# ---------------------------------------------------------------------------
# Assertions.
# ---------------------------------------------------------------------------

if grep -qi "deadlock detected" "$WORKDIR/t1.out" "$WORKDIR/t2.out"; then
  fail "deadlock detected -- lock ordering regression (container-then-GroupItem(s) must be uniform across every structural mutation)"
fi

if ! grep -q "container has been modified since expectedRevision was read" "$WORKDIR/t2.out"; then
  fail "T2 (reorder) did not report the expected revision-mismatch error -- optimistic concurrency regression"
fi

# T2's own reorder statement must have genuinely BLOCKED (waited on T1's
# lock), not failed instantly for an unrelated reason. \timing is only
# turned on right before the reorder call, so the FIRST "Time:" line in
# the output is that call's own timing (a second "Time:" line follows
# for the subsequent commit-of-an-aborted-transaction, which psql/
# Postgres reports and times as a ROLLBACK -- not what we want here).
T2_REORDER_MS=$(awk '/^Time: /{ms=$2; gsub(/[^0-9.]/,"",ms); print ms; exit}' "$WORKDIR/t2.out")
if [ -z "$T2_REORDER_MS" ]; then
  fail "could not parse T2's reorder statement timing from output"
fi
T2_BLOCKED=$(python3 -c "print(1 if $T2_REORDER_MS >= 1500 else 0)")
if [ "$T2_BLOCKED" != "1" ]; then
  fail "T2's reorder returned in ${T2_REORDER_MS}ms -- expected >= 1500ms, meaning it never actually blocked on T1's lock (lock ordering may have regressed to allow it through immediately)"
fi

REV_AFTER=$(psql_local -t -A -c "select group_items_revision from public.runtime_nodes where id = '$CONTAINER_ID';")
if [ "$REV_AFTER" -ne "$((REV_BEFORE + 1))" ]; then
  fail "expected group_items_revision to be exactly REV_BEFORE+1 (=$((REV_BEFORE + 1))) after T1's duplicate committed and T2's reorder was rejected; got $REV_AFTER"
fi

ACTIVE_COUNT=$(psql_local -t -A -c "select count(*) from public.group_items where technical_job_id = '$JOB_ID' and state = 'active';")
if [ "$ACTIVE_COUNT" -ne 3 ]; then
  fail "expected exactly 3 active group_items after T1's duplicate (2 originals + 1 clone) and T2's rejected reorder (no change); got $ACTIVE_COUNT"
fi

DUP_POSITIONS=$(psql_local -t -A -c "
  select count(*) from (
    select position, count(*) c from public.group_items
    where technical_job_id = '$JOB_ID' and state = 'active'
    group by position having count(*) > 1
  ) x;
")
if [ "$DUP_POSITIONS" -ne 0 ]; then
  fail "found duplicated positions among active group_items after the concurrency test -- position invariant violated"
fi

echo ""
echo "ALL ASSERTIONS PASSED"
echo "  - no deadlock (container-then-GroupItem(s) lock order holds under real concurrency)"
echo "  - T2 (reorder) genuinely blocked for ${T2_REORDER_MS}ms behind T1's (duplicate) lock"
echo "  - T2 correctly detected the revision change after unblocking and aborted (no partial mutation)"
echo "  - group_items_revision, active count, and position uniqueness all correct in the final state"
