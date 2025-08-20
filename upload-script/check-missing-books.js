#!/usr/bin/env node

import AWS from 'aws-sdk';
import admin from 'firebase-admin';
import dotenv from 'dotenv';

dotenv.config();

// Inicializar Firebase Admin
function initializeFirebaseAdmin() {
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
    databaseURL: process.env.FIREBASE_DATABASE_URL
  });

  return admin;
}

// Configurar AWS S3
const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION
});

async function getAllS3Files() {
  console.log('📦 Obteniendo lista completa de S3...');
  const s3Files = new Set();
  
  let continuationToken = undefined;
  do {
    const params = {
      Bucket: process.env.S3_BUCKET_NAME,
      MaxKeys: 1000
    };
    
    if (continuationToken) {
      params.ContinuationToken = continuationToken;
    }
    
    try {
      const data = await s3.listObjectsV2(params).promise();
      data.Contents?.forEach(obj => {
        s3Files.add(obj.Key);
      });
      continuationToken = data.NextContinuationToken;
      process.stdout.write(`\r📦 S3 archivos cargados: ${s3Files.size}`);
    } catch (error) {
      console.error('\n❌ Error obteniendo archivos S3:', error.message);
      break;
    }
  } while (continuationToken);
  
  console.log(`\n✅ Total archivos en S3: ${s3Files.size}`);
  return s3Files;
}

async function getAllFirebaseBooks() {
  console.log('🔥 Obteniendo lista de Firebase Database...');
  const app = initializeFirebaseAdmin();
  const database = admin.database();
  
  try {
    const snapshot = await database.ref('/libros').once('value');
    const libros = snapshot.val() || [];
    console.log(`✅ Total libros en Firebase: ${libros.length}`);
    return libros;
  } catch (error) {
    console.error('❌ Error obteniendo libros Firebase:', error.message);
    return [];
  }
}

async function checkMissingBooks() {
  try {
    const [s3Files, firebaseBooks] = await Promise.all([
      getAllS3Files(),
      getAllFirebaseBooks()
    ]);
    
    console.log('\n🔍 Analizando diferencias...');
    
    const missingInS3 = [];
    const extraInS3 = [];
    
    // Libros en Firebase que no están en S3
    firebaseBooks.forEach(book => {
      if (!s3Files.has(book)) {
        missingInS3.push(book);
      }
    });
    
    // Archivos en S3 que no están en Firebase (opcional)
    s3Files.forEach(file => {
      if (!firebaseBooks.includes(file)) {
        extraInS3.push(file);
      }
    });
    
    console.log('\n📊 RESUMEN:');
    console.log(`📚 Libros en Firebase Database: ${firebaseBooks.length}`);
    console.log(`📦 Archivos en S3: ${s3Files.size}`);
    console.log(`❌ Faltan en S3: ${missingInS3.length}`);
    console.log(`➕ Extras en S3: ${extraInS3.length}`);
    
    if (missingInS3.length > 0) {
      console.log('\n📝 Libros que faltan en S3:');
      missingInS3.slice(0, 20).forEach((book, i) => {
        console.log(`${i + 1}. ${book}`);
      });
      
      if (missingInS3.length > 20) {
        console.log(`... y ${missingInS3.length - 20} más`);
      }
      
      // Guardar lista completa
      const fs = await import('fs');
      fs.writeFileSync('./missing-in-s3.txt', missingInS3.join('\n'));
      console.log('\n💾 Lista completa guardada en: missing-in-s3.txt');
    }
    
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

checkMissingBooks();