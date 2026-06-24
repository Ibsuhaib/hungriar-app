import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase environment variables. Copy .env.example to .env and set ' +
      'VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.',
  )
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: 'goana-ar-auth',
  },
})

/**
 * Invokes a Supabase Edge Function and normalises error handling so callers
 * get a plain Error with the server-provided message (instead of having to
 * unwrap supabase-js's FunctionsHttpError manually).
 */
export async function invokeEdgeFunction(name, body, options = {}) {
  const { data, error } = await supabase.functions.invoke(name, { body, ...options })

  if (error) {
    let message = error.message || 'Request failed. Please try again.'
    let status

    try {
      const context = error.context
      status = context?.status
      if (context && typeof context.json === 'function') {
        const parsed = await context.json()
        if (parsed?.error) message = parsed.error
      }
    } catch {
      // response body wasn't JSON - keep default message
    }

    const wrapped = new Error(message)
    wrapped.status = status
    throw wrapped
  }

  return data
}
