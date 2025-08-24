#!/usr/bin/env node

import admin from 'firebase-admin';
import dotenv from 'dotenv';

dotenv.config();

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

async function investigateStorage() {
  const bucket = admin.storage().bucket();
  
  console.log('🔍 INVESTIGACIÓN COMPLETA DE FIREBASE STORAGE');
  console.log('============================================');
  
  // 1. Ver si hay diferentes prefijos/carpetas
  console.log('\n📁 PASO 1: Explorando estructura de carpetas...');
  
  try {
    const [files] = await bucket.getFiles({
      maxResults: 100,  // Solo primeros 100 para ver estructura
      delimiter: '/'    // Ver carpetas
    });
    
    console.log(`   Total archivos en raíz (primeros 100): ${files.length}`);
    
    // Ver algunos archivos de ejemplo
    console.log('\n📄 Ejemplos de archivos/carpetas en raíz:');
    files.slice(0, 10).forEach((file, index) => {
      console.log(`   ${index + 1}. ${file.name}`);
    });
    
  } catch (error) {
    console.error('Error explorando raíz:', error);
  }
  
  // 2. Verificar específicamente la carpeta __books__
  console.log('\n📚 PASO 2: Contando archivos en __books__/ (sin paginación)...');
  
  try {
    const [books] = await bucket.getFiles({
      prefix: '__books__/',
      maxResults: 100000  // Intentar obtener muchos de una vez
    });
    
    const epubCount = books.filter(file => file.name.endsWith('.epub')).length;
    
    console.log(`   Total archivos en __books__/: ${books.length}`);
    console.log(`   Total EPUBs en __books__/: ${epubCount}`);
    
    if (books.length > 0) {
      console.log('\n📋 Ejemplos de archivos en __books__/:');
      books.slice(0, 5).forEach((file, index) => {
        console.log(`   ${index + 1}. ${file.name}`);
      });
      
      if (books.length >= 100000) {
        console.log('\n⚠️  NOTA: Resultado puede estar truncado en 100,000');
      }
    }
    
  } catch (error) {
    console.error('Error con __books__:', error);
  }
  
  // 3. Verificar otras posibles carpetas
  console.log('\n📂 PASO 3: Buscando otras carpetas de libros...');
  
  const possiblePrefixes = [
    'books/',
    'libros/',
    'epub/',
    'files/',
    'uploads/',
    ''  // raíz sin prefijo
  ];
  
  for (const prefix of possiblePrefixes) {
    try {
      console.log(`\n   🔍 Investigando prefijo: "${prefix}"`);
      
      const [files] = await bucket.getFiles({
        prefix: prefix,
        maxResults: 1000
      });
      
      const epubs = files.filter(file => file.name.endsWith('.epub'));
      
      console.log(`      Archivos totales: ${files.length}`);
      console.log(`      EPUBs encontrados: ${epubs.length}`);
      
      if (epubs.length > 0) {
        console.log('      Ejemplos:');
        epubs.slice(0, 3).forEach(file => {
          console.log(`        - ${file.name}`);
        });
      }
      
    } catch (error) {
      console.log(`      Error: ${error.message}`);
    }
  }
  
  // 4. Comparar con la base de datos actual
  console.log('\n🗄️  PASO 4: Comparando con Firebase Realtime Database...');
  
  try {
    const database = admin.database();
    const snapshot = await database.ref('/libros').once('value');
    const dbBooks = snapshot.val() || [];
    
    console.log(`   Libros en Database: ${dbBooks.length}`);
    
    if (dbBooks.length > 0) {
      console.log('   Ejemplos de libros en Database:');
      dbBooks.slice(0, 5).forEach((book, index) => {
        console.log(`     ${index + 1}. ${book}`);
      });
    }
    
  } catch (error) {
    console.error('Error accediendo a Database:', error);
  }
  
  // 5. Información del bucket
  console.log('\n🗂️  PASO 5: Información del bucket...');
  
  try {
    const [metadata] = await bucket.getMetadata();
    console.log(`   Bucket: ${metadata.name}`);
    console.log(`   Ubicación: ${metadata.location}`);
    console.log(`   Clase de almacenamiento: ${metadata.storageClass}`);
    console.log(`   Creado: ${metadata.timeCreated}`);
    
  } catch (error) {
    console.error('Error obteniendo metadata:', error);
  }
  
  console.log('\n🎯 CONCLUSIONES:');
  console.log('================');
  console.log('1. Revisar los conteos de archivos arriba');
  console.log('2. Verificar si hay archivos en diferentes carpetas');
  console.log('3. Comparar con el conteo de Database (570K)');
  console.log('4. Posibles causas del descuadre:');
  console.log('   - Archivos en múltiples carpetas');
  console.log('   - Límites de API no manejados correctamente');
  console.log('   - Archivos borrados recientemente');
  console.log('   - Problema con las credenciales/permisos');
}

// Ejecutar
async function main() {
  try {
    initializeFirebaseAdmin();
    await investigateStorage();
  } catch (error) {
    console.error('❌ Error en main:', error.message);
    process.exit(1);
  }
}

main();