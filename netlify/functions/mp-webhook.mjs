// Webhook de Mercado Pago: cuando el pago se aprueba,
// marca la orden como pagada y el disco como vendido.
const SUPA = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export default async (req) => {
  const ok = new Response("ok", { status: 200 }); // siempre 200 para que MP no reintente infinito
  try {
    const url = new URL(req.url);
    const orderId = url.searchParams.get("order");
    const body = await req.json().catch(() => ({}));
    const paymentId = body?.data?.id || url.searchParams.get("data.id");
    if (!orderId || !paymentId) return ok;

    // Orden → vendedor → su token de MP
    const ords = await fetch(
      `${SUPA}/rest/v1/orders?id=eq.${orderId}&select=id,seller_id,record_id,status`,
      { headers: hdrs() }
    ).then((r) => r.json());
    const order = ords[0];
    if (!order || order.status === "pagada") return ok;

    const toks = await fetch(
      `${SUPA}/rest/v1/mp_tokens?user_id=eq.${order.seller_id}&select=access_token`,
      { headers: hdrs() }
    ).then((r) => r.json());
    if (!toks.length) return ok;

    // Consultar el pago real en MP (nunca confiar solo en el webhook)
    const pay = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { Authorization: `Bearer ${toks[0].access_token}` },
    }).then((r) => r.json());

    if (pay.status === "approved" && String(pay.external_reference) === String(order.id)) {
      await fetch(`${SUPA}/rest/v1/orders?id=eq.${order.id}`, {
        method: "PATCH", headers: hdrs(),
        body: JSON.stringify({ status: "pagada", mp_payment_id: String(paymentId) }),
      });
      await fetch(`${SUPA}/rest/v1/records?id=eq.${order.record_id}`, {
        method: "PATCH", headers: hdrs(),
        body: JSON.stringify({ status: "vendido" }),
      });
    }
    return ok;
  } catch {
    return ok;
  }
};

const hdrs = () => ({
  apikey: KEY,
  Authorization: `Bearer ${KEY}`,
  "Content-Type": "application/json",
});
