// Cloudflare Pages Function — el comprador califica al vendedor (1-5 estrellas).
// Seguridad: requiere el rating_token secreto de la orden (viaja solo en la URL
// de retorno del pago), la orden debe estar pagada y solo se puede calificar una vez.
export async function onRequestPost({ request, env }) {
  const SUPA = env.SUPABASE_URL;
  const KEY = env.SUPABASE_SERVICE_ROLE_KEY;

  const { order_id, token, stars, comment } = await request.json().catch(() => ({}));
  const n = Number(stars);
  if (!order_id || !token || !Number.isInteger(n) || n < 1 || n > 5) {
    return json({ error: "Datos inválidos" }, 400);
  }

  // Orden válida, pagada y con token correcto
  const ords = await fetch(
    `${SUPA}/rest/v1/orders?id=eq.${order_id}&select=id,seller_id,status,rating_token`,
    { headers: hdrs(KEY) }
  ).then((r) => r.json());
  const order = ords[0];
  if (!order || order.rating_token !== token) return json({ error: "Orden no encontrada" }, 404);
  if (order.status !== "pagada") {
    return json({ error: "El pago todavía se está confirmando. Probá de nuevo en unos minutos." }, 409);
  }

  // Insertar (la restricción unique impide calificar dos veces)
  const ins = await fetch(`${SUPA}/rest/v1/ratings`, {
    method: "POST",
    headers: { ...hdrs(KEY), Prefer: "return=minimal" },
    body: JSON.stringify({
      order_id: order.id,
      seller_id: order.seller_id,
      stars: n,
      comment: (comment || "").slice(0, 300) || null,
    }),
  });
  if (ins.status === 409) return json({ error: "Esta compra ya fue calificada" }, 409);
  if (!ins.ok) return json({ error: "No se pudo guardar la calificación" }, 500);

  return json({ ok: true });
}

const hdrs = (KEY) => ({
  apikey: KEY,
  Authorization: `Bearer ${KEY}`,
  "Content-Type": "application/json",
});
const json = (b, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });
