// Genera el checkout de Mercado Pago con split de comisión.
// Comisión: 0% si el vendedor está en sus primeros 30 días, después 15%.
const SUPA = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SITE = process.env.SITE_URL;
const COMISION = 0.15;
const DIAS_GRATIS = 30;

export default async (req) => {
  if (req.method !== "POST") return json({ error: "Método inválido" }, 405);
  const { record_id, buyer_email } = await req.json().catch(() => ({}));
  if (!record_id) return json({ error: "Falta el disco" }, 400);

  // Disco + perfil del vendedor
  const recs = await fetch(
    `${SUPA}/rest/v1/records?id=eq.${record_id}&select=*,profiles!records_seller_id_fkey(created_at)`,
    { headers: hdrs() }
  ).then((r) => r.json());
  const rec = recs[0];
  if (!rec) return json({ error: "Disco no encontrado" }, 404);
  if (rec.status !== "disponible") return json({ error: "Este disco ya no está disponible" }, 409);

  // Token de MP del vendedor
  const toks = await fetch(
    `${SUPA}/rest/v1/mp_tokens?user_id=eq.${rec.seller_id}&select=access_token`,
    { headers: hdrs() }
  ).then((r) => r.json());
  if (!toks.length) return json({ error: "El vendedor todavía no activó el pago online" }, 409);

  // Comisión según antigüedad del vendedor
  const alta = new Date(rec.profiles.created_at).getTime();
  const enPromo = Date.now() - alta < DIAS_GRATIS * 86400000;
  const fee = enPromo ? 0 : Math.round(rec.price * COMISION);

  // Crear orden pendiente
  const ord = await fetch(`${SUPA}/rest/v1/orders`, {
    method: "POST",
    headers: { ...hdrs(), Prefer: "return=representation" },
    body: JSON.stringify({
      record_id: rec.id,
      seller_id: rec.seller_id,
      buyer_email: buyer_email || null,
      amount: rec.price,
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
        unit_price: rec.price,
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
      notification_url: `${SITE}/.netlify/functions/mp-webhook?order=${orderId}`,
    }),
  }).then((r) => r.json());

  if (!pref.init_point) {
    return json({ error: pref.message || "Mercado Pago rechazó la operación" }, 502);
  }
  return json({ init_point: pref.init_point, fee });
};

const hdrs = () => ({
  apikey: KEY,
  Authorization: `Bearer ${KEY}`,
  "Content-Type": "application/json",
});
const json = (b, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });
