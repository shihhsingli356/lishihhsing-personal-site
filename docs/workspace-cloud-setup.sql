-- Applied to the LiShihhsing Supabase project on 2026-09-18.
-- Kept here as the reproducible database definition for the private workspace.
begin;
create table if not exists public.personal_workspace (
  user_id uuid primary key references auth.users(id) on delete cascade,
  payload jsonb not null,
  version bigint not null default 1 check (version > 0),
  updated_at timestamptz not null default now(),
  constraint workspace_payload_object check (jsonb_typeof(payload) = 'object')
);
alter table public.personal_workspace enable row level security;
revoke all on public.personal_workspace from anon, public;
grant select, insert, update on public.personal_workspace to authenticated;
drop policy if exists workspace_owner_select on public.personal_workspace;
create policy workspace_owner_select on public.personal_workspace for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists workspace_owner_insert on public.personal_workspace;
create policy workspace_owner_insert on public.personal_workspace for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists workspace_owner_update on public.personal_workspace;
create policy workspace_owner_update on public.personal_workspace for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create or replace function public.save_personal_workspace(expected_version bigint, new_payload jsonb)
returns bigint language plpgsql security invoker set search_path = '' as $$
declare current_uid uuid := auth.uid(); result_version bigint;
begin
  if current_uid is null then raise exception 'Authentication required'; end if;
  if jsonb_typeof(new_payload) <> 'object' or octet_length(new_payload::text) > 31457280 then
    raise exception 'Invalid workspace payload';
  end if;
  if expected_version = 0 then
    insert into public.personal_workspace(user_id,payload,version)
    values(current_uid,new_payload,1)
    on conflict (user_id) do nothing returning version into result_version;
  else
    update public.personal_workspace set payload=new_payload,version=version+1,updated_at=now()
    where user_id=current_uid and version=expected_version returning version into result_version;
  end if;
  if result_version is null then raise exception 'WORKSPACE_CONFLICT'; end if;
  return result_version;
end;
$$;
revoke all on function public.save_personal_workspace(bigint,jsonb) from public, anon;
grant execute on function public.save_personal_workspace(bigint,jsonb) to authenticated;
commit;
