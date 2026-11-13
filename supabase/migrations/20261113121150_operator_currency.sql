-- An operator's money is always in its country's currency.
--
-- Tariffs, charging records and documents carried a column default of 'MYR',
-- so a Singapore operator's tariff would have been priced in ringgit unless
-- every writer remembered to say otherwise. The currency is now stamped from
-- the operator's country on insert, whatever the writer sent.

create function public.country_currency(p_country text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_country when 'SG' then 'SGD' else 'MYR' end;
$$;

create function public.stamp_tenant_currency()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.currency := coalesce(
    (select public.country_currency(t.country) from public.tenants t where t.id = new.tenant_id),
    new.currency
  );
  return new;
end;
$$;

create trigger tariffs_tenant_currency before insert on public.tariffs
  for each row execute function public.stamp_tenant_currency();
create trigger cdrs_tenant_currency before insert on public.cdrs
  for each row execute function public.stamp_tenant_currency();
create trigger documents_tenant_currency before insert on public.documents
  for each row execute function public.stamp_tenant_currency();

create function public.stamp_tenant_default_currency()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.default_currency := coalesce(
    (select public.country_currency(t.country) from public.tenants t where t.id = new.tenant_id),
    new.default_currency
  );
  return new;
end;
$$;

create trigger tenant_settings_default_currency
  before insert or update of default_currency on public.tenant_settings
  for each row execute function public.stamp_tenant_default_currency();
