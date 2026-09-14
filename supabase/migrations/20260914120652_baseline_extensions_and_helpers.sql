-- Baseline extensions and helpers shared by every future tenant-owned table.
-- No business tables are created here; see FIRST_12_TASKS.md Task 04+.

create extension if not exists pgcrypto with schema extensions;

-- Every table with created_at/updated_at columns should attach this trigger
-- on update to keep updated_at accurate without relying on the application layer.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

comment on function public.set_updated_at() is
  'BEFORE UPDATE trigger: stamps updated_at with now(). Attach to any table that has an updated_at column.';
