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

async function countStorageFiles() {
  const bucket = admin.storage().bucket();
  let totalEpubs = 0;
  let totalFiles = 0;
  let pageToken = undefined;
  let totalRequests = 0;
  
  console.log('🔢 Contando archivos de Firebase Storage...');
  console.log('⚠️  Solo contando, no descargando ni actualizando...');
  
  const startTime = Date.now();
  
  do {
    try {
      totalRequests++;
      console.log(`\n📄 Página ${totalRequests}...`);
      
      const [files, , nextPageToken] = await bucket.getFiles({
        pageToken,
        maxResults: 1000,
        prefix: '__books__/'
      });
      
      const epubsInPage = files.filter(file => file.name.endsWith('.epub')).length;
      
      totalFiles += files.length;
      totalEpubs += epubsInPage;
      
      console.log(`   - Archivos en página: ${files.length}`);
      console.log(`   - EPUBs en página: ${epubsInPage}`);
      console.log(`   - Total archivos: ${totalFiles}`);
      console.log(`   - Total EPUBs: ${totalEpubs}`);
      
      pageToken = nextPageToken;
      
      // Seguridad: máximo 3000 requests
      if (totalRequests > 3000) {
        console.log('\n⚠️  Deteniendo después de 3000 requests por seguridad');
        break;
      }
      
      if (!pageToken) {
        console.log('✅ No hay más páginas');
        break;
      }
      
    } catch (error) {
      console.error('\n❌ Error contando archivos:', error.message);
      break;
    }
  } while (pageToken);
  
  const endTime = Date.now();
  const durationMinutes = Math.round((endTime - startTime) / 1000 / 60 * 100) / 100;
  
  console.log('\n📊 RESUMEN FINAL:');
  console.log(`   📁 Total archivos en Storage: ${totalFiles}`);
  console.log(`   📚 Total EPUBs encontrados: ${totalEpubs}`);
  console.log(`   📄 Páginas procesadas: ${totalRequests}`);
  console.log(`   ⏱️  Tiempo: ${durationMinutes} minutos`);
  
  if (totalRequests >= 3000) {
    console.log('\n⚠️  ADVERTENCIA: Proceso interrumpido por límite de seguridad');
    console.log('   Es posible que haya más archivos sin contar');
  }
  
  return { totalFiles, totalEpubs, requests: totalRequests };
}

// Ejecutar
async function main() {
  try {
    initializeFirebaseAdmin();
    const result = await countStorageFiles();
    
    console.log('\n💰 Estimación de costos (aproximada):');
    console.log(`   - Requests realizados: ${result.requests}`);
    console.log(`   - Costo estimado: $${(result.requests * 0.0004).toFixed(4)} USD`);
    
  } catch (error) {
    console.error('❌ Error en main:', error.message);
    process.exit(1);
  }
}

main();