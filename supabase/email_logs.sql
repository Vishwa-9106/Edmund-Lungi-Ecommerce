create extension if not exists "pgcrypto";

create table if not exists public.email_logs (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null,
  user_email text,
  email_type text not null,
  sent_at timestamptz not null default now(),
  status text not null,
  error_message text
);

create unique index if not exists email_logs_order_id_email_type_success_uq
on public.email_logs(order_id, email_type)
where status = 'success';

create index if not exists email_logs_order_id_email_type_idx
on public.email_logs(order_id, email_type);

alter table public.email_logs enable row level security;

drop policy if exists "email_logs_select_admin" on public.email_logs;
create policy "email_logs_select_admin" on public.email_logs
for select
to authenticated
using (
  exists (
    select 1
    from public.users u
    where u.id = auth.uid() and u.role = 'admin'
  )
);

drop policy if exists "email_logs_insert_admin" on public.email_logs;
create policy "email_logs_insert_admin" on public.email_logs
for insert
to authenticated
with check (
  exists (
    select 1
    from public.users u
    where u.id = auth.uid() and u.role = 'admin'
  )
);
