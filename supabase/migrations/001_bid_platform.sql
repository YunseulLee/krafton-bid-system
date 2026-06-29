create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  name text not null,
  company_name text not null,
  role text not null check (role in ('supplier', 'operator')),
  login_expires_at timestamptz null,
  created_at timestamptz not null default now()
);

alter table public.profiles
  add column if not exists login_expires_at timestamptz null;

create table if not exists public.bid_notices (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text not null,
  summary text not null,
  starts_at timestamptz not null,
  deadline_at timestamptz not null,
  status text not null default 'published' check (status in ('published', 'ended')),
  rfp_file_path text not null,
  rfp_file_name text not null,
  rfp_file_size bigint not null default 0,
  created_by uuid not null references public.profiles(id),
  preferred_proposal_id uuid null,
  result_notified_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bid_notices_valid_period check (starts_at < deadline_at)
);

create table if not exists public.proposals (
  id uuid primary key default gen_random_uuid(),
  notice_id uuid not null references public.bid_notices(id) on delete cascade,
  supplier_id uuid not null references public.profiles(id),
  supplier_company_name text not null,
  file_path text not null,
  file_name text not null,
  file_size bigint not null default 0,
  status text not null default 'submitted' check (status in ('submitted', 'selected', 'not_selected')),
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (notice_id, supplier_id)
);

create table if not exists public.proposal_file_revisions (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references public.proposals(id) on delete cascade,
  notice_id uuid null references public.bid_notices(id) on delete cascade,
  supplier_id uuid null references public.profiles(id),
  supplier_company_name text null,
  file_path text not null,
  file_name text not null,
  file_size bigint not null default 0,
  uploaded_at timestamptz not null,
  replaced_at timestamptz not null default now(),
  storage_deleted_at timestamptz null
);

alter table public.proposal_file_revisions
  add column if not exists notice_id uuid null references public.bid_notices(id) on delete cascade,
  add column if not exists supplier_id uuid null references public.profiles(id),
  add column if not exists supplier_company_name text null,
  add column if not exists storage_deleted_at timestamptz null;

do $migration$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'bid_notices_preferred_proposal_fk'
      and conrelid = 'public.bid_notices'::regclass
  ) then
    alter table public.bid_notices
      add constraint bid_notices_preferred_proposal_fk
      foreign key (preferred_proposal_id)
      references public.proposals(id)
      deferrable initially deferred;
  end if;
end;
$migration$;

create table if not exists public.evaluations (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references public.proposals(id) on delete cascade,
  notice_id uuid not null references public.bid_notices(id) on delete cascade,
  evaluator_id uuid not null references public.profiles(id),
  score numeric not null check (score >= 0 and score <= 100),
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (proposal_id)
);

create index if not exists bid_notices_deadline_idx on public.bid_notices(deadline_at);
create index if not exists proposals_notice_idx on public.proposals(notice_id);
create index if not exists proposal_file_revisions_proposal_idx on public.proposal_file_revisions(proposal_id);
create index if not exists evaluations_notice_idx on public.evaluations(notice_id);

create or replace function public.current_profile_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.is_operator()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_profile_role() = 'operator'
$$;

create or replace function public.is_supplier()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'supplier'
      and (login_expires_at is null or login_expires_at > now())
  )
$$;

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  metadata jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
begin
  insert into public.profiles (
    id,
    email,
    name,
    company_name,
    role,
    login_expires_at
  )
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(nullif(metadata->>'name', ''), '입찰 참여자'),
    coalesce(nullif(metadata->>'company_name', ''), split_part(coalesce(new.email, ''), '@', 1), '미등록 업체'),
    'supplier',
    nullif(metadata->>'login_expires_at', '')::timestamptz
  )
  on conflict (id) do update
    set email = excluded.email,
        login_expires_at = excluded.login_expires_at;

  return new;
end;
$$;

drop trigger if exists handle_new_auth_user on auth.users;
create trigger handle_new_auth_user
after insert on auth.users
for each row execute function public.handle_new_auth_user();

create or replace function public.uuid_or_null(value text)
returns uuid
language plpgsql
immutable
strict
set search_path = public
as $$
begin
  return value::uuid;
exception
  when invalid_text_representation then
    return null;
end;
$$;

create or replace function public.validate_evaluation_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  proposal_notice_id uuid;
  notice_deadline_at timestamptz;
  notice_result_notified_at timestamptz;
begin
  select proposal.notice_id, notice.deadline_at, notice.result_notified_at
    into proposal_notice_id, notice_deadline_at, notice_result_notified_at
  from public.proposals proposal
  join public.bid_notices notice on notice.id = proposal.notice_id
  where proposal.id = new.proposal_id;

  if proposal_notice_id is null then
    raise exception 'evaluation proposal must exist';
  end if;

  if new.notice_id <> proposal_notice_id then
    raise exception 'evaluation notice_id must match proposal.notice_id';
  end if;

  if notice_deadline_at >= now() then
    raise exception 'deadline_at must pass before evaluations can be written';
  end if;

  if notice_result_notified_at is not null then
    raise exception 'result_notified_at prevents evaluation changes';
  end if;

  return new;
end;
$$;

create or replace function public.validate_notice_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  preferred_notice_id uuid;
begin
  if tg_op = 'INSERT' then
    if new.preferred_proposal_id is not null or new.result_notified_at is not null then
      raise exception 'new notices cannot start with preferred_proposal_id or result_notified_at';
    end if;

    return new;
  end if;

  if old.result_notified_at is not null and (
    new.preferred_proposal_id is distinct from old.preferred_proposal_id
    or new.result_notified_at is distinct from old.result_notified_at
  ) then
    raise exception 'result_notified_at locks preferred proposal changes';
  end if;

  if new.preferred_proposal_id is distinct from old.preferred_proposal_id
    and new.preferred_proposal_id is not null then
    if not (new.deadline_at < now()) then
      raise exception 'deadline_at must pass before preferred_proposal_id can change';
    end if;

    select proposal.notice_id
      into preferred_notice_id
    from public.proposals proposal
    where proposal.id = new.preferred_proposal_id;

    if preferred_notice_id is distinct from new.id then
      raise exception 'preferred proposal.notice_id must match bid notice';
    end if;

    if exists (
      select 1
      from public.proposals proposal
      where proposal.notice_id = new.id
        and not exists (
          select 1
          from public.evaluations evaluation
          where evaluation.proposal_id = proposal.id
        )
    ) then
      raise exception 'all proposals need evaluations before preferred_proposal_id can change';
    end if;
  end if;

  if new.result_notified_at is distinct from old.result_notified_at
    and new.result_notified_at is not null
    and new.preferred_proposal_id is null then
    raise exception 'preferred_proposal_id is required before result_notified_at';
  end if;

  return new;
end;
$$;

create or replace function public.validate_proposal_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  file_changed boolean;
  status_changed boolean;
  notice_status text;
  notice_starts_at timestamptz;
  notice_deadline_at timestamptz;
  notice_result_notified_at timestamptz;
begin
  file_changed := new.file_path is distinct from old.file_path
    or new.file_name is distinct from old.file_name
    or new.file_size is distinct from old.file_size;
  status_changed := new.status is distinct from old.status;

  if new.id is distinct from old.id
    or new.notice_id is distinct from old.notice_id
    or new.supplier_id is distinct from old.supplier_id
    or new.supplier_company_name is distinct from old.supplier_company_name
    or new.submitted_at is distinct from old.submitted_at then
    raise exception 'proposal immutable fields cannot change';
  end if;

  select notice.status, notice.starts_at, notice.deadline_at, notice.result_notified_at
    into notice_status, notice_starts_at, notice_deadline_at, notice_result_notified_at
  from public.bid_notices notice
  where notice.id = new.notice_id;

  if notice_deadline_at is null then
    raise exception 'proposal notice must exist';
  end if;

  if file_changed then
    if status_changed or old.status <> 'submitted' or new.status <> 'submitted' then
      raise exception 'proposal file replacement must keep submitted status';
    end if;

    if not public.is_supplier() or new.supplier_id <> auth.uid() then
      raise exception 'only owning supplier can replace proposal file';
    end if;

    if notice_status <> 'published'
      or notice_starts_at > now()
      or notice_deadline_at < now()
      or notice_result_notified_at is not null then
      raise exception 'proposal file replacement is allowed only before deadline';
    end if;

    return new;
  end if;

  if not status_changed then
    raise exception 'proposal updates must change status through result selection';
  end if;

  if old.status <> 'submitted' then
    raise exception 'only submitted proposals can enter result selection';
  end if;

  if not (new.status in ('selected', 'not_selected')) then
    raise exception 'proposal result status must be selected or not_selected';
  end if;

  if notice_deadline_at >= now() then
    raise exception 'deadline_at must pass before proposal result updates';
  end if;

  if notice_result_notified_at is not null then
    raise exception 'result_notified_at prevents proposal result updates';
  end if;

  if exists (
    select 1
    from public.proposals proposal
    where proposal.notice_id = new.notice_id
      and proposal.status = 'submitted'
      and not exists (
        select 1
        from public.evaluations evaluation
        where evaluation.proposal_id = proposal.id
      )
  ) then
    raise exception 'all submitted proposals need evaluations before proposal result updates';
  end if;

  return new;
end;
$$;

create or replace function public.record_proposal_file_revision()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.file_path is distinct from old.file_path
    or new.file_name is distinct from old.file_name
    or new.file_size is distinct from old.file_size then
    insert into public.proposal_file_revisions (
      proposal_id,
      notice_id,
      supplier_id,
      supplier_company_name,
      file_path,
      file_name,
      file_size,
      uploaded_at,
      replaced_at
    )
    values (
      old.id,
      old.notice_id,
      old.supplier_id,
      old.supplier_company_name,
      old.file_path,
      old.file_name,
      old.file_size,
      old.updated_at,
      now()
    );
  end if;

  return new;
end;
$$;

create or replace function public.list_expired_proposal_revision_files(retention_days integer default 30)
returns table(id uuid, file_path text)
language sql
stable
security definer
set search_path = public
as $$
  select revision.id, revision.file_path
  from public.proposal_file_revisions revision
  join public.bid_notices notice on notice.id = revision.notice_id
  where public.is_operator()
    and revision.storage_deleted_at is null
    and notice.result_notified_at is not null
    and notice.result_notified_at + make_interval(days => retention_days) < now()
$$;

create or replace view public.participant_bid_notices
with (security_barrier = true)
as
select
  id,
  title,
  category,
  summary,
  starts_at,
  deadline_at,
  status,
  rfp_file_path,
  rfp_file_name,
  rfp_file_size
from public.bid_notices
where status = 'published';

create or replace view public.participant_proposals
with (security_barrier = true)
as
select
  id,
  notice_id,
  supplier_id,
  file_name,
  file_size,
  submitted_at,
  'submitted'::text as display_status
from public.proposals
where supplier_id = auth.uid();

alter table public.profiles enable row level security;
alter table public.bid_notices enable row level security;
alter table public.proposals enable row level security;
alter table public.proposal_file_revisions enable row level security;
alter table public.evaluations enable row level security;

drop trigger if exists validate_evaluation_write on public.evaluations;
create trigger validate_evaluation_write
before insert or update on public.evaluations
for each row
execute function public.validate_evaluation_write();

drop trigger if exists validate_notice_update on public.bid_notices;
create trigger validate_notice_update
before insert or update on public.bid_notices
for each row
execute function public.validate_notice_update();

drop trigger if exists validate_proposal_update on public.proposals;
create trigger validate_proposal_update
before update on public.proposals
for each row
execute function public.validate_proposal_update();

drop trigger if exists record_proposal_file_revision on public.proposals;
create trigger record_proposal_file_revision
before update of file_path, file_name, file_size on public.proposals
for each row
execute function public.record_proposal_file_revision();

revoke all on public.profiles from anon, authenticated;
revoke all on public.bid_notices from anon, authenticated;
revoke all on public.proposals from anon, authenticated;
revoke all on public.proposal_file_revisions from anon, authenticated;
revoke all on public.evaluations from anon, authenticated;
grant select on public.profiles to authenticated;
grant select on public.participant_bid_notices to authenticated;
grant select on public.participant_proposals to authenticated;
grant select, insert, update on public.bid_notices to authenticated;
grant insert, select, update on public.proposals to authenticated;
grant select, update on public.proposal_file_revisions to authenticated;
grant select, insert, update on public.evaluations to authenticated;

drop policy if exists "profiles read own or operator" on public.profiles;
create policy "profiles read own or operator"
on public.profiles for select to authenticated
using (id = auth.uid() or public.is_operator());

drop policy if exists "operators manage notices" on public.bid_notices;
create policy "operators manage notices"
on public.bid_notices for all to authenticated
using (public.is_operator())
with check (public.is_operator());

drop policy if exists "suppliers submit proposals" on public.proposals;
create policy "suppliers submit proposals"
on public.proposals for insert to authenticated
with check (
  public.is_supplier()
  and supplier_id = auth.uid()
  and exists (
    select 1
    from public.bid_notices notice
    where notice.id = notice_id
      and notice.status = 'published'
      and notice.starts_at <= now()
      and notice.deadline_at >= now()
      and notice.result_notified_at is null
  )
);

drop policy if exists "suppliers replace own proposal files before deadline" on public.proposals;
create policy "suppliers replace own proposal files before deadline"
on public.proposals for update to authenticated
using (
  public.is_supplier()
  and supplier_id = auth.uid()
  and status = 'submitted'
  and exists (
    select 1
    from public.bid_notices notice
    where notice.id = notice_id
      and notice.status = 'published'
      and notice.starts_at <= now()
      and notice.deadline_at >= now()
      and notice.result_notified_at is null
  )
)
with check (
  public.is_supplier()
  and supplier_id = auth.uid()
  and status = 'submitted'
  and exists (
    select 1
    from public.bid_notices notice
    where notice.id = notice_id
      and notice.status = 'published'
      and notice.starts_at <= now()
      and notice.deadline_at >= now()
      and notice.result_notified_at is null
  )
);

drop policy if exists "operators read proposals after deadline" on public.proposals;
create policy "operators read proposals after deadline"
on public.proposals for select to authenticated
using (
  public.is_operator()
  and exists (
    select 1
    from public.bid_notices notice
    where notice.id = notice_id
      and notice.deadline_at < now()
  )
);

drop policy if exists "operators update proposal results" on public.proposals;
drop policy if exists "operators update proposal status after validation" on public.proposals;
create policy "operators update proposal status after validation"
on public.proposals for update to authenticated
using (public.is_operator())
with check (
  public.is_operator()
  and status in ('selected', 'not_selected')
);

drop policy if exists "operators read evaluations" on public.evaluations;
create policy "operators read evaluations"
on public.evaluations for select to authenticated
using (public.is_operator());

drop policy if exists "operators mark proposal revision storage deleted" on public.proposal_file_revisions;
create policy "operators mark proposal revision storage deleted"
on public.proposal_file_revisions for update to authenticated
using (public.is_operator())
with check (public.is_operator());

drop policy if exists "operators create evaluations" on public.evaluations;
create policy "operators create evaluations"
on public.evaluations for insert to authenticated
with check (public.is_operator());

drop policy if exists "operators update evaluations" on public.evaluations;
create policy "operators update evaluations"
on public.evaluations for update to authenticated
using (public.is_operator())
with check (public.is_operator());

insert into storage.buckets (id, name, public)
values
  ('rfp-files', 'rfp-files', false),
  ('proposal-files', 'proposal-files', false)
on conflict (id) do nothing;

drop policy if exists "operators upload rfp files" on storage.objects;
create policy "operators upload rfp files"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'rfp-files'
  and public.is_operator()
);

drop policy if exists "authenticated users read rfp files" on storage.objects;
create policy "authenticated users read rfp files"
on storage.objects for select to authenticated
using (bucket_id = 'rfp-files');

drop policy if exists "operators delete rfp files" on storage.objects;
create policy "operators delete rfp files"
on storage.objects for delete to authenticated
using (
  bucket_id = 'rfp-files'
  and public.is_operator()
);

drop policy if exists "suppliers upload proposal files to own folder" on storage.objects;
create policy "suppliers upload proposal files to own folder"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'proposal-files'
  and public.is_supplier()
  and (storage.foldername(name))[1] = 'notices'
  and public.uuid_or_null((storage.foldername(name))[2]) is not null
  and (storage.foldername(name))[3] = 'suppliers'
  and (storage.foldername(name))[4] = auth.uid()::text
  and exists (
    select 1
    from public.bid_notices notice
    where notice.id = public.uuid_or_null((storage.foldername(name))[2])
      and notice.status = 'published'
      and notice.starts_at <= now()
      and notice.deadline_at >= now()
      and notice.result_notified_at is null
  )
);

drop policy if exists "operators read proposal files after deadline" on storage.objects;
create policy "operators read proposal files after deadline"
on storage.objects for select to authenticated
using (
  bucket_id = 'proposal-files'
  and public.is_operator()
  and exists (
    select 1
    from public.proposals proposal
    join public.bid_notices notice on notice.id = proposal.notice_id
    where proposal.file_path = name
      and proposal.notice_id = public.uuid_or_null((storage.foldername(name))[2])
      and notice.deadline_at < now()
  )
);

drop policy if exists "operators delete replaced proposal files after notification retention" on storage.objects;
create policy "operators delete replaced proposal files after notification retention"
on storage.objects for delete to authenticated
using (
  bucket_id = 'proposal-files'
  and public.is_operator()
  and exists (
    select 1
    from public.proposal_file_revisions revision
    join public.bid_notices notice on notice.id = revision.notice_id
    where revision.file_path = name
      and revision.storage_deleted_at is null
      and notice.result_notified_at is not null
      and notice.result_notified_at + interval '30 days' < now()
  )
);
