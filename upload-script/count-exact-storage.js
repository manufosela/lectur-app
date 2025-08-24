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

async function countExactStorage() {
  const bucket = admin.storage().bucket();
  
  console.log('🔢 CONTEO EXACTO DE FIREBASE STORAGE');
  console.log('===================================');
  
  let pageToken = undefined;
  let pageNumber = 0;
  let totalFiles = 0;
  let totalEpubs = 0;
  const uniqueFiles = new Set();
  
  const startTime = Date.now();
  
  console.log('🚀 Iniciando conteo exhaustivo...');
  console.log('⏱️  Progreso cada 10 páginas\n');
  
  do {
    try {
      pageNumber++;
      
      const [files, , nextPageToken] = await bucket.getFiles({
        pageToken,
        maxResults: 1000,
        prefix: '__books__/'
      });
      
      // Contar EPUBs únicos
      const epubsInPage = files.filter(file => file.name.endsWith('.epub'));
      let newEpubs = 0;
      
      epubsInPage.forEach(file => {
        if (!uniqueFiles.has(file.name)) {
          uniqueFiles.add(file.name);
          newEpubs++;
        }
      });
      
      totalFiles += files.length;
      totalEpubs = uniqueFiles.size;
      
      // Mostrar progreso cada 10 páginas o si hay cambios importantes
      if (pageNumber % 10 === 0 || newEpubs === 0 || !nextPageToken) {
        const elapsed = Math.round((Date.now() - startTime) / 1000);
        console.log(`📄 Página ${pageNumber}: ${files.length} archivos, ${epubsInPage.length} EPUBs (${newEpubs} nuevos)`);
        console.log(`   📊 Total único acumulado: ${totalEpubs} EPUBs`);
        console.log(`   ⏱️  Tiempo transcurrido: ${elapsed}s`);
        
        if (newEpubs === 0 && pageNumber > 1) {
          console.log('   🔄 Esta página solo tiene duplicados');
        }
      }
      
      // Verificar token para evitar bucles infinitos
      pageToken = nextPageToken;
      
      // Si no hay más páginas
      if (!nextPageToken) {
        console.log('\n✅ No hay más páginas - conteo completado');
        break;
      }
      
      // Seguridad contra bucles infinitos (límite alto)
      if (pageNumber > 1000) {
        console.log('\n⚠️  Límite de seguridad alcanzado (1000 páginas)');
        console.log('   🚨 Posible bucle infinito detectado');
        break;
      }
      
    } catch (error) {
      console.error(`\n❌ Error en página ${pageNumber}:`, error.message);
      break;
    }
  } while (pageToken);
  
  const endTime = Date.now();
  const totalTimeSeconds = Math.round((endTime - startTime) / 1000);
  const totalTimeMinutes = Math.round(totalTimeSeconds / 60 * 100) / 100;
  
  console.log('\n📊 RESULTADO FINAL:');
  console.log('==================');
  console.log(`📄 Páginas procesadas: ${pageNumber}`);
  console.log(`📁 Total archivos vistos: ${totalFiles}`);
  console.log(`📚 Total EPUBs únicos: ${totalEpubs}`);
  console.log(`⏱️  Tiempo total: ${totalTimeMinutes} minutos (${totalTimeSeconds}s)`);
  console.log(`💰 Costo estimado: $${(pageNumber * 0.0004).toFixed(4)} USD`);
  
  if (pageNumber > 100 && totalEpubs < 10000) {
    console.log('\n🚨 POSIBLE PROBLEMA:');
    console.log('   - Muchas páginas pero pocos archivos únicos');
    console.log('   - Esto sugiere bucle infinito o duplicados masivos');
  }
  
  if (totalEpubs < 50000) {
    console.log('\n💡 OBSERVACIÓN:');
    console.log(`   - Solo ${totalEpubs} archivos únicos encontrados`);
    console.log('   - Esto es mucho menos que los ~570K esperados');
    console.log('   - Los archivos pueden haber sido eliminados o movidos');
  }
  
  return {
    pages: pageNumber,
    totalFiles,
    uniqueEpubs: totalEpubs,
    timeMinutes: totalTimeMinutes
  };
}

// Ejecutar
async function main() {
  try {
    initializeFirebaseAdmin();
    const result = await countExactStorage();
    
    console.log('\n🎯 CONFIRMACIÓN FINAL:');
    console.log(`Firebase Storage contiene EXACTAMENTE ${result.uniqueEpubs} EPUBs únicos`);
    
  } catch (error) {
    console.error('❌ Error en main:', error.message);
    process.exit(1);
  }
}

main();