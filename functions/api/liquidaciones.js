// Panel de liquidaciones — qué le tengo que transferir a cada vendedor.
// Protegido por ADMIN_KEY. Lee la vista liquidaciones_pendientes.
import { notificar } from "./_notificar.js";

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  if (url.searchParams.get("key") !== env.ADMIN_KEY) return json({ error: "no autorizado" }, 401);

  const pend = await sel(env, "liquidaciones_pendientes", "select=*&order=entregado_at.asc");
  const listas = await sel(env, "orders",
    "liquidado_at=not.is.null&select=id,monto_vendedor,liquidado_at,seller_id&order=liquidado_at.desc&limit=20");

  return json({
    liberables: (pend || []).filter((o) => o.liberable),
    esperando: (pend || []).filter((o) => !o.liberable),
    liquidadas: listas || [],
  });
}

export async function onRequestPost({ request, env }) {
  const b = await request.json().catch(() => ({}));
  if (b.key !== env.ADMIN_KEY) return json({ error: "no autorizado" }, 401);
  if (!b.id) return json({ error: "falta la orden" }, 400);

  const [orden] = await sel(env, "orders", `id=eq.${b.id}&select=seller_id,monto_vendedor`);
  await fetch(`${env.SUPABASE_URL}/rest/v1/orders?id=eq.${b.id}`, {
    method: "PATCH",
    headers: H(env),
    body: JSON.stringify({ liquidado_at: new Date().toISOString() }),
  });
  if (orden) await notificar(env, {
    user_id: orden.seller_id,
    tipo: "pago",
    titulo: `Te transferimos ${Number(orden.monto_vendedor || 0).toLocaleString("es-AR")}`,
    detalle: "Ya salió a tu alias. Puede tardar unos minutos en impactar.",
    link: "/cuenta.html#ventas",
  });
  return json({ ok: true });
}

const H = (env) => ({
  apikey: env.SUPABASE_SERVICE_ROLE_KEY,
  Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
  "Content-Type": "application/json",
});
const sel = (env, tabla, q) =>
  fetch(`${env.SUPABASE_URL}/rest/v1/${tabla}?${q}`, { headers: H(env) }).then((r) => r.json());
const json = (b, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });
