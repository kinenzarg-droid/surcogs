// Cloudflare Pages Function — calificaciones en los dos sentidos.
//
// Como en Mercado Libre, se califica DESPUÉS de la entrega, nunca antes:
// una calificación hecha al pagar no informa nada, porque el comprador
// todavía no vio el disco.
//
//   tipo "a_vendedor"  → lo hace el comprador. Se autentica con el rating_token
//                        que viaja en el link del mail (no necesita cuenta).
//   tipo "a_comprador" → lo hace el vendedor. Se autentica con su sesión.
//
// Se habilita cuando el comprador confirmó la entrega, o cuando pasaron los
// 10 días en que la plata se libera igual. Después hay 21 días para calificar.
import { notificar } from "./_notificar.js";

const DIAS_VENTANA = 21;
const DIAS_LIBERACION = 10;

export async function onRequestPost({ request, env }) {
  const SUPA = env.SUPABASE_URL;
  const KEY = env.SUPABASE_SERVICE_ROLE_KEY;

  const body = await request.json().catch(() => ({}));
  const { order_id, token, stars, comment } = body;
  const tipo = body.tipo === "a_comprador" ? "a_comprador" : "a_vendedor";
  const n = Number(stars);
  if (!order_id || !Number.isInteger(n) || n < 1 || n > 5) {
    return json({ error: "Datos inválidos" }, 400);
  }

  const ords = await fetch(
    `${SUPA}/rest/v1/orders?id=eq.${order_id}` +
    `&select=id,seller_id,buyer_id,buyer_email,status,rating_token,pagado_at,entregado_at`,
    { headers: hdrs(KEY) }
  ).then((r) => r.json());
  const orden = ords?.[0];
  if (!orden) return json({ error: "No encontramos esa compra" }, 404);

  // ---- Quién puede calificar ----
  if (tipo === "a_vendedor") {
    if (!token || orden.rating_token !== token) {
      return json({ error: "Link inválido" }, 403);
    }
  } else {
    // El vendedor se identifica con su sesión
    const jwt = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    if (!jwt) return json({ error: "Iniciá sesión para calificar" }, 401);
    const user = await fetch(`${SUPA}/auth/v1/user`, {
      headers: { apikey: KEY, Authorization: `Bearer ${jwt}` },
    }).then((r) => (r.ok ? r.json() : null));
    if (!user?.id || user.id !== orden.seller_id) {
      return json({ error: "Esta venta no es tuya" }, 403);
    }
    if (!orden.buyer_id) {
      return json({ error: "Esta compra no tiene una cuenta asociada, no se puede calificar" }, 409);
    }
  }

  // ---- Cuándo se puede calificar ----
  if (!["pagada", "enviado", "entregado"].includes(orden.status)) {
    return json({ error: "Esta compra todavía no está paga" }, 409);
  }
  const pagado = orden.pagado_at ? new Date(orden.pagado_at) : null;
  const habilita = orden.entregado_at
    ? new Date(orden.entregado_at)
    : (pagado ? new Date(pagado.getTime() + DIAS_LIBERACION * 86400000) : null);

  if (!habilita || habilita > new Date()) {
    return json({
      error: "Vas a poder calificar cuando el disco esté entregado. Te avisamos.",
    }, 409);
  }
  const vence = new Date(habilita.getTime() + DIAS_VENTANA * 86400000);
  if (vence < new Date()) {
    return json({ error: `El plazo para calificar era de ${DIAS_VENTANA} días y ya pasó` }, 409);
  }

  // ---- Guardar (el índice único impide calificar dos veces) ----
  const ins = await fetch(`${SUPA}/rest/v1/ratings`, {
    method: "POST",
    headers: { ...hdrs(KEY), Prefer: "return=minimal" },
    body: JSON.stringify({
      order_id: orden.id,
      seller_id: orden.seller_id,
      buyer_id: orden.buyer_id || null,
      tipo,
      stars: n,
      comment: (comment || "").slice(0, 300) || null,
    }),
  });
  if (ins.status === 409) return json({ error: "Ya calificaste esta compra" }, 409);
  if (!ins.ok) return json({ error: "No se pudo guardar la calificación" }, 500);

  // Avisarle al calificado
  await notificar(env, {
    user_id: tipo === "a_vendedor" ? orden.seller_id : orden.buyer_id,
    tipo: "calificacion",
    titulo: `Te calificaron con ${"★".repeat(n)}`,
    detalle: comment ? `"${String(comment).slice(0, 90)}"` : "Sin comentario.",
    link: tipo === "a_vendedor" ? "/cuenta.html#ventas" : "/cuenta.html#compras",
  });

  return json({ ok: true });
}

const hdrs = (KEY) => ({
  apikey: KEY,
  Authorization: `Bearer ${KEY}`,
  "Content-Type": "application/json",
});
const json = (b, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });
