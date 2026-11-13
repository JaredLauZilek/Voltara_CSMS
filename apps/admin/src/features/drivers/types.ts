// A driver is an app account (signed up in the driver app). Operators see
// only the accounts already attached to them, and add more by email or phone.

export interface DriverTag {
  id: string;
  tag: string;
  kind: 'rfid' | 'virtual' | 'mac' | 'vehicle';
  status: string;
  label: string | null;
}

export interface Driver {
  user_id: string;
  email: string | null;
  phone: string | null;
  display_name: string | null;
  /** The company billed for this account's charging, if any (one per account). */
  billing_account_id: string | null;
  tags: DriverTag[];
  group_ids: string[];
}

/** 'Aina Rahman', else the email, else the phone. */
export function driverName(d: Pick<Driver, 'display_name' | 'email' | 'phone'>): string {
  return d.display_name || d.email || d.phone || 'Driver';
}
