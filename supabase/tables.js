import { supabase } from './client.js';

export async function listTables(restaurantId) {
  return supabase
    .from('tables')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .order('table_number', { ascending: true })
    .order('name', { ascending: true });
}

export async function insertTable(restaurantId, { name, table_number }) {
  const parsedNumber = Number.parseInt(table_number, 10);
  const payload = {
    restaurant_id: restaurantId,
    name: String(name || '').trim(),
    table_number: Number.isFinite(parsedNumber) ? parsedNumber : null,
  };
  return supabase
    .from('tables')
    .insert(payload)
    .select()
    .single();
}

