-- Which configuration keys the charger reports as read-only.
--
-- GetConfiguration answers each key with a `readonly` flag; until now the
-- gateway kept only the value, so the admin offered Edit on keys the charger
-- will always refuse to change (NumberOfConnectors, SupportedFeatureProfiles…).
-- Written by the gateway alongside `config` (CLAUDE.md §6). Null means the
-- snapshot predates this column — the UI then treats every key as editable,
-- as before. Covered by the existing charge_points RLS policies.

alter table public.charge_points add column config_readonly text[];

comment on column public.charge_points.config_readonly is
  'Configuration keys the charger reported readonly in its last GetConfiguration; null = unknown.';
