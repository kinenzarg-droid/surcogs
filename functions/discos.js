// El indice completo del catalogo, en /discos.
//
// La lista se escribe aca, en el servidor, antes de mandar la pagina. El
// buscador la lee sin ejecutar JavaScript, y de paso encuentra el camino a las
// 229 fichas: hasta que existio esto, no habia un solo enlace a ninguna.

import { RECARGO, esc, urlDeFicha } from "./_ficha.js";

export async function onRequestGet({ env, next }) {
  const respuesta = await next();   // el discos.html de siempre
  const tipo = respuesta.headers.get("content-type") || "";
  if (!tipo.includes("text/html")) return respuesta;
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return respuesta;

  let discos = [];
  try {
    const campos = "id,id_corto,artist,title,label,year,format,condition_media,price";
    const r = await fetch(
      `${env.SUPABASE_URL}/rest/v1/records?select=${campos}` +
      "&status=eq.disponible&order=created_at.desc",
      { headers: {
          apikey: env.SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        } }
    );
    if (r.ok) { const j = await r.json(); if (Array.isArray(j)) discos = j; }
  } catch (e) { discos = []; }

  if (!discos.length) {
    // Si la base no contesta, al menos que no quede diciendo "Cargando"
    return new HTMLRewriter()
      .on("#lista-discos", { element(el) {
        el.setInnerContent(
          '<li>No pudimos traer el cat\u00e1logo. Prob\u00e1 de nuevo en un rato o mir\u00e1 el ' +
          '<a href="/">cat\u00e1logo con filtros</a>.</li>', { html: true });
      } })
      .transform(respuesta);
  }

  const filas = discos.map((d) => {
    const nombre = [d.artist, d.title].filter(Boolean).join(" \u2013 ") || "Disco";
    const sello = String(d.label || "").split(" \u00b7 ")[0];
    const detalle = [sello, d.year, d.format, d.condition_media].filter(Boolean).join(" \u00b7 ");
    const precio = d.price ? "$" + Math.round(d.price * RECARGO).toLocaleString("es-AR") : "";
    return `<li><a href="${esc(urlDeFicha("", d))}">${esc(nombre)}</a>` +
      (detalle ? ` <span>${esc(detalle)}</span>` : "") +
      (precio ? ` <b>${esc(precio)}</b>` : "") + "</li>";
  }).join("");

  return new HTMLRewriter()
    .on("h1", { element(el) { el.setInnerContent(`Los ${discos.length} vinilos en venta`); } })
    .on("#lista-discos", { element(el) { el.setInnerContent(filas, { html: true }); } })
    .transform(respuesta);
}
