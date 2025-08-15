import admin from 'firebase-admin';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Inicializa Firebase Admin SDK
 */
export function initializeFirebase() {
  try {
    if (admin.apps.length === 0) {
      const serviceAccount = {
        type: "service_account",
        project_id: process.env.FIREBASE_PROJECT_ID,
        private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
        private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        client_email: process.env.FIREBASE_CLIENT_EMAIL,
        client_id: process.env.FIREBASE_CLIENT_ID,
        auth_uri: process.env.FIREBASE_AUTH_URI,
        token_uri: process.env.FIREBASE_TOKEN_URI,
        auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
        client_x509_cert_url: `https://www.googleapis.com/service_accounts/v1/metadata/x509/${encodeURIComponent(process.env.FIREBASE_CLIENT_EMAIL)}`
      };

      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: process.env.FIREBASE_DATABASE_URL
      });
      
      console.log('🔥 Firebase Admin inicializado correctamente');
    }
    
    return admin.database();
  } catch (error) {
    console.error('❌ Error inicializando Firebase:', error.message);
    throw error;
  }
}

/**
 * Convierte email a clave Firebase (punto por |)
 * @param {string} email 
 * @returns {string}
 */
function emailToFirebaseKey(email) {
  return email.replace(/\./g, '|');
}

/**
 * Limpia string para usar como clave Firebase
 * @param {string} str 
 * @returns {string}
 */
function cleanFirebaseKey(str) {
  return str.replace(/[^a-zA-Z0-9-_\s$]/g, "");
}

/**
 * Añade un libro a Firebase Realtime Database
 * @param {Object} bookData - {title, author, filename}
 * @returns {Promise<boolean>}
 */
export async function addBookToFirebase(bookData) {
  try {
    const db = initializeFirebase();
    const { title, author, filename } = bookData;
    
    console.log(`🔥 Añadiendo a Firebase: ${title} - ${author}`);
    
    // 1. Añadir a la lista de libros
    const booksRef = db.ref('libros');
    const currentBooks = await booksRef.once('value');
    const booksList = currentBooks.val() || [];
    
    if (!booksList.includes(filename)) {
      booksList.push(filename);
      await booksRef.set(booksList);
      console.log(`   ✅ Libro añadido a lista: ${filename}`);
    } else {
      console.log(`   ⚠️  Libro ya existe en lista: ${filename}`);
    }
    
    // 2. Añadir autor a la lista de autores
    const authorsRef = db.ref('autores');
    const currentAuthors = await authorsRef.once('value');
    const authorsList = currentAuthors.val() || [];
    
    if (!authorsList.includes(author)) {
      authorsList.push(author);
      await authorsRef.set(authorsList);
      console.log(`   ✅ Autor añadido: ${author}`);
    } else {
      console.log(`   ⚠️  Autor ya existe: ${author}`);
    }
    
    // 3. Añadir libro al autor en librosPorAutor
    const cleanAuthor = cleanFirebaseKey(author);
    const authorBooksRef = db.ref(`librosPorAutor/${cleanAuthor}`);
    const currentAuthorBooks = await authorBooksRef.once('value');
    const authorBooks = currentAuthorBooks.val() || {};
    
    // Generar clave única para el libro
    const bookKey = `libro_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    authorBooks[bookKey] = filename;
    
    await authorBooksRef.set(authorBooks);
    console.log(`   ✅ Libro vinculado a autor: ${cleanAuthor}`);
    
    return true;
    
  } catch (error) {
    console.error(`❌ Error añadiendo ${bookData.filename} a Firebase:`, error.message);
    return false;
  }
}

/**
 * Procesa múltiples libros en lotes
 * @param {Array} booksMetadata - Array de metadatos de libros
 * @param {number} batchSize - Tamaño del lote
 */
export async function addBooksToFirebaseBatch(booksMetadata, batchSize = 5) {
  console.log(`🔥 Procesando ${booksMetadata.length} libros en lotes de ${batchSize}`);
  
  let processed = 0;
  let successful = 0;
  let failed = 0;
  
  for (let i = 0; i < booksMetadata.length; i += batchSize) {
    const batch = booksMetadata.slice(i, i + batchSize);
    
    console.log(`\n📦 Procesando lote ${Math.floor(i / batchSize) + 1}/${Math.ceil(booksMetadata.length / batchSize)}`);
    
    const promises = batch.map(async (book) => {
      const success = await addBookToFirebase(book);
      processed++;
      if (success) {
        successful++;
      } else {
        failed++;
      }
      return success;
    });
    
    await Promise.all(promises);
    
    console.log(`📊 Progreso: ${processed}/${booksMetadata.length} (✅ ${successful} | ❌ ${failed})`);
    
    // Pausa entre lotes para no sobrecargar Firebase
    if (i + batchSize < booksMetadata.length) {
      console.log('⏸️  Pausa entre lotes...');
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  
  console.log(`\n🎉 Procesamiento completado:`);
  console.log(`   ✅ Exitosos: ${successful}`);
  console.log(`   ❌ Fallidos: ${failed}`);
  console.log(`   📊 Total: ${processed}`);
}