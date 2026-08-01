// Cloudflare Pages Function — webhook de Mercado Pago: al aprobarse el pago,
// marca como pagadas TODAS las órdenes de la compra y los discos como vendidos.
export async function onRequest({ request, env }) {
  const SUPA = env.SUPABASE_URL;
  const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
  const ok = new Response("ok", { status: 200 }); // siempre 200 para que MP no reintente infinito

  try {
    const url = new URL(request.url);
    const purchaseId = url.searchParams.get("purchase") || null;
    const orderId = url.searchParams.get("order") || null; // compat con órdenes viejas
    const body = await request.json().catch(() => ({}));
    const paymentId = body?.data?.id || url.searchParams.get("data.id");
    if ((!purchaseId && !orderId) || !paymentId) return ok;

    // Órdenes de la compra → vendedor → su token de MP
    const filtro = purchaseId ? `purchase_id=eq.${purchaseId}` : `id=eq.${orderId}`;
    const ords = await fetch(
      `${SUPA}/rest/v1/orders?${filtro}&select=id,seller_id,record_id,status`,
      { headers: hdrs(KEY) }
    ).then((r) => r.json());
    if (!Array.isArray(ords) || !ords.length) return ok;
    if (ords.every((o) => o.status === "pagada")) return ok;

    const toks = await fetch(
      `${SUPA}/rest/v1/mp_tokens?user_id=eq.${ords[0].seller_id}&select=access_token`,
      { headers: hdrs(KEY) }
    ).then((r) => r.json());
    if (!toks.length) return ok;

    // Consultar el pago real en MP (nunca confiar solo en el webhook)
    const pay = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { Authorization: `Bearer ${toks[0].access_token}` },
    }).then((r) => r.json());

    const refEsperada = purchaseId || String(ords[0].id);
    if (pay.status === "approved" && String(pay.external_reference) === refEsperada) {
      await fetch(`${SUPA}/rest/v1/orders?${filtro}`, {
        method: "PATCH", headers: hdrs(KEY),
        body: JSON.stringify({ status: "pagada", mp_payment_id: String(paymentId) }),
      });
      const recordIds = ords.map((o) => o.record_id).join(",");
      await fetch(`${SUPA}/rest/v1/records?id=in.(${recordIds})`, {
        method: "PATCH", headers: hdrs(KEY),
        body: JSON.stringify({ status: "vendido" }),
      });
    }
    return ok;
  } catch {
    return ok;
  }
}

const hdrs = (KEY) => ({
  apikey: KEY,
  Authorization: `Bearer ${KEY}`,
  "Content-Type": "application/json",
});
