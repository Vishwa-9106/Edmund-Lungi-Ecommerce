-- AI Try-On teardown script.
-- Run this in Supabase SQL editor to remove legacy AI Try-On database objects.

drop policy if exists "ai_tryon_daily_select_own" on public.ai_tryon_usage_daily;
drop policy if exists "ai_tryon_monthly_select_own" on public.ai_tryon_usage_monthly;
drop policy if exists "ai_tryon_logs_select_own" on public.ai_tryon_logs;
drop policy if exists "ai_tryon_cache_select_own" on public.ai_tryon_cache;

drop function if exists public.tryon_check_and_consume(uuid, integer, integer, integer);
drop function if exists public.tryon_refund_last(uuid);

drop table if exists public.ai_tryon_cache;
drop table if exists public.ai_tryon_logs;
drop table if exists public.ai_tryon_rate_limit;
drop table if exists public.ai_tryon_usage_monthly;
drop table if exists public.ai_tryon_usage_daily;
