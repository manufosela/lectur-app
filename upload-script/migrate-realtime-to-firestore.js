#!/usr/bin/env node

import admin from 'firebase-admin';
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config();

// Configuración
const STATE_FILE = './realtime-to-firestore-state.json';
const BATCH_SIZE = 500; // Firestore batch limit

// Estado
let state = {
  totalBooks: 0,
  processed: 0,
  migrated: 0,
  errors: 0,
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
      console.log(`📊 Estado cargado: ${state.processed} libros procesados`);
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

async function migrateRealtimeToFirestore() {
  if (!state.startTime) {
    state.startTime = new Date().toISOString();
  }
  
  const database = admin.database();
  const firestore = admin.firestore();
  
  console.log('📚 Iniciando migración de Realtime Database a Firestore...');
  console.log('🔒 SIN TOCAR ni borrar Realtime Database (solo lectura)');
  
  // Paso 1: Obtener todos los libros de Realtime Database
  console.log('\n📖 PASO 1: Obteniendo libros de Realtime Database...');
  
  let realtimeBooks = [];
  try {
    const snapshot = await database.ref('/libros').once('value');
    realtimeBooks = snapshot.val() || [];
    
    console.log(`✅ Obtenidos ${realtimeBooks.length} libros de Realtime Database`);
    state.totalBooks = realtimeBooks.length;
    
    if (realtimeBooks.length === 0) {
      console.log('⚠️  No hay libros en Realtime Database para migrar');
      return;
    }
    
    // Mostrar algunos ejemplos
    console.log('\n📋 Ejemplos de libros a migrar:');
    realtimeBooks.slice(0, 5).forEach((book, index) => {
      console.log(`   ${index + 1}. ${book}`);
    });
    
  } catch (error) {
    console.error('❌ Error obteniendo libros de Realtime Database:', error.message);
    throw error;
  }
  
  // Paso 2: Verificar Firestore actual
  console.log('\n🔍 PASO 2: Verificando estado actual de Firestore...');
  
  try {
    const existingCount = await firestore.collection('books').get();
    console.log(`📊 Libros ya en Firestore: ${existingCount.size}`);
    
    if (existingCount.size > 0) {
      console.log('⚠️  Firestore ya tiene libros. Continuando (no se duplicarán)...');
    }
  } catch (error) {
    console.error('❌ Error verificando Firestore:', error.message);
  }
  
  // Paso 3: Migrar en lotes
  console.log('\n📤 PASO 3: Migrando libros a Firestore...');
  
  let batch = firestore.batch();
  let batchCount = 0;
  let migrated = 0;
  let skipped = 0;
  
  for (let i = 0; i < realtimeBooks.length; i++) {
    const fileName = realtimeBooks[i];
    
    try {
      // Crear ID único para el documento
      const docId = Buffer.from(fileName, 'utf8').toString('base64url');
      const docRef = firestore.collection('books').doc(docId);
      
      // Verificar si ya existe (para evitar duplicados)
      const existingDoc = await docRef.get();
      if (existingDoc.exists) {
        skipped++;
        state.processed++;
        continue;
      }
      
      // Extraer información del libro
      const bookInfo = extractBookInfo(fileName);
      
      // Añadir al batch
      batch.set(docRef, bookInfo);
      batchCount++;
      state.processed++;
      
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
        
        console.log(`✅ Progreso: ${migrated} migrados, ${skipped} omitidos, ${state.processed}/${state.totalBooks} procesados`);
      }
      
    } catch (error) {
      console.error(`❌ Error procesando archivo: ${fileName}`, error.message);
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
  
  // Paso 4: Actualizar estadísticas en Firestore
  console.log('\n📊 PASO 4: Actualizando estadísticas...');
  
  try {
    await firestore.collection('metadata').doc('stats').set({
      totalBooks: migrated,
      lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
      migrationCompleted: new Date().toISOString(),
      migratedFrom: 'realtime-database'
    });
    console.log('✅ Estadísticas actualizadas en Firestore');
  } catch (error) {
    console.error('❌ Error actualizando estadísticas:', error.message);
  }
  
  state.completed = true;
  saveState();
  
  const endTime = new Date().toISOString();
  console.log('\n🎉 MIGRACIÓN COMPLETADA');
  console.log('=======================');
  console.log(`📊 Estadísticas finales:`);
  console.log(`   - Total libros en Realtime DB: ${state.totalBooks}`);
  console.log(`   - Libros migrados a Firestore: ${migrated}`);
  console.log(`   - Libros omitidos (ya existían): ${skipped}`);
  console.log(`   - Errores: ${state.errors}`);
  console.log(`   - Inicio: ${state.startTime}`);
  console.log(`   - Fin: ${endTime}`);
  console.log('\n✅ Realtime Database INTACTO (no se tocó)');
  console.log('✅ Firestore poblado y listo para usar');
  console.log('✅ La app ahora usará Firestore automáticamente');
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
    
    console.log('🚀 Iniciando migración Realtime DB → Firestore...');
    console.log('💡 Puedes interrumpir con Ctrl+C y reanudar después');
    
    await migrateRealtimeToFirestore();
    
  } catch (error) {
    console.error('❌ Error en main:', error.message);
    saveState();
    process.exit(1);
  }
}

main();