begin;

alter table public.project_documents add column if not exists storage_provider text not null default 'supabase';
-- Keep an independent ledger so project deletion cannot orphan uncharged R2 files.
create table public.project_storage_objects (
  id uuid primary key,
  user_id uuid not null,
  project_id uuid not null,
  stage_id uuid,
  object_key text not null unique,
  file_name text not null,
  mime_type text not null,
  kind text not null,
  size_bytes bigint not null check (size_bytes between 1 and 15000000),
  state text not null default 'pending' check (state in ('pending','ready')),
  created_at timestamptz not null default now()
);
alter table public.project_storage_objects enable row level security;
revoke all on public.project_storage_objects from public, anon, authenticated;
grant all on public.project_storage_objects to service_role;
create index on public.project_storage_objects(user_id);

-- Count attempts before touching R2; never refund failed attempts. Rolling 32 days
-- safely covers monthly billing cycles without depending on invoice reset dates.
create table public.project_storage_operations (
  day date not null,
  kind text not null check(kind in ('read','write')),
  attempts bigint not null default 0,
  primary key(day,kind)
);
alter table public.project_storage_operations enable row level security;
revoke all on public.project_storage_operations from public,anon,authenticated;
grant all on public.project_storage_operations to service_role;
create function public.consume_project_storage_operation(p_kind text)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare used bigint; cap bigint;
begin
  if p_kind not in ('read','write') then raise exception 'INVALID_OPERATION'; end if;
  perform pg_advisory_xact_lock(hashtextextended('r2-operation-'||p_kind,7813));
  cap := case when p_kind='write' then 100000 else 1000000 end;
  select coalesce(sum(attempts),0) into used from public.project_storage_operations
    where kind=p_kind and day >= (now() at time zone 'UTC')::date - 32;
  if used >= cap then raise exception 'PLATFORM_REQUEST_LIMIT'; end if;
  insert into public.project_storage_operations(day,kind,attempts) values((now() at time zone 'UTC')::date,p_kind,1)
  on conflict(day,kind) do update set attempts=public.project_storage_operations.attempts+1;
  return true;
end;
$$;
revoke all on function public.consume_project_storage_operation(text) from public,anon,authenticated;
grant execute on function public.consume_project_storage_operation(text) to service_role;

create function public.project_storage_usage(p_user_id uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'used_bytes',
      coalesce((select sum(size_bytes) from public.project_storage_objects where user_id = p_user_id),0)
      + coalesce((select sum(d.size_bytes) from public.project_documents d join public.projects p on p.id=d.project_id
          where p.owner_user_id=p_user_id and d.storage_provider='supabase'),0),
    'limit_bytes', case when exists (
      select 1 from public.user_entitlements where user_id=p_user_id
      and plan_id='homeowner_project_pass' and status='active'
      and active_from <= now() and (active_until is null or active_until > now())
    ) then 100000000 else 20000000 end,
    'free_limit_bytes',20000000
  );
$$;

create function public.reserve_project_storage(p_user_id uuid, p_project_id uuid, p_stage_id uuid,
  p_file_name text, p_mime_type text, p_kind text, p_size_bytes bigint)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare usage jsonb; item public.project_storage_objects; new_id uuid := gen_random_uuid();
begin
  -- Lock before checking usage: two simultaneous uploads cannot both spend the same allowance.
  perform pg_advisory_xact_lock(78120001);
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 7812));
  if (select coalesce(sum(size_bytes),0) from public.project_storage_objects) + p_size_bytes > 8000000000 then
    raise exception 'PLATFORM_STORAGE_LIMIT';
  end if;
  if not exists(select 1 from public.projects where id=p_project_id and owner_user_id=p_user_id) then
    raise exception 'PROJECT_NOT_FOUND';
  end if;
  if p_stage_id is not null and not exists(select 1 from public.project_stages where id=p_stage_id and project_id=p_project_id) then
    raise exception 'INVALID_STAGE';
  end if;
  if p_size_bytes is null or p_size_bytes < 1 or p_size_bytes > 15000000 then raise exception 'FILE_TOO_LARGE'; end if;
  usage := public.project_storage_usage(p_user_id);
  if (usage->>'used_bytes')::bigint + p_size_bytes > (usage->>'limit_bytes')::bigint then
    raise exception 'STORAGE_QUOTA_EXCEEDED';
  end if;
  insert into public.project_storage_objects(id,user_id,project_id,stage_id,object_key,file_name,mime_type,kind,size_bytes)
  values(new_id,p_user_id,p_project_id,p_stage_id,p_user_id::text||'/'||new_id::text,
    left(p_file_name,240),p_mime_type,left(p_kind,60),p_size_bytes) returning * into item;
  return to_jsonb(item);
end;
$$;

create function public.finish_project_storage(p_id uuid, p_user_id uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare item public.project_storage_objects; doc public.project_documents;
begin
  select * into item from public.project_storage_objects where id=p_id and user_id=p_user_id for update;
  if not found then raise exception 'UPLOAD_NOT_FOUND'; end if;
  if not exists(select 1 from public.projects where id=item.project_id and owner_user_id=p_user_id) then raise exception 'PROJECT_NOT_FOUND'; end if;
  insert into public.project_documents(id,project_id,stage_id,uploaded_by_user_id,kind,file_name,file_url,storage_path,mime_type,size_bytes,storage_provider)
  values(item.id,item.project_id,item.stage_id,item.user_id,item.kind,item.file_name,item.object_key,item.object_key,item.mime_type,item.size_bytes,'r2')
  on conflict(id) do nothing;
  update public.project_storage_objects set state='ready' where id=p_id;
  select * into doc from public.project_documents where id=p_id;
  return to_jsonb(doc);
end;
$$;

create function public.project_storage_cleanup_candidates()
returns setof public.project_storage_objects language sql stable security invoker set search_path = '' as $$
  select o.* from public.project_storage_objects o
  where o.created_at < now() - interval '24 hours'
    and (o.state='pending' or not exists(select 1 from public.project_documents d where d.id=o.id))
  order by o.created_at limit 20;
$$;
revoke all on function public.project_storage_cleanup_candidates() from public,anon,authenticated;
grant execute on function public.project_storage_cleanup_candidates() to service_role;

revoke all on function public.project_storage_usage(uuid) from public,anon,authenticated;
revoke all on function public.reserve_project_storage(uuid,uuid,uuid,text,text,text,bigint) from public,anon,authenticated;
revoke all on function public.finish_project_storage(uuid,uuid) from public,anon,authenticated;
grant execute on function public.project_storage_usage(uuid) to service_role;
grant execute on function public.reserve_project_storage(uuid,uuid,uuid,text,text,text,bigint) to service_role;
grant execute on function public.finish_project_storage(uuid,uuid) to service_role;
commit;
