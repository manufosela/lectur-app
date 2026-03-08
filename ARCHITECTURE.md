# LecturAPP - Arquitectura del Sistema

## Visión General

LecturAPP es una biblioteca digital multimedia construida con **Astro** como Static Site Generator, con páginas independientes para cada tipo de contenido (libros, audiolibros, cómics). La arquitectura sigue principios SOLID con una clara separación de responsabilidades.

### Stack Tecnológico
```
Frontend:  Astro 5.x + ES6 Modules + Pico CSS
Backend:   Firebase (Realtime DB + Auth + Hosting)
Storage:   Nginx Static Server con autenticación por token
Readers:   EPUB.js + HTML5 Audio + JSZip
```

### Arquitectura de Alto Nivel
```
┌─────────────────────────────────────────────────────────────┐
│                      CLIENT SIDE                            │
├─────────────────────────────────────────────────────────────┤
│  Astro Pages (index, books, audiobooks, comics)             │
│           ↓                                                 │
│  ES6 Modules (public/js/modules/)                           │
│  ├── auth.js          → Firebase Auth                       │
│  ├── content.js       → Catálogo y metadatos                │
│  ├── books.js         → Lógica de libros                    │
│  ├── navigation.js    → Navegación y lector EPUB            │
│  ├── catalog-loader.js→ Carga _aquitengolalista.json        │
│  └── protected-download.js → Descargas con token            │
│           ↓                                                 │
│  firebase-config.js (ÚNICO punto de init Firebase)          │
└─────────────────────────────────────────────────────────────┘
           ↓                              ↓
┌──────────────────────┐    ┌─────────────────────────────────┐
│     FIREBASE         │    │         NGINX STORAGE           │
├──────────────────────┤    ├─────────────────────────────────┤
│ • Realtime Database  │    │ https://storage.lecturapp.es    │
│ • Authentication     │    │ ├── libros/     (EPUB)          │
│ • Hosting            │    │ ├── audiolibros/ (MP3)          │
└──────────────────────┘    │ └── comics/     (CBZ)           │
                            │                                 │
                            │ IMPORTANTE: Rutas en minúsculas │
                            │ Autenticación: Bearer Token     │
                            │ (Firebase ID Token)             │
                            └─────────────────────────────────┘
```

## Sistema de Descargas Protegidas

### Flujo de Autenticación de Contenido

```
1. Usuario autenticado en Firebase
2. Frontend solicita contenido (libro, audio, cómic)
3. protected-download.js obtiene ID Token del usuario
4. Fetch a Nginx con header: Authorization: Bearer <token>
5. Nginx valida token y sirve el archivo
```

### Módulos Clave

#### `protected-download.js`
Único punto de acceso a contenido protegido:

```javascript
// Obtener URL absoluta (para mostrar, no para fetch directo)
getProtectedUrl(relpath) → "https://storage.lecturapp.es/libros/libro.epub"

// Descargar archivo con autenticación
downloadProtectedFile(relpath) → Blob
```

#### `catalog-loader.js`
Carga el catálogo del NAS (`_aquitengolalista.json`):

```javascript
// Cargar catálogo de una sección (SIEMPRE minúsculas)
loadCatalog('comics') → { name, type, children: [...] }

// Buscar archivo por ruta relativa
findNodeByRelpath(catalog, 'comics/serie/comic.cbz') → node

// Obtener archivos por extensión
getFilesByExtension(catalog, ['.cbz', '.cbr']) → [nodes]
```

### Estructura del Catálogo

Cada sección tiene un `_aquitengolalista.json` (rutas en minúsculas):
```json
{
  "name": "comics",
  "type": "dir",
  "relpath": "comics",
  "children": [
    {
      "name": "archivo.cbz",
      "type": "file",
      "relpath": "comics/archivo.cbz",
      "size": 12345
    },
    {
      "name": "subcarpeta",
      "type": "dir",
      "relpath": "comics/subcarpeta",
      "children": [...]
    }
  ]
}
```

## Arquitectura de Módulos

### Estructura de Archivos
```
public/js/
├── firebase-config.js      # Config Firebase (auto-generado, NO EDITAR)
├── app.js                  # Menú principal (index)
├── books.js                # Legacy books (usar modules/books.js)
├── audiobook-player.js     # Reproductor de audiolibros
├── comic-reader.js         # Lector de cómics CBZ
└── modules/
    ├── auth.js             # Servicio de autenticación
    ├── content.js          # Gestión de contenido/catálogo
    ├── books.js            # Servicio de libros
    ├── navigation.js       # Navegación y lector EPUB
    ├── theme.js            # Temas light/dark
    ├── ui.js               # Utilidades de UI
    ├── catalog-loader.js   # Carga de catálogos NAS
    └── protected-download.js # Descargas autenticadas
```

### Principio de Responsabilidad Única

| Módulo | Responsabilidad |
|--------|-----------------|
| `auth.js` | Login/logout, estado de sesión, autorización |
| `content.js` | Consultas Firebase, normalización de rutas |
| `books.js` | UI de libros, historial, apertura de libros |
| `navigation.js` | Navegación entre páginas, lector EPUB |
| `catalog-loader.js` | Carga y consulta de catálogos JSON |
| `protected-download.js` | Descargas con autenticación |
| `theme.js` | Persistencia de tema claro/oscuro |
| `ui.js` | Manipulación DOM, modales, loading |

## Firebase

### Inicialización Centralizada

**IMPORTANTE**: `firebase-config.js` es el ÚNICO punto de inicialización de Firebase.

```javascript
// firebase-config.js (generado desde .env)
firebase.initializeApp(firebaseConfig);
export const database = firebase.database();
export const auth = firebase.auth();
```

Todos los módulos importan desde `firebase-config.js`:
```javascript
import { auth } from '../firebase-config.js';
```

### Estructura de Base de Datos

```json
{
  "libros": ["libro1.epub", "libro2.epub", ...],
  "audiolibros": { "id": { "archivo": "audio.mp3", ... } },
  "comics_cbz": ["comic1.cbz", ...],
  "comicsStructure_cbz": { "SERIE": { "folders": {...} } },
  "autores": ["Autor 1", ...],
  "librosPorAutor": { "Autor_1": { "id": "libro.epub" } },
  "usuariosAutorizados": { "email|com": true },
  "historialLectura": { "user_key": { "book_id": {...} } },
  "historialComics": { "user_key": { "comic_id": {...} } },
  "historialAudiolibros": { "user_key": { "audio_id": {...} } }
}
```

## Flujos de Datos

### Apertura de Libro EPUB

```
1. Usuario hace clic en libro
2. books.js → resolveBookRelpath(bookPath)
   └── Busca en catálogo (_aquitengolalista.json)
3. navigation.js → openReader(relpath)
4. navigation.js → loadEpub(relpath)
   └── downloadProtectedFile(relpath) → Blob
5. JSZip procesa el EPUB
6. Renderiza capítulos en modal
7. Guarda progreso en Firebase
```

### Apertura de Cómic CBZ

```
1. Usuario hace clic en cómic
2. comic-reader.js → getComicUrl(comicPath)
   └── Busca en catálogo con findNodeByRelpath()
3. comic-reader.js → fetchComic(relpath)
   └── downloadProtectedFile(relpath) → Blob
4. JSZip extrae imágenes
5. Renderiza visor de páginas
6. Guarda progreso en Firebase
```

## Seguridad

### Autenticación
- **OAuth 2.0** con Google via Firebase Auth
- **Whitelist** de emails autorizados en `/usuariosAutorizados`
- **ID Tokens** para acceso a contenido protegido

### Protección de Contenido
- Nginx valida Firebase ID Token en cada request
- Tokens expiran (1 hora), se renuevan automáticamente
- CORS configurado solo para orígenes autorizados

### Reglas de Base de Datos
```javascript
{
  "rules": {
    ".read": "auth != null",
    ".write": "auth != null",
    "historialLectura": {
      "$userId": {
        ".read": "$userId === auth.uid",
        ".write": "$userId === auth.uid"
      }
    }
  }
}
```

## Scripts de Utilidad

| Comando | Descripción |
|---------|-------------|
| `npm run dev` | Desarrollo (genera firebase-config.js) |
| `npm run build` | Build producción |
| `npm run deploy` | Deploy a Firebase |
| `npm run generate:firebase-config` | Regenera config desde .env |
| `npm run convert:cbr` | Convierte CBR a CBZ |
| `npm run generate:comics-json` | Genera JSON de cómics |
| `npm run generate:stats` | Genera contadores (proceso nocturno) |

## Variables de Entorno

```bash
# Firebase Client SDK (PUBLIC_ para Astro)
PUBLIC_FIREBASE_API_KEY=
PUBLIC_FIREBASE_AUTH_DOMAIN=
PUBLIC_FIREBASE_DATABASE_URL=
PUBLIC_FIREBASE_PROJECT_ID=
PUBLIC_FIREBASE_STORAGE_BUCKET=
PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
PUBLIC_FIREBASE_APP_ID=

# Storage URL
PUBLIC_STORAGE_BASE_URL=https://storage.lecturapp.es
```

---

**Versión**: 2.0 (Arquitectura de descargas protegidas)
**Última actualización**: Noviembre 2025
