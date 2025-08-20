#!/usr/bin/env node

import admin from 'firebase-admin';
import AWS from 'aws-sdk';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Script alternativo para subir libros con caracteres especiales
 * Mantiene los nombres originales
 */

let firebaseApp = null;

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

function initializeS3() {
  AWS.config.update({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: process.env.AWS_REGION || 'eu-west-1'
  });
  
  const s3 = new AWS.S3({
    signatureVersion: 'v4',
    s3ForcePathStyle: true
  });
  
  return s3;
}

async function uploadSingleBook(bookName) {
  console.log(`\n📖 Procesando: ${bookName}`);
  
  const app = initializeFirebaseAdmin();
  const bucket = admin.storage().bucket();
  const s3 = initializeS3();
  
  try {
    // 1. Descargar de Firebase Storage
    const firebasePath = `__books__/${bookName}`;
    const file = bucket.file(firebasePath);
    
    console.log('⬇️  Descargando de Firebase Storage...');
    const [exists] = await file.exists();
    
    if (!exists) {
      console.log(`⚠️  No encontrado en Firebase: ${firebasePath}`);
      return false;
    }
    
    const [fileBuffer] = await file.download();
    console.log(`✅ Descargado: ${(fileBuffer.length / 1024 / 1024).toFixed(2)} MB`);
    
    // 2. Subir a S3 con el nombre original
    console.log('☁️  Subiendo a S3 con nombre original...');
    
    // Usar putObject en lugar de upload para mejor control
    const params = {
      Bucket: process.env.S3_BUCKET_NAME,
      Key: bookName, // Nombre original sin modificación
      Body: fileBuffer,
      ContentType: 'application/epub+zip',
      ServerSideEncryption: 'AES256'
    };
    
    await s3.putObject(params).promise();
    console.log(`✅ Subido exitosamente: ${bookName}`);
    
    // Verificar que se puede acceder
    const url = `https://${process.env.S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${encodeURIComponent(bookName)}`;
    console.log(`🔗 URL: ${url}`);
    
    return true;
    
  } catch (error) {
    console.error(`❌ Error: ${error.message}`);
    if (error.code) {
      console.error(`   Código: ${error.code}`);
    }
    return false;
  }
}

async function main() {
  const problematicBooks = [
    "Albert Bertran Bas - La memoria eres tú.epub",
    "Apocalipsis Z - 2 Los días oscuros - Manel Loureiro.epub",
    "Benvolguda - Empar Moliner .epub",
    "Habitaciones separadas - Luis García Montero.epub",
    "Habitación 501. Your secret is mine - Carla Marpe.epub",
    "Hábitos atómicos - James Clear.epub",
    "La historia secreta del señor White - Juan Gómez-Jurado.epub",
    "La invasión - Jack London.epub",
    "La invasión de las Tinieblas - Glenn Cooper.epub",
    "La mirada quieta (de Pérez Galdós) - Mario Vargas Llosa.epub",
    "La muerte contada por un sapiens a un neandertal - Juan José Millás.epub",
    "La mujer justa - Sándor Márai.epub",
    "La noche de las panteras - Juan González Mesa.epub",
    "La noche de los niños - Toni Morrison.epub",
    "La oración de la rana - Anthony de Mello.epub",
    "La oración del tomate - Elisa Mayo.epub",
    "Platos típicos de Asturias - Maria Luisa García.epub",
    "Sesenta semanas en el trópico - Antonio Escohotado.epub",
    "Sueños en la casa de té - Justin Hill.epub"
  ];

  console.log('🔍 Iniciando subida de libros con caracteres especiales...');
  console.log(`📚 Total a procesar: ${problematicBooks.length} libros`);
  
  let successful = 0;
  let failed = 0;
  
  // Procesar uno por uno
  for (const book of problematicBooks) {
    const result = await uploadSingleBook(book);
    if (result) {
      successful++;
    } else {
      failed++;
    }
    
    // Pequeña pausa entre uploads
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  console.log('\n' + '='.repeat(50));
  console.log('📊 RESUMEN');
  console.log('='.repeat(50));
  console.log(`✅ Exitosos: ${successful}`);
  console.log(`❌ Fallidos: ${failed}`);
  console.log(`📊 Total: ${problematicBooks.length}`);
  
  if (failed > 0) {
    console.log('\n⚠️  Algunos libros no pudieron subirse.');
    console.log('Esto puede deberse a caracteres especiales en los nombres.');
    console.log('Considera renombrarlos manualmente en Firebase Storage primero.');
  }
}

// Ejecutar
main().catch(console.error);