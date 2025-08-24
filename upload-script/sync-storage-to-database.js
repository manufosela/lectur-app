#!/usr/bin/env node

import admin from 'firebase-admin';
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config();

// Configuración
const STATE_FILE = './sync-storage-database-state.json';
const BATCH_SIZE = 1000;

// Estado
let state = {
  totalFiles: 0,
  processed: 0,
  epubCount: 0,
  startTime: null,
  completed: false
};

function initializeFirebaseAdmin() {
  try {
    const serviceAccount = {
      type: "service_account",
      project_id: process.env.FIREBASE_PROJECT_ID,
      private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
      private_key: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      client_email: process.env.FIREBASE_CLIENT_EMAIL,
      client_id: process.env.FIREBASE_CLIENT_ID,
      auth_uri: "https://accounts.google.com/o/oauth2/auth",
      token_uri: "https://oauth2.googleapis.com/token",
      auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
      client_x509_cert_url: `https://www.googleapis.com/service_accounts/v1/metadata/x509/${process.env.FIREBASE_CLIENT_EMAIL}`
    };

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      databaseURL: process.env.FIREBASE_DATABASE_URL,
      storageBucket: process.env.PUBLIC_FIREBASE_STORAGE_BUCKET
    });

    console.log('🔥 Firebase Admin inicializado');
    return admin;
  } catch (error) {
    console.error('❌ Error inicializando Firebase:', error.message);
    throw error;
  }
}

function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const data = fs.readFileSync(STATE_FILE, 'utf8');
      state = { ...state, ...JSON.parse(data) };
      console.log(`📊 Estado cargado: ${state.processed} archivos procesados`);
    }
  } catch (error) {
    console.log('⚠️  No se encontró estado previo, empezando desde cero');
  }
}

function saveState() {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  } catch (error) {
    console.error('❌ Error guardando estado:', error.message);
  }
}

async function getAllStorageFiles() {
  const bucket = admin.storage().bucket();
  const allFiles = [];
  let pageToken = undefined;
  let totalRequests = 0;
  
  console.log('📋 Obteniendo lista completa de archivos de Firebase Storage...');
  console.log('⚠️  Esto puede tomar varios minutos...');
  
  do {
    try {
      totalRequests++;
      console.log(`\n🔄 Página ${totalRequests}, token: ${pageToken ? (typeof pageToken === 'string' ? pageToken.substring(0, 20) + '...' : 'objeto') : 'inicial'}`);
      
      const [files, , nextPageToken] = await bucket.getFiles({
        pageToken,
        maxResults: 1000,
        prefix: '__books__/'  // Solo archivos en la carpeta __books__
      });
      
      console.log(`📁 Archivos en esta página: ${files.length}`);
      
      // Filtrar solo EPUBs
      const epubFiles = files
        .filter(file => file.name.endsWith('.epub'))
        .map(file => file.name.replace('__books__/', ''));  // Quitar el prefijo
      
      console.log(`📚 EPUBs en esta página: ${epubFiles.length}`);
      allFiles.push(...epubFiles);
      
      // Actualizar pageToken para la siguiente iteración
      pageToken = nextPageToken;
      
      console.log(`📊 Total EPUBs acumulados: ${allFiles.length}`);
      
      // Seguridad: evitar bucle infinito
      if (totalRequests > 2000) {
        console.log('\n⚠️  Deteniendo después de 2000 requests por seguridad');
        break;
      }
      
    } catch (error) {
      console.error('\n❌ Error obteniendo archivos:', error.message);
      break;
    }
  } while (pageToken);
  
  console.log(`\n✅ Total de EPUBs encontrados: ${allFiles.length} en ${totalRequests} requests`);
  return allFiles;
}

async function getCurrentDatabaseBooks() {
  const database = admin.database();
  
  console.log('📖 Obteniendo libros actuales de Firebase Database...');
  
  try {
    const snapshot = await database.ref('/libros').once('value');
    const currentBooks = snapshot.val() || [];
    console.log(`📊 Libros actuales en Database: ${currentBooks.length}`);
    return new Set(currentBooks);
  } catch (error) {
    console.error('❌ Error obteniendo libros de Database:', error.message);
    return new Set();
  }
}

async function updateDatabase(allBooks) {
  const database = admin.database();
  
  console.log('📝 Actualizando Firebase Database con la lista completa...');
  
  try {
    // Convertir a array y ordenar alfabéticamente
    const sortedBooks = Array.from(allBooks).sort((a, b) => 
      a.toLowerCase().localeCompare(b.toLowerCase())
    );
    
    console.log(`📊 Intentando actualizar con ${sortedBooks.length} libros...`);
    
    // Para datasets grandes, actualizar en lotes
    if (sortedBooks.length > 100000) {
      console.log('⚠️  Dataset muy grande, actualizando en lotes...');
      
      const batchSize = 50000;
      const batches = [];
      
      for (let i = 0; i < sortedBooks.length; i += batchSize) {
        batches.push(sortedBooks.slice(i, i + batchSize));
      }
      
      console.log(`📦 Dividido en ${batches.length} lotes de máximo ${batchSize} libros`);
      
      // Limpiar la referencia primero
      await database.ref('/libros').set(null);
      console.log('🧹 Lista anterior limpiada');
      
      // Actualizar en lotes
      for (let i = 0; i < batches.length; i++) {
        console.log(`📤 Subiendo lote ${i + 1}/${batches.length}...`);
        const batchRef = database.ref(`/libros_batch_${i}`);
        await batchRef.set(batches[i]);
      }
      
      console.log('✅ Todos los lotes subidos');
      console.log('⚠️  NOTA: Los libros están en /libros_batch_0, /libros_batch_1, etc.');
      console.log('⚠️  Necesitarás combinarlos manualmente o modificar la app para leer de múltiples referencias');
      
      return sortedBooks.length;
    } else {
      // Actualizar normalmente si es pequeño
      await database.ref('/libros').set(sortedBooks);
      console.log(`✅ Database actualizada con ${sortedBooks.length} libros`);
      
      // También crear índice por autores (solo si no es demasiado grande)
      if (sortedBooks.length < 200000) {
        console.log('📑 Creando índice de autores...');
        const authorIndex = {};
        
        sortedBooks.forEach(bookName => {
          // Intentar extraer el autor del nombre del archivo
          // Formato común: "Título - Autor.epub" o "Título-Autor.epub"
          const match = bookName.match(/^(.+?)[\-_]([^-_]+)\.epub$/);
          if (match) {
            const title = match[1].trim();
            const author = match[2].trim();
            
            if (!authorIndex[author]) {
              authorIndex[author] = [];
            }
            authorIndex[author].push(bookName);
          } else {
            // Si no se puede extraer autor, poner en "Otros"
            if (!authorIndex['Otros']) {
              authorIndex['Otros'] = [];
            }
            authorIndex['Otros'].push(bookName);
          }
        });
        
        // Actualizar índice de autores
        await database.ref('/autores').set(Object.keys(authorIndex).sort());
        await database.ref('/librosPorAutor').set(authorIndex);
        
        console.log(`✅ Índice de autores creado con ${Object.keys(authorIndex).length} autores`);
      } else {
        console.log('⚠️  Índice de autores omitido por tamaño del dataset');
      }
      
      return sortedBooks.length;
    }
  } catch (error) {
    console.error('❌ Error actualizando Database:', error.message);
    
    if (error.message.includes('WRITE_TOO_BIG')) {
      console.log('💡 Sugerencia: El dataset es demasiado grande. Considera:');
      console.log('   1. Dividir en múltiples referencias');
      console.log('   2. Usar Firebase Firestore en lugar de Realtime Database');
      console.log('   3. Implementar paginación en la app');
    }
    
    throw error;
  }
}

async function syncStorageToDatabase() {
  if (!state.startTime) {
    state.startTime = new Date().toISOString();
  }
  
  try {
    // 1. Obtener todos los archivos de Storage
    const storageBooks = await getAllStorageFiles();
    state.totalFiles = storageBooks.length;
    
    // 2. Obtener libros actuales de Database
    const currentBooks = await getCurrentDatabaseBooks();
    
    // 3. Combinar ambas listas (unión)
    const allBooks = new Set([...currentBooks, ...storageBooks]);
    
    console.log('\n📊 Resumen:');
    console.log(`   - Libros en Storage: ${storageBooks.length}`);
    console.log(`   - Libros en Database: ${currentBooks.size}`);
    console.log(`   - Libros únicos totales: ${allBooks.size}`);
    console.log(`   - Nuevos libros a agregar: ${allBooks.size - currentBooks.size}`);
    
    // 4. Actualizar Database con la lista completa
    const totalUpdated = await updateDatabase(allBooks);
    
    state.epubCount = totalUpdated;
    state.completed = true;
    state.processed = state.totalFiles;
    saveState();
    
    const endTime = new Date().toISOString();
    console.log('\n🎉 SINCRONIZACIÓN COMPLETADA');
    console.log(`📊 Estadísticas finales:`);
    console.log(`   - Total libros sincronizados: ${totalUpdated}`);
    console.log(`   - Inicio: ${state.startTime}`);
    console.log(`   - Fin: ${endTime}`);
    
  } catch (error) {
    console.error('❌ Error fatal:', error.message);
    saveState();
    throw error;
  }
}

// Manejo de señales
process.on('SIGINT', () => {
  console.log('\n⚠️  Interrupción recibida, guardando estado...');
  saveState();
  process.exit(0);
});

// Ejecutar
async function main() {
  try {
    initializeFirebaseAdmin();
    loadState();
    
    if (state.completed) {
      console.log('✅ La sincronización ya está completada');
      console.log(`📚 Total de libros: ${state.epubCount}`);
      return;
    }
    
    await syncStorageToDatabase();
    
  } catch (error) {
    console.error('❌ Error en main:', error.message);
    process.exit(1);
  }
}

main();