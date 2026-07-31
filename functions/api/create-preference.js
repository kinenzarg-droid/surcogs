// Cloudflare Pages Function — genera el checkout de Mercado Pago con split de comisión.
// records.price = lo que RECIBE el vendedor. El comprador paga precio con comisiones.
// Comisión: 0% primeros 30 días del vendedor, después 10%. Debe coincidir con app.js.
const COMISION = 0.10;
const DIAS_GRATIS = 30;
const TASA_MP = 0.0761; // estimado Checkout Pro liberación inmediata (6,29% + IVA)

export async function onRequestPost({ request, env }) {
  const SUPA = env.SUPABASE_URL;
  const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
  const SITE = env.SITE_URL;

  const { record_id, buyer_email } = await request.json().catch(() => ({}));
  if (!record_id) return json({ error: "Falta el disco" }, 400);

  // Disco + perfil del vendedor
  const recs = await fetch(
    `${SUPA}/rest/v1/records?id=eq.${record_id}&select=*,profiles!records_seller_id_fkey(created_at)`,
    { headers: hdrs(KEY) }
  ).then((r) => r.json());
  const rec = recs[0];
  if (!rec) return json({ error: "Disco no encontrado" }, 404);
  if (rec.status !== "disponible") return json({ error: "Este disco ya no está disponible" }, 409);

  // Token de MP del vendedor
  const toks = await fetch(
    `${SUPA}/rest/v1/mp_tokens?user_id=eq.${rec.seller_id}&select=access_token`,
    { headers: hdrs(KEY) }
  ).then((r) => r.json());
  if (!toks.length) return json({ error: "El vendedor todavía no activó el pago online" }, 409);

  // Precio final para el comprador (neto del vendedor + comisiones)
  const precioFinal = Math.round(rec.price / (1 - TASA_MP - COMISION));

  // Comisión según antigüedad del vendedor (en promo el vendedor se lleva el 10% de más)
  const alta = new Date(rec.profiles.created_at).getTime();
  const enPromo = Date.now() - alta < DIAS_GRATIS * 86400000;
  const fee = enPromo ? 0 : Math.round(precioFinal * COMISION);

  // Crear orden pendiente
  const ord = await fetch(`${SUPA}/rest/v1/orders`, {
    method: "POST",
    headers: { ...hdrs(KEY), Prefer: "return=representation" },
    body: JSON.stringify({
      record_id: rec.id,
      seller_id: rec.seller_id,
      buyer_email: buyer_email || null,
      amount: precioFinal,
      fee,
    }),
  }).then((r) => r.json());
  const orderId = ord[0]?.id;
  if (!orderId) return json({ error: "No se pudo crear la orden" }, 500);

  // Preferencia de pago con el token DEL VENDEDOR + marketplace_fee para SURCOGS
  const pref = await fetch("https://api.mercadopago.com/checkout/preferences", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${toks[0].access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      items: [{
        title: `${rec.artist} – ${rec.title} (vinilo)`,
        quantity: 1,
        unit_price: precioFinal,
        currency_id: "ARS",
      }],
      marketplace_fee: fee,
      payer: buyer_email ? { email: buyer_email } : undefined,
      external_reference: orderId,
      back_urls: {
        success: `${SITE}/disco.html?id=${rec.id}&pago=ok`,
        failure: `${SITE}/disco.html?id=${rec.id}&pago=error`,
        pending: `${SITE}/disco.html?id=${rec.id}&pago=ok`,
      },
      auto_return: "approved",
      notification_url: `${SITE}/api/mp-webhook?order=${orderId}`,
    }),
  }).then((r) => r.json());

  if (!pref.init_point) {
    return json({ error: pref.message || "Mercado Pago rechazó la operación" }, 502);
  }
  return json({ init_point: pref.init_point, fee });
}

const hdrs = (KEY) => ({
  apikey: KEY,
  Authorization: `Bearer ${KEY}`,
  "Content-Type": "application/json",
});
const json = (b, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });
