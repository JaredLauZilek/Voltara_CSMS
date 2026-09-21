// The ONLY place `supabase.from('driver_groups' | 'driver_group_members')` may appear.
import { supabase } from '@/shared/lib/supabase';
import type {
  DriverGroup,
  DriverGroupInsert,
  DriverGroupWithCount,
  MemberWithNames,
} from './types';

export async function listGroups(): Promise<DriverGroupWithCount[]> {
  const { data, error } = await supabase
    .from('driver_groups')
    .select('*, driver_group_members(count)')
    .order('name');
  if (error) throw error;
  return (data ?? []).map((row) => {
    const { driver_group_members, ...g } = row as unknown as DriverGroup & {
      driver_group_members: { count: number }[];
    };
    return { ...g, member_count: driver_group_members?.[0]?.count ?? 0 };
  });
}

export async function listMembers(groupId: string): Promise<MemberWithNames[]> {
  const { data, error } = await supabase
    .from('driver_group_members')
    .select('*, id_tags(tag, label), billing_accounts(name)')
    .eq('driver_group_id', groupId)
    .order('created_at');
  if (error) throw error;
  return (data ?? []).map((row) => {
    const { id_tags, billing_accounts, ...m } = row as unknown as MemberWithNames & {
      id_tags: { tag: string; label: string | null } | null;
      billing_accounts: { name: string } | null;
    };
    return {
      ...m,
      tag: id_tags?.tag ?? null,
      tag_label: id_tags?.label ?? null,
      account_name: billing_accounts?.name ?? null,
    };
  });
}

export async function createGroup(row: DriverGroupInsert): Promise<DriverGroup> {
  const { data, error } = await supabase.from('driver_groups').insert(row).select().single();
  if (error) throw error;
  return data;
}

export async function updateGroup(
  id: string,
  patch: Partial<DriverGroupInsert>,
): Promise<DriverGroup> {
  const { data, error } = await supabase
    .from('driver_groups')
    .update(patch)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteGroup(id: string): Promise<void> {
  const { error } = await supabase.from('driver_groups').delete().eq('id', id);
  if (error) throw error;
}

export async function addMember(
  tenantId: string,
  groupId: string,
  member: { id_tag_id?: string; billing_account_id?: string },
): Promise<void> {
  const { error } = await supabase
    .from('driver_group_members')
    .insert({ tenant_id: tenantId, driver_group_id: groupId, ...member });
  if (error) throw error;
}

export async function removeMember(id: string): Promise<void> {
  const { error } = await supabase.from('driver_group_members').delete().eq('id', id);
  if (error) throw error;
}
