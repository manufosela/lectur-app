# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

LecturAPP is a multimedia digital library web application built with Astro and Firebase. It supports three main content types: EPUB books, audiobooks (MP3), and comics (CBZ/CBR). Users can browse, search, and consume content directly in the browser with personalized authentication and progress tracking.

## Technology Stack

- **Frontend**: Astro 5.13.0 (Static Site Generator)
- **Backend**: Firebase (Realtime Database, Authentication, Hosting)
- **Storage**: Nginx static file server (replaced Firebase Storage and AWS S3)
- **Content Types**: 
  - **Books**: EPUB.js for EPUB reading
  - **Audiobooks**: HTML5 Audio API with custom player
  - **Comics**: Custom CBZ/CBR reader with JSZip
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

### Upload Script (Content Management)
```bash
# Navigate to upload-script directory
cd upload-script

# Install dependencies
npm install

# Book Management
npm run upload                 # Upload books to Firebase/S3
npm run test                   # Test EPUB metadata extraction
npm run check                  # Check book synchronization status
npm run sync                   # Sync books between Firebase and S3

# Migration Scripts
npm run migrate                # Migrate books from Firebase to S3
npm run migrate-batch          # Batch migration with resume capability
npm run migrate-status         # Check migration status
npm run migrate-reset          # Reset migration state

# NAS Synchronization
npm run sync-nas               # Sync new books from NAS
npm run sync-nas-auto          # Auto sync with confirmation
npm run upload-missing         # Upload missing NAS books
npm run upload-missing-auto    # Auto upload missing books

# Audiobook Management
npm run add-audiobooks         # Add audiobooks to Firebase
npm run add-all-audiobooks     # Add all audiobooks to Firebase
npm run check-audiobooks       # Check audiobooks status
```

## Architecture

### Current Architecture (Modular Design)

LecturAPP follows a modular page-based architecture with separated concerns:

#### Page Structure
- **src/pages/index.astro**: Authentication and main category menu (Books, Audiobooks, Comics)
- **src/pages/books.astro**: Dedicated EPUB books library interface
- **src/pages/audiobooks.astro**: Dedicated audiobooks library and player interface  
- **src/pages/comics.astro**: Dedicated comics library and reader interface
- **src/layouts/Layout.astro**: Base layout template shared across all pages

#### JavaScript Modules
- **public/js/app.js**: Authentication and main menu logic (index page only)
- **public/js/books.js**: Books library functionality and EPUB reading
- **public/js/audiobook-player.js**: Audiobooks library and MP3 player functionality
- **public/js/comic-reader.js**: Comics library and CBZ/CBR reader functionality
- **public/js/firebase-config.js**: Auto-generated Firebase configuration (DO NOT EDIT)
- **public/js/modules/**: Refactored ES6 modules following SOLID principles
  - **auth.js**: Authentication service module
  - **content.js**: Content management service
  - **theme.js**: Theme management service
  - **ui.js**: UI utilities and helpers
  - **navigation.js**: Page navigation service

#### Shared Resources
- **public/css/**: Pico CSS framework and custom styles
- **scripts/generate-firebase-config.js**: Generates firebase-config.js from environment variables

### Firebase Integration
- **Database**: Content metadata stored in Firebase Realtime Database (europe-west1)
  - Books: 126,259 EPUB files
  - Audiobooks: 6,121 MP3 files  
  - Comics: Available CBZ/CBR files
- **Authentication**: Google OAuth with authorized user whitelist
- **Functions**: Cloud Function for file downloads (functions/index.js)
- **Configuration**: 
  - Project ID: `lectur-app`
  - Database URL: `https://lectur-app-default-rtdb.europe-west1.firebasedatabase.app`

### Storage Architecture
- **Current Solution**: Nginx static file server (`https://storage.lecturapp.es/`)
- **Directory Structure**:
  - `/LIBROS/` - EPUB books (126,259 files)
  - `/AUDIOLIBROS/` - MP3 audiobooks (6,121 files)
  - `/COMICS/` - CBZ/CBR comic files
- **Previous**: Migrated from Firebase Storage → AWS S3 → Nginx for better performance and cost

### Content Management
- **Upload Script**: Tools in `upload-script/` for managing content uploads and synchronization
- **Firebase Manager**: Manages Firebase database operations (upload-script/firebase-manager.js)
- **Content Processing**: Scripts for adding content from NAS to Firebase Database
- **Migration Tools**: Historical scripts for storage migrations (Firebase → S3 → Nginx)
- **Batch Processing**: Support for resumable batch operations with state management

### Key Application Features

#### Authentication & Navigation
1. **Google OAuth**: Secure authentication with authorized user whitelist
2. **Modular Navigation**: Separate pages for Books, Audiobooks, and Comics
3. **Persistent Sessions**: LocalStorage-based state management to prevent login flashing
4. **Clickable Logos**: All section logos return to main menu

#### Books (EPUB)
1. **Library Management**: 126,259 EPUB books with search and filtering
2. **EPUB Reader**: Full-featured in-browser reading with EPUB.js
3. **Search & Filter**: By title, author, and alphabetical navigation
4. **Reading Progress**: Firebase-based reading history and progress tracking
5. **Clean Titles**: Automatic underscore-to-space conversion for readability

#### Audiobooks (MP3)
1. **Audio Library**: 6,121 MP3 audiobooks with metadata
2. **Custom Player**: HTML5 Audio with progress saving and chapter tracking
3. **Playback Controls**: Standard controls plus speed adjustment and bookmarking
4. **Progress Sync**: Automatic progress saving to Firebase per user

#### Comics (CBZ/CBR)
1. **Comic Reader**: Custom reader supporting CBZ and CBR formats
2. **Archive Handling**: JSZip-based extraction and page navigation
3. **Reading Interface**: Full-screen reading with page-by-page navigation

#### Shared Features
1. **Responsive Design**: Mobile-friendly interface using Pico CSS
2. **Dark/Light Theme**: Persistent theme switching across all sections
3. **Real-time Sync**: Firebase Realtime Database for instant updates
4. **Performance**: Nginx static serving for fast content delivery

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
- Functions configuration in `functions/` with ESLint Google style
- Authorized users managed in Firebase Database (usuariosAutorizados node)

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
  "audiolibros": ["audiolibro1.mp3", "audiolibro2.mp3", ...],
  "comics": ["comic1.cbz", "comic2.cbr", ...],
  "usuariosAutorizados": {
    "email|com": true
  },
  "historialLectura": {
    "user_key": {
      "content_id": {
        "bookPath": "path/to/content.epub|mp3|cbz",
        "title": "Content Title",
        "author": "Author Name",
        "currentChapter": 5,
        "totalChapters": 10,
        "progress": 50,
        "currentTime": 1234, // For audiobooks (seconds)
        "duration": 3600,    // For audiobooks (seconds)
        "lastRead": "2024-01-01T00:00:00.000Z",
        "type": "book|audiobook|comic"
      }
    }
  }
}
```

### Testing
Currently no test suite configured. When adding tests, consider:
- Unit tests for modular JavaScript functions (app.js, books.js, audiobook-player.js, comic-reader.js)
- Integration tests for Firebase operations
- E2E tests for content consumption (EPUB reading, audio playback, comic viewing)
- Tests for upload-script modules (firebase-manager, content processing)

## Development Workflow

### Adding New Content
1. **Books (EPUB)**: Use upload-script tools to add to Firebase Database
2. **Audiobooks (MP3)**: Use upload-script tools to add to Firebase Database  
3. **Comics (CBZ/CBR)**: Use upload-script tools to add to Firebase Database
4. Files should be placed in appropriate Nginx directories (`/LIBROS/`, `/AUDIOLIBROS/`, `/COMICS/`)

### Code Maintenance
- Follow modular architecture with separated concerns per content type
- Maintain consistent authentication patterns across all pages
- Use shared utilities for common operations (Firebase, theming, navigation)
- Keep database operations centralized in firebase-config.js
- Preserve existing file serving from Nginx static server
- When modifying JavaScript modules, maintain backward compatibility with legacy code

### Important Notes
- **Storage URL**: Content is served from `https://storage.lecturapp.es/` (Nginx server)
- **Authentication**: Uses Google OAuth with whitelist in Firebase Database
- **Firebase Config**: Auto-generated from environment variables - never edit directly
- **Theme**: Dark/light mode persisted in localStorage
- **Session Management**: Uses localStorage to prevent authentication flashing

### Development Guidelines

#### Key Implementation Details
- **Firebase Config Generation**: The `scripts/generate-firebase-config.js` auto-generates `public/js/firebase-config.js` from `.env` variables. This happens automatically during `npm run dev` and `npm run build`.
- **Email to Firebase Key Conversion**: User emails are converted to Firebase keys using the pattern `email.replace(/\./g, '|')` for database compatibility.
- **Module Architecture**: Both legacy JavaScript files and modern ES6 modules coexist. New development should prefer the modular approach in `public/js/modules/`.
- **Content Types Support**: 
  - **EPUB**: Uses EPUB.js library for in-browser reading
  - **MP3**: HTML5 Audio API with custom controls and progress tracking
  - **CBZ/CBR**: JSZip library for archive extraction and page navigation
- **Storage Evolution**: Migrated from Firebase Storage → AWS S3 → Nginx static server for optimal performance and cost.

#### Database Operations
- All content metadata is stored in Firebase Realtime Database (europe-west1 region)
- Reading progress is tracked per user with timestamps and progress percentages
- User authorization is managed through a whitelist in the `usuariosAutorizados` node
- Content lists are stored as arrays in `libros`, `audiolibros`, and `comics` nodes

#### Performance Considerations
- Use batch Firebase operations when possible
- Leverage the Nginx static server for content delivery
- Implement proper error handling for large content libraries (126K+ books)
- Consider pagination for large result sets

#### Security Notes
- Never expose Firebase Admin SDK credentials in client-side code
- Maintain the user authorization whitelist for access control
- Use the upload-script tools for content management rather than direct Firebase operations