# SURCOGS — Estado del proyecto

> Documento de contexto para retomar el proyecto en cualquier conversación nueva.
> Última actualización: 18 de agosto de 2026.

---

## 1. Qué es y dónde está

**SURCOGS** es un marketplace P2P de vinilos, con foco inicial en techno, para el
mercado argentino. Está **en producción** en **surcogs.com.ar**.

- **Visión:** ser el lugar donde los coleccionistas de vinilo de música electrónica
  de Latinoamérica compran y venden entre sí de forma simple y confiable.
- **Misión:** que consumidores finales compren y vendan vinilos techno cómodamente,
  sin fricción y con confianza entre pares.
- **Roles de trabajo:** Nico es el Product Manager y toma toda decisión final
  (prioridades, roadmap, alcance, trade-offs). Claude cubre el resto como equipo:
  marketing y growth, diseño UX/UI, tecnología, legal/pagos, finanzas y operaciones,
  proponiendo con criterio de especialista senior y presentando opciones con pros y contras.
- **Referentes a analizar:** Discogs, Mercado Libre, Wallapop, Bandcamp.
- **Idioma:** español rioplatense, directo y conciso.

**Estado actual:** el sitio está vivo, con catálogo cargado (~173 discos), pagos
funcionando, notificaciones, carrito y reproductor. **Todavía no se hizo ninguna
venta real ni se probó el circuito de compra de punta a punta.**

**Fecha de lanzamiento objetivo: jueves 10 de septiembre de 2026.**
(Nico había dicho "6 de septiembre", pero ese día cae domingo.)

---

## 2. Modelo de negocio y precios

Esta es la decisión económica central y hay que respetarla en todo el código:

- **`records.price` es siempre lo que RECIBE el vendedor**, intacto. Nunca se toca.
- **El comprador paga ese precio + 15%.** Ese 15% es el ingreso de SURCOGS.
- **Descuento del 10% pagando por transferencia**, para evitar la comisión de
  Mercado Pago.
- **El envío no paga comisión** y va completo al vendedor.
- **Publicar es gratis.**

### Fórmulas exactas (frontend y backend tienen que coincidir)

```js
const RECARGO = 0.15;
const DTO_TRANSFER = 0.10;

precioComprador     = Math.round(precioVendedor * 1.15)
precioTransferencia = Math.round(precioComprador * 0.9)   // se redondea disco por disco
```

El total del carrito por transferencia se calcula **disco por disco** y recién
después se suma el envío (el envío no tiene descuento), igual que lo hace el
servidor en `/api/reserva`.

### Flujo del dinero (escrow manual)

1. El comprador paga **a la cuenta de Mercado Pago de SURCOGS** (no del vendedor).
2. Mercado Pago descuenta su comisión (acreditación **al instante**: 6,60% + IVA).
   Se eligió acreditación al día/instante a propósito, resignando margen inicial
   a cambio de velocidad y confianza.
3. SURCOGS le transfiere al vendedor **por alias** cuando el comprador confirma que
   recibió el disco, **o automáticamente a los 10 días** si no hubo reclamo.
4. El panel de liquidaciones (`/liquidaciones.html`) es la herramienta de Nico para
   ver a quién le tiene que transferir.

**Importante:** el usuario no ve toda esta mecánica. Al vendedor se le comunica
simplemente que cobra cuando el comprador confirma la entrega.

---

## 3. Arquitectura técnica

| Capa | Qué se usa |
|---|---|
| Frontend | HTML + JS vanilla (ES modules), sin framework ni build |
| Backend | Cloudflare Pages Functions (`/functions/api/*.js`) |
| Base de datos y auth | Supabase (Postgres + RLS + Storage para fotos) |
| Hosting y CDN | Cloudflare Pages, auto-deploy desde GitHub |
| Repo | `github.com/kinenzarg-droid/surcogs`, rama `main` |
| Pagos | Mercado Pago Checkout Pro **centralizado** (un solo token, sin split ni OAuth) |
| Mails | Resend |
| Datos de discos | API de Discogs (`releases/{id}`, incluye `videos[]` para el audio) |

### Estructura del repo

```
public/            → el sitio (index, disco, publicar, cuenta, perfil,
                     notificaciones, liquidaciones, courier, etiquetas, r.html…)
public/js/app.js   → header compartido, sesión, helpers de precio, campanita,
                     botón "volver arriba"
public/css/style.css
functions/api/     → create-preference, mp-webhook, reserva, recibido,
                     liquidaciones, courier, discogs, rate, metrics, _notificar
*.sql              → los scripts que se corrieron en Supabase
```

### Variables de entorno (en Cloudflare Pages)

`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `MP_ACCESS_TOKEN`, `RESEND_API_KEY`,
`ADMIN_EMAIL`, `ADMIN_KEY`, `SITE_URL`, `WHATSAPP_SURCOGS`, `DISCOGS_TOKEN`.

---

## 4. Cómo se deploya (el flujo real)

No hay git local ni terminal conectada al repo. El flujo que funciona es:

1. Claude edita los archivos en su carpeta de trabajo.
2. Claude abre `github.com/kinenzarg-droid/surcogs/upload/main/<carpeta>` en Chrome.
3. Claude descarga el archivo actual desde `raw.githubusercontent.com`, le aplica
   parches de texto con contexto único, **verifica el resultado contra un hash de
   bytes de su copia local**, y lo inyecta en el `<input type=file>` vía `DataTransfer`.
4. Nico aprieta **Commit changes**.
5. Cloudflare rebuildea solo.

**Lecciones aprendidas de este flujo:**

- Verificar siempre por **bytes UTF-8**, no por `.length` de JavaScript: los emoji
  cuentan doble en JS y hacen fallar comparaciones que en realidad estaban bien.
- Mandar archivos comprimidos en base64 en un solo mensaje se corrompe seguido
  arriba de ~7 KB. Conviene el método de traer-y-parchear, que manda solo el diff.
- Si la pestaña de Chrome se reinicia, lo inyectado se pierde y hay que rehacerlo.
- Arrastrar archivos a mano desde Windows puede subirlos con **nombre corto 8.3**
  (`NOTIFI~1.HTM` en vez de `notificaciones.html`). Ya pasó una vez.

### Supabase

Al correr SQL en el editor de Supabase, usar siempre el botón **"Run"** común.
La opción "Run and enable RLS" mete un wrapper que rompe los scripts largos
(dio `ERROR: 42P01: relation "Fear" does not exist` con un UPDATE de 82 mil caracteres).

### Cache de Cloudflare

El archivo `_headers` **no alcanza**: Cloudflare seguía mandando `max-age=14400`.
La solución real fue una **Cache Rule en el dashboard** con Browser TTL en "Bypass cache".
Si un cambio "no aparece", revisar eso antes que el código.

---

## 5. Base de datos

Tablas principales: `profiles`, `records`, `orders`, `ratings`, `shipments`,
`notificaciones`, `mp_tokens` (obsoleta, del modelo viejo con split).

Scripts que ya se corrieron: `supabase-schema.sql`, `sql-pagos.sql`,
`sql-logistica.sql`, `sql-notificaciones.sql`.

Columnas que importan en `orders`: `amount`, `fee`, `monto_vendedor`, `metodo_pago`,
`purchase_id`, `status`, `pagado_at`, `entregado_at`, `liquidado_at`, `rating_token`,
`shipping_cost`, y los `buyer_*` (nombre, teléfono, dirección, zona, localidad, CP, email).

En `records`: `price` (neto del vendedor), `condition_media`, `shipping_mode`,
`shipping_cost`, `status` (disponible/reservado/vendido), `reservado_hasta`,
`zona`, `localidad`, `tracks` (jsonb), `photos`.

**Vista `liquidaciones_pendientes`:** junta orders + records + profiles y calcula
`liberable` = el comprador confirmó, o pasaron 10 días desde `pagado_at`.

---

## 6. El circuito de compra

### Con Mercado Pago

1. `/api/create-preference` valida los discos, chequea que sean todos del mismo
   vendedor, crea una orden por disco agrupadas por `purchase_id`, y devuelve el
   `init_point` de Mercado Pago.
2. El comprador paga.
3. `/api/mp-webhook` consulta el pago real contra la API de MP (nunca confía solo
   en el webhook), marca las órdenes como `pagada`, los discos como `vendido`,
   crea el paquete para el courier, notifica al vendedor en la campanita y manda
   dos mails: al vendedor ("vendiste") y al comprador con el botón **"Ya lo recibí"**.
4. El comprador toca "Ya lo recibí" → `/r.html` → `/api/recibido` marca `entregado_at`,
   notifica al vendedor y le avisa a Nico por mail con el alias para transferir.
5. Nico entra a `/liquidaciones.html`, transfiere y marca "Ya le transferí".

### Por transferencia (10% off)

1. `/api/reserva` reserva los discos **24 horas**, crea las órdenes en estado
   `reservado` y devuelve un link de WhatsApp con el detalle y el código de compra.
2. El comprador transfiere y le escribe a Nico por WhatsApp.
3. Nico entra a `/liquidaciones.html` → sección **"Transferencias por cobrar"** →
   botón **"Ya me transfirió"**. Eso marca la compra como pagada, pasa los discos a
   vendido, notifica al vendedor y le manda al comprador el mismo mail con
   "Ya lo recibí".
4. De ahí en adelante es igual que Mercado Pago.

---

## 7. Decisiones de producto tomadas

- **Carrito sin cuenta.** Se puede armar el carrito sin estar registrado; el login
  se pide recién al momento de pagar.
- **Un carrito = un vendedor.** No se permite mezclar discos de distintos vendedores
  en una misma compra.
- **Un solo envío por vendedor:** se cobra el más caro del grupo.
- **Ficha del disco sin recargar la página**, para que el audio nunca se corte.
- **Un solo audio sonando a la vez**, incluso entre pestañas distintas
  (se resuelve con `BroadcastChannel`).
- **Sellos discográficos clickeables** en la tarjeta y en el reproductor: filtran el
  catálogo. El artista filtra **solo desde el reproductor**, no desde la tarjeta.
- **Estado del disco siempre visible** en la tarjeta del catálogo.
- **Se sacó el estado de la tapa.** Solo se califica el vinilo.
- **Se sacó el "audio de referencia general".** El audio va tema por tema.
- **Solo YouTube** para cargar audio. Se sacaron SoundCloud y Spotify del formulario
  de publicar (la reproducción de links viejos de esas plataformas sigue andando).
- **Escala Goldmine** como estándar de calificación, explicada en el pie del catálogo,
  en publicar y en la ficha.
- **Se descartó** copiar el layout de decks.de. Se sigue con el diseño actual.

---

## 8. Bugs encontrados y arreglados (18 de agosto)

Revisando el circuito de compra antes del test real aparecieron cuatro bugs,
tres de ellos bloqueantes para el lanzamiento:

1. **El webhook nunca marcaba la compra como pagada.** Buscaba el token de Mercado
   Pago del vendedor en `mp_tokens`, tabla que quedó del modelo viejo con split y
   que hoy está vacía para todos. El webhook cortaba ahí: el comprador pagaba, la
   plata entraba, y en la plataforma no pasaba nada.
   → Ahora consulta el pago con `MP_ACCESS_TOKEN` de SURCOGS.
2. **`notificar()` se usaba sin importarlo** en `mp-webhook.js`. Tiraba
   `ReferenceError` y se salteaba los dos mails.
3. **El paquete del courier salía sin los datos del comprador**: el `select` de
   órdenes no traía los campos `buyer_*`.
4. **Las compras por transferencia no se podían confirmar.** Quedaban en `reservado`
   y a las 24 horas el disco **volvía al catálogo aunque ya te hubieran pagado**,
   quedando disponible para venderse dos veces.
   → Se agregó la sección "Transferencias por cobrar" al panel de liquidaciones.

**Conclusión operativa:** el circuito completo nunca corrió de verdad. Hasta que no
se haga el test punta a punta con plata real, hay que asumir que puede haber más.

---

## 9. Lo que falta

### Antes del lanzamiento (bloqueante)

- [ ] **Test de compra punta a punta con plata real.** Publicar un disco de $1.000,
      comprarlo desde otro navegador y otro mail, y seguir todo el circuito:
      pago → mail → "Ya lo recibí" → aviso con el alias → panel de liquidaciones.
      Hacer las dos variantes: Mercado Pago y transferencia.
- [ ] **Cuenta de Tarbet y traspaso del catálogo.** Los ~173 discos que hoy están en
      la cuenta de Nico son de Tarbet. Él se registra, carga alias/zona/dirección, y
      se corre `sql-traspaso-tarbet.sql`. Decisiones ya tomadas: se registra él mismo,
      pasan todos los discos disponibles, y se actualiza la zona a la de Tarbet.
      Los discos ya vendidos se quedan en la cuenta de Nico (están atados a órdenes
      y a la reputación de esa venta).
- [ ] **Conectar los mails de auth de Supabase a Resend** para que salgan desde
      surcogs.com.ar y no desde el dominio de Supabase.

### Captación de vendedores

Contactos a sumar (venden por Instagram): **Nano, Pulso, Tarbet, Dj Homeless,
Intech, Luqui, SMT**. Falta que Nico pase los @ de cada uno y diga a quién conoce
personalmente, para escribir un mensaje distinto según el caso.

### Backlog de producto

- [ ] **"Lo quieren 4":** mostrar cuánta gente tiene el disco en el carrito. Hoy el
      carrito vive solo en `localStorage`, así que requiere una tabla nueva en
      Supabase. Recomendación: mostrarlo recién a partir de 3 personas, porque
      "lo quiere 1 persona" comunica lo contrario de lo que se busca.
- [ ] **Páginas de sello y de artista estilo Discogs.**
- [ ] **Los 16 discos sin audio** (de 173). Hoy hay audio en el 79% de los temas y
      el 91% de los discos.
- [ ] Logística propia: panel de courier y etiquetas con QR (a medio hacer).

---

## 10. Cosas para no olvidar

- **Medir antes de afirmar.** En un momento se reportó "60% de audios cargados"
  mirando solo la primera página del catálogo. El número real era 79% de temas y
  91% de discos.
- **Verificar en el sitio real, no en el código.** Varias veces un cambio estaba
  bien en el archivo y no aparecía en producción por cache.
- **El `_headers` no resuelve el cache.** La Cache Rule del dashboard sí.
- **Supabase: siempre "Run" común**, nunca "Run and enable RLS".
- Nico prefiere respuestas **concisas y directas**, sin explicaciones de más.
