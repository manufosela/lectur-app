# Repository Guidelines

## Project Structure & Module Organization
- `src/` contiene la aplicación Astro: `pages/` para rutas, `components/` para UI reutilizable y `layouts/` para envoltorios comunes. Mantén la lógica de datos fuera de las plantillas cuando sea posible.
- `public/` aloja assets servidos sin procesamiento (`/js/app.js`, imágenes); `dist/` es solo salida de build.
- `scripts/` reúne utilidades de línea de comando (p.ej., `generate-firebase-config.js` lee `.env`, `convert-cbr-to-cbz.js`, `generate-comics-json.js`).
- `functions/` contiene Cloud Functions (Node 20) con dependencias aisladas; `upload-script/` es un CLI opcional para cargar y sincronizar contenido.
- Archivos JSON en la raíz (`firebase_comics*.json`, `authorized-users.json`, reglas de Firebase) son insumos operativos; edítalos con cuidado y revisa tamaño antes de commitear.

## Build, Test, and Development Commands
- Instala dependencias: `npm install`.
- Desarrollo Astro con configuración de Firebase generada: `npm run dev`.
- Build producción: `npm run build`; vista previa del build: `npm run preview`.
- Despliegues: `npm run deploy` (todo Firebase) o `npm run deploy:hosting` (solo hosting).
- Utilidades: `npm run generate:firebase-config` (regenera `public/firebase-config.js` desde `.env`), `npm run convert:cbr`, `npm run generate:comics-json`.
- Funciones: en `functions/`, `npm run serve` levanta emulador local; `npm run deploy` publica funciones; `npm run logs` consulta registros.

## Coding Style & Naming Conventions
- JavaScript/TypeScript en modo estricto (ver `tsconfig.json`); usa ES modules, `const`/`let`, y evita lógica extensa en scripts inlined salvo necesidades de render inmediato.
- Identación de 2 espacios y comillas dobles como en `src/pages/index.astro`; preferir componentes reutilizables antes que duplicar bloques HTML.
- Rutas y archivos de página deben coincidir con la URL (`src/pages/libros/index.astro` → `/libros`). Scripts y JSON emplean nombres en minúsculas con guiones o snake_case según el contexto existente.

## Testing Guidelines
- No hay suite automatizada central; valida cambios con `npm run preview` y revisa consola/Network. Para cambios de autenticación, prueba flujo de login/logout y persistencia de tema.
- Para funciones, usa `npm run serve` con el emulador y verifica endpoints antes de desplegar. Si modificas JSON masivos, añade comprobaciones básicas (conteos, rutas válidas) con scripts puntuales.

## Commit & Pull Request Guidelines
- Sigue convención tipo Conventional Commits en español: `feat:`, `fix:`, `chore:`, `refactor:` + mensaje corto en presente.
- En PRs incluye: objetivo claro, lista breve de cambios, notas de testing manual, y capturas si afecta UI. Vincula issue/ticket si aplica y menciona impactos en datos/infra (Firebase rules, JSON de catálogos).

## Security & Configuration Tips
- Nunca commitees secretos; `.env` debe contener claves `PUBLIC_FIREBASE_*` (cliente) y variables privadas para scripts/admin. Ejecuta `npm run generate:firebase-config` tras cambios de `.env`.
- Mantén `authorized-users.json` actualizado cuando cambie el acceso y revisa `database.rules.json`/`storage.rules` tras cualquier ajuste de permisos.

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

LecturAPP is a multimedia digital library web application built with Astro and Firebase. It supports three content types: EPUB books, audiobooks (MP3), and comics (CBZ/CBR). Users authenticate via Google OAuth (whitelist-based) and can browse, search, and consume content directly in the browser with progress tracking.

## Technology Stack

- **Frontend**: Astro 5.x (Static Site Generator)
- **Backend**: Firebase (Realtime Database, Authentication, Hosting)
- **Storage**: Nginx static file server (`https://storage.lecturapp.es/`)
- **Content Readers**: EPUB.js (books), HTML5 Audio (audiobooks), JSZip (comics)
- **Styling**: Pico CSS framework

## Common Development Commands

```bash
# Development server (localhost:4321) - auto-generates firebase-config.js
npm run dev

# Build for production (outputs to dist/)
npm run build

# Deploy to Firebase (builds and deploys)
npm run deploy

# Deploy only hosting
npm run deploy:hosting

# Generate Firebase config from .env
npm run generate:firebase-config

# Convert CBR to CBZ format
npm run convert:cbr

# Generate comics JSON
npm run generate:comics-json
```

### Firebase Functions
```bash
cd functions
npm run lint      # Lint Cloud Functions
npm run serve     # Start emulators
npm run deploy    # Deploy functions
npm run logs      # View function logs
```

## Architecture

### Page Structure
- `src/pages/index.astro`: Authentication and main category menu
- `src/pages/books.astro`: EPUB books library
- `src/pages/audiobooks.astro`: Audiobooks library and player
- `src/pages/comics.astro`: Comics library and reader
- `src/layouts/Layout.astro`: Base layout template

### JavaScript Architecture
Legacy and modern ES6 modules coexist:
- `public/js/app.js`: Main menu (index page)
- `public/js/books.js`: Books functionality
- `public/js/audiobook-player.js`: Audiobooks player
- `public/js/comic-reader.js`: Comics reader
- `public/js/firebase-config.js`: Auto-generated (DO NOT EDIT)
- `public/js/modules/`: ES6 modules (auth, content, theme, ui, navigation)

New development should prefer the modular approach in `public/js/modules/`.

### Storage Structure
Content is served from Nginx static server:
```
https://storage.lecturapp.es/
├── LIBROS/          # EPUB books
├── AUDIOLIBROS/     # MP3 audiobooks
└── COMICS/          # CBZ/CBR comics
```

## Key Implementation Details

- **Firebase Config**: Auto-generated from `.env` by `scripts/generate-firebase-config.js` during dev/build
- **Email to Firebase Key**: `email.replace(/\./g, '|')` for database compatibility
- **Session Management**: localStorage prevents auth flashing between pages
- **Theme**: Dark/light mode persisted in localStorage

## Database Structure

```json
{
  "libros": ["libro1.epub", ...],
  "audiolibros": ["audio1.mp3", ...],
  "comics": ["comic1.cbz", ...],
  "autores": ["Author 1", ...],
  "librosPorAutor": { "Author_1": { "libro_123": "libro1.epub" } },
  "usuariosAutorizados": { "email|com": true },
  "historialLectura": {
    "user_key": {
      "content_id": {
        "bookPath": "path/to/content",
        "title": "Title",
        "progress": 50,
        "lastRead": "2024-01-01T00:00:00.000Z",
        "type": "book|audiobook|comic"
      }
    }
  }
}
```

## Environment Variables

Required in `.env`:
```bash
# Firebase Client SDK (PUBLIC_ prefix for Astro)
PUBLIC_FIREBASE_API_KEY=
PUBLIC_FIREBASE_AUTH_DOMAIN=
PUBLIC_FIREBASE_DATABASE_URL=
PUBLIC_FIREBASE_PROJECT_ID=
PUBLIC_FIREBASE_STORAGE_BUCKET=
PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
PUBLIC_FIREBASE_APP_ID=
PUBLIC_STORAGE_BASE_URL=https://storage.lecturapp.es
```

## Development Notes

- Database rules: `database.rules.json`
- Firebase config: `firebase.json`
- Functions use Node.js 20 runtime
- Authorized users managed in `usuariosAutorizados` database node
- Build outputs to `dist/`, served by Firebase Hosting
<!-- >>> kj:managed:guidelines v1 >>> (regenerated by kj harden: anything written inside is lost; keep your own rules outside this block) -->
# Project guidelines (kj harden)

## Code
- SOLID, DRY, KISS, YAGNI. Names in English, descriptive.
- No silent fallbacks: the system works or fails loudly. Validate and sanitize all input.

## Commits & PRs
- Conventional Commits (`feat:`/`fix:`/`refactor:`/`docs:`/`test:`/`chore:`). Header <=100 chars, lowercase subject.
- Never attribute commits or PRs to AI (no `Co-Authored-By`, no "generated by").
- Atomic PRs: one purpose, small (~150 LOC). Each PR compiles and passes its tests on its own.

## Testing
- Test-first. Run the tests after each meaningful change. Never skip tests.

## Security
- Never commit secrets, keys or tokens. Parameterized queries; sanitize output against injection.

## Files
- Edit existing files in place; never overwrite a whole file to make a small change.

## JavaScript / TypeScript
- `const` by default; arrow callbacks; template literals.
- ES2025 target: never `var`, `document.write`, `alert`/`confirm`/`prompt`, `escape`/`unescape`, `substr`.
  Prefer modern APIs (`structuredClone`, `Object.groupBy`, `Array.at`/`findLast`/`toSorted`, optional chaining, `??`).
- ES modules (`import`/`export`), never `require` in new code. Avoid `any` in TypeScript.

## UI/UX
- No native `alert`/`confirm`/`prompt` — use the app's modal system. Loading states; accessible; mobile-first.
<!-- <<< kj:managed:guidelines <<< -->
