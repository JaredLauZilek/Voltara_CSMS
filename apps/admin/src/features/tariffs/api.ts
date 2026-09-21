// The ONLY place `supabase.from('tariffs' | 'tariff_versions' | 'tariff_assignments' | 'tax_profiles')` may appear.
import { billing } from '@voltara/shared';
import { supabase } from '@/shared/lib/supabase';
import type {
  AssignmentWithNames,
  NewAssignmentInput,
  NewVersionInput,
  Tariff,
  TariffDetail,
  TariffInsert,
  TariffUpdate,
  TariffVersion,
  TariffWithLatest,
  TaxProfile,
  TaxProfileInsert,
} from './types';

export async function listTariffs(): Promise<TariffWithLatest[]> {
  const { data, error } = await supabase
    .from('tariffs')
    .select('*, tariff_versions(*), tariff_assignments(count)')
    .order('name');
  if (error) throw error;
  return (data ?? []).map((row) => {
    const { tariff_versions, tariff_assignments, ...tariff } = row as unknown as Tariff & {
      tariff_versions: TariffVersion[];
      tariff_assignments: { count: number }[];
    };
    const versions = [...(tariff_versions ?? [])].sort((a, b) => b.version - a.version);
    return {
      ...tariff,
      latest: versions[0] ?? null,
      version_count: versions.length,
      assignment_count: tariff_assignments?.[0]?.count ?? 0,
    };
  });
}

export async function getTariff(id: string): Promise<TariffDetail | null> {
  const { data, error } = await supabase
    .from('tariffs')
    .select(
      '*, tariff_versions(*), tariff_assignments(*, locations(name), charge_points(name, ocpp_identity), connectors(ocpp_connector_id, charge_points(name)), driver_groups(name))',
    )
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const { tariff_versions, tariff_assignments, ...tariff } = data as unknown as Tariff & {
    tariff_versions: TariffVersion[];
    tariff_assignments: (AssignmentWithNames & {
      locations: { name: string } | null;
      charge_points: { name: string; ocpp_identity: string } | null;
      connectors: { ocpp_connector_id: number; charge_points: { name: string } | null } | null;
      driver_groups: { name: string } | null;
    })[];
  };
  return {
    ...tariff,
    versions: [...(tariff_versions ?? [])].sort((a, b) => b.version - a.version),
    assignments: (tariff_assignments ?? [])
      .map(({ locations, charge_points, connectors, driver_groups, ...a }) => ({
        ...a,
        location_name: locations?.name ?? null,
        charge_point_name: charge_points?.name ?? connectors?.charge_points?.name ?? null,
        connector_label: connectors ? `Connector ${connectors.ocpp_connector_id}` : null,
        driver_group_name: driver_groups?.name ?? null,
      }))
      .sort((a, b) => (b.created_at > a.created_at ? 1 : -1)),
  };
}

export async function createTariff(row: TariffInsert): Promise<Tariff> {
  const { data, error } = await supabase.from('tariffs').insert(row).select().single();
  if (error) throw error;
  return data;
}

export async function updateTariff(id: string, patch: TariffUpdate): Promise<Tariff> {
  const { data, error } = await supabase
    .from('tariffs')
    .update(patch)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

/**
 * Versions are immutable and never deleted; the next one is numbered by the
 * database so two admins saving at once cannot collide.
 */
export async function createVersion(
  tenantId: string,
  userId: string,
  tariffId: string,
  input: NewVersionInput,
): Promise<TariffVersion> {
  // Validate our own shape before it reaches the check constraint.
  const elements = billing.parseTariffElements(input.elements);
  const { data: version, error: vErr } = await supabase.rpc('next_tariff_version', {
    p_tariff_id: tariffId,
  });
  if (vErr) throw vErr;
  const { data, error } = await supabase
    .from('tariff_versions')
    .insert({
      tenant_id: tenantId,
      tariff_id: tariffId,
      version: version ?? 1,
      elements: elements as never,
      tax_included: input.tax_included,
      tax_profile_id: input.tax_profile_id,
      min_price_sen: input.min_price_sen,
      max_price_sen: input.max_price_sen,
      display_text: input.display_text,
      created_by: userId,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function createAssignment(
  tenantId: string,
  tariffId: string,
  input: NewAssignmentInput,
): Promise<void> {
  const { error } = await supabase.from('tariff_assignments').insert({
    tenant_id: tenantId,
    tariff_id: tariffId,
    ...input,
  });
  if (error) throw error;
}

/** Ending an assignment keeps its history; deleting is for mistakes. */
export async function endAssignment(id: string): Promise<void> {
  const { error } = await supabase
    .from('tariff_assignments')
    .update({ valid_to: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

export async function deleteAssignment(id: string): Promise<void> {
  const { error } = await supabase.from('tariff_assignments').delete().eq('id', id);
  if (error) throw error;
}

// ── Tax profiles ────────────────────────────────────────────────────────────

export async function listTaxProfiles(): Promise<TaxProfile[]> {
  const { data, error } = await supabase
    .from('tax_profiles')
    .select('*')
    .order('is_default', { ascending: false })
    .order('name');
  if (error) throw error;
  return data ?? [];
}

export async function upsertTaxProfile(
  row: TaxProfileInsert & { id?: string },
): Promise<TaxProfile> {
  const { data, error } = await supabase.from('tax_profiles').upsert(row).select().single();
  if (error) throw error;
  return data;
}
