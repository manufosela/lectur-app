#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

// Cargar variables de entorno
dotenv.config();

/**
 * Genera el archivo firebase-config.js desde las variables de entorno
 */
function generateFirebaseConfig() {
  const requiredEnvVars = [
    'PUBLIC_FIREBASE_API_KEY',
    'PUBLIC_FIREBASE_AUTH_DOMAIN', 
    'PUBLIC_FIREBASE_DATABASE_URL',
    'PUBLIC_FIREBASE_PROJECT_ID',
    'PUBLIC_FIREBASE_STORAGE_BUCKET',
    'PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
    'PUBLIC_FIREBASE_APP_ID'
  ];

  // Verificar que todas las variables requeridas están presentes
  const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
  
  if (missingVars.length > 0) {
    console.error('❌ Faltan variables de entorno requeridas:');
    missingVars.forEach(varName => console.error(`   - ${varName}`));
    console.error('\nAgrega estas variables al archivo .env');
    process.exit(1);
  }

  const configContent = `/**
 * Firebase Configuration - MÓDULO CENTRAL
 * Generado automáticamente desde .env por scripts/generate-firebase-config.js
 *
 * IMPORTANTE: Este es el ÚNICO punto de inicialización de Firebase.
 * Todos los módulos deben importar 'auth', 'database', etc. desde este archivo.
 * NO inicializar Firebase en ningún otro lugar.
 */
const firebaseConfig = {
  apiKey: "${process.env.PUBLIC_FIREBASE_API_KEY}",
  authDomain: "${process.env.PUBLIC_FIREBASE_AUTH_DOMAIN}",
  databaseURL: "${process.env.PUBLIC_FIREBASE_DATABASE_URL}",
  projectId: "${process.env.PUBLIC_FIREBASE_PROJECT_ID}",
  storageBucket: "${process.env.PUBLIC_FIREBASE_STORAGE_BUCKET}",
  messagingSenderId: "${process.env.PUBLIC_FIREBASE_MESSAGING_SENDER_ID}",
  appId: "${process.env.PUBLIC_FIREBASE_APP_ID}"
};

// Inicializar Firebase
firebase.initializeApp(firebaseConfig);

// Analytics deshabilitado completamente

// Exportar funciones de base de datos y autenticación
export const database = firebase.database();
export const auth = firebase.auth();

// Configurar proveedor de Google
export const googleProvider = new firebase.auth.GoogleAuthProvider();
googleProvider.addScope('email');
googleProvider.addScope('profile');

// Función para convertir email a clave Firebase (algoritmo: punto por |)
export const emailToFirebaseKey = (email) => {
  return email.replace(/\\./g, '|');
};

// Función para verificar si un usuario está autorizado
export const isUserAuthorized = async (email) => {
  try {
    const snapshot = await database.ref('/usuariosAutorizados').once('value');
    if (snapshot.exists()) {
      const authorizedUsers = snapshot.val();
      // Usar algoritmo de conversión de email a clave Firebase
      const firebaseKey = emailToFirebaseKey(email);
      console.log(\`Verificando autorización: \${email} → \${firebaseKey}\`);
      return authorizedUsers[firebaseKey] === true;
    }
    return false;
  } catch (error) {
    console.error('Error verificando autorización:', error);
    return false;
  }
};

// Función para login con Google
export const signInWithGoogle = () => {
  return auth.signInWithPopup(googleProvider);
};

// Función para logout
export const signOut = () => {
  return auth.signOut();
};

// Funciones para el historial de lectura en Firebase
export const saveReadingProgressToFirebase = async (userEmail, bookPath, bookTitle, author, chapterIndex, totalChapters) => {
  try {
    if (!userEmail) {
      throw new Error('Usuario no autenticado');
    }
    
    const userKey = emailToFirebaseKey(userEmail);
    const bookId = btoa(bookPath); // Base64 encode para ID único
    
    const progressData = {
      bookPath: bookPath,
      title: bookTitle,
      author: author,
      currentChapter: chapterIndex,
      totalChapters: totalChapters,
      progress: Math.round((chapterIndex / totalChapters) * 100),
      lastRead: new Date().toISOString(),
      updatedAt: firebase.database.ServerValue.TIMESTAMP
    };
    
    // Guardar en Firebase: historialLectura/[userKey]/[bookId]
    const ref = database.ref(\`historialLectura/\${userKey}/\${bookId}\`);
    await ref.set(progressData);
    
    console.log('Progreso guardado en Firebase:', progressData);
    return true;
  } catch (error) {
    console.error('Error guardando progreso en Firebase:', error);
    return false;
  }
};

export const getReadingHistoryFromFirebase = async (userEmail) => {
  try {
    if (!userEmail) {
      return [];
    }
    
    const userKey = emailToFirebaseKey(userEmail);
    const snapshot = await database.ref(\`historialLectura/\${userKey}\`).once('value');
    
    if (snapshot.exists()) {
      const historyData = snapshot.val();
      // Convertir objeto a array y ordenar por fecha de actualización
      const historyArray = Object.keys(historyData).map(bookId => ({
        id: bookId,
        ...historyData[bookId]
      })).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
      
      // Mantener solo los últimos 10 libros
      return historyArray.slice(0, 10);
    }
    
    return [];
  } catch (error) {
    console.error('Error obteniendo historial de Firebase:', error);
    return [];
  }
};

export const removeFromHistoryFirebase = async (userEmail, bookId) => {
  try {
    if (!userEmail) {
      throw new Error('Usuario no autenticado');
    }
    
    const userKey = emailToFirebaseKey(userEmail);
    const ref = database.ref(\`historialLectura/\${userKey}/\${bookId}\`);
    await ref.remove();
    
    console.log('Libro eliminado del historial Firebase:', bookId);
    return true;
  } catch (error) {
    console.error('Error eliminando del historial Firebase:', error);
    return false;
  }
};

export const getBooksList = () => {
  return new Promise((resolve, reject) => {
    database.ref('/libros').once('value')
      .then((snapshot) => {
        if (snapshot.exists()) {
          const booksList = snapshot.val();
          resolve(booksList);
        } else {
          console.log("No hay libros disponibles");
          resolve([]);
        }
      })
      .catch((error) => {
        console.error("Error obteniendo libros:", error);
        reject(error);
      });
  });
};

export const getAutorsList = () => {
  return new Promise((resolve, reject) => {
    database.ref('/autores').once('value')
      .then((snapshot) => {
        if (snapshot.exists()) {
          const authorBooks = snapshot.val();
          resolve(authorBooks);
        } else {
          console.log("No hay autores disponibles");
          resolve([]);
        }
      })
      .catch((error) => {
        console.error("Error obteniendo autores:", error);
        reject(error);
      });
  });
};

export const getAutorsBooksList = () => {
  return new Promise((resolve, reject) => {
    database.ref('/librosPorAutor').once('value')
      .then((snapshot) => {
        if (snapshot.exists()) {
          const authorBooks = snapshot.val();
          resolve(authorBooks);
        } else {
          console.log("No hay libros por autor disponibles");
          resolve([]);
        }
      })
      .catch((error) => {
        console.error("Error obteniendo libros por autor:", error);
        reject(error);
      });
  });
};

// Funciones principales con nombres que app.js espera
export const getBooksNamesList = () => {
  return new Promise((resolve, reject) => {
    database.ref('/libros').once('value')
      .then((snapshot) => {
        if (snapshot.exists()) {
          const booksList = snapshot.val();
          // Convertir a array si es un objeto
          const booksArray = Array.isArray(booksList) ? booksList : Object.values(booksList);
          resolve(booksArray.filter(book => book && typeof book === 'string'));
        } else {
          console.log("No hay libros disponibles");
          resolve([]);
        }
      })
      .catch((error) => {
        console.error("Error obteniendo libros:", error);
        reject(error);
      });
  });
};

export const getAutorsNamesList = () => {
  return new Promise((resolve, reject) => {
    database.ref('/autores').once('value')
      .then((snapshot) => {
        if (snapshot.exists()) {
          const authorsList = snapshot.val();
          // Convertir a array si es un objeto
          const authorsArray = Array.isArray(authorsList) ? authorsList : Object.values(authorsList);
          resolve(authorsArray.filter(author => author && typeof author === 'string'));
        } else {
          console.log("No hay autores disponibles");
          resolve([]);
        }
      })
      .catch((error) => {
        console.error("Error obteniendo autores:", error);
        reject(error);
      });
  });
};

export const getAutorsBooks = () => {
  return new Promise((resolve, reject) => {
    database.ref('/librosPorAutor').once('value')
      .then((snapshot) => {
        if (snapshot.exists()) {
          const authorBooks = snapshot.val();
          resolve(authorBooks);
        } else {
          console.log("No hay libros por autor disponibles");
          resolve({});
        }
      })
      .catch((error) => {
        console.error("Error obteniendo libros por autor:", error);
        reject(error);
      });
  });
};

// Funciones para cómics eliminadas - declaraciones completas están más abajo

export const saveComicProgressToFirebase = async (userEmail, comicPath, currentPage, totalPages) => {
  try {
    if (!userEmail) {
      throw new Error('Usuario no autenticado');
    }
    
    const userKey = emailToFirebaseKey(userEmail);
    const comicId = btoa(comicPath); // Base64 encode para ID único
    
    const progressData = {
      comicPath: comicPath,
      title: extractComicTitle(comicPath),
      currentPage: currentPage,
      totalPages: totalPages,
      progress: Math.round((currentPage / totalPages) * 100),
      lastRead: new Date().toISOString(),
      updatedAt: firebase.database.ServerValue.TIMESTAMP
    };
    
    // Guardar en Firebase: historialComics/[userKey]/[comicId]
    const ref = database.ref(\`historialComics/\${userKey}/\${comicId}\`);
    await ref.set(progressData);
    
    console.log('Progreso de cómic guardado en Firebase:', progressData);
    return true;
  } catch (error) {
    console.error('Error guardando progreso de cómic en Firebase:', error);
    return false;
  }
};

export const getComicHistoryFromFirebase = async (userEmail) => {
  try {
    if (!userEmail) {
      return [];
    }
    
    const userKey = emailToFirebaseKey(userEmail);
    const snapshot = await database.ref(\`historialComics/\${userKey}\`).once('value');
    
    if (snapshot.exists()) {
      const historyData = snapshot.val();
      // Convertir objeto a array y ordenar por fecha de actualización
      const historyArray = Object.keys(historyData).map(comicId => ({
        id: comicId,
        ...historyData[comicId]
      })).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
      
      // Mantener solo los últimos 10 cómics
      return historyArray.slice(0, 10);
    }
    
    return [];
  } catch (error) {
    console.error('Error obteniendo historial de cómics de Firebase:', error);
    return [];
  }
};

export const removeComicFromHistoryFirebase = async (userEmail, comicId) => {
  try {
    if (!userEmail) {
      throw new Error('Usuario no autenticado');
    }
    
    const userKey = emailToFirebaseKey(userEmail);
    const ref = database.ref(\`historialComics/\${userKey}/\${comicId}\`);
    await ref.remove();
    
    console.log('Cómic eliminado del historial Firebase:', comicId);
    return true;
  } catch (error) {
    console.error('Error eliminando cómic del historial Firebase:', error);
    return false;
  }
};

// Funciones para audiolibros
export const getAudiobooksList = () => {
  return new Promise((resolve, reject) => {
    database.ref('/audiolibros').once('value')
      .then((snapshot) => {
        if (snapshot.exists()) {
          const audiobooksData = snapshot.val();
          // Los audiolibros están estructurados como objetos complejos
          // Extraer los nombres de archivos de cada objeto
          const audiobooksArray = Object.values(audiobooksData)
            .filter(audiobook => audiobook && audiobook.archivo)
            .map(audiobook => audiobook.archivo);
          resolve(audiobooksArray);
        } else {
          console.log("No hay audiolibros disponibles");
          resolve([]);
        }
      })
      .catch((error) => {
        console.error("Error obteniendo audiolibros:", error);
        reject(error);
      });
  });
};

export const saveAudiobookProgressToFirebase = async (userEmail, audiobookPath, currentTime, duration, metadata = {}) => {
  try {
    if (!userEmail) {
      throw new Error('Usuario no autenticado');
    }
    
    const userKey = emailToFirebaseKey(userEmail);
    const audiobookId = btoa(audiobookPath); // Base64 encode para ID único
    
    const progressData = {
      audiobookPath: audiobookPath,
      title: metadata.title || extractAudiobookTitle(audiobookPath),
      author: metadata.author || 'Autor desconocido',
      narrator: metadata.narrator || 'Narrador desconocido',
      cover: metadata.cover || null,
      currentTime: currentTime,
      duration: duration,
      progress: duration > 0 ? Math.round((currentTime / duration) * 100) : 0,
      lastPlayed: metadata.lastPlayed || Date.now(),
      updatedAt: firebase.database.ServerValue.TIMESTAMP
    };
    
    // Guardar en Firebase: historialAudiolibros/[userKey]/[audiobookId]
    const ref = database.ref(\`historialAudiolibros/\${userKey}/\${audiobookId}\`);
    await ref.set(progressData);
    
    console.log('Progreso de audiolibro guardado en Firebase:', progressData);
    return true;
  } catch (error) {
    console.error('Error guardando progreso de audiolibro en Firebase:', error);
    return false;
  }
};

export const getAudiobookHistoryFromFirebase = async (userEmail) => {
  try {
    if (!userEmail) {
      return {};
    }
    
    const userKey = emailToFirebaseKey(userEmail);
    const snapshot = await database.ref(\`historialAudiolibros/\${userKey}\`).once('value');
    
    if (snapshot.exists()) {
      const historyData = snapshot.val();
      
      // Convertir a objeto con path como clave para fácil acceso
      const historyObject = {};
      Object.keys(historyData).forEach(audiobookId => {
        const data = historyData[audiobookId];
        historyObject[data.audiobookPath] = data;
      });
      
      return historyObject;
    }
    
    return {};
  } catch (error) {
    console.error('Error obteniendo historial de audiolibros de Firebase:', error);
    return {};
  }
};

export const removeAudiobookFromHistoryFirebase = async (userEmail, audiobookId) => {
  try {
    if (!userEmail) {
      throw new Error('Usuario no autenticado');
    }
    
    const userKey = emailToFirebaseKey(userEmail);
    const ref = database.ref(\`historialAudiolibros/\${userKey}/\${audiobookId}\`);
    await ref.remove();
    
    console.log('Audiolibro eliminado del historial Firebase:', audiobookId);
    return true;
  } catch (error) {
    console.error('Error eliminando audiolibro del historial Firebase:', error);
    return false;
  }
};

// Funciones auxiliares para extraer títulos
// extractComicTitle movida más abajo junto con las otras funciones de cómics

function extractAudiobookTitle(filename) {
  return filename
    .replace(/\\.(mp3|m4a|m4b|aac|ogg|flac)$/i, '')
    .replace(/[_-]/g, ' ')
    .replace(/\\//g, ' - ')
    .trim();
}

// Funciones para cómics
export const getComicsList = () => {
  return new Promise((resolve, reject) => {
    database.ref('/comics_cbz').once('value')
      .then((snapshot) => {
        if (snapshot.exists()) {
          const comicsData = snapshot.val();
          // Convertir a array si es un objeto
          const comicsArray = Array.isArray(comicsData) ? comicsData : Object.values(comicsData);
          resolve(comicsArray.filter(comic => comic && typeof comic === 'string'));
        } else {
          console.log("No hay cómics disponibles");
          resolve([]);
        }
      })
      .catch((error) => {
        console.error("Error obteniendo cómics:", error);
        reject(error);
      });
  });
};

export const getComicsStructure = () => {
  return new Promise((resolve, reject) => {
    database.ref('/comicsStructure_cbz').once('value')
      .then((snapshot) => {
        if (snapshot.exists()) {
          resolve(snapshot.val());
        } else {
          console.log("No hay estructura de cómics disponible");
          resolve({});
        }
      })
      .catch((error) => {
        console.error("Error obteniendo estructura de cómics:", error);
        reject(error);
      });
  });
};

export const getComicsByFolder = (folderKey) => {
  return new Promise((resolve, reject) => {
    const cleanKey = folderKey.replace(/[.#$/\\[\\]]/g, '|').replace(/\\s+/g, '_').replace(/\\|+/g, '|');
    database.ref(\`/comicsByFolder_cbz/\${cleanKey}\`).once('value')
      .then((snapshot) => {
        if (snapshot.exists()) {
          resolve(snapshot.val() || []);
        } else {
          console.log(\`No hay cómics en la carpeta: \${folderKey}\`);
          resolve([]);
        }
      })
      .catch((error) => {
        console.error("Error obteniendo cómics por carpeta:", error);
        reject(error);
      });
  });
};

export const getComicMetadata = (comicPath) => {
  return new Promise((resolve, reject) => {
    const cleanKey = comicPath.replace(/[.#$/\\[\\]]/g, '|').replace(/\\s+/g, '_').replace(/\\|+/g, '|');
    database.ref(\`/comicsMetadata_cbz/\${cleanKey}\`).once('value')
      .then((snapshot) => {
        if (snapshot.exists()) {
          resolve(snapshot.val());
        } else {
          console.log(\`No hay metadatos para el cómic: \${comicPath}\`);
          // Crear metadatos básicos desde la ruta (sin URL absoluta - usar getProtectedUrl)
          resolve({
            title: extractComicTitle(comicPath),
            series: extractComicSeries(comicPath),
            path: comicPath,
            relpath: \`COMICS/\${comicPath}\`
          });
        }
      })
      .catch((error) => {
        console.error("Error obteniendo metadatos del cómic:", error);
        reject(error);
      });
  });
};

function extractComicTitle(filename) {
  return filename
    .replace(/^.*\\//, '') // Quitar ruta
    .replace(/\\.(cbz|cbr|zip|rar)$/i, '')
    .replace(/[_-]/g, ' ')
    .trim();
}

function extractComicSeries(folderPath) {
  if (!folderPath) return 'Sin serie';
  const pathParts = folderPath.split('/').filter(p => p);
  return pathParts[pathParts.length - 1] || 'Sin serie';
}
`;

  // Crear directorio si no existe
  const outputDir = path.join(process.cwd(), 'public', 'js');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Escribir archivo
  const outputPath = path.join(outputDir, 'firebase-config.js');
  fs.writeFileSync(outputPath, configContent);

  console.log('✅ Firebase config generado:', outputPath);
}

// Ejecutar si se llama directamente
if (import.meta.url === `file://${process.argv[1]}`) {
  generateFirebaseConfig();
}

export { generateFirebaseConfig };