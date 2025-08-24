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

async function estimateStorageSize() {
  const bucket = admin.storage().bucket();
  
  console.log('📊 Estimando tamaño de Firebase Storage por muestreo...');
  console.log('💡 Método: Contar las primeras 50 páginas y extrapolar');
  
  let totalEpubs = 0;
  let totalFiles = 0;
  let pageToken = undefined;
  let pagesChecked = 0;
  const maxPagesToSample = 50;
  
  const startTime = Date.now();
  
  do {
    try {
      pagesChecked++;
      console.log(`📄 Muestrando página ${pagesChecked}/${maxPagesToSample}...`);
      
      const [files, , nextPageToken] = await bucket.getFiles({
        pageToken,
        maxResults: 1000,
        prefix: '__books__/'
      });
      
      const epubsInPage = files.filter(file => file.name.endsWith('.epub')).length;
      
      totalFiles += files.length;
      totalEpubs += epubsInPage;
      
      console.log(`   - Archivos: ${files.length}, EPUBs: ${epubsInPage}`);
      
      pageToken = nextPageToken;
      
      if (pagesChecked >= maxPagesToSample) {
        console.log('✅ Muestra completada');
        break;
      }
      
      if (!pageToken) {
        console.log('✅ No hay más páginas (storage más pequeño de lo esperado)');
        break;
      }
      
    } catch (error) {
      console.error('\n❌ Error muestreando:', error.message);
      break;
    }
  } while (pageToken && pagesChecked < maxPagesToSample);
  
  const endTime = Date.now();
  const durationSeconds = Math.round((endTime - startTime) / 1000);
  
  console.log('\n📊 RESULTADO DEL MUESTREO:');
  console.log(`   📁 Archivos en muestra: ${totalFiles}`);
  console.log(`   📚 EPUBs en muestra: ${totalEpubs}`);
  console.log(`   📄 Páginas muestreadas: ${pagesChecked}`);
  console.log(`   ⏱️  Tiempo de muestreo: ${durationSeconds} segundos`);
  
  if (pageToken) {
    // Hay más páginas, podemos extrapolar
    const avgFilesPerPage = totalFiles / pagesChecked;
    const avgEpubsPerPage = totalEpubs / pagesChecked;
    
    console.log('\n🔮 EXTRAPOLACIÓN (HAY MÁS PÁGINAS):');
    console.log(`   📊 Promedio archivos/página: ${avgFilesPerPage.toFixed(1)}`);
    console.log(`   📊 Promedio EPUBs/página: ${avgEpubsPerPage.toFixed(1)}`);
    
    // Estimación conservadora: asumir que hay al menos 1000 páginas en total
    // (si las primeras 50 páginas tienen data, probablemente hay muchas más)
    const estimatedMinPages = 1000;
    const estimatedMaxPages = 2000;
    
    const minFiles = Math.round(avgFilesPerPage * estimatedMinPages);
    const maxFiles = Math.round(avgFilesPerPage * estimatedMaxPages);
    const minEpubs = Math.round(avgEpubsPerPage * estimatedMinPages);
    const maxEpubs = Math.round(avgEpubsPerPage * estimatedMaxPages);
    
    console.log(`\n📈 ESTIMACIONES (basado en ${avgFilesPerPage.toFixed(1)} archivos/página):`);
    console.log(`   📁 Total archivos estimado: ${minFiles.toLocaleString()} - ${maxFiles.toLocaleString()}`);
    console.log(`   📚 Total EPUBs estimado: ${minEpubs.toLocaleString()} - ${maxEpubs.toLocaleString()}`);
    
    const estimatedRequests = Math.round((estimatedMinPages + estimatedMaxPages) / 2);
    const estimatedCost = estimatedRequests * 0.0004;
    
    console.log(`\n💰 COSTO ESTIMADO PARA CONTEO COMPLETO:`);
    console.log(`   📄 Requests necesarios: ~${estimatedRequests.toLocaleString()}`);
    console.log(`   💵 Costo estimado: ~$${estimatedCost.toFixed(2)} USD`);
    
    if (estimatedCost > 10) {
      console.log('\n⚠️  ADVERTENCIA: El costo podría exceder los $10 USD');
      console.log('   💡 Considera si realmente necesitas el conteo exacto');
    }
  } else {
    // No hay más páginas, el conteo es exacto
    console.log('\n✅ CONTEO EXACTO (no hay más páginas):');
    console.log(`   📁 Total archivos: ${totalFiles.toLocaleString()}`);
    console.log(`   📚 Total EPUBs: ${totalEpubs.toLocaleString()}`);
    
    const actualCost = pagesChecked * 0.0004;
    console.log(`\n💰 COSTO REAL: $${actualCost.toFixed(4)} USD`);
  }
  
  return { totalFiles, totalEpubs, pagesChecked, hasMore: !!pageToken };
}

// Ejecutar
async function main() {
  try {
    initializeFirebaseAdmin();
    await estimateStorageSize();
  } catch (error) {
    console.error('❌ Error en main:', error.message);
    process.exit(1);
  }
}

main();