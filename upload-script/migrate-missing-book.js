#!/usr/bin/env node

import admin from 'firebase-admin';
import { initializeS3 } from './s3-manager.js';
import dotenv from 'dotenv';

dotenv.config();

let firebaseApp = null;

/**
 * Inicializar Firebase Admin
 */
function initializeFirebaseAdmin() {
  if (firebaseApp) return firebaseApp;
  
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
      client_x509_cert_url: `https://www.googleapis.com/robot/v1/metadata/x509/${process.env.FIREBASE_CLIENT_EMAIL}`
    };

    firebaseApp = admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      storageBucket: process.env.PUBLIC_FIREBASE_STORAGE_BUCKET
    });

    console.log('🔥 Firebase Admin inicializado correctamente');
    return firebaseApp;
  } catch (error) {
    console.error('❌ Error inicializando Firebase Admin:', error.message);
    throw error;
  }
}

async function findAndMigrateBook() {
  console.log('🔍 Buscando el libro en Firebase Storage...');
  
  try {
    const app = initializeFirebaseAdmin();
    const bucket = admin.storage().bucket();
    
    // Buscar archivos que contengan términos relacionados
    const [files] = await bucket.getFiles({
      prefix: '__books__/',
      maxResults: 1000
    });
    
    console.log(`📄 Encontrados ${files.length} archivos en Firebase`);
    
    // Buscar coincidencias
    const searchTerms = ['50', 'cosas', 'universo', 'joanne', 'baker'];
    const matches = files.filter(file => {
      const name = file.name.toLowerCase();
      return searchTerms.some(term => name.includes(term));
    });
    
    console.log(`\n🎯 Encontradas ${matches.length} coincidencias:`);
    
    matches.forEach((file, index) => {
      const fileName = file.name.replace('__books__/', '');
      console.log(`${index + 1}. ${fileName}`);
    });
    
    if (matches.length === 0) {
      console.log('❌ No se encontró el libro en Firebase Storage');
      return;
    }
    
    // Buscar la coincidencia más probable
    let bestMatch = matches.find(file => {
      const name = file.name.toLowerCase();
      return name.includes('50') && 
             name.includes('cosas') && 
             name.includes('universo') &&
             (name.includes('joanne') || name.includes('baker'));
    });
    
    if (!bestMatch && matches.length > 0) {
      bestMatch = matches[0]; // Usar la primera coincidencia
    }
    
    if (bestMatch) {
      console.log(`\n📚 Migrando: ${bestMatch.name}`);
      
      // Descargar de Firebase
      console.log('⬇️  Descargando de Firebase...');
      const [fileBuffer] = await bestMatch.download();
      
      // Subir a S3
      console.log('☁️  Subiendo a S3...');
      const fileName = bestMatch.name.replace('__books__/', '');
      const s3 = await initializeS3();
      
      const uploadParams = {
        Bucket: process.env.S3_BUCKET_NAME,
        Key: fileName,
        Body: fileBuffer,
        ContentType: 'application/epub+zip',
        ServerSideEncryption: 'AES256',
        Metadata: {
          'original-size': fileBuffer.length.toString(),
          'migration-date': new Date().toISOString(),
          'original-path': bestMatch.name,
          'migrated-from': 'firebase-storage'
        }
      };
      
      await s3.upload(uploadParams).promise();
      
      console.log(`✅ Migrado exitosamente: ${fileName}`);
      console.log(`📊 Tamaño: ${(fileBuffer.length / 1024 / 1024).toFixed(2)} MB`);
      
      // URL para probar
      const testUrl = `https://${process.env.S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${encodeURIComponent(fileName)}`;
      console.log(`🔗 URL de prueba: ${testUrl}`);
      
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

findAndMigrateBook();