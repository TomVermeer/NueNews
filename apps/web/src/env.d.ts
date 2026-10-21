/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Set both to turn on login. Leave them out to run without one (local development). */
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
