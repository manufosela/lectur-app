// Configuración de Firebase
const firebaseConfig = {
  apiKey: "AIzaSyAmJujsQL5isE4ekrnXxvscBSDyKm4vlGI",
  authDomain: "lectur-app.firebaseapp.com",
  databaseURL: "https://lectur-app-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "lectur-app",
  storageBucket: "lectur-app.appspot.com",
  messagingSenderId: "585977135338",
  appId: "1:585977135338:web:61e4ee8bf4543264389793"
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
  return email.replace(/\./g, '|');
};

// Función para verificar si un usuario está autorizado
export const isUserAuthorized = async (email) => {
  try {
    const snapshot = await database.ref('/usuariosAutorizados').once('value');
    if (snapshot.exists()) {
      const authorizedUsers = snapshot.val();
      // Usar algoritmo de conversión de email a clave Firebase
      const firebaseKey = emailToFirebaseKey(email);
      console.log(`Verificando autorización: ${email} → ${firebaseKey}`);
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
    const ref = database.ref(`historialLectura/${userKey}/${bookId}`);
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
    const snapshot = await database.ref(`historialLectura/${userKey}`).once('value');
    
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
    const ref = database.ref(`historialLectura/${userKey}/${bookId}`);
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