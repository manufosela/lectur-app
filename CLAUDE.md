# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

LecturAPP is an EPUB book library web application built with Astro and Firebase. It allows users to browse, search, and read EPUB books directly in the browser. The project is currently undergoing a migration to AWS S3 for storage.

## Technology Stack

- **Frontend**: Astro 5.13.0 (Static Site Generator)
- **Backend**: Firebase (Realtime Database, Cloud Functions, Authentication, Hosting)
- **Storage**: Migrating from Firebase Cloud Storage to AWS S3
- **EPUB Reading**: EPUB.js library
- **Styling**: Pico CSS framework
- **Deployment**: Firebase Hosting (serves from `dist/` directory)

## Common Development Commands

### Main Application
```bash
# Install dependencies
npm install

# Development server (runs on localhost:4321)
# Auto-generates firebase-config.js from .env
npm run dev

# Build for production (outputs to dist/)
# Auto-generates firebase-config.js from .env
npm run build

# Preview production build locally
npm run preview

# Deploy to Firebase (builds and deploys)
npm run deploy

# Deploy only hosting (after build)
npm run deploy:hosting

# Serve Firebase locally
npm run serve

# Generate Firebase config from environment variables
npm run generate:firebase-config
```

### Firebase Functions
```bash
# Navigate to functions directory first
cd functions

# Install dependencies
npm install

# Lint Cloud Functions code
npm run lint

# Start Firebase emulators for functions
npm run serve

# Deploy only functions
npm run deploy

# View function logs
npm run logs
```

### Upload Script (Book Management)
```bash
# Navigate to upload-script directory
cd upload-script

# Install dependencies
npm install

# Upload books to Firebase/S3
npm run upload

# Test EPUB metadata extraction
npm run test

# Check book synchronization status
npm run check

# Sync books between Firebase and S3
npm run sync

# Migrate books from Firebase to S3
npm run migrate

# Batch migration with resume capability
npm run migrate-batch

# Check migration status
npm run migrate-status

# Reset migration state
npm run migrate-reset
```

## Architecture

### Frontend Structure
- **src/pages/index.astro**: Main application page with book library UI
- **src/layouts/Layout.astro**: Base layout template
- **public/js/app.js**: Core application logic for book loading, search, and EPUB rendering
- **public/js/firebase-config.js**: Auto-generated Firebase configuration (DO NOT EDIT - generated from .env)
- **public/css/**: Pico CSS framework and custom styles
- **scripts/generate-firebase-config.js**: Generates firebase-config.js from environment variables

### Firebase Integration
- **Database**: Books metadata stored in Firebase Realtime Database (europe-west1)
- **Storage**: EPUB files stored in Firebase Cloud Storage (migrating to S3)
- **Functions**: Cloud Function for file downloads (functions/index.js)
- **Authentication**: Google OAuth for user authentication
- **Configuration**: 
  - Project ID: `lectur-app`
  - Storage bucket: `lectur-app.appspot.com`
  - Database URL: `https://lectur-app-default-rtdb.europe-west1.firebasedatabase.app`

### AWS S3 Migration
- **Upload Script**: Tools in `upload-script/` for managing book uploads and migration
- **S3 Manager**: Handles AWS S3 operations (upload-script/s3-manager.js)
- **Firebase Manager**: Manages Firebase database operations (upload-script/firebase-manager.js)
- **EPUB Parser**: Extracts metadata from EPUB files (upload-script/epub-parser.js)
- **Migration Tools**: Scripts for migrating from Firebase Storage to S3

#### Migration Status (Current)
- **Total files in Firebase Storage**: 101,998 EPUB files
- **Migration progress**: 15 files processed (0.01%)
- **State tracking**: `upload-script/migration-state.json` saves progress automatically
- **Cost per batch**: ~$0.01-0.03 (processing 20-50 files per batch)
- **Main migration script**: `upload-script/migrate-firebase-to-s3-batch.js`

#### Migration Commands
```bash
cd upload-script/

# Check current migration status
npm run migrate-status

# Continue migration from last checkpoint
npm run migrate-batch

# Reset migration (start over)
npm run migrate-reset
```

#### Next Steps
- **Frontend update pending**: Modify `public/js/app.js` to fetch from S3 instead of Cloud Functions once migration advances
- **Current state**: Application still uses Firebase Cloud Functions for file serving
- **Migration can be resumed**: State is preserved between sessions in `migration-state.json`

### Key Application Features
1. **Book Library Display**: Dynamically loads books from Firebase Database
2. **Search Functionality**: Filter books by title and author
3. **Alphabetical Navigation**: Quick access via letter index
4. **EPUB Reader**: Uses EPUB.js to render books in-browser
5. **User Authentication**: Google OAuth with authorized user list
6. **Reading History**: Tracks user reading progress in Firebase
7. **Responsive Design**: Mobile-friendly using Pico CSS

## Environment Configuration

### Required Environment Variables (.env)
```bash
# Firebase Client SDK (PUBLIC_ prefix required for Astro)
PUBLIC_FIREBASE_API_KEY=
PUBLIC_FIREBASE_AUTH_DOMAIN=
PUBLIC_FIREBASE_DATABASE_URL=
PUBLIC_FIREBASE_PROJECT_ID=
PUBLIC_FIREBASE_STORAGE_BUCKET=
PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
PUBLIC_FIREBASE_APP_ID=

# Firebase Admin SDK (for upload-script)
FIREBASE_PROJECT_ID=
FIREBASE_PRIVATE_KEY_ID=
FIREBASE_PRIVATE_KEY=
FIREBASE_CLIENT_EMAIL=
FIREBASE_CLIENT_ID=
FIREBASE_DATABASE_URL=

# AWS S3 (for upload-script)
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_REGION=eu-west-1
S3_BUCKET_NAME=
```

## Development Notes

### Firebase Services
- Realtime Database rules are in `database.rules.json`
- Storage rules are in `storage.rules`
- Firebase configuration is in `firebase.json`
- Functions use Node.js 20 runtime
- Authorized users list in `authorized-users.json`

### Build Process
- Astro builds static files to `dist/` directory
- Firebase config is auto-generated before build/dev from environment variables
- Firebase Hosting serves from `dist/`
- TypeScript configuration in `tsconfig.json` (Astro handles compilation)

### Code Style
- Functions use ESLint with Google style guide
- Double quotes enforced in Cloud Functions
- No linting configured for main application code

### Database Structure
```json
{
  "libros": ["libro1.epub", "libro2.epub", ...],
  "autores": ["Autor 1", "Autor 2", ...],
  "librosPorAutor": {
    "Autor_1": {
      "libro_123": "libro1.epub"
    }
  },
  "usuariosAutorizados": {
    "email|com": true
  },
  "historialLectura": {
    "user_key": {
      "book_id": {
        "bookPath": "path/to/book.epub",
        "title": "Book Title",
        "author": "Author Name",
        "currentChapter": 5,
        "totalChapters": 10,
        "progress": 50,
        "lastRead": "2024-01-01T00:00:00.000Z"
      }
    }
  }
}
```

### Testing
Currently no test suite configured. When adding tests, consider:
- Unit tests for public/js/app.js functions
- Integration tests for Firebase operations
- E2E tests for EPUB reading functionality
- Tests for upload-script modules (epub-parser, firebase-manager, s3-manager)