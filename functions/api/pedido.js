// "Avisame cuando entre": alguien buscó algo que no está en el catálogo.
//
// El pedido se guarda y además llega por mail, porque un pedido que se ve tres
// días tarde ya perdió a la persona. Pasa por acá y no directo a la base para
// poder mandar ese mail y para validar lo que entra.
export async function onRequestPost({ request, env }) {
  const b = await request.json().catch(() => ({}));
  const texto = String(b.texto || "").trim().slice(0, 120);
  const email = String(b.email || "").trim().slice(0, 120);

  if (texto.length < 2) return json({ error: "Escribí qué estás buscando" }, 400);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: "Revisá el mail" }, 400);

  const H = {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json",
  };

  const r = await fetch(`${env.SUPABASE_URL}/rest/v1/busquedas`, {
    method: "POST",
    headers: H,
    body: JSON.stringify({ texto, email, user_id: b.user_id || null }),
  });
  if (!r.ok) return json({ error: "No se pudo guardar" }, 500);

  // Cuántas veces ya pidieron lo mismo. Si un disco lo pidieron cuatro veces,
  // eso cambia la decisión de salir a buscarlo.
  let repetido = 0;
  try {
    const previas = await fetch(
      `${env.SUPABASE_URL}/rest/v1/busquedas?select=id&texto=ilike.${encodeURIComponent(texto)}`,
      { headers: H }).then((x) => x.json());
    repetido = Array.isArray(previas) ? previas.length : 0;
  } catch (_) { repetido = 0; }

  // El mail es lo que hace que esto sirva: avisa en el momento.
  if (env.RESEND_API_KEY && env.ADMIN_EMAIL) {
    try {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "SURCOGS <ventas@surcogs.com.ar>",
          to: [env.ADMIN_EMAIL],
          reply_to: email,
          subject: `Buscan: ${texto}`,
          html: `
            <div style="font-family:-apple-system,'Segoe UI',Arial,sans-serif;max-width:520px">
              <p style="font-size:13px;color:#6b6560;margin:0 0 4px">ALGUIEN BUSCA</p>
              <p style="font-size:22px;font-weight:700;margin:0 0 14px">${esc(texto)}</p>
              <p style="font-size:14px;line-height:1.7;margin:0 0 14px">
                Avisarle a <a href="mailto:${esc(email)}">${esc(email)}</a> cuando entre.
                ${repetido > 1 ? `<br><b>Lo pidieron ${repetido} veces.</b>` : ""}
              </p>
              <p style="font-size:13px;color:#6b6560;margin:0">
                Todos los pedidos en
                <a href="https://surcogs.com.ar/metricas">surcogs.com.ar/metricas</a>
              </p>
            </div>`,
        }),
      });
    } catch (_) { /* el pedido ya quedó guardado: el mail es un extra */ }
  }

  return json({ ok: true });
}

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

const json = (b, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });
