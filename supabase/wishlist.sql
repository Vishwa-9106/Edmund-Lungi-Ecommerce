alter table if exists public.users
add column if not exists wishlist text[] not null default '{}'::text[];

alter table public.users enable row level security;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.users u
    where u.id = auth.uid()
      and u.role = 'admin'
  );
$$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'users'
      and policyname = 'users_select_own'
  ) then
    create policy users_select_own on public.users
    for select
    to authenticated
    using (id = auth.uid());
  end if;

  if exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'users'
      and policyname = 'users_select_admin_all'
  ) then
    execute 'drop policy users_select_admin_all on public.users';
  end if;

  create policy users_select_admin_all on public.users
  for select
  to authenticated
  using (public.is_admin());

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'users'
      and policyname = 'users_update_own'
  ) then
    create policy users_update_own on public.users
    for update
    to authenticated
    using (id = auth.uid())
    with check (id = auth.uid());
  end if;
end
$$;

create or replace function public.get_wishlist()
returns text[]
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
  v_list text[];
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select u.wishlist into v_list
  from public.users u
  where u.id = v_uid;

  if v_list is null then
    v_list := '{}'::text[];
  end if;

  return v_list;
end;
$$;

create or replace function public.toggle_wishlist(p_product_id text)
returns text[]
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
  v_existing text[];
  v_next text[];
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  if p_product_id is null or length(trim(p_product_id)) = 0 then
    raise exception 'Invalid product id';
  end if;

  select u.wishlist into v_existing
  from public.users u
  where u.id = v_uid
  for update;

  if not found then
    raise exception 'User profile row missing';
  end if;

  if v_existing is null then
    v_existing := '{}'::text[];
  end if;

  if p_product_id = any(v_existing) then
    v_next := array_remove(v_existing, p_product_id);
  else
    v_next := array_append(array_remove(v_existing, p_product_id), p_product_id);
  end if;

  update public.users
  set wishlist = v_next
  where id = v_uid;

  return v_next;
end;
$$;

revoke all on function public.get_wishlist() from public;
grant execute on function public.get_wishlist() to authenticated;

revoke all on function public.toggle_wishlist(text) from public;
grant execute on function public.toggle_wishlist(text) to authenticated;
