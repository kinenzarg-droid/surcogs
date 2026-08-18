// Cloudflare Pages Function — el comprador confirma que recibió el disco.
// Se entra por un link del mail (no hace falta tener cuenta): /r.html?o=<id>&t=<token>
// Al confirmar, la orden queda liberable y le avisamos a SURCOGS para transferir.
import { notificar } from "./_notificar.js";

export async function onRequestPost({ request, env }) {
  const SUPA = env.SUPABASE_URL;
  const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
  const { order_id, token } = await request.json().catch(() => ({}));
  if (!order_id || !token) return json({ error: "Link inválido" }, 400);

  const ords = await fetch(
    `${SUPA}/rest/v1/orders?id=eq.${order_id}&rating_token=eq.${token}&select=id,status,entregado_at,monto_vendedor,seller_id,record_id`,
    { headers: hdrs(KEY) }
  ).then((r) => r.json());
  if (!Array.isArray(ords) || !ords.length) return json({ error: "Link inválido o vencido" }, 404);
  const o = ords[0];
  if (o.entregado_at) return json({ ok: true, ya: true });

  const ahora = new Date().toISOString();
  await fetch(`${SUPA}/rest/v1/orders?id=eq.${o.id}`, {
    method: "PATCH",
    headers: hdrs(KEY),
    body: JSON.stringify({ entregado_at: ahora, status: "entregado" }),
  });

  await notificar(env, {
    user_id: o.seller_id,
    tipo: "entrega",
    titulo: "El comprador confirmó que recibió el disco",
    detalle: "Te transferimos dentro de las 48hs hábiles al alias que tenés cargado.",
    link: "/cuenta.html#ventas",
  });

  // Aviso a SURCOGS: hay que transferirle al vendedor
  if (env.RESEND_API_KEY && env.ADMIN_EMAIL) {
    const [rec, ven] = await Promise.all([
      fetch(`${SUPA}/rest/v1/records?id=eq.${o.record_id}&select=artist,title`, { headers: hdrs(KEY) }).then((r) => r.json()),
      fetch(`${SUPA}/rest/v1/profiles?id=eq.${o.seller_id}&select=name,alias,titular`, { headers: hdrs(KEY) }).then((r) => r.json()),
    ]);
    const d = rec?.[0] || {}, v = ven?.[0] || {};
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "SURCOGS <info@surcogs.com.ar>",
        to: [env.ADMIN_EMAIL],
        subject: `💸 Transferir $${Number(o.monto_vendedor || 0).toLocaleString("es-AR")} a ${v.name || "vendedor"}`,
        html: `<p>El comprador confirmó que recibió <b>${d.artist} – ${d.title}</b>.</p>
               <p><b>Transferir:</b> $${Number(o.monto_vendedor || 0).toLocaleString("es-AR")}<br>
               <b>Alias:</b> ${v.alias || "⚠ sin alias cargado"}<br>
               <b>Titular:</b> ${v.titular || "—"}</p>
               <p><a href="${env.SITE_URL}/liquidaciones.html">Abrir el panel de liquidaciones</a></p>`,
      }),
    }).catch(() => {});
  }
  return json({ ok: true });
}

const hdrs = (KEY) => ({
  apikey: KEY,
  Authorization: `Bearer ${KEY}`,
  "Content-Type": "application/json",
});
const json = (b, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });
