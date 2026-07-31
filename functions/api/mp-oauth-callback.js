// Cloudflare Pages Function — callback del OAuth de Mercado Pago: guarda el token del vendedor.
export async function onRequestGet({ request, env }) {
  const SUPA = env.SUPABASE_URL;
  const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
  const SITE = env.SITE_URL;

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  let next = "/cuenta.html";
  const back = (ok) => Response.redirect(`${SITE}${next}?mp=${ok ? "ok" : "error"}`, 302);
  if (!code || !state) return back(false);

  try {
    // Validar state → user_id
    const st = await fetch(
      `${SUPA}/rest/v1/mp_oauth_states?state=eq.${state}&select=user_id,next`,
      { headers: hdrs(KEY) }
    ).then((r) => r.json());
    if (!st.length) return back(false);
    const userId = st[0].user_id;
    if (st[0].next && st[0].next.startsWith("/")) next = st[0].next;
    await fetch(`${SUPA}/rest/v1/mp_oauth_states?state=eq.${state}`, {
      method: "DELETE", headers: hdrs(KEY),
    });

    // Canjear code por tokens
    const tok = await fetch("https://api.mercadopago.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: env.MP_CLIENT_ID,
        client_secret: env.MP_CLIENT_SECRET,
        grant_type: "authorization_code",
        code,
        redirect_uri: SITE + "/api/mp-oauth-callback",
      }),
    }).then((r) => r.json());
    if (!tok.access_token) return back(false);

    // Guardar tokens (solo service role puede leer esta tabla)
    await fetch(`${SUPA}/rest/v1/mp_tokens`, {
      method: "POST",
      headers: { ...hdrs(KEY), Prefer: "resolution=merge-duplicates" },
      body: JSON.stringify({
        user_id: userId,
        access_token: tok.access_token,
        refresh_token: tok.refresh_token || null,
        mp_user_id: String(tok.user_id || ""),
        updated_at: new Date().toISOString(),
      }),
    });

    // Marcar el perfil como conectado
    await fetch(`${SUPA}/rest/v1/profiles?id=eq.${userId}`, {
      method: "PATCH", headers: hdrs(KEY),
      body: JSON.stringify({ mp_connected: true }),
    });

    return back(true);
  } catch {
    return back(false);
  }
}

const hdrs = (KEY) => ({
  apikey: KEY,
  Authorization: `Bearer ${KEY}`,
  "Content-Type": "application/json",
});
