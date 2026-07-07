// Stateless Realtime broadcast over the REST endpoint — no websocket needed
// inside an edge function. Failures are non-fatal: clients also poll/refetch.
// Used by the hungriOrder online-ordering functions (order tracking page).

export async function broadcast(
  topic: string,
  event: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const url = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  try {
    await fetch(`${url}/realtime/v1/api/broadcast`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({ messages: [{ topic, event, payload }] }),
    })
  } catch (err) {
    console.error('broadcast failed', topic, event, err)
  }
}
