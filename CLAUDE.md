# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

LecturAPP is an EPUB book library web application built with Astro and Firebase. It allows users to browse, search, and read EPUB books directly in the browser.

## Technology Stack

- **Frontend**: Astro 5.13.0 (Static Site Generator)
- **Backend**: Firebase (Realtime Database, Cloud Storage, Cloud Functions, Hosting)
- **EPUB Reading**: EPUB.js library
- **Styling**: Pico CSS framework
- **Deployment**: Firebase Hosting (serves from `dist/` directory)

## Common Development Commands

### Main Application
```bash
# Development server (runs on localhost:4321)
npm run dev

# Build for production (outputs to dist/)
npm run build

# Preview production build locally
npm run preview

# Deploy to Firebase (builds and deploys)
npm run deploy

# Deploy only hosting (after build)
npm run deploy:hosting

# Serve Firebase locally
npm run serve
```

### Firebase Functions
```bash
# Navigate to functions directory first
cd functions

# Lint Cloud Functions code
npm run lint

# Start Firebase emulators for functions
npm run serve

# Deploy only functions
npm run deploy

# View function logs
npm run logs
```

## Architecture

### Frontend Structure
- **src/pages/index.astro**: Main application page with book library UI
- **src/layouts/Layout.astro**: Base layout template
- **public/js/app.js**: Core application logic for book loading, search, and EPUB rendering
- **public/js/firebase-config.js**: Firebase initialization and configuration
- **public/css/**: Pico CSS framework and custom styles

### Firebase Integration
- **Database**: Books metadata stored in Firebase Realtime Database (europe-west1)
- **Storage**: EPUB files stored in Firebase Cloud Storage
- **Functions**: Cloud Function for file downloads (functions/index.js)
- **Configuration**: 
  - Project ID: `lectur-app`
  - Storage bucket: `lectur-app.appspot.com`

### Key Application Features
1. **Book Library Display**: Dynamically loads books from Firebase Database
2. **Search Functionality**: Filter books by title and author
3. **Alphabetical Navigation**: Quick access via letter index
4. **EPUB Reader**: Uses EPUB.js to render books in-browser
5. **Responsive Design**: Mobile-friendly using Pico CSS

## Development Notes

### Firebase Services
- Realtime Database rules are in `database.rules.json`
- Storage rules are in `storage.rules`
- Firebase configuration is in `firebase.json`
- Functions use Node.js 16 runtime

### Build Process
- Astro builds static files to `dist/` directory
- Firebase Hosting serves from `dist/`
- No TypeScript compilation needed for runtime (Astro handles it)

### Code Style
- Functions use ESLint with Google style guide
- Double quotes enforced in Cloud Functions
- No linting configured for main application code

### Testing
Currently no test suite configured. When adding tests, consider:
- Unit tests for public/js/app.js functions
- Integration tests for Firebase operations
- E2E tests for EPUB reading functionality