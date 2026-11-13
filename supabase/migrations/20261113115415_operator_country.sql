-- Every operator belongs to one country, decided by the platform when the
-- operator account is created and never changed afterwards.
--
-- One backend serves every country (CLAUDE.md §13): an operator that trades in
-- two countries is two operator accounts, one per legal entity. The country
-- fixes the currency, the tax regime, the business-registration vocabulary
-- and, later, which payment account takes the money. A sub-operator (future)
-- inherits its parent's country.

alter table public.tenants
  add column country text not null default 'MY' check (country in ('MY', 'SG'));

comment on column public.tenants.country is
  'ISO 3166-1 alpha-2 country the operator trades in. Set at creation by the platform; immutable.';

create function public.tenants_country_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.country is distinct from old.country then
    raise exception 'An operator''s country is fixed when the account is created'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger tenants_country_immutable
  before update of country on public.tenants
  for each row execute function public.tenants_country_immutable();

-- ── A site is always in its operator's country ──────────────────────────────
create function public.locations_inherit_country()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_country text;
begin
  select t.country into v_country from public.tenants t where t.id = new.tenant_id;
  new.country := coalesce(v_country, new.country);
  if new.country = 'SG' then
    new.timezone := 'Asia/Singapore';
    new.state := null; -- Singapore has no states
  end if;
  return new;
end;
$$;

create trigger locations_inherit_country
  before insert or update of country, timezone, state, tenant_id on public.locations
  for each row execute function public.locations_inherit_country();

-- ── The country travels in the session token ────────────────────────────────
-- Screens need it for labels and currency; it is read from the membership's
-- tenant by the same hook that supplies tenant_id, never from user_metadata.
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  claims jsonb;
  m record;
  is_pa boolean;
begin
  claims := coalesce(event -> 'claims', '{}'::jsonb);
  if claims -> 'app_metadata' is null then
    claims := jsonb_set(claims, '{app_metadata}', '{}'::jsonb);
  end if;

  select ms.tenant_id, ms.role, t.country into m
  from public.memberships ms
  join public.tenants t on t.id = ms.tenant_id
  where ms.user_id = (event ->> 'user_id')::uuid
  order by ms.created_at asc
  limit 1;

  if found then
    claims := jsonb_set(claims, '{app_metadata,tenant_id}', to_jsonb(m.tenant_id::text));
    claims := jsonb_set(claims, '{app_metadata,tenant_role}', to_jsonb(m.role));
    claims := jsonb_set(claims, '{app_metadata,tenant_country}', to_jsonb(m.country));
  end if;

  select exists (
    select 1 from public.platform_admins pa where pa.user_id = (event ->> 'user_id')::uuid
  ) into is_pa;

  if is_pa then
    claims := jsonb_set(claims, '{app_metadata,platform_admin}', 'true'::jsonb);
  end if;

  return jsonb_set(event, '{claims}', claims);
end;
$$;

grant select on table public.tenants to supabase_auth_admin;
create policy tenants_auth_admin_read on public.tenants
  for select to supabase_auth_admin using (true);
