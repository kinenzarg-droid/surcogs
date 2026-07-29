// Inicia la conexión de Mercado Pago del vendedor (OAuth).
// Se llama recién cuando el vendedor decide activar el pago online.
const SUPA = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SITE = process.env.SITE_URL; // ej: https://surcogs.netlify.app

export default async (req) => {
  const auth = req.headers.get("authorization") || "";
  if (!auth.startsWith("Bearer ")) return json({ error: "No autorizado" }, 401);

  // Verificar el usuario con su token de Supabase
  const u = await fetch(`${SUPA}/auth/v1/user`, {
    headers: { apikey: KEY, Authorization: auth },
  });
  if (!u.ok) return json({ error: "Sesión inválida" }, 401);
  const user = await u.json();

  // A dónde volver después de conectar (solo rutas internas)
  let next = new URL(req.url).searchParams.get("next") || "/cuenta.html";
  if (!next.startsWith("/")) next = "/cuenta.html";

  // Guardar state anti-CSRF
  const state = crypto.randomUUID();
  const ins = await fetch(`${SUPA}/rest/v1/mp_oauth_states`, {
    method: "POST",
    headers: hdrs(),
    body: JSON.stringify({ state, user_id: user.id, next }),
  });
  if (!ins.ok) return json({ error: "No se pudo iniciar la conexión" }, 500);

  const url =
    `https://auth.mercadopago.com.ar/authorization` +
    `?client_id=${process.env.MP_CLIENT_ID}` +
    `&response_type=code&platform_id=mp` +
    `&state=${state}` +
    `&redirect_uri=${encodeURIComponent(SITE + "/.netlify/functions/mp-oauth-callback")}`;
  return json({ url });
};

const hdrs = () => ({
  apikey: KEY,
  Authorization: `Bearer ${KEY}`,
  "Content-Type": "application/json",
  Prefer: "return=minimal",
});
const json = (b, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });
