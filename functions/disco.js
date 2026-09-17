// Las direcciones viejas de una ficha: /disco?id=<uuid>
//
// Antes esta funcion servia la pagina con las etiquetas pegadas. Ahora la
// ficha vive en /disco/nombre-del-disco-xxxxxxxx, asi que esto quedo como
// mudanza: manda a la direccion nueva con un 301, que es la forma de decirle
// al buscador "se mudo para siempre, pasale todo lo que tenias guardado de la
// vieja". Los links que ya circulan por WhatsApp e Instagram siguen andando.

import { buscarPorId, urlDeFicha } from "./_ficha.js";

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (!id) return Response.redirect(url.origin + "/", 302);
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return Response.redirect(url.origin + "/", 302);
  }

  let d = null;
  try { d = await buscarPorId(env, id); } catch (e) { d = null; }
  if (!d) return Response.redirect(url.origin + "/", 302);

  // Lo que venga colgado atras se conserva: el aviso de pago exitoso y el
  // token de calificacion viajan asi despues de comprar.
  const resto = new URLSearchParams(url.search);
  resto.delete("id");
  const cola = resto.toString();
  return Response.redirect(urlDeFicha(url.origin, d) + (cola ? "?" + cola : ""), 301);
}
