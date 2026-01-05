create extension if not exists "pgcrypto";

alter table if exists public.users
add column if not exists role text not null default 'user';

create table if not exists public.email_campaigns (
  id uuid primary key default gen_random_uuid(),
  subject text not null,
  body text not null,
  audience text,
  sent_count integer not null default 0,
  status text not null default 'draft',
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create index if not exists email_campaigns_created_at_idx
on public.email_campaigns(created_at desc);

create table if not exists public.email_campaign_logs (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.email_campaigns(id) on delete cascade,
  user_email text,
  status text not null default 'sent',
  sent_at timestamptz not null default now()
);

create index if not exists email_campaign_logs_campaign_id_idx
on public.email_campaign_logs(campaign_id);

alter table public.email_campaigns enable row level security;
alter table public.email_campaign_logs enable row level security;

drop policy if exists "email_campaigns_select_admin" on public.email_campaigns;
create policy "email_campaigns_select_admin" on public.email_campaigns
for select
to authenticated
using (
  exists (
    select 1
    from public.users u
    where u.id = auth.uid() and u.role = 'admin'
  )
);

drop policy if exists "email_campaigns_insert_admin" on public.email_campaigns;
create policy "email_campaigns_insert_admin" on public.email_campaigns
for insert
to authenticated
with check (
  exists (
    select 1
    from public.users u
    where u.id = auth.uid() and u.role = 'admin'
  )
);

drop policy if exists "email_campaigns_update_admin" on public.email_campaigns;
create policy "email_campaigns_update_admin" on public.email_campaigns
for update
to authenticated
using (
  exists (
    select 1
    from public.users u
    where u.id = auth.uid() and u.role = 'admin'
  )
)
with check (
  exists (
    select 1
    from public.users u
    where u.id = auth.uid() and u.role = 'admin'
  )
);

drop policy if exists "email_campaign_logs_select_admin" on public.email_campaign_logs;
create policy "email_campaign_logs_select_admin" on public.email_campaign_logs
for select
to authenticated
using (
  exists (
    select 1
    from public.users u
    where u.id = auth.uid() and u.role = 'admin'
  )
);

drop policy if exists "email_campaign_logs_insert_admin" on public.email_campaign_logs;
create policy "email_campaign_logs_insert_admin" on public.email_campaign_logs
for insert
to authenticated
with check (
  exists (
    select 1
    from public.users u
    where u.id = auth.uid() and u.role = 'admin'
  )
);
