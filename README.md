# LecturAPP 📚

> **Biblioteca digital multimedia con soporte para EPUB, audiolibros y cómics**

LecturAPP es una aplicación web moderna desarrollada con Astro y Firebase que proporciona una experiencia completa de biblioteca digital. Soporta tres tipos de contenido: libros EPUB, audiolibros MP3 y cómics CBZ/CBR, todo con autenticación segura y seguimiento de progreso personalizado.

## ✨ Características Principales

### 📖 **Libros EPUB**
- **Biblioteca masiva**: 126,259 libros EPUB disponibles
- **Lector integrado**: Powered by EPUB.js para lectura fluida en navegador
- **Búsqueda avanzada**: Por título, autor y navegación alfabética
- **Progreso de lectura**: Seguimiento automático con Firebase
- **Historial personalizado**: Últimos libros leídos por usuario

### 🎧 **Audiolibros**
- **Colección extensa**: 6,121 audiolibros MP3 con metadatos
- **Reproductor personalizado**: Controles avanzados con HTML5 Audio
- **Marcadores y velocidad**: Ajuste de velocidad de reproducción y bookmarks
- **Sincronización**: Progreso guardado automáticamente por usuario
- **Interfaz intuitiva**: Diseño optimizado para listening sessions

### 💬 **Cómics**
- **Formatos soportados**: CBZ y CBR archives
- **Lector dedicado**: Extracción con JSZip y navegación página por página
- **Interfaz completa**: Modo pantalla completa para lectura inmersiva

### 🔐 **Autenticación y Seguridad**
- **Google OAuth**: Autenticación segura con Google
- **Lista autorizada**: Control de acceso con whitelist de usuarios
- **Sesiones persistentes**: Estado guardado para evitar re-logins
- **Navegación fluida**: Sin flasheos de pantalla de login

### 🎨 **Experiencia de Usuario**
- **Responsive Design**: Diseño móvil-first con Pico CSS
- **Tema dual**: Modo claro/oscuro persistente
- **Navegación modular**: Páginas separadas por tipo de contenido
- **Performance**: Servidor Nginx para entrega rápida de contenido

## 🏗️ Arquitectura Técnica

### **Frontend**
- **Framework**: Astro 5.13.0 (Static Site Generator)
- **Styling**: Pico CSS framework + custom styles
- **JavaScript**: ES6 modules con arquitectura SOLID
- **Content Readers**: EPUB.js, HTML5 Audio, JSZip

### **Backend & Database**
- **Database**: Firebase Realtime Database (europa-west1)
- **Authentication**: Firebase Auth con Google OAuth
- **Hosting**: Firebase Hosting
- **Storage**: Nginx static file server (`https://storage.lecturapp.es/`)

### **Storage Structure**
```
https://storage.lecturapp.es/
├── LIBROS/          # 126,259 archivos EPUB
├── AUDIOLIBROS/     # 6,121 archivos MP3  
└── COMICS/          # Archivos CBZ/CBR
```

### **Database Schema**
```json
{
  "libros": ["libro1.epub", "libro2.epub", ...],
  "audiolibros": ["audio1.mp3", "audio2.mp3", ...],
  "comics": ["comic1.cbz", "comic2.cbr", ...],
  "autores": ["Autor 1", "Autor 2", ...],
  "librosPorAutor": {
    "Autor_1": { "libro_123": "libro1.epub" }
  },
  "usuariosAutorizados": {
    "email|com": true
  },
  "historialLectura": {
    "user_key": {
      "content_id": {
        "bookPath": "path/to/content.epub",
        "title": "Content Title",
        "progress": 50,
        "lastRead": "2024-01-01T00:00:00.000Z"
      }
    }
  }
}
```

## 🚀 Instalación y Desarrollo

### **Prerrequisitos**
- Node.js 18+ 
- npm o yarn
- Cuenta de Firebase
- Acceso al servidor de contenido

### **Configuración Inicial**

1. **Clonar el repositorio**
```bash
git clone <repository-url>
cd lectur-app-astro
```

2. **Instalar dependencias**
```bash
npm install
```

3. **Configurar variables de entorno**
```bash
cp .env.example .env
```

Completar `.env` con las credenciales de Firebase:
```bash
# Firebase Client SDK (PUBLIC_ prefix required for Astro)
PUBLIC_FIREBASE_API_KEY=your_api_key
PUBLIC_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
PUBLIC_FIREBASE_DATABASE_URL=https://your_project.firebasedatabase.app
PUBLIC_FIREBASE_PROJECT_ID=your_project
PUBLIC_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
PUBLIC_FIREBASE_APP_ID=your_app_id
```

4. **Configurar Firebase Functions** (opcional)
```bash
cd functions
npm install
```

5. **Configurar Upload Script** (para gestión de contenido)
```bash
cd upload-script
npm install
cp .env.example .env
# Completar con credenciales Firebase Admin y AWS
```

### **Comandos de Desarrollo**

#### **Aplicación Principal**
```bash
# Servidor de desarrollo (localhost:4321)
npm run dev

# Build para producción
npm run build

# Preview del build
npm run preview

# Deploy a Firebase
npm run deploy

# Deploy solo hosting
npm run deploy:hosting

# Generar config de Firebase desde .env
npm run generate:firebase-config
```

#### **Firebase Functions**
```bash
cd functions

# Linting
npm run lint

# Emulador local
npm run serve

# Deploy functions
npm run deploy

# Ver logs
npm run logs
```

#### **Gestión de Contenido**
```bash
cd upload-script

# Upload contenido
npm run upload

# Sincronizar con Firebase
npm run sync

# Verificar estado
npm run check
```

## 📁 Estructura del Proyecto

```
lectur-app-astro/
├── src/
│   ├── pages/
│   │   ├── index.astro          # Login y menú principal
│   │   ├── books.astro          # Biblioteca de libros
│   │   ├── audiobooks.astro     # Biblioteca de audiolibros
│   │   └── comics.astro         # Biblioteca de cómics
│   └── layouts/
│       └── Layout.astro         # Layout base compartido
├── public/
│   ├── js/
│   │   ├── modules/             # Módulos ES6 refactorizados
│   │   │   ├── auth.js          # Servicio de autenticación
│   │   │   ├── content.js       # Gestión de contenido
│   │   │   ├── theme.js         # Gestión de temas
│   │   │   ├── ui.js            # Utilidades de UI
│   │   │   ├── navigation.js    # Navegación entre páginas
│   │   │   └── books.js         # Funcionalidad específica de libros
│   │   ├── app-refactored.js    # App principal refactorizada
│   │   ├── books-refactored.js  # App de libros refactorizada
│   │   ├── app.js               # App principal (legacy)
│   │   ├── books.js             # App de libros (legacy)
│   │   ├── audiobook-player.js  # Reproductor de audiolibros
│   │   ├── comic-reader.js      # Lector de cómics
│   │   └── firebase-config.js   # Config Firebase (auto-generado)
│   ├── css/                     # Estilos personalizados
│   └── images/                  # Recursos de imagen
├── functions/                   # Firebase Cloud Functions
├── upload-script/               # Herramientas de gestión de contenido
├── scripts/                     # Scripts de build y utilidades
├── firebase.json               # Configuración Firebase
├── database.rules.json         # Reglas de database
└── storage.rules              # Reglas de storage
```

## 🔧 Arquitectura SOLID

El proyecto ha sido refactorizado siguiendo principios SOLID:

### **Single Responsibility Principle (SRP)**
- `AuthService`: Solo maneja autenticación
- `ThemeService`: Solo maneja temas
- `ContentService`: Solo maneja contenido
- `UIService`: Solo maneja operaciones de UI
- `NavigationService`: Solo maneja navegación

### **Open/Closed Principle (OCP)**
- Servicios extensibles para nuevas funcionalidades
- Interfaz común para diferentes tipos de contenido

### **Liskov Substitution Principle (LSP)**
- Servicios intercambiables que mantienen contratos
- Implementaciones consistentes

### **Interface Segregation Principle (ISP)**
- Módulos específicos por funcionalidad
- No dependencias innecesarias

### **Dependency Inversion Principle (DIP)**
- Inyección de dependencias entre servicios
- Abstracción de implementaciones concretas

## 🛠️ Gestión de Contenido

### **Añadir Nuevo Contenido**

1. **Libros EPUB**:
```bash
cd upload-script
# Colocar archivos en directorio fuente
npm run upload -- --type books
```

2. **Audiolibros MP3**:
```bash
cd upload-script  
# Colocar archivos en directorio fuente
npm run upload -- --type audiobooks
```

3. **Cómics CBZ/CBR**:
```bash
cd upload-script
# Colocar archivos en directorio fuente  
npm run upload -- --type comics
```

### **Sincronización Manual**
```bash
cd upload-script
npm run sync
```

## 🔐 Autorización de Usuarios

Los usuarios autorizados se gestionan en Firebase Database:

```json
{
  "usuariosAutorizados": {
    "usuario@ejemplo|com": true,
    "otro@dominio|org": true
  }
}
```

**Nota**: Los puntos (.) en emails se reemplazan por pipes (|) para compatibilidad con Firebase.

## 🚀 Deployment

### **Firebase Hosting**
```bash
# Build y deploy completo
npm run deploy

# Solo hosting (después de build)
npm run deploy:hosting
```

### **Variables de Entorno en Producción**
Configurar las mismas variables en el entorno de producción:
- Firebase Console → Project Settings → General
- Variables de entorno del servidor de hosting

## 📊 Métricas del Proyecto

- **📚 Libros**: 126,259 archivos EPUB
- **🎧 Audiolibros**: 6,121 archivos MP3  
- **💬 Cómics**: Biblioteca en crecimiento
- **👥 Usuarios**: Sistema de whitelist autorizada
- **🌍 Hosting**: Firebase Hosting (Global CDN)
- **📦 Storage**: Nginx server (Europa)

## 🤝 Contribución

### **Guías de Desarrollo**
- Seguir arquitectura modular establecida
- Mantener principios SOLID
- Documentar nuevas funcionalidades
- Probar en diferentes tipos de contenido

### **Code Style**
- ES6+ modules
- Async/await sobre Promises
- Descriptive naming
- Single responsibility por función

## 📄 Licencia

Este proyecto es de uso privado. Todos los derechos reservados.

## 🆘 Soporte

Para issues y soporte:
- Revisar documentación en `/CLAUDE.md`
- Consultar arquitectura en `/ARCHITECTURE.md`
- Logs en Firebase Console
- Estado de servicios en `/status`

---

**LecturAPP** - *Tu biblioteca digital completa* 📚🎧💬
