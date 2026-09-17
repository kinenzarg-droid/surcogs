// Contenido real en el HTML de la portada, antes de que corra el JavaScript.
//
// El catalogo lo dibuja el navegador, asi que un buscador que entra y no
// ejecuta JavaScript veia una pagina de 822 caracteres que decia "No hay
// discos que coincidan". Google la indexo asi: como una pagina vacia. Y ademas
// no tenia un solo enlace a ninguna ficha, porque los enlaces tambien los
// dibuja el navegador.
//
// Esta funcion le agrega al final un indice con todos los discos en venta. No
// reemplaza nada ni se esconde: es una lista de verdad, que ademas le sirve al
// que quiere ver todo junto sin filtrar.

import { RECARGO, esc, urlDeFicha } from "./_ficha.js";

export async function onRequestGet({ request, env, next }) {
  const respuesta = await next();
  const tipo = respuesta.headers.get("content-type") || "";
  if (!tipo.includes("text/html")) return respuesta;
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return respuesta;

  // Solo la portada limpia. Con filtros en la direccion la pagina muestra otra
  // cosa y el indice completo no corresponde.
  const url = new URL(request.url);
  if (url.search) return respuesta;

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

  // Si la base no contesta, la pagina sale como siempre. Perder el indice es
  // mucho mejor que romper la portada.
  if (!discos.length) return respuesta;

  const filas = discos.map((d) => {
    const nombre = [d.artist, d.title].filter(Boolean).join(" \u2013 ") || "Disco";
    const sello = String(d.label || "").split(" \u00b7 ")[0];
    const detalle = [sello, d.year, d.format, d.condition_media].filter(Boolean).join(" \u00b7 ");
    const precio = d.price ? "$" + Math.round(d.price * RECARGO).toLocaleString("es-AR") : "";
    // Enlace directo a la direccion buena, sin pasar por redirecciones
    return `<li><a href="${esc(urlDeFicha("", d))}">${esc(nombre)}</a>` +
      (detalle ? ` <span>${esc(detalle)}</span>` : "") +
      (precio ? ` <b>${esc(precio)}</b>` : "") + "</li>";
  }).join("");

  const indice =
    '<section id="indice-catalogo">' +
    `<h2>Los ${discos.length} vinilos que hay en venta ahora</h2>` +
    "<p>SURCOGS es un mercado entre coleccionistas para comprar y vender vinilos " +
    "de techno y m\u00fasica electr\u00f3nica en Argentina. Cada disco se puede escuchar " +
    "entero antes de comprarlo. El vendedor cobra el precio que puso y la plata " +
    "queda protegida hasta que el comprador confirma que lo recibi\u00f3.</p>" +
    `<ul>${filas}</ul>` +
    "</section>";

  // Quienes somos, para el buscador y para los asistentes.
  const quienes = {
    "@context": "https://schema.org",
    "@type": "OnlineStore",
    name: "SURCOGS",
    url: "https://surcogs.com.ar",
    description: "Mercado entre coleccionistas para comprar y vender vinilos de " +
      "techno y musica electronica en Argentina, con audio de cada tema.",
    areaServed: { "@type": "Country", name: "Argentina" },
    currenciesAccepted: "ARS",
    sameAs: ["https://www.instagram.com/surcogs"],
  };
  const ld = '<script type="application/ld+json">' +
    JSON.stringify(quienes).replace(/</g, "\\u003c") + "\u003c/script>";

  const estilo = "<style>" +
    "#indice-catalogo{max-width:1100px;margin:44px auto 0;padding:26px 20px 8px;" +
    "border-top:1px solid var(--bd,#e0dbd3);font-size:13.5px;line-height:1.7}" +
    "#indice-catalogo h2{font-size:15px;margin:0 0 8px}" +
    "#indice-catalogo p{color:var(--dim,#6b6560);margin:0 0 16px;max-width:70ch}" +
    "#indice-catalogo ul{list-style:none;margin:0;padding:0;columns:2;column-gap:34px}" +
    "#indice-catalogo li{break-inside:avoid;margin-bottom:5px}" +
    "#indice-catalogo a{color:inherit;text-decoration:none}" +
    "#indice-catalogo a:hover{text-decoration:underline}" +
    "#indice-catalogo span,#indice-catalogo b{color:var(--dim,#6b6560);font-weight:400}" +
    "@media(max-width:700px){#indice-catalogo ul{columns:1}}" +
    "</style>";

  return new HTMLRewriter()
    .on("head", { element(el) { el.append(ld + estilo, { html: true }); } })
    // Al final del <main>. El <footer> no sirve de ancla: no esta en el HTML,
    // lo dibuja el JavaScript despues.
    .on("main", { element(el) { el.append(indice, { html: true }); } })
    .transform(respuesta);
}
