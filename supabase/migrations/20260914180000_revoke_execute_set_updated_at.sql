-- Task 05.1 short audit (post-approval): generic anon-EXECUTE regression
-- test (organizations_cross_tenant_test.sql) caught set_updated_at() --
-- the BEFORE UPDATE trigger function from
-- 20260914120652_baseline_extensions_and_helpers.sql -- still holding
-- EXECUTE for anon/authenticated/PUBLIC via the same default-privilege
-- mechanism already fixed on the two RPCs.
--
-- set_updated_at() has return type `trigger`, so Postgres refuses to call
-- it directly via SQL ("trigger functions can only be called as triggers")
-- regardless of grants -- it was never exploitable. But no role ever needs
-- direct EXECUTE on a trigger function: the trigger mechanism invokes it
-- as part of the table's own UPDATE processing, which does not require
-- the DML-issuing role to hold EXECUTE on the trigger function itself.
-- Revoking is pure least-privilege cleanup, not an architecture change --
-- verified locally (db reset + a real update_organization_settings() call)
-- that updated_at is still stamped correctly after this revoke.

revoke execute on function public.set_updated_at() from anon, authenticated, public;
