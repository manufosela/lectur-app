#!/usr/bin/env node

import admin from 'firebase-admin';
import AWS from 'aws-sdk';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Script para migrar los 19 libros problemáticos con caracteres especiales
 * Los renombra a versiones seguras para S3 y actualiza Firebase Database
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
      storageBucket: process.env.PUBLIC_FIREBASE_STORAGE_BUCKET,
      databaseURL: process.env.FIREBASE_DATABASE_URL
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
  
  return new AWS.S3();
}

// Función para limpiar nombres de archivo para S3
function sanitizeFileName(fileName) {
  // Primero normalizar Unicode (descomponer caracteres acentuados)
  const normalized = fileName.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  
  // Luego reemplazar caracteres problemáticos restantes
  let sanitized = normalized
    .replace(/ñ/g, 'n')
    .replace(/Ñ/g, 'N')
    .replace(/[()]/g, '') // Eliminar paréntesis
    .replace(/\s+/g, '_') // Espacios por guiones bajos
    .replace(/[^\w\-_.]/g, '') // Eliminar otros caracteres especiales
    .replace(/__+/g, '_') // Reemplazar múltiples guiones bajos por uno solo
    .replace(/^_+|_+$/g, ''); // Eliminar guiones bajos al inicio y final
  
  return sanitized;
}

async function migrateProblematicBooks() {
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

  console.log('🔍 Iniciando migración de libros problemáticos...');
  console.log(`📚 Total a procesar: ${problematicBooks.length} libros\n`);

  const app = initializeFirebaseAdmin();
  const bucket = admin.storage().bucket();
  const s3 = initializeS3();
  const database = admin.database();

  let successful = 0;
  let failed = 0;
  const bookMapping = {}; // Para guardar el mapeo de nombres

  for (const originalName of problematicBooks) {
    console.log(`\n📖 Procesando: ${originalName}`);
    
    try {
      // 1. Descargar de Firebase Storage
      const firebasePath = `__books__/${originalName}`;
      const file = bucket.file(firebasePath);
      
      console.log('⬇️  Descargando de Firebase Storage...');
      const [exists] = await file.exists();
      
      if (!exists) {
        console.log(`⚠️  No encontrado en Firebase: ${firebasePath}`);
        failed++;
        continue;
      }
      
      const [fileBuffer] = await file.download();
      console.log(`✅ Descargado: ${(fileBuffer.length / 1024 / 1024).toFixed(2)} MB`);
      
      // 2. Crear nombre seguro para S3
      const safeName = sanitizeFileName(originalName);
      console.log(`🔄 Nombre seguro: ${safeName}`);
      bookMapping[originalName] = safeName;
      
      // 3. Subir a S3 con nombre seguro
      console.log('☁️  Subiendo a S3...');
      const uploadParams = {
        Bucket: process.env.S3_BUCKET_NAME,
        Key: safeName,
        Body: fileBuffer,
        ContentType: 'application/epub+zip',
        ServerSideEncryption: 'AES256',
        Metadata: {
          'original-name': originalName,
          'migration-date': new Date().toISOString(),
          'migrated-from': 'firebase-storage'
        }
      };
      
      await s3.upload(uploadParams).promise();
      console.log(`✅ Subido a S3: ${safeName}`);
      
      // 4. Actualizar Firebase Database con el nuevo nombre
      console.log('🔥 Actualizando Firebase Database...');
      
      // Obtener lista actual de libros
      const librosRef = database.ref('/libros');
      const snapshot = await librosRef.once('value');
      const libros = snapshot.val() || [];
      
      // Buscar y reemplazar el nombre
      const index = libros.indexOf(originalName);
      if (index !== -1) {
        libros[index] = safeName;
        await librosRef.set(libros);
        console.log('✅ Actualizado en Firebase Database');
      } else {
        console.log('⚠️  No encontrado en Firebase Database - añadiendo...');
        libros.push(safeName);
        await librosRef.set(libros);
      }
      
      successful++;
      
    } catch (error) {
      console.error(`❌ Error: ${error.message}`);
      failed++;
    }
  }

  // Guardar mapeo de nombres
  console.log('\n💾 Guardando mapeo de nombres...');
  fs.writeFileSync(
    'book-name-mapping.json',
    JSON.stringify(bookMapping, null, 2)
  );

  console.log('\n' + '='.repeat(50));
  console.log('📊 RESUMEN DE MIGRACIÓN');
  console.log('='.repeat(50));
  console.log(`✅ Exitosos: ${successful}`);
  console.log(`❌ Fallidos: ${failed}`);
  console.log(`📊 Total procesados: ${successful + failed}`);
  console.log('\n📝 Mapeo de nombres guardado en: book-name-mapping.json');
  
  if (successful > 0) {
    console.log('\n⚠️  IMPORTANTE: Los nombres de archivo han sido modificados.');
    console.log('Los caracteres especiales fueron reemplazados para compatibilidad con S3.');
    console.log('El mapeo original->nuevo está en book-name-mapping.json');
  }
}

// Ejecutar
migrateProblematicBooks().catch(console.error);