# LecturAPP

Biblioteca digital personal para leer libros EPUB, escuchar audiolibros y leer cómics CBZ/CBR desde el navegador, con historial de lectura por usuario.

> Este repositorio está gobernado por [Karajan Code](https://karajancode.com). Antes de contribuir, lee [Repositorio gobernado por Karajan Code](#repositorio-gobernado-por-karajan-code).

## Estado del proyecto

El proyecto está en plena transición de arquitectura:

| Pieza | Estado | Tecnología |
|-------|--------|------------|
| Frontend (`src/`, `public/`) | En producción | Astro 5 (sitio estático), Pico CSS, EPUB.js, JSZip |
| Login, catálogo e historial | En producción | Firebase Auth (Google) y Realtime Database |
| Ficheros de contenido | En producción | Servidor Nginx propio que valida el ID token de Firebase |
| Backend propio (`server/`) | En desarrollo, aún no conectado al frontend | Express + PostgreSQL 16 (`pg_trgm`) en Docker |

La idea es que el backend de `server/` sustituya a Firebase (tareas LCT-TSK-0068 y LCT-TSK-0069). Hasta entonces, el frontend sigue dependiendo de Firebase.

## Requisitos

- **Node.js 20 o superior** (probado con Node 22) y npm.
- **Git**.
- **Docker** con Docker Compose v2, solo si vas a trabajar en el backend.
- **Firebase CLI** (`npm install -g firebase-tools`), solo si vas a usar emuladores o desplegar.
- Una **cuenta de Google** dada de alta como usuario autorizado (ver la sección siguiente).

## Qué tienes que pedir al mantenedor

El repositorio es público, así que nada de esto está en él. Pídelo antes de empezar:

| Qué | Para qué | Cómo se entrega |
|-----|----------|-----------------|
| Acceso de colaborador al repositorio | Crear ramas y abrir Pull Requests | Invitación de GitHub |
| Fichero `.env` de la raíz | Configuración del cliente Firebase y URL del storage | Por un canal seguro, nunca por el repo ni por chat abierto |
| Alta de tu email de Google como usuario autorizado | Sin ella, el login te rechaza y las reglas de la base de datos no te dejan leer | La hace el mantenedor en Firebase |
| Acceso al storage de contenidos | Abrir libros, audiolibros y cómics desde `localhost` | Lo configura el mantenedor en el servidor Nginx |
| Muestra del NAS con sus `_aquitengolalista.json` | Solo para el backend: indexar y servir contenido en local | Por un canal seguro |

El fichero `server/.env` del backend **no hace falta pedirlo**: genera el tuyo propio (ver más abajo).

## Instalación del frontend

```bash
git clone -b main https://github.com/manufosela/lectur-app.git
cd lectur-app
npm install
cp .env.example .env
```

Rellena `.env` con los valores que te haya pasado el mantenedor y arranca el servidor de desarrollo:

```bash
npm run dev
```

La aplicación queda en <http://localhost:4321>. Entra con tu cuenta de Google autorizada.

`npm run dev` y `npm run build` generan antes `public/js/firebase-config.js` a partir de `.env`. Ese fichero está en `.gitignore`: no lo edites a mano ni lo subas. Si cambias `.env`, vuelve a arrancar o ejecuta `npm run generate:firebase-config`.

### Variables de `.env`

| Variable | Obligatoria | Descripción |
|----------|-------------|-------------|
| `PUBLIC_FIREBASE_API_KEY` | Sí | Configuración web del proyecto Firebase |
| `PUBLIC_FIREBASE_AUTH_DOMAIN` | Sí | Ídem |
| `PUBLIC_FIREBASE_DATABASE_URL` | Sí | URL de la Realtime Database |
| `PUBLIC_FIREBASE_PROJECT_ID` | Sí | Ídem |
| `PUBLIC_FIREBASE_STORAGE_BUCKET` | Sí | Ídem |
| `PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | Sí | Ídem |
| `PUBLIC_FIREBASE_APP_ID` | Sí | Ídem |
| `PUBLIC_STORAGE_BASE_URL` | No | Servidor de contenidos. Por defecto `https://storage.lecturapp.es` |
| `COMICS_DIR` | No | Carpeta local de cómics para `npm run generate:comics-json` |

Las variables `PUBLIC_*` acaban en el JavaScript que se sirve al navegador: no pongas nunca ahí nada que sea secreto de verdad.

## Backend (`server/`)

API REST con Express y PostgreSQL que servirá el catálogo, los ficheros y el historial. Se ejecuta con Docker.

### 1. Configura `server/.env`

```bash
cd server
cp .env.example .env
```

Edita `server/.env`:

- `JWT_SECRET`: genera uno propio con `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. Sin él, la API no arranca.
- `POSTGRES_PASSWORD`: cualquier contraseña local.
- `NAS_HOST_PATH`: carpeta de tu máquina con el contenido. Debe tener esta forma (las carpetas que falten se ignoran con un aviso):

```
<NAS_HOST_PATH>/
├── LIBROS/        _aquitengolalista.json + ficheros .epub/.pdf
├── AUDIOLIBROS/   _aquitengolalista.json + ficheros .mp3/.m4a/.m4b
└── COMICS/        _aquitengolalista.json + ficheros .cbz/.cbr
```

Cada `_aquitengolalista.json` es un árbol `{ "items": [ { "name", "clean_name", "type": "file|dir", "relpath", "ext", "size_bytes", "children" } ] }` con rutas relativas a su carpeta.

### 2. Arranca los contenedores

Desde la raíz del repo:

```bash
npm run docker:up
curl http://localhost:3001/api/health
```

Levanta PostgreSQL (puerto `5433` del host) y la API (puerto `3001`). La primera vez que se crea el volumen se aplica el esquema de `server/sql/`. Para empezar de cero: `cd server && docker compose down -v`.

### 3. Crea tu usuario e indexa el contenido

```bash
cd server
docker compose exec api node src/seed.js <email> <nombre> <contraseña>
docker compose exec api node src/indexer.js
```

El indexador lee los `_aquitengolalista.json` y rehace la tabla `catalog_items` entera.

### Endpoints

Todos menos `health` y `login` necesitan la cabecera `Authorization: Bearer <token>`, con el token que devuelve `login` (caduca en 24 h).

| Método y ruta | Descripción |
|---------------|-------------|
| `GET /api/health` | Estado de la API y de la base de datos |
| `POST /api/auth/login` | `{ email, password }` → `{ token, user }` |
| `GET /api/auth/me` | Usuario actual |
| `GET /api/catalog/search?q=&type=` | Búsqueda aproximada por nombre (`type`: `book`, `audiobook`, `comic`) |
| `GET /api/catalog/browse/<ruta>` | Contenido de una carpeta |
| `GET /api/catalog/<type>` y `/api/catalog/<type>/count` | Listado y recuento por tipo |
| `GET /api/files/<type>/<ruta>` | Descarga del fichero, con soporte de `Range` para el audio |
| `GET/POST /api/history`, `DELETE /api/history/<id>` | Historial y progreso de lectura |

Para pararlo: `npm run docker:down`.

## Scripts

| Comando | Qué hace |
|---------|----------|
| `npm run dev` | Servidor de desarrollo de Astro |
| `npm run build` | Build de producción en `dist/` |
| `npm run preview` | Sirve el build para probarlo |
| `npm run generate:firebase-config` | Regenera `public/js/firebase-config.js` desde `.env` |
| `npm run convert:cbr` | Convierte cómics CBR a CBZ |
| `npm run generate:comics-json` | Genera el JSON de cómics a partir de `COMICS_DIR` |
| `npm run docker:up` / `docker:down` | Arranca o para el backend |
| `npm run deploy` / `deploy:hosting` | Despliegue a Firebase (solo el mantenedor) |

## Estructura

```
├── src/
│   ├── pages/          index (login y menú), books, audiobooks, comics
│   ├── layouts/        Layout.astro
│   └── components/
├── public/
│   ├── js/modules/     Módulos ES: auth, content, books, navigation, catalog-loader,
│   │                   protected-download, theme, ui
│   ├── js/             app.js, books.js, audiobook-player.js, comic-reader.js
│   └── css/, images/
├── scripts/            Utilidades de línea de comandos
├── server/             Backend Express + PostgreSQL (Docker)
├── functions/          Cloud Functions (hoy solo un health check)
├── database.rules.json Reglas de la Realtime Database
└── firebase.json
```

Más detalle en [ARCHITECTURE.md](ARCHITECTURE.md) y, para agentes de IA, en [AGENTS.md](AGENTS.md).

## Repositorio gobernado por Karajan Code

Este repositorio está gobernado por [Karajan Code](https://karajancode.com) (`kj`). Sus reglas viven en el propio repositorio (`.karajan/` y `.github/workflows/kj-*`) y se comprueban en tu máquina al commitear y en la CI de cada Pull Request.

### Qué se comprueba y dónde

| Regla | En tu máquina (git hooks) | En la CI de la PR |
|-------|---------------------------|-------------------|
| Nada de commits directos en `main` | Sí | Protección de rama |
| Conventional Commits, asunto en minúscula, sin punto final, líneas de 100 caracteres como máximo | Sí | Sí |
| Sin atribución a IA en commits, título ni descripción de la PR | Sí | Sí |
| Sin credenciales ni datos personales en lo que añades | Con `kj` instalado | Sí |
| Lint de `functions/` si lo tocas | Sí | Sí |
| `npm ci` funciona | No | Sí |
| Cada commit de la PR tiene una revisión cruzada hecha por otra IA, ligada a su diff exacto | Con `kj` instalado | Sí |

### Activa los hooks en tu clon

Git no activa los hooks al clonar. Hazlo una vez, desde la raíz del repo:

```bash
git config core.hooksPath .karajan/hooks
```

Sin `kj` instalado, los hooks aplican las reglas que no dependen de él y avisan de las que se saltan.

### Dos formas de trabajar

**Con Karajan (recomendado).** Instala `kj` con [la guía de instalación](https://karajancode.com/docs/getting-started/installation) y declara tu identidad con `kj identity set`. Antes de cada commit, pide la revisión cruzada con `kj review --staged`. Al abrir la PR, publica los veredictos con `kj review --publish-pr <número>`. Necesitas un agente de IA de línea de comandos y Docker para SonarQube.

**A mano, sin Karajan.** Puedes trabajar sin instalar nada más, pero:

- Cumple tú las reglas de la tabla: los hooks y la CI rechazan lo que no las cumpla.
- La comprobación de revisión cruzada de la CI no pasará sola. El mantenedor revisará tu PR con Karajan y publicará los veredictos antes de mergearla: cuenta con ese paso extra en cada PR.
- Si añades commits después de esa revisión, hay que revisarlos otra vez.

### Limitaciones

- No uses `--no-verify` para saltarte los hooks: la CI comprueba lo mismo y la PR no se podrá mergear.
- Los ficheros de gobierno (`.karajan/hooks/`, `.github/workflows/kj-*`) no se editan a mano: los regenera `kj harden` y su cambio lo sella una persona.
- PRs pequeñas: Karajan avisa a partir de 200 líneas netas de código (la documentación no cuenta).

## Cómo contribuir

1. Parte siempre de `main` actualizada y crea una rama por tarea: `feat/<descripcion>`, `fix/<descripcion>` o `docs/<descripcion>`. Si la tarea tiene identificador (por ejemplo `LCT-TSK-0070`), ponlo en el nombre de la rama.
2. Haz commits pequeños con [Conventional Commits](https://www.conventionalcommits.org/es/): `feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`.
3. Abre una Pull Request contra `main`. Nunca hagas push directo a `main`.
4. Una PR, un propósito, y por debajo de 200 líneas netas de código.
5. En la descripción de la PR explica qué cambia, cómo lo has probado y añade capturas si toca la interfaz.

Pautas de código:

- JavaScript moderno con módulos ES, `const` por defecto y sin APIs obsoletas.
- El código nuevo del frontend va en `public/js/modules/`.
- Nada de `alert()`, `confirm()` ni `prompt()`: usa los modales de la aplicación.

Pruebas: todavía no hay tests automáticos (la CI solo aplica las reglas de Karajan). Antes de abrir la PR, ejecuta `npm run build && npm run preview` y prueba a mano el login, el logout y abrir un libro, un audiolibro y un cómic. Si tocas el backend, prueba los endpoints afectados con `curl`.

Seguridad, sobre todo porque el repositorio es público:

- No subas nunca `.env`, `server/.env`, `public/js/firebase-config.js` ni claves de cuentas de servicio.
- No añadas emails ni otros datos personales a ficheros del repositorio.

## Licencia

Uso privado. Todos los derechos reservados.
