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

async function debugPagination() {
  const bucket = admin.storage().bucket();
  let pageToken = undefined;
  let pageCount = 0;
  let totalFiles = 0;
  let totalEpubs = 0;
  const seenFiles = new Set();
  let duplicates = 0;
  
  console.log('🔍 Depurando paginación de Firebase Storage...');
  
  do {
    try {
      pageCount++;
      console.log(`\n📄 Página ${pageCount}`);
      console.log(`   Token: ${pageToken ? (typeof pageToken === 'string' ? pageToken.substring(0, 50) + '...' : 'objeto-' + JSON.stringify(pageToken).substring(0, 30) + '...') : 'inicial'}`);
      
      const [files, , nextPageToken] = await bucket.getFiles({
        pageToken,
        maxResults: 1000,
        prefix: '__books__/'
      });
      
      const epubFiles = files.filter(file => file.name.endsWith('.epub'));
      
      console.log(`   Archivos totales: ${files.length}`);
      console.log(`   EPUBs: ${epubFiles.length}`);
      
      // Verificar duplicados
      let newFiles = 0;
      let duplicatesInPage = 0;
      
      epubFiles.forEach(file => {
        if (seenFiles.has(file.name)) {
          duplicatesInPage++;
        } else {
          seenFiles.add(file.name);
          newFiles++;
        }
      });
      
      console.log(`   Archivos nuevos: ${newFiles}`);
      console.log(`   Duplicados en esta página: ${duplicatesInPage}`);
      
      totalFiles += files.length;
      totalEpubs += newFiles; // Solo contar archivos únicos
      duplicates += duplicatesInPage;
      
      console.log(`   📊 Total único acumulado: ${totalEpubs}`);
      console.log(`   📊 Total duplicados: ${duplicates}`);
      
      // Mostrar algunos nombres para verificar
      if (epubFiles.length > 0) {
        console.log(`   Primer archivo: ${epubFiles[0].name.replace('__books__/', '')}`);
        console.log(`   Último archivo: ${epubFiles[epubFiles.length-1].name.replace('__books__/', '')}`);
      }
      
      pageToken = nextPageToken;
      
      // Verificar si el token cambia
      if (pageCount > 1 && !nextPageToken) {
        console.log('✅ No hay más páginas - fin normal');
        break;
      }
      
      // Parar después de 10 páginas para debugging
      if (pageCount >= 10) {
        console.log('⚠️  Parando después de 10 páginas para debugging');
        break;
      }
      
    } catch (error) {
      console.error('\n❌ Error en página:', error.message);
      break;
    }
  } while (pageToken);
  
  console.log('\n📊 RESUMEN FINAL:');
  console.log(`   📄 Páginas procesadas: ${pageCount}`);
  console.log(`   📁 Total archivos vistos: ${totalFiles}`);
  console.log(`   📚 Total EPUBs únicos: ${totalEpubs}`);
  console.log(`   🔄 Total duplicados: ${duplicates}`);
  console.log(`   ⚠️  Hay más páginas: ${!!pageToken}`);
  
  if (duplicates > 0) {
    console.log('\n🚨 PROBLEMA DETECTADO: Hay archivos duplicados!');
    console.log('   Esto indica un problema en la paginación de Firebase Storage');
  }
}

// Ejecutar
async function main() {
  try {
    initializeFirebaseAdmin();
    await debugPagination();
  } catch (error) {
    console.error('❌ Error en main:', error.message);
    process.exit(1);
  }
}

main();