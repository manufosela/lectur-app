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
