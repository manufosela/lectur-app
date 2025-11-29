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
