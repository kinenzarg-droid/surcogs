// Direcciones cortas de vendedor: surcogs.com.ar/luking
//
// Es el link que ponen en la bio de Instagram, asi que tiene que ser corto
// y quedarse corto: no redirige al id largo, sirve el perfil ahi mismo.
//
// Cuidado con el alcance. Este archivo atiende CUALQUIER direccion de un
// solo tramo: /luking, pero tambien /publicar.html o /favicon.ico. Por eso
// lo primero que hace es dejar que el sitio conteste como siempre, y solo
// se mete cuando la respuesta fue 404, es decir cuando no habia nada ahi.

const FORMATO = /^[a-z0-9][a-z0-9._-]{1,28}[a-z0-9]$/;
const MARCA = "x-surcogs-interno";

const esc = (s) => String(s ?? "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;")
  .replace(/>/g, "&gt;").replace(/"/g, "&quot;");

async function traerPerfil(env, usuario) {
  const campos = "id,name,localidad,zona,avatar_url,usuario";
  const r = await fetch(
    `${env.SUPABASE_URL}/rest/v1/profiles?usuario=eq.${encodeURIComponent(usuario)}&select=${campos}`,
    { headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      } }
  );
  if (!r.ok) return null;
  const filas = await r.json();
  return Array.isArray(filas) && filas.length ? filas[0] : null;
}

async function contarDiscos(env, id) {
  const r = await fetch(
    `${env.SUPABASE_URL}/rest/v1/records?seller_id=eq.${id}&status=eq.disponible&select=id`,
    { headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        Prefer: "count=exact", Range: "0-0",
      } }
  );
  const rango = r.headers.get("content-range") || "";   // viene como "0-0/172"
  const n = Number(rango.split("/")[1]);
  return Number.isFinite(n) ? n : null;
}

export async function onRequestGet(context) {
  const { request, env, params, next } = context;

  // Si soy yo mismo pidiendo el perfil de adentro, no me vuelvo a meter.
  if (request.headers.get(MARCA)) return next();

  const respuesta = await next();
  if (respuesta.status !== 404) return respuesta;   // habia un archivo real

  const usuario = String(params.usuario || "").toLowerCase();
  if (!FORMATO.test(usuario)) return respuesta;
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return respuesta;

  let p = null;
  try { p = await traerPerfil(env, usuario); } catch (e) { p = null; }
  if (!p) return respuesta;   // no existe ese vendedor: 404 de verdad

  const url = new URL(request.url);
  const pagina = await fetch(new Request(`${url.origin}/perfil`, {
    headers: { [MARCA]: "1" },
  }));
  if (!pagina.ok) return respuesta;

  let n = null;
  try { n = await contarDiscos(env, p.id); } catch (e) { n = null; }

  const lugar = [p.localidad, p.zona].filter(Boolean).join(", ");
  const texto = [
    n ? `${n} disco${n === 1 ? "" : "s"} en venta` : "Colección en SURCOGS",
    lugar,
  ].filter(Boolean).join(" · ");
  const limpia = `${url.origin}/${usuario}`;

  const metas = [
    `<meta property="og:type" content="profile">`,
    `<meta property="og:site_name" content="SURCOGS">`,
    `<meta property="og:locale" content="es_AR">`,
    `<meta property="og:url" content="${esc(limpia)}">`,
    `<meta property="og:title" content="${esc(p.name)} en SURCOGS">`,
    `<meta property="og:description" content="${esc(texto)}">`,
    `<meta name="description" content="${esc(p.name + " — " + texto)}">`,
    `<meta name="twitter:card" content="summary">`,
    `<link rel="canonical" href="${esc(limpia)}">`,
    // El perfil se arma en el navegador y hasta ahora sacaba el id de la
    // direccion. Con la direccion corta no hay id, asi que se lo dejamos
    // servido aca.
    `<script>window.__perfil=${JSON.stringify({ id: p.id, usuario })}<\/script>`,
  ];
  if (p.avatar_url) {
    metas.push(`<meta property="og:image" content="${esc(p.avatar_url)}">`);
    metas.push(`<meta name="twitter:image" content="${esc(p.avatar_url)}">`);
  }

  return new HTMLRewriter()
    .on("title", { element(el) { el.setInnerContent(`${p.name} · SURCOGS`); } })
    .on("head", { element(el) { el.append("\n" + metas.join("\n") + "\n", { html: true }); } })
    .transform(new Response(pagina.body, {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8" },
    }));
}
