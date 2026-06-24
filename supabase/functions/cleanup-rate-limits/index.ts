import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'
import { corsHeaders } from '../_shared/cors.ts'
import { jsonResponse } from '../_shared/utils.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const CRON_SECRET = Deno.env.get('CRON_SECRET')

/**
 * Deletes stale rate_limits / admin_sessions rows.
 * Intended to be invoked once a day by Supabase's pg_cron (via
 * `supabase.functions.invoke` from a cron job) or any external scheduler.
 *
 * If CRON_SECRET is set, the caller must send it in the `x-cron-secret`
 * header - this prevents random clients from triggering it repeatedly.
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  if (CRON_SECRET) {
    const provided = req.headers.get('x-cron-secret')
    if (provided !== CRON_SECRET) {
      return jsonResponse({ error: 'Unauthorized' }, 401)
    }
  }

  try {
    const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
    const { error } = await supabaseAdmin.rpc('cleanup_rate_limits')

    if (error) {
      console.error('cleanup_rate_limits error', error)
      return jsonResponse({ error: 'Cleanup failed' }, 500)
    }

    return jsonResponse({ success: true, ranAt: new Date().toISOString() })
  } catch (err) {
    console.error('cleanup-rate-limits error', err)
    return jsonResponse({ error: 'Internal server error' }, 500)
  }
})
