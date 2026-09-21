-- Apply in the selected project. No public table or storage access is granted.
create table public.postcards (
  token_hash text primary key check (token_hash ~ '^[a-f0-9]{64}$'),
  details jsonb not null,
  ready boolean not null default false,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours')
);
alter table public.postcards enable row level security;
revoke all on public.postcards from anon, authenticated;
grant all on public.postcards to service_role;
create index postcards_expiry_idx on public.postcards(expires_at);
create index postcards_created_idx on public.postcards(created_at);

-- Serialized quota reservation prevents concurrent uploads bypassing the limit.
create function public.reserve_postcard(p_hash text, p_details jsonb)
returns timestamptz language plpgsql security invoker set search_path = '' as $$
declare expiration timestamptz;
begin
  perform pg_advisory_xact_lock(7012401);
  if (select count(*) from public.postcards where created_at > now() - interval '24 hours') >= 100 then
    raise exception 'postcard_quota';
  end if;
  insert into public.postcards(token_hash,details) values(p_hash,p_details) returning expires_at into expiration;
  return expiration;
end;
$$;
revoke all on function public.reserve_postcard(text,jsonb) from public, anon, authenticated;
grant execute on function public.reserve_postcard(text,jsonb) to service_role;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('postcards','postcards',false,2097152,array['image/jpeg']);
-- No storage policies: only the backend service role can access this bucket.
