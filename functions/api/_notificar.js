// Crea una notificación dentro de la plataforma (la campanita del header).
// Se llama desde el servidor con la service role key: nadie puede fabricarse una.
export async function notificar(env, { user_id, tipo, titulo, detalle, link }) {
  if (!user_id) return;
  try {
    await fetch(`${env.SUPABASE_URL}/rest/v1/notificaciones`, {
      method: "POST",
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ user_id, tipo, titulo, detalle: detalle || null, link: link || null }),
    });
  } catch (_) { /* una notificación que falla nunca puede romper una venta */ }
}
