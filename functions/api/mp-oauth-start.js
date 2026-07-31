// Cloudflare Pages Function — inicia la conexión de Mercado Pago del vendedor (OAuth).
export async function onRequestGet({ request, env }) {
  const SUPA = env.SUPABASE_URL;
  const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
  const SITE = env.SITE_URL;

  const auth = request.headers.get("authorization") || "";
  if (!auth.startsWith("Bearer ")) return json({ error: "No autorizado" }, 401);

  // Verificar el usuario con su token de Supabase
  const u = await fetch(`${SUPA}/auth/v1/user`, {
    headers: { apikey: KEY, Authorization: auth },
  });
  if (!u.ok) return json({ error: "Sesión inválida" }, 401);
  const user = await u.json();

  // A dónde volver después de conectar (solo rutas internas)
  let next = new URL(request.url).searchParams.get("next") || "/cuenta.html";
  if (!next.startsWith("/")) next = "/cuenta.html";

  // Guardar state anti-CSRF
  const state = crypto.randomUUID();
  const ins = await fetch(`${SUPA}/rest/v1/mp_oauth_states`, {
    method: "POST",
    headers: { ...hdrs(KEY), Prefer: "return=minimal" },
    body: JSON.stringify({ state, user_id: user.id, next }),
  });
  if (!ins.ok) return json({ error: "No se pudo iniciar la conexión" }, 500);

  const url =
    `https://auth.mercadopago.com.ar/authorization` +
    `?client_id=${env.MP_CLIENT_ID}` +
    `&response_type=code&platform_id=mp` +
    `&state=${state}` +
    `&redirect_uri=${encodeURIComponent(SITE + "/api/mp-oauth-callback")}`;
  return json({ url });
}

const hdrs = (KEY) => ({
  apikey: KEY,
  Authorization: `Bearer ${KEY}`,
  "Content-Type": "application/json",
});
const json = (b, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });
