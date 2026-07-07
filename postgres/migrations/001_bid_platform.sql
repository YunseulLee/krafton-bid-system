create extension if not exists pgcrypto;

create table if not exists app_users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  password_hash text null,
  name text not null default '',
  company_name text not null default '',
  role text not null check (role in ('supplier', 'operator')),
  login_expires_at timestamptz null,
  deleted_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists bid_notices (
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
  created_by uuid not null references app_users(id),
  preferred_proposal_id uuid null,
  result_notified_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bid_notices_valid_period check (starts_at < deadline_at)
);

create table if not exists rfp_file_revisions (
  id uuid primary key default gen_random_uuid(),
  notice_id uuid not null references bid_notices(id),
  file_path text not null,
  file_name text not null,
  file_size bigint not null default 0,
  uploaded_at timestamptz not null,
  replaced_at timestamptz not null default now()
);

create table if not exists proposals (
  id uuid primary key default gen_random_uuid(),
  notice_id uuid not null references bid_notices(id) on delete cascade,
  supplier_id uuid null references app_users(id) on delete set null,
  supplier_company_name text not null,
  file_path text not null,
  file_name text not null,
  file_size bigint not null default 0,
  status text not null default 'submitted' check (status in ('submitted', 'selected', 'not_selected')),
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (notice_id, supplier_id)
);

create table if not exists proposal_file_revisions (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references proposals(id),
  notice_id uuid not null references bid_notices(id),
  supplier_id uuid null references app_users(id) on delete set null,
  supplier_company_name text not null,
  file_path text not null,
  file_name text not null,
  file_size bigint not null default 0,
  uploaded_at timestamptz not null,
  replaced_at timestamptz not null default now()
);

create table if not exists evaluations (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references proposals(id) on delete cascade,
  notice_id uuid not null references bid_notices(id) on delete cascade,
  evaluator_id uuid not null references app_users(id),
  score numeric not null check (score >= 0 and score <= 100),
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (proposal_id)
);

alter table bid_notices
  drop constraint if exists bid_notices_preferred_proposal_fk;

alter table bid_notices
  add constraint bid_notices_preferred_proposal_fk
  foreign key (preferred_proposal_id)
  references proposals(id)
  deferrable initially deferred;

alter table rfp_file_revisions
  drop constraint if exists rfp_file_revisions_notice_id_fkey,
  add constraint rfp_file_revisions_notice_id_fkey
  foreign key (notice_id)
  references bid_notices(id);

alter table proposal_file_revisions
  drop constraint if exists proposal_file_revisions_proposal_id_fkey,
  add constraint proposal_file_revisions_proposal_id_fkey
  foreign key (proposal_id)
  references proposals(id);

alter table proposal_file_revisions
  drop constraint if exists proposal_file_revisions_notice_id_fkey,
  add constraint proposal_file_revisions_notice_id_fkey
  foreign key (notice_id)
  references bid_notices(id);

create index if not exists app_users_role_expiry_idx on app_users(role, login_expires_at, deleted_at);
create index if not exists bid_notices_deadline_idx on bid_notices(deadline_at);
create index if not exists proposals_notice_idx on proposals(notice_id);
create index if not exists rfp_file_revisions_notice_idx on rfp_file_revisions(notice_id);
create index if not exists proposal_file_revisions_notice_idx on proposal_file_revisions(notice_id);
create index if not exists evaluations_notice_idx on evaluations(notice_id);

create or replace function record_rfp_file_revision()
returns trigger
language plpgsql
as $$
begin
  if new.rfp_file_path is distinct from old.rfp_file_path
    or new.rfp_file_name is distinct from old.rfp_file_name
    or new.rfp_file_size is distinct from old.rfp_file_size then
    insert into rfp_file_revisions (
      notice_id,
      file_path,
      file_name,
      file_size,
      uploaded_at,
      replaced_at
    )
    values (
      old.id,
      old.rfp_file_path,
      old.rfp_file_name,
      old.rfp_file_size,
      old.updated_at,
      now()
    );
  end if;

  return new;
end;
$$;

drop trigger if exists record_rfp_file_revision on bid_notices;
create trigger record_rfp_file_revision
before update of rfp_file_path, rfp_file_name, rfp_file_size on bid_notices
for each row
execute function record_rfp_file_revision();

create or replace function record_proposal_file_revision()
returns trigger
language plpgsql
as $$
begin
  if new.file_path is distinct from old.file_path
    or new.file_name is distinct from old.file_name
    or new.file_size is distinct from old.file_size then
    insert into proposal_file_revisions (
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

drop trigger if exists record_proposal_file_revision on proposals;
create trigger record_proposal_file_revision
before update of file_path, file_name, file_size on proposals
for each row
execute function record_proposal_file_revision();

create or replace function validate_evaluation_write()
returns trigger
language plpgsql
as $$
declare
  proposal_notice_id uuid;
  notice_deadline_at timestamptz;
  notice_result_notified_at timestamptz;
  evaluator_role text;
begin
  select proposal.notice_id, notice.deadline_at, notice.result_notified_at
    into proposal_notice_id, notice_deadline_at, notice_result_notified_at
  from proposals proposal
  join bid_notices notice on notice.id = proposal.notice_id
  where proposal.id = new.proposal_id;

  select role
    into evaluator_role
  from app_users
  where id = new.evaluator_id;

  if evaluator_role <> 'operator' then
    raise exception 'only operators can write evaluations';
  end if;

  if proposal_notice_id is null then
    raise exception 'evaluation proposal must exist';
  end if;

  if new.notice_id <> proposal_notice_id then
    raise exception 'evaluation notice_id must match proposal.notice_id';
  end if;

  if not (notice_deadline_at <= now()) then
    raise exception 'deadline_at must pass before evaluations can be written';
  end if;

  if notice_result_notified_at is not null then
    raise exception 'result_notified_at prevents evaluation changes';
  end if;

  return new;
end;
$$;

drop trigger if exists validate_evaluation_write on evaluations;
create trigger validate_evaluation_write
before insert or update on evaluations
for each row
execute function validate_evaluation_write();

create or replace function validate_notice_update()
returns trigger
language plpgsql
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
    new.title is distinct from old.title
    or new.category is distinct from old.category
    or new.summary is distinct from old.summary
    or new.starts_at is distinct from old.starts_at
    or new.deadline_at is distinct from old.deadline_at
    or new.status is distinct from old.status
    or new.rfp_file_path is distinct from old.rfp_file_path
    or new.rfp_file_name is distinct from old.rfp_file_name
    or new.rfp_file_size is distinct from old.rfp_file_size
    or new.created_by is distinct from old.created_by
    or new.preferred_proposal_id is distinct from old.preferred_proposal_id
    or new.result_notified_at is distinct from old.result_notified_at
  ) then
    raise exception 'result_notified_at locks notice changes';
  end if;

  if new.starts_at is distinct from old.starts_at then
    raise exception 'starts_at cannot change after notice creation';
  end if;

  if new.deadline_at is distinct from old.deadline_at then
    if old.deadline_at <= now() then
      raise exception 'deadline_at cannot change after the original deadline has passed';
    end if;

    if new.deadline_at < old.deadline_at then
      raise exception 'deadline_at cannot be shortened';
    end if;
  end if;

  if old.result_notified_at is not null and (
    new.preferred_proposal_id is distinct from old.preferred_proposal_id
    or new.result_notified_at is distinct from old.result_notified_at
  ) then
    raise exception 'result_notified_at locks preferred proposal changes';
  end if;

  if new.preferred_proposal_id is distinct from old.preferred_proposal_id
    and new.preferred_proposal_id is not null then
    if not (new.deadline_at <= now()) then
      raise exception 'deadline_at must pass before preferred_proposal_id can change';
    end if;

    select proposal.notice_id
      into preferred_notice_id
    from proposals proposal
    where proposal.id = new.preferred_proposal_id;

    if preferred_notice_id is distinct from new.id then
      raise exception 'preferred proposal.notice_id must match bid notice';
    end if;

    if exists (
      select 1
      from proposals proposal
      where proposal.notice_id = new.id
        and proposal.status = 'submitted'
        and not exists (
          select 1
          from evaluations evaluation
          where evaluation.proposal_id = proposal.id
        )
    ) then
      raise exception 'all submitted proposals need evaluations before preferred proposal changes';
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

drop trigger if exists validate_notice_update on bid_notices;
create trigger validate_notice_update
before insert or update on bid_notices
for each row
execute function validate_notice_update();

create or replace function validate_proposal_update()
returns trigger
language plpgsql
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
  from bid_notices notice
  where notice.id = new.notice_id;

  if notice_deadline_at is null then
    raise exception 'proposal notice must exist';
  end if;

  if file_changed then
    if status_changed or old.status <> 'submitted' or new.status <> 'submitted' then
      raise exception 'proposal file replacement must keep submitted status';
    end if;

    if notice_status <> 'published'
      or notice_starts_at > now()
      or notice_deadline_at <= now()
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

  if not (notice_deadline_at <= now()) then
    raise exception 'deadline_at must pass before proposal result updates';
  end if;

  if notice_result_notified_at is not null then
    raise exception 'result_notified_at prevents proposal result updates';
  end if;

  if exists (
    select 1
    from proposals proposal
    where proposal.notice_id = new.notice_id
      and proposal.status = 'submitted'
      and not exists (
        select 1
        from evaluations evaluation
        where evaluation.proposal_id = proposal.id
      )
  ) then
    raise exception 'all submitted proposals need evaluations before proposal result updates';
  end if;

  return new;
end;
$$;

drop trigger if exists validate_proposal_update on proposals;
create trigger validate_proposal_update
before update on proposals
for each row
execute function validate_proposal_update();

create or replace view expired_supplier_accounts as
select
  id,
  email,
  company_name,
  login_expires_at
from app_users
where role = 'supplier'
  and deleted_at is null
  and login_expires_at is not null
  and login_expires_at <= now();

create or replace function mark_expired_supplier_accounts_deleted()
returns table(id uuid, email text)
language sql
as $$
  update app_users
  set
    deleted_at = now(),
    updated_at = now(),
    password_hash = null,
    email = concat('deleted+', id::text, '@expired.local'),
    name = '삭제된 입찰자 계정'
  where role = 'supplier'
    and deleted_at is null
    and login_expires_at is not null
    and login_expires_at <= now()
  returning id, email;
$$;
