import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Without env vars (e.g. dev fixtures mode) createClient throws at import
// time and takes down every route that imports this module. In that case
// export a stand-in that only throws (the same createClient error) when a
// client is actually used. With env vars present, behavior is unchanged.
function createClientOrDeferError(url?: string, key?: string): SupabaseClient {
  if (url && key) return createClient(url, key);
  return new Proxy({} as SupabaseClient, {
    get(_target, prop) {
      if (typeof prop === "symbol" || prop === "then") return undefined;
      return createClient(url!, key!);
    },
  });
}

// Client-side (componentes)
export const supabase = createClientOrDeferError(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// Server-side (API Routes / Server Actions)
export const supabaseAdmin = createClientOrDeferError(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
