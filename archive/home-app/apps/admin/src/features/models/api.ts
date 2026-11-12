// The ONLY place supabase.from('charger_models' | 'firmware_releases') appears
// for this feature (CLAUDE.md §4). Writes are policy-gated: models by staff
// admins, firmware by staff support.
import { supabase } from '@/shared/lib/supabase';
import type {
  ChargerModel,
  ChargerModelInsert,
  ChargerModelUpdate,
  FirmwareRelease,
  FirmwareReleaseInsert,
} from './types';

export async function listModels(): Promise<ChargerModel[]> {
  const { data, error } = await supabase
    .from('charger_models')
    .select('*')
    .order('brand')
    .order('model');
  if (error) throw error;
  return data ?? [];
}

export async function createModel(row: ChargerModelInsert): Promise<ChargerModel> {
  const { data, error } = await supabase.from('charger_models').insert(row).select().single();
  if (error) throw error;
  return data;
}

export async function updateModel(id: string, patch: ChargerModelUpdate): Promise<ChargerModel> {
  const { data, error } = await supabase
    .from('charger_models')
    .update(patch)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function listFirmware(modelId: string): Promise<FirmwareRelease[]> {
  const { data, error } = await supabase
    .from('firmware_releases')
    .select('*')
    .eq('model_id', modelId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function createFirmware(row: FirmwareReleaseInsert): Promise<FirmwareRelease> {
  const { data, error } = await supabase.from('firmware_releases').insert(row).select().single();
  if (error) throw error;
  return data;
}
