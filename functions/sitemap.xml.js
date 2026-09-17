// El mapa del sitio: la lista de todo lo que queremos que Google indexe.
//
// Se arma en el momento contra la base, no a mano, porque el catalogo cambia
// todos los dias. Un sitemap escrito a mano se desactualiza en una semana y
// empieza a mandar a los buscadores a discos que ya no estan.

import { urlDeFicha } from "./_ficha.js";

const SITIO = "https://surcogs.com.ar";

// En XML estos cinco caracteres rompen el archivo si van crudos.
const esc = (s) => String(s ?? "")
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&apos;");

const soloFecha = (f) => {
  const d = new Date(f);
  return isNaN(d) ? null : d.toISOString().slice(0, 10);
};

function entrada({ url, fecha, cada, peso }) {
  return [
    "  <url>",
    `    <loc>${esc(url)}</loc>`,
    fecha ? `    <lastmod>${fecha}</lastmod>` : null,
    cada ? `    <changefreq>${cada}</changefreq>` : null,
    peso ? `    <priority>${peso}</priority>` : null,
    "  </url>",
  ].filter(Boolean).join("\n");
}

async function traer(env, ruta) {
  const r = await fetch(`${env.SUPABASE_URL}/rest/v1/${ruta}`, {
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    },
  });
  if (!r.ok) return [];
  const j = await r.json();
  return Array.isArray(j) ? j : [];
}

export async function onRequestGet({ env }) {
  const urls = [
    entrada({ url: `${SITIO}/`, cada: "daily", peso: "1.0" }),
    entrada({ url: `${SITIO}/discos`, cada: "daily", peso: "0.9" }),
    entrada({ url: `${SITIO}/vender`, cada: "monthly", peso: "0.8" }),
    entrada({ url: `${SITIO}/terminos.html`, cada: "yearly", peso: "0.3" }),
  ];

  if (env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) {
    // Los vendedores, por su direccion propia
    const perfiles = await traer(env, "profiles?select=usuario&usuario=not.is.null");
    for (const p of perfiles) {
      if (p.usuario) {
        urls.push(entrada({
          url: `${SITIO}/${encodeURIComponent(p.usuario)}`,
          cada: "weekly", peso: "0.7",
        }));
      }
    }

    // Los discos. Solo los que se pueden comprar: mandar a los buscadores a
    // una ficha vendida es gastar el rastreo y decepcionar al que llega.
    const discos = await traer(env,
      "records?select=id,id_corto,artist,title,created_at" +
      "&status=eq.disponible&order=created_at.desc");
    for (const d of discos) {
      urls.push(entrada({
        // La direccion con nombre, que es la buena. Si aca pusieramos la vieja,
        // le estariamos mandando a Google 229 redirecciones.
        url: urlDeFicha(SITIO, d),
        fecha: soloFecha(d.created_at),
        cada: "weekly", peso: "0.6",
      }));
    }
  }

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    urls.join("\n"),
    "</urlset>",
  ].join("\n");

  return new Response(xml, {
    headers: {
      "content-type": "application/xml; charset=utf-8",
      // Una hora: alcanza para no golpear la base en cada visita de un robot
      // y para que un disco nuevo aparezca el mismo dia.
      "cache-control": "public, max-age=3600",
    },
  });
}
