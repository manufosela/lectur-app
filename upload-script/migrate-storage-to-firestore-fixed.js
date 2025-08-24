#!/usr/bin/env node

import admin from 'firebase-admin';
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config();

// Configuración
const STATE_FILE = './firestore-migration-fixed-state.json';
const BATCH_SIZE = 500; // Firestore batch limit

// Estado
let state = {
  totalFiles: 0,
  processed: 0,
  migrated: 0,
  errors: 0,
  lastProcessedFile: '',
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
      client_x509_cert_url: `https://www.googleapis.com/service-accounts/v1/metadata/x509/${process.env.FIREBASE_CLIENT_EMAIL}`
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

function extractBookInfo(fileName) {
  try {
    // Intentar extraer título y autor del nombre del archivo
    // Formatos comunes: "Título - Autor.epub", "Título_Autor.epub", etc.
    const nameWithoutExt = fileName.replace('.epub', '');
    
    // Intentar diferentes separadores
    let title, author;
    
    if (nameWithoutExt.includes(' - ')) {
      [title, author] = nameWithoutExt.split(' - ');
    } else if (nameWithoutExt.includes('_-_')) {
      [title, author] = nameWithoutExt.split('_-_');
    } else if (nameWithoutExt.includes(' _ ')) {
      [title, author] = nameWithoutExt.split(' _ ');
    } else if (nameWithoutExt.includes('__')) {
      [title, author] = nameWithoutExt.split('__');
    } else {
      // Si no se puede separar, usar el nombre completo como título
      title = nameWithoutExt;
      author = 'Autor desconocido';
    }
    
    // Limpiar espacios y caracteres especiales
    title = title ? title.trim() : 'Título desconocido';
    author = author ? author.trim() : 'Autor desconocido';
    
    // Crear palabras clave para búsqueda
    const titleKeywords = title.toLowerCase()
      .split(/[\s\-_.,;:()[\]{}]+/)
      .filter(word => word.length > 2)
      .slice(0, 10); // Máximo 10 palabras clave
    
    return {
      title,
      author,
      titleKeywords,
      fileName,
      addedAt: admin.firestore.FieldValue.serverTimestamp()
    };
  } catch (error) {
    console.error('Error extrayendo info del libro:', fileName, error);
    return {
      title: fileName.replace('.epub', ''),
      author: 'Autor desconocido',
      titleKeywords: [fileName.toLowerCase()],
      fileName,
      addedAt: admin.firestore.FieldValue.serverTimestamp()
    };
  }
}

async function migrateStorageToFirestore() {
  if (!state.startTime) {
    state.startTime = new Date().toISOString();
  }
  
  const bucket = admin.storage().bucket();
  const firestore = admin.firestore();
  
  console.log('📚 Iniciando migración CORREGIDA de Firebase Storage a Firestore...');
  console.log('🔧 Con manejo correcto de pageToken');
  
  // Obtener TODOS los archivos únicos primero
  const allUniqueFiles = new Set();
  let pageToken = undefined;
  let pageNumber = 0;
  
  // Fase 1: Obtener lista única de archivos
  console.log('\n📋 FASE 1: Obteniendo lista única de archivos...');
  
  do {
    try {
      pageNumber++;
      console.log(`🔄 Procesando página ${pageNumber}...`);
      
      const [files, , nextPageToken] = await bucket.getFiles({
        pageToken,
        maxResults: 1000,
        prefix: '__books__/'
      });
      
      // Filtrar solo EPUBs y añadir a Set (evita duplicados automáticamente)
      const epubFiles = files
        .filter(file => file.name.endsWith('.epub'))
        .map(file => file.name.replace('__books__/', ''));
      
      let newFiles = 0;
      epubFiles.forEach(fileName => {
        if (!allUniqueFiles.has(fileName)) {
          allUniqueFiles.add(fileName);
          newFiles++;
        }
      });
      
      console.log(`   📁 Archivos en página: ${files.length}`);
      console.log(`   📚 EPUBs en página: ${epubFiles.length}`);
      console.log(`   ✨ Archivos nuevos únicos: ${newFiles}`);
      console.log(`   📊 Total únicos acumulados: ${allUniqueFiles.size}`);
      
      // CRÍTICO: Verificar si realmente hay más páginas
      pageToken = nextPageToken;
      
      if (!nextPageToken) {
        console.log('✅ No hay más páginas - lista completa obtenida');
        break;
      }
      
      // Seguridad contra bucles infinitos
      if (pageNumber > 100) {
        console.log('\n⚠️  Límite de seguridad alcanzado (100 páginas)');
        console.log('   Si hay más archivos, ajustar el límite');
        break;
      }
      
    } catch (error) {
      console.error('\n❌ Error obteniendo archivos:', error.message);
      break;
    }
  } while (pageToken);
  
  // Convertir Set a Array
  const uniqueFilesList = Array.from(allUniqueFiles);
  state.totalFiles = uniqueFilesList.length;
  
  console.log(`\n📊 FASE 1 COMPLETADA:`);
  console.log(`   📄 Páginas procesadas: ${pageNumber}`);
  console.log(`   📚 Archivos únicos encontrados: ${uniqueFilesList.length}`);
  
  // Fase 2: Migrar a Firestore en lotes
  console.log('\n📤 FASE 2: Migrando a Firestore...');
  
  let batch = firestore.batch();
  let batchCount = 0;
  let migrated = 0;
  
  for (let i = 0; i < uniqueFilesList.length; i++) {
    const fileName = uniqueFilesList[i];
    
    try {
      const bookInfo = extractBookInfo(fileName);
      const docId = Buffer.from(fileName, 'utf8').toString('base64url');
      
      // Añadir al batch
      const docRef = firestore.collection('books').doc(docId);
      batch.set(docRef, bookInfo);
      batchCount++;
      
      state.processed++;
      state.lastProcessedFile = fileName;
      
      // Ejecutar batch cuando llegue al límite
      if (batchCount >= BATCH_SIZE) {
        console.log(`📤 Ejecutando batch ${Math.ceil(migrated / BATCH_SIZE) + 1} (${batchCount} documentos)...`);
        await batch.commit();
        migrated += batchCount;
        
        // Nuevo batch
        batch = firestore.batch();
        batchCount = 0;
        
        // Guardar progreso
        state.migrated = migrated;
        saveState();
        console.log(`✅ ${migrated} libros migrados hasta ahora`);
      }
      
    } catch (error) {
      console.error('❌ Error procesando archivo:', fileName, error.message);
      state.errors++;
    }
  }
  
  // Ejecutar último batch si tiene documentos
  if (batchCount > 0) {
    console.log(`📤 Ejecutando último batch (${batchCount} documentos)...`);
    await batch.commit();
    migrated += batchCount;
    state.migrated = migrated;
  }
  
  // Actualizar estadísticas
  try {
    await firestore.collection('metadata').doc('stats').set({
      totalBooks: migrated,
      lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
      migrationCompleted: new Date().toISOString()
    });
    console.log('📊 Estadísticas actualizadas en Firestore');
  } catch (error) {
    console.error('❌ Error actualizando estadísticas:', error.message);
  }
  
  state.completed = true;
  saveState();
  
  const endTime = new Date().toISOString();
  console.log('\n🎉 MIGRACIÓN COMPLETADA');
  console.log(`📊 Estadísticas finales:`);
  console.log(`   - Total archivos únicos: ${uniqueFilesList.length}`);
  console.log(`   - Total libros migrados: ${migrated}`);
  console.log(`   - Errores: ${state.errors}`);
  console.log(`   - Inicio: ${state.startTime}`);
  console.log(`   - Fin: ${endTime}`);
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
      console.log('✅ La migración ya está completada');
      console.log(`📚 Total de libros migrados: ${state.migrated}`);
      return;
    }
    
    console.log('🚀 Iniciando migración CORREGIDA a Firestore...');
    
    await migrateStorageToFirestore();
    
  } catch (error) {
    console.error('❌ Error en main:', error.message);
    saveState();
    process.exit(1);
  }
}

main();