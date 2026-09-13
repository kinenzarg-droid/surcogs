// Tarjeta de disco y reproductor, compartidos por todo el sitio.
//
// Vivian sueltos adentro de index.html. Cuando el perfil del vendedor
// necesito las mismas tarjetas, copiarlas hubiera dejado dos versiones
// de lo mismo destinadas a separarse: ya nos habia pasado con la ficha
// del disco. Estan aca para tocarlas una sola vez.

import { fotoPrincipal, fmtPrecio, precioComprador, youtubeId } from "/js/app.js?v=3";

export const esc = (s) => String(s ?? "").replace(/</g, "&lt;").replace(/"/g, "&quot;");
const CART_ICON = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#e6a817" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="pointer-events:none;flex:none"><circle cx="9" cy="20" r="1.7" fill="#e6a817" stroke="none"/><circle cx="17" cy="20" r="1.7" fill="#e6a817" stroke="none"/><path d="M3 3h2.5l2.2 12.2a1.5 1.5 0 0 0 1.5 1.3h7.9a1.5 1.5 0 0 0 1.5-1.2L20.5 8H6"/></svg>';

// La localidad sale del perfil del vendedor; la copia guardada en el
// disco es el respaldo por si el perfil no vino en la consulta.
export const locDe = (d) => d.profiles?.localidad || d.localidad || "";

// Cada pantalla define lo suyo: quien es el dueño del disco, y que hacer
// cuando el reproductor entra o sale (el catalogo tiene que correr la
// barra del carrito; el perfil no tiene barra).
let esMio = () => false;
let ajustarBarras = () => {};
export function configurarTarjetas(opciones = {}) {
  if (opciones.esMio) esMio = opciones.esMio;
  if (opciones.ajustar) ajustarBarras = opciones.ajustar;
}

export function tarjeta(d, i) {
  return `
    <div class="gcard">
      <a href="/disco.html?id=${d.id}"><img class="gcov" src="${fotoPrincipal(d)}" alt="${esc(d.artist)} – ${esc(d.title)}" loading="lazy"></a>
      <span class="gbadge ${d.status}">${d.status.charAt(0).toUpperCase() + d.status.slice(1)}</span>
      ${esMio(d) ? `<span class="gown">
        <a href="/publicar.html?edit=${d.id}" title="Editar">✎</a>
        <button class="del" data-del="${d.id}" title="Eliminar">🗑</button></span>` : ""}
      <div class="gbody">
        <a class="gname" href="/disco.html?id=${d.id}"><b>${esc(d.artist)}:</b> ${esc(d.title)}</a>
        <div class="gmeta">${d.label ? `<a class="lk-sello" data-q="${esc(d.label)}" href="/?q=${encodeURIComponent(d.label)}">${esc(d.label)}</a> · ` : ""}${esc(d.format)}${d.condition_media ? ` · <b class="ggrado" title="Estado del disco, escala Goldmine">${esc(d.condition_media)}</b>` : ""}</div>
        ${locDe(d) ? `<div class="gmeta">📍 ${esc(locDe(d))}</div>` : ""}
        ${trackBtns(d, i)}
        <div class="gfoot">
          <span class="gprecio">
            <span class="gprice">${d.old_price && d.old_price > d.price ? `<s>${fmtPrecio(precioComprador(d.old_price))}</s>` : ""}${fmtPrecio(precioComprador(d.price))}</span>
            <span class="gtr">${fmtPrecio(Math.round(precioComprador(d.price) * 0.9))} <b>10% OFF</b> con transferencia</span>
          </span>
        </div>
        ${d.status === "disponible" ? `<div class="gbtns">
          <a class="gbuy" href="/disco.html?id=${d.id}">Comprar</a>
          <button class="gcart" data-cart="${d.id}">${CART_ICON} Agregar al carrito</button>
        </div>` : ""}
      </div>
    </div>`;
}

// El reproductor se inyecta solo, asi la pantalla que lo use no tiene
// que acordarse de pegar el HTML.
export function montarPlayer() {
  const ya = document.getElementById("player");
  if (ya) { engancharCerrar(ya); return; }
  const p = document.createElement("div");
  p.className = "hw-player";
  p.id = "player";
  p.innerHTML = `<div class="bar"><span id="pl-titulo">▶</span><button class="cerrar" id="pl-cerrar">✕ Cerrar</button></div><div id="pl-frame"></div>`;
  document.body.appendChild(p);
  engancharCerrar(p);
}

// El catalogo ya trae el reproductor en su HTML, asi que montarPlayer sale
// antes de crear nada. El boton de cerrar hay que engancharlo igual.
function engancharCerrar(p) {
  const b = p.querySelector("#pl-cerrar");
  if (b) b.onclick = () => cerrarPlayer();
}

export function trackBtns(d, i) {
  // Se listan TODOS los temas del disco. Los que tienen audio se pueden tocar;
  // los que no, se ven como texto plano: ni link, ni ▶, ni cursor de mano.
  const tracks = (d.tracks || []).filter(t => (t.title || "").trim() || t.position);
  if (!tracks.length) return "";
  const flechas = tracks.length > 3;   // con 3 o menos entran todos: no hace falta deslizar
  return `<div class="gtks">
    ${flechas ? `<button class="gtk-nav" data-tk="-1" title="Temas anteriores">▲</button>` : ""}
    <div class="gtk-list">
      ${tracks.map((t) => {
        const ti = (d.tracks || []).indexOf(t);
        const nombre = `<span class="gtk-pos">${esc(t.position || "")}</span>${esc(t.title || "Tema")}`;
        return t.audio_url
          ? `<button class="gtk" data-play="${i}:${ti}" title="Escuchar ${esc(t.title)}">${nombre}</button>`
          : `<span class="gtk gtk-off" title="Este tema todavía no tiene audio">${nombre}</span>`;
      }).join("")}
    </div>
    ${flechas ? `<button class="gtk-nav" data-tk="1" title="Más temas">▼</button>` : ""}
  </div>`;
}

// ===== Player fijo abajo =====
// Cola de reproducción: solo los temas que tienen audio cargado.
// Los que no tienen no entran, así "siguiente" nunca cae en el vacío.
let cola = { disco: null, temas: [], pos: 0 };

export function reproducirDisco(d, ti) {
  const temas = (d.tracks || []).filter(t => t.audio_url);
  if (!temas.length) return;
  const buscado = (d.tracks || [])[ti];
  const pos = Math.max(0, temas.findIndex(t => t === buscado));
  cola = { disco: d, temas, pos };
  reproducir(d, temas[pos]);
}

function moverCola(n) {
  if (!cola.temas.length) return;
  const nueva = cola.pos + n;
  if (nueva < 0 || nueva >= cola.temas.length) return;
  cola.pos = nueva;
  reproducir(cola.disco, cola.temas[nueva]);
}

function reproducir(d, t) {
  const url = t.audio_url || "";
  const yt = youtubeId(url);
  const sp = url.match(/open\.spotify\.com\/(?:intl-\w+\/)?track\/([A-Za-z0-9]+)/);
  let frame = "";
  if (yt) frame = `<iframe src="https://www.youtube.com/embed/${yt}?autoplay=1" allow="autoplay; encrypted-media"></iframe>`;
  else if (url.includes("soundcloud.com"))
    frame = `<iframe class="sc" src="https://w.soundcloud.com/player/?url=${encodeURIComponent(url)}&auto_play=true&visual=false" allow="autoplay"></iframe>`;
  else if (sp) frame = `<iframe src="https://open.spotify.com/embed/track/${sp[1]}" allow="autoplay; encrypted-media"></iframe>`;
  else { window.open(url, "_blank"); return; }

  const total = cola.temas.length || 1;
  const nro = (cola.pos || 0) + 1;
  const dosDig = (x) => String(x).padStart(2, "0");
  document.getElementById("pl-titulo").innerHTML =
    `<button class="pl-nav" id="pl-prev" title="Tema anterior" ${nro === 1 ? "disabled" : ""}>⏮</button>` +
    `<button class="pl-nav" id="pl-next" title="Tema siguiente" ${nro === total ? "disabled" : ""}>⏭</button>` +
    `<span class="pl-cnt">${dosDig(nro)}/${dosDig(total)}</span>` +
    `<a class="lk-sello" data-q="${esc(d.artist)}" href="/?q=${encodeURIComponent(d.artist)}">${esc(d.artist)}</a>` +
    ` — <b>${esc(t.title || d.title)}</b>` +
    (t.position ? ` <span class="pl-pos">(${esc(t.position)})</span>` : "") +
    (d.label ? ` · <a class="lk-sello" data-q="${esc(d.label)}" href="/?q=${encodeURIComponent(d.label)}">${esc(d.label)}</a>` : "");
  const prev = document.getElementById("pl-prev");
  const next = document.getElementById("pl-next");
  if (prev) prev.onclick = () => moverCola(-1);
  if (next) next.onclick = () => moverCola(1);
  if (canalPlayer) canalPlayer.postMessage("play");   // callate, resto de las pestañas
  document.getElementById("pl-frame").innerHTML = frame;
  document.getElementById("player").style.display = "block";
  ajustarBarras();
}
// Un solo reproductor sonando en todo SURCOGS, aunque tengas varias pestañas
// abiertas: al dar play, las demás se enteran por este canal y se cierran.
const canalPlayer = ("BroadcastChannel" in window) ? new BroadcastChannel("surcogs-player") : null;
if (canalPlayer) canalPlayer.onmessage = (ev) => { if (ev.data === "play") cerrarPlayer(); };

export function cerrarPlayer() {
  const f = document.getElementById("pl-frame");
  const p = document.getElementById("player");
  if (!f || !p) return;
  f.innerHTML = "";           // corta el audio: si no, sigue sonando de fondo
  p.style.display = "none";
  ajustarBarras();
}

// Las flechitas que hacen scroll dentro de la lista de temas. Se instalan
// una sola vez para toda la pantalla, no una por tarjeta.
let flechasPuestas = false;
function activarFlechas() {
  if (flechasPuestas) return;
  flechasPuestas = true;
  document.addEventListener("click", (ev) => {
    const b = ev.target.closest(".gtk-nav");
    if (!b) return;
    ev.preventDefault(); ev.stopPropagation();
    const lista = b.parentElement.querySelector(".gtk-list");
    if (lista) lista.scrollBy({ top: Number(b.dataset.tk) * 22, behavior: "smooth" });
  });
}

// Enganchar los botones de tema despues de dibujar. Cada boton guarda la
// posicion del disco dentro de la lista que se dibujo, asi que hay que
// pasarle esa misma lista y en el mismo orden.
export function activarTracks(lista, raiz = document) {
  montarPlayer();
  activarFlechas();
  raiz.querySelectorAll("[data-play]").forEach((b) => {
    b.onclick = () => {
      const [di, ti] = b.dataset.play.split(":").map(Number);
      const d = lista[di];
      if (d) reproducirDisco(d, ti);
    };
  });
}
