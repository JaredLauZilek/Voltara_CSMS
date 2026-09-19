// The ONLY place `supabase.from('issues')` may appear.
import { supabase } from '@/shared/lib/supabase';
import type { Issue, IssueInsert, IssueUpdate, IssueWithChargePoint } from './types';

const SELECT = '*, charge_points(name, ocpp_identity)';

function flatten(
  row: Issue & { charge_points?: { name: string; ocpp_identity: string } | null },
): IssueWithChargePoint {
  const { charge_points, ...issue } = row;
  return {
    ...(issue as Issue),
    charge_point_name: charge_points?.name ?? null,
    charge_point_identity: charge_points?.ocpp_identity ?? null,
  };
}

export async function listIssues(): Promise<IssueWithChargePoint[]> {
  const { data, error } = await supabase
    .from('issues')
    .select(SELECT)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => flatten(r as Parameters<typeof flatten>[0]));
}

export async function listIssuesForChargePoint(
  chargePointId: string,
): Promise<IssueWithChargePoint[]> {
  const { data, error } = await supabase
    .from('issues')
    .select(SELECT)
    .eq('charge_point_id', chargePointId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => flatten(r as Parameters<typeof flatten>[0]));
}

export async function createIssue(row: IssueInsert): Promise<Issue> {
  const { data, error } = await supabase.from('issues').insert(row).select().single();
  if (error) throw error;
  return data;
}

export async function updateIssue(id: string, patch: IssueUpdate): Promise<Issue> {
  const { data, error } = await supabase
    .from('issues')
    .update(patch)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteIssue(id: string): Promise<void> {
  const { error } = await supabase.from('issues').delete().eq('id', id);
  if (error) throw error;
}
