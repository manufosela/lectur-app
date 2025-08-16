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
    'FIREBASE_API_KEY',
    'FIREBASE_AUTH_DOMAIN', 
    'FIREBASE_DATABASE_URL',
    'FIREBASE_PROJECT_ID',
    'FIREBASE_STORAGE_BUCKET',
    'FIREBASE_MESSAGING_SENDER_ID',
    'FIREBASE_APP_ID'
  ];

  // Verificar que todas las variables requeridas están presentes
  const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
  
  if (missingVars.length > 0) {
    console.error('❌ Faltan variables de entorno requeridas:');
    missingVars.forEach(varName => console.error(`   - ${varName}`));
    console.error('\nAgrega estas variables al archivo .env');
    process.exit(1);
  }

  const configContent = `// Configuración de Firebase (generado automáticamente desde .env)
const firebaseConfig = {
  apiKey: "${process.env.FIREBASE_API_KEY}",
  authDomain: "${process.env.FIREBASE_AUTH_DOMAIN}",
  databaseURL: "${process.env.FIREBASE_DATABASE_URL}",
  projectId: "${process.env.FIREBASE_PROJECT_ID}",
  storageBucket: "${process.env.FIREBASE_STORAGE_BUCKET}",
  messagingSenderId: "${process.env.FIREBASE_MESSAGING_SENDER_ID}",
  appId: "${process.env.FIREBASE_APP_ID}"
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