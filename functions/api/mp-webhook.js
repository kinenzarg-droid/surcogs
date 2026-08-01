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

      // Avisar al vendedor por email (Resend) — si falla, no rompe nada
      if (env.RESEND_API_KEY) {
        try {
          const [vendedor, discos] = await Promise.all([
            fetch(`${SUPA}/auth/v1/admin/users/${ords[0].seller_id}`, { headers: hdrs(KEY) }).then((r) => r.json()),
            fetch(`${SUPA}/rest/v1/records?id=in.(${recordIds})&select=artist,title`, { headers: hdrs(KEY) }).then((r) => r.json()),
          ]);
          const buyer = await fetch(
            `${SUPA}/rest/v1/orders?id=eq.${ords[0].id}&select=buyer_email`,
            { headers: hdrs(KEY) }
          ).then((r) => r.json());
          const lista = (discos || []).map((d) => `• ${d.artist} – ${d.title}`).join("<br>");
          const emailComprador = buyer?.[0]?.buyer_email || "no dejó email";
          if (vendedor?.email) {
            await fetch("https://api.resend.com/emails", {
              method: "POST",
              headers: {
                Authorization: `Bearer ${env.RESEND_API_KEY}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                from: "SURCOGS <ventas@surcogs.com.ar>",
                to: [vendedor.email],
                subject: "🎉 ¡Vendiste en SURCOGS!",
                html: `<div style="font-family:sans-serif;max-width:520px">
                  <h2>¡Felicitaciones, vendiste!</h2>
                  <p>${lista}</p>
                  <p>El pago ya está acreditado en tu Mercado Pago (menos comisiones).</p>
                  <p><b>Comprador:</b> ${emailComprador}<br>
                  Escribile hoy para coordinar la entrega: punto de encuentro o envío.</p>
                  <p><a href="https://surcogs.com.ar/cuenta.html" style="background:#ff5500;color:#fff;padding:10px 18px;border-radius:5px;text-decoration:none">Ver mi panel</a></p>
                  <p style="color:#999;font-size:12px">SURCOGS · Vinilos de mano en mano</p>
                </div>`,
              }),
            });
          }
        } catch {}
      }
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
