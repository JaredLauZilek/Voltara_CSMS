// Drivers are reached only through security-definer functions: auth.users is
// not readable from the browser, and an operator may only look accounts up by
// exact email or phone.
import { supabase } from '@/shared/lib/supabase';
import type { Driver, DriverTag } from './types';

export async function listDrivers(): Promise<Driver[]> {
  const { data, error } = await supabase.rpc('admin_list_drivers');
  if (error) throw error;
  return (data ?? []).map((d) => ({
    ...d,
    tags: (d.tags as unknown as DriverTag[]) ?? [],
    group_ids: d.group_ids ?? [],
  }));
}

/** Attach the account behind an email or phone to a company and/or a whitelist. */
export async function addDriver(
  contact: string,
  target: { billingAccountId?: string; driverGroupId?: string },
): Promise<string> {
  const { data, error } = await supabase.rpc('admin_add_driver', {
    p_contact: contact,
    p_billing_account_id: target.billingAccountId,
    p_driver_group_id: target.driverGroupId,
  });
  if (error) throw error;
  return data as string;
}
