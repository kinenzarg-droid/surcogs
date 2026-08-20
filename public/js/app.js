// SURCOGS — módulo compartido
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const { SUPABASE_URL, SUPABASE_ANON_KEY } = window.SURCOGS_CONFIG;
export const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export const GRADOS = ["M", "NM", "VG+", "VG", "G+", "G"];

// Zonas y localidades para perfiles y discos
export const ZONAS = {
  "CABA": ["Agronomía", "Almagro", "Balvanera", "Barracas", "Belgrano", "Boedo", "Caballito",
    "Chacarita", "Coghlan", "Colegiales", "Constitución", "Flores", "Floresta", "La Boca",
    "La Paternal", "Liniers", "Mataderos", "Monte Castro", "Monserrat", "Nueva Pompeya", "Núñez",
    "Palermo", "Parque Avellaneda", "Parque Chacabuco", "Parque Chas", "Parque Patricios",
    "Puerto Madero", "Recoleta", "Retiro", "Saavedra", "San Cristóbal", "San Nicolás", "San Telmo",
    "Vélez Sársfield", "Versalles", "Villa Crespo", "Villa del Parque", "Villa Devoto",
    "Villa General Mitre", "Villa Lugano", "Villa Luro", "Villa Ortúzar", "Villa Pueyrredón",
    "Villa Real", "Villa Riachuelo", "Villa Santa Rita", "Villa Soldati", "Villa Urquiza"],
  "GBA Norte": ["Vicente López", "Olivos", "Florida", "Munro", "Villa Martelli", "San Isidro",
    "Martínez", "Acassuso", "Beccar", "Boulogne", "Villa Adelina", "San Fernando", "Victoria",
    "Tigre", "Don Torcuato", "Pacheco", "Benavídez", "Nordelta", "Escobar", "Garín", "Maquinista Savio",
    "Pilar", "Del Viso", "San Martín", "Villa Ballester", "San Andrés", "José León Suárez",
    "San Miguel", "Bella Vista", "Muñiz", "José C. Paz", "Malvinas Argentinas", "Los Polvorines",
    "Grand Bourg", "Campana", "Zárate"],
  "GBA Oeste": ["La Matanza", "San Justo", "Ramos Mejía", "Lomas del Mirador", "Villa Luzuriaga",
    "Isidro Casanova", "González Catán", "Laferrere", "Morón", "Castelar", "Haedo", "El Palomar",
    "Hurlingham", "Villa Tesei", "William Morris", "Ituzaingó", "Parque Leloir", "Merlo",
    "San Antonio de Padua", "Libertad", "Moreno", "Paso del Rey", "Francisco Álvarez",
    "Tres de Febrero", "Caseros", "Ciudadela", "Santos Lugares", "Sáenz Peña", "Villa Bosch",
    "General Rodríguez", "Marcos Paz", "Luján", "General Las Heras"],
  "GBA Sur": ["Avellaneda", "Sarandí", "Wilde", "Gerli", "Piñeyro", "Lanús", "Remedios de Escalada",
    "Monte Chingolo", "Valentín Alsina", "Lomas de Zamora", "Banfield", "Temperley", "Turdera",
    "Llavallol", "Quilmes", "Bernal", "Don Bosco", "Ezpeleta", "San Francisco Solano", "Berazategui",
    "Ranelagh", "Hudson", "Florencio Varela", "Almirante Brown", "Adrogué", "Burzaco", "Glew",
    "Longchamps", "Rafael Calzada", "Claypole", "Esteban Echeverría", "Monte Grande", "Ezeiza",
    "Canning", "San Vicente", "Guernica", "Cañuelas"],
  "La Plata y alrededores": ["La Plata", "City Bell", "Gonnet", "Villa Elisa", "Tolosa", "Ringuelet",
    "Los Hornos", "Berisso", "Ensenada", "Brandsen", "Magdalena"],
  "Interior del país": ["Córdoba", "Rosario", "Santa Fe", "Mendoza", "San Miguel de Tucumán",
    "Mar del Plata", "Bahía Blanca", "Tandil", "Salta", "San Salvador de Jujuy", "Neuquén",
    "Cipolletti", "Bariloche", "Paraná", "Corrientes", "Resistencia", "Posadas", "Formosa",
    "Santiago del Estero", "Catamarca", "La Rioja", "San Juan", "San Luis", "Santa Rosa",
    "Rawson", "Comodoro Rivadavia", "Río Gallegos", "Ushuaia"],
};

// Zona (select) → localidad (input con autocompletado). Si no está en la lista, se puede escribir igual.
export function zonaSelector(selZona, inpLoc, zonaVal = "", locVal = "") {
  selZona.innerHTML = `<option value="">Elegí tu zona…</option>` +
    Object.keys(ZONAS).map(z => `<option ${z === zonaVal ? "selected" : ""}>${z}</option>`).join("");

  // datalist para autocompletar mientras escribe
  const dlId = "dl-" + (inpLoc.id || Math.random().toString(36).slice(2));
  let dl = document.getElementById(dlId);
  if (!dl) { dl = document.createElement("datalist"); dl.id = dlId; inpLoc.after(dl); }
  inpLoc.setAttribute("list", dlId);
  inpLoc.setAttribute("autocomplete", "off");
  inpLoc.placeholder = "Escribí tu localidad o barrio…";

  const llenar = (loc) => {
    const locs = ZONAS[selZona.value] || [];
    dl.innerHTML = locs.map(l => `<option value="${l}">`).join("");
    inpLoc.value = loc || "";
    inpLoc.disabled = !selZona.value;
  };
  selZona.onchange = () => llenar("");
  llenar(locVal);
}
export const ADMIN_ID = window.SURCOGS_CONFIG.ADMIN_ID || null;

export const fmtPrecio = (n) => "$" + Number(n).toLocaleString("es-AR");

// El precio guardado (records.price) es lo que RECIBE el vendedor.
// El comprador ve el precio con comisiones incluidas.
// Debe coincidir con functions/api/create-preference.js
// El vendedor cobra su precio intacto. El comprador paga ese precio + 15%,
// que cubre la comisión de Mercado Pago y el servicio de SURCOGS.
export const RECARGO = 0.15;
export const DTO_TRANSFER = 0.10;    // descuento por pagar con transferencia
export const precioComprador = (neto) =>
  Math.round(Number(neto) * (1 + RECARGO));
export const precioTransferencia = (neto) =>
  Math.round(precioComprador(neto) * (1 - DTO_TRANSFER));

export async function getUser() {
  const { data } = await sb.auth.getUser();
  return data.user || null;
}

export async function getPerfil(userId) {
  const { data } = await sb.from("profiles").select("*").eq("id", userId).maybeSingle();
  return data;
}

// Header compartido — estilo SoundCloud
// Texto de la tira: frases encadenadas sin huecos. Se repite lo suficiente
// para cubrir cualquier ancho de pantalla, así el verde nunca queda vacío.
function tiraTexto() {
  const frases = [
    "10% de descuento pagando por transferencia",
    "Tu plata protegida: el vendedor cobra cuando confirmás que recibiste el disco",
    "Publicar es gratis",
    "Vinilos de mano en mano, entre coleccionistas",
  ];
  return `<span>${(frases.join(" · ") + " · ").repeat(3)}</span>`;
}

// Cabeceras para pegarle a nuestras funciones del servidor identificándonos.
// Si no hay sesión devuelve solo el Content-Type: hay endpoints que se pueden
// usar sin cuenta (el carrito, por ejemplo).
export async function authHeaders() {
  const h = { "Content-Type": "application/json" };
  try {
    const { data } = await sb.auth.getSession();
    const t = data?.session?.access_token;
    if (t) h.Authorization = `Bearer ${t}`;
  } catch (_) { /* sin sesión */ }
  return h;
}

// "hace 5 min", "hace 2 h", "ayer"… más humano que una fecha suelta
// Icono y color de fondo por tipo de notificacion. Una sola fuente de verdad:
// la usan la campanita del header y la pagina /notificaciones.html.
export const ICONOS_NOTIF = {
  venta:        { ico: "\u{1F4BF}", bg: "#e3f5ea" },
  pago:         { ico: "\u{1F4B8}", bg: "#ffeee4" },
  calificacion: { ico: "\u2B50",    bg: "#fff6dc" },
  entrega:      { ico: "\u2705",    bg: "#e3f5ea" },
  envio:        { ico: "\u{1F69A}", bg: "#e6f0f6" },
  reserva:      { ico: "\u23F3",    bg: "#f0f0f0" },
  bienvenida:   { ico: "\u{1F44B}", bg: "#ffeee4" },
};
export const iconoNotif = (tipo) =>
  ICONOS_NOTIF[tipo] || { ico: "\u{1F514}", bg: "#f0f0f0" };

export function hace(fecha) {
  const seg = Math.floor((Date.now() - new Date(fecha).getTime()) / 1000);
  if (seg < 60) return "recién";
  if (seg < 3600) return `hace ${Math.floor(seg / 60)} min`;
  if (seg < 86400) return `hace ${Math.floor(seg / 3600)} h`;
  const d = Math.floor(seg / 86400);
  if (d === 1) return "ayer";
  if (d < 30) return `hace ${d} días`;
  return new Date(fecha).toLocaleDateString("es-AR");
}

export async function renderHeader(activo) {
  const user = await getUser();
  let avatarInner = "";
  if (user) {
    const perfil = await getPerfil(user.id);
    const iniciales = (perfil?.name || "")
      .trim().split(/\s+/).map(w => w[0]).slice(0, 2).join("").toUpperCase() || "YO";
    avatarInner = perfil?.avatar_url
      ? `<img src="${perfil.avatar_url}" alt="Mi foto">`
      : iniciales;
  }
  const el = document.getElementById("header");
  el.innerHTML = `
    <div class="hwh-banner">
      <a href="/"><span class="hwh-word">SURC</span><svg class="vinilo-o" viewBox="0 0 40 40" aria-hidden="true"><g class="vo-gira"><circle cx="20" cy="20" r="18" fill="#000" stroke="#ff5500" stroke-width="4.5"/><circle cx="20" cy="20" r="9.5" fill="#ff5500"/><text class="vo-txt" x="20" y="22.2" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="7" font-weight="700" fill="#000">SCS</text><circle cx="20" cy="20" r="1.2" fill="#000"/><path d="M20 2.8 L20 6.5" stroke="#fff" stroke-width="1.5"/></g></svg><span class="hwh-word">GS</span></a>
    </div>
    <header class="hwh-bar">
      <a class="hwh-brand-m" href="/">SURC<svg class="vinilo-o" viewBox="0 0 40 40" aria-hidden="true"><g class="vo-gira"><circle cx="20" cy="20" r="18" fill="#000" stroke="#ff5500" stroke-width="4.5"/><circle cx="20" cy="20" r="9.5" fill="#ff5500"/><text class="vo-txt" x="20" y="22.2" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="7" font-weight="700" fill="#000">SCS</text><circle cx="20" cy="20" r="1.2" fill="#000"/><path d="M20 2.8 L20 6.5" stroke="#fff" stroke-width="1.5"/></g></svg>GS</a>
      <nav class="hwh-tabs">
        <a href="/" class="${activo === "catalogo" ? "on" : ""}">Catálogo</a>
        <a href="${user ? "/perfil.html?id=" + user.id : "/cuenta.html"}"
           class="${activo === "coleccion" ? "on" : ""}">Mi colección</a>
      </nav>
      <div class="search">
        <input id="hdr-q" type="search" placeholder="Buscar artista, disco o sello" autocomplete="off">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.4"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.5" y2="16.5"/></svg>
        <div class="search-dd" id="hdr-dd"></div>
      </div>
      <a class="btn-cta" href="${user ? "/publicar.html" : "/vender.html"}">Vender gratis</a>
      <div class="hdr-links">
        ${user ? `
          <div class="campana-wrap">
            <button class="campana" id="campana-btn" title="Notificaciones" aria-label="Notificaciones">
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                <path d="M13.7 21a2 2 0 0 1-3.4 0"/>
              </svg>
              <span class="campana-n" id="campana-n" style="display:none">0</span>
            </button>
            <div class="notif-panel" id="notif-panel">
              <div class="notif-h">Notificaciones</div>
              <div id="notif-lista"><p class="notif-vacio">Cargando…</p></div>
              <a class="notif-todas" href="/notificaciones.html">Ver todas</a>
            </div>
          </div>
          <div class="avatar-wrap">
            <button class="avatar" id="avatar-btn" title="Menú">${avatarInner}</button>
            <div class="avatar-menu" id="avatar-menu">
              <a href="/cuenta.html">Mi cuenta</a>
              <a href="/cuenta.html#compras">Compras</a>
              <a href="/cuenta.html#ventas">Ventas</a>
              <a href="#" class="salir" id="btn-salir">Salir</a>
            </div>
          </div>` : `
          <a class="btn-ing" href="/cuenta.html">Ingresar</a>
          <a class="btn-reg" href="/cuenta.html?registro=1">Registrarse</a>`}
      </div>
    </header>
    <div class="tira" aria-label="10% de descuento pagando por transferencia">
      <div class="tira-in">${tiraTexto()}${tiraTexto()}</div>
    </div>`;

  // Un solo desplegable abierto a la vez: campanita, menú del avatar y buscador
  // se cierran entre sí. También cierran con Escape y con un clic afuera.
  const paneles = [];
  const cerrarPaneles = (menos) => paneles.forEach(p => { if (p && p !== menos) p.style.display = "none"; });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") cerrarPaneles(); });
  document.addEventListener("click", (e) => {
    // tocar el buscador cierra los otros dos, pero no su propio desplegable
    if (e.target.closest(".search")) { cerrarPaneles(document.getElementById("hdr-dd")); return; }
    if (e.target.closest(".campana-wrap, .avatar-wrap")) return;
    cerrarPaneles();
  });

  // Campanita: últimas 3 notificaciones y cuántas sin leer
  if (user) {
    const btn = document.getElementById("campana-btn");
    const panel = document.getElementById("notif-panel");
    const bolita = document.getElementById("campana-n");

    const pintarNotis = (ns) => {
      const lista = document.getElementById("notif-lista");
      if (!ns.length) {
        lista.innerHTML = `<p class="notif-vacio">Todavía no tenés novedades.</p>`;
        return;
      }
      lista.innerHTML = ns.map(n => {
        const { ico, bg } = iconoNotif(n.tipo);
        return `
        <a class="notif ${n.leida ? "" : "sin-leer"}" href="${n.link || "/cuenta.html"}">
          <span class="notif-ico" style="--nico-bg:${bg}">${ico}</span>
          <span class="notif-txt">
            <span class="notif-t">${n.titulo}</span>
            ${n.detalle ? `<span class="notif-d">${n.detalle}</span>` : ""}
            <span class="notif-f">${hace(n.created_at)}</span>
          </span>
        </a>`; }).join("");
    };

    const cargar = async () => {
      const { data } = await sb.from("notificaciones")
        .select("*").eq("user_id", user.id)
        .order("created_at", { ascending: false }).limit(3);
      pintarNotis(data || []);
      const { count } = await sb.from("notificaciones")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id).eq("leida", false);
      if (count > 0) { bolita.textContent = count > 9 ? "9+" : count; bolita.style.display = "block"; }
      else bolita.style.display = "none";
    };
    cargar();

    paneles.push(panel);
    btn.onclick = async (e) => {
      e.stopPropagation();
      const abierto = panel.style.display === "block";
      cerrarPaneles(panel);
      panel.style.display = abierto ? "none" : "block";
      if (abierto) return;
      // al abrirlas se dan por vistas
      await sb.from("notificaciones").update({ leida: true })
        .eq("user_id", user.id).eq("leida", false);
      bolita.style.display = "none";
    };
  }

  // Menú del avatar
  if (user) {
    const menu = document.getElementById("avatar-menu");
    paneles.push(menu);
    document.getElementById("avatar-btn").onclick = (e) => {
      e.stopPropagation();
      const abierto = menu.style.display === "block";
      cerrarPaneles(menu);
      menu.style.display = abierto ? "none" : "block";
    };
    document.getElementById("btn-salir").onclick = async (e) => {
      e.preventDefault();
      await sb.auth.signOut();
      location.href = "/";
    };
  }

  // Búsqueda global: Enter → catálogo con el término
  const q = document.getElementById("hdr-q");
  const dd = document.getElementById("hdr-dd");
  paneles.push(dd);
  // Tocar o escribir en el buscador cierra la campanita y el menú del avatar
  q.addEventListener("focus", () => cerrarPaneles(dd));
  q.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && q.value.trim()) {
      location.href = "/?q=" + encodeURIComponent(q.value.trim());
    }
    if (e.key === "Escape") dd.style.display = "none";
  });

  // Autocompletado con miniaturas mientras tipeás
  let ddTimer;
  q.addEventListener("input", () => {
    clearTimeout(ddTimer);
    cerrarPaneles(dd);
    const term = q.value.trim().replace(/[,()]/g, " ");
    if (term.length < 2) { dd.style.display = "none"; return; }
    ddTimer = setTimeout(async () => {
      const { data } = await sb.from("records")
        .select("id, artist, title, label, photos, status")
        .or(`artist.ilike.%${term}%,title.ilike.%${term}%,label.ilike.%${term}%`)
        .neq("status", "vendido")
        .limit(6);
      if (!data || !data.length) {
        dd.innerHTML = `<div class="sd-empty">Sin resultados para "${term.replace(/</g, "&lt;")}"</div>`;
        dd.style.display = "block";
        return;
      }
      dd.innerHTML = data.map(r => `
        <a href="/disco.html?id=${r.id}">
          <img src="${fotoPrincipal(r)}" alt="">
          <div>
            <div class="sd-t">${r.title.replace(/</g, "&lt;")}</div>
            <div class="sd-a">${r.artist.replace(/</g, "&lt;")}${r.label ? " · " + r.label.replace(/</g, "&lt;") : ""}</div>
          </div>
        </a>`).join("");
      dd.style.display = "block";
    }, 250);
  });

  botonArriba();
}

// Botón redondo fijo abajo a la derecha para volver al principio de la página.
// Se sube solo cuando el reproductor está visible, así nunca queda tapado.
export function botonArriba() {
  if (document.getElementById("btn-arriba")) return;
  const b = document.createElement("button");
  b.id = "btn-arriba";
  b.type = "button";
  b.title = "Volver arriba";
  b.setAttribute("aria-label", "Volver arriba");
  b.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V6"/><path d="M5 12l7-7 7 7"/></svg>`;
  b.onclick = () => window.scrollTo({ top: 0, behavior: "smooth" });
  document.body.appendChild(b);

  // Cuánto ocupan las cosas fijas abajo (reproductor, y en celular la bandeja
  // del carrito), para apoyar el botón justo arriba de ellas.
  const ocupado = () => {
    let alto = 0;
    document.querySelectorAll("#player, .cartp").forEach(el => {
      if (!el.offsetHeight) return;
      const r = el.getBoundingClientRect();
      // solo cuenta si está pegado al borde de abajo de la pantalla
      if (r.bottom >= window.innerHeight - 2) alto = Math.max(alto, r.height);
    });
    return alto;
  };
  let ultimo = -1;
  const acomodar = () => {
    b.classList.toggle("ver", window.scrollY > 400);
    const abajo = ocupado() + 18;
    if (abajo === ultimo) return;      // sin esto el observer se retroalimenta
    ultimo = abajo;
    b.style.bottom = abajo + "px";
  };
  acomodar();
  window.addEventListener("scroll", acomodar, { passive: true });
  window.addEventListener("resize", acomodar);
  // el reproductor y la bandeja del carrito aparecen sin que uno scrollee
  const obs = new MutationObserver(acomodar);
  document.querySelectorAll("#player, .cartp").forEach(el =>
    obs.observe(el, { attributes: true, attributeFilter: ["style", "class"] }));
}

export function youtubeId(url) {
  if (!url) return null;
  const m = url.match(/(?:youtu\.be\/|v=|shorts\/|embed\/)([\w-]{11})/);
  return m ? m[1] : null;
}

export function fotoPrincipal(rec) {
  return rec.photos && rec.photos.length
    ? rec.photos[0]
    : "data:image/svg+xml," + encodeURIComponent(
        `<svg xmlns='http://www.w3.org/2000/svg' width='400' height='400'><rect width='400' height='400' fill='#1a1a1a'/><circle cx='200' cy='200' r='140' fill='#111' stroke='#333' stroke-width='2'/><circle cx='200' cy='200' r='45' fill='#222'/><circle cx='200' cy='200' r='6' fill='#0a0a0a'/></svg>`);
}

// Reputación: promedio de estrellas de un vendedor, estilo "★★★★★ 100.0%, 79 valoraciones"
export async function reputacionHTML(sellerId) {
  // Solo las que le hicieron COMO VENDEDOR. Sin este filtro, las calificaciones
  // que él le pone a sus compradores se le sumarían a su propia reputación.
  const { data } = await sb.from("ratings").select("stars")
    .eq("seller_id", sellerId).eq("tipo", "a_vendedor");
  if (!data || !data.length) return `<span class="hint">Vendedor nuevo, sin valoraciones todavía</span>`;
  const avg = data.reduce((a, r) => a + r.stars, 0) / data.length;
  const full = Math.round(avg);
  return `<span class="stars">${"★".repeat(full)}${"☆".repeat(5 - full)}</span>
    <b>${((avg / 5) * 100).toFixed(1)}%</b>, ${data.length} valoraci${data.length === 1 ? "ón" : "ones"}`;
}

export function toast(msg, err = false) {
  let t = document.createElement("div");
  t.className = "toast" + (err ? " err" : "");
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 4000);
}
