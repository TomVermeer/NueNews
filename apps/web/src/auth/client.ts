import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

/**
 * The Supabase client, or null when the app is not set up with a login (local development).
 * Both values are public by design: the anon key only identifies the project, it grants nothing.
 */
export const authClient: SupabaseClient | null = url && anonKey ? createClient(url, anonKey) : null

/** The current session's access token, refreshed by the client when it is about to expire. */
export async function accessToken(): Promise<string | undefined> {
  if (!authClient) return undefined
  const { data } = await authClient.auth.getSession()
  return data.session?.access_token
}
