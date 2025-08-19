#!/usr/bin/env node

import admin from 'firebase-admin';
import { initializeS3 } from './s3-manager.js';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Script para migrar libros de Firebase Storage a AWS S3
 * 1. Lista todos los archivos en Firebase Storage (__books__/)
 * 2. Descarga cada archivo temporalmente
 * 3. Sube el archivo a S3
 * 4. Elimina el archivo temporal
 */

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

/**
 * Listar todos los archivos en Firebase Storage
 */
async function listFirebaseStorageFiles() {
  try {
    const app = initializeFirebaseAdmin();
    const bucket = admin.storage().bucket();
    
    console.log('📋 Listando archivos en Firebase Storage...');
    
    const [files] = await bucket.getFiles({
      prefix: '__books__/'
    });
    
    const bookFiles = files.filter(file => 
      file.name.endsWith('.epub') || file.name.endsWith('.pdf')
    );
    
    console.log(`📚 Encontrados ${bookFiles.length} archivos en Firebase Storage`);
    
    return bookFiles.map(file => ({
      name: file.name,
      filename: path.basename(file.name),
      size: file.metadata.size,
      contentType: file.metadata.contentType
    }));
    
  } catch (error) {
    console.error('❌ Error listando archivos Firebase:', error.message);
    return [];
  }
}

/**
 * Descargar archivo de Firebase Storage
 */
async function downloadFromFirebase(firebaseFile, tempDir) {
  try {
    const bucket = admin.storage().bucket();
    const file = bucket.file(firebaseFile.name);
    
    const tempFilePath = path.join(tempDir, firebaseFile.filename);
    
    console.log(`⬇️  Descargando: ${firebaseFile.filename}`);
    console.log(`   📊 Tamaño: ${(firebaseFile.size / 1024 / 1024).toFixed(2)} MB`);
    
    // Crear stream de descarga
    const downloadStream = file.createReadStream();
    const writeStream = fs.createWriteStream(tempFilePath);
    
    return new Promise((resolve, reject) => {
      downloadStream.pipe(writeStream)
        .on('error', reject)
        .on('finish', () => {
          console.log(`   ✅ Descargado: ${tempFilePath}`);
          resolve(tempFilePath);
        });
    });
    
  } catch (error) {
    console.error(`❌ Error descargando ${firebaseFile.filename}:`, error.message);
    throw error;
  }
}

/**
 * Subir archivo a S3
 */
async function uploadToS3(filePath, originalFirebaseFile) {
  try {
    const s3 = initializeS3();
    const bucketName = process.env.S3_BUCKET_NAME;
    const filename = path.basename(filePath);
    
    console.log(`☁️  Subiendo a S3: ${filename}`);
    
    // Verificar si ya existe en S3
    try {
      await s3.headObject({
        Bucket: bucketName,
        Key: filename
      }).promise();
      
      console.log(`   ⚠️  Archivo ya existe en S3: ${filename}`);
      return true;
    } catch (error) {
      if (error.code !== 'NotFound') {
        throw error;
      }
    }
    
    // Leer archivo
    const fileContent = fs.readFileSync(filePath);
    const fileStats = fs.statSync(filePath);
    
    // Parámetros de subida
    const uploadParams = {
      Bucket: bucketName,
      Key: filename,
      Body: fileContent,
      ContentType: originalFirebaseFile.contentType || 'application/epub+zip',
      Metadata: {
        'migrated-from': 'firebase-storage',
        'original-path': originalFirebaseFile.name,
        'migration-date': new Date().toISOString(),
        'original-size': originalFirebaseFile.size.toString()
      },
      ServerSideEncryption: 'AES256',
      StorageClass: 'STANDARD_IA'
    };
    
    await s3.upload(uploadParams).promise();
    
    console.log(`   ✅ Subido a S3: ${filename}`);
    console.log(`   📊 Tamaño: ${(fileStats.size / 1024 / 1024).toFixed(2)} MB`);
    
    return true;
    
  } catch (error) {
    console.error(`❌ Error subiendo ${path.basename(filePath)} a S3:`, error.message);
    return false;
  }
}

/**
 * Migrar todos los libros
 */
async function migrateAllBooks() {
  console.log('🚀 INICIANDO MIGRACIÓN FIREBASE STORAGE → AWS S3');
  console.log('==================================================\n');
  
  // Crear directorio temporal
  const tempDir = path.join(process.cwd(), 'temp-migration');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
    console.log(`📁 Directorio temporal creado: ${tempDir}`);
  }
  
  try {
    // Listar archivos en Firebase Storage
    const firebaseFiles = await listFirebaseStorageFiles();
    
    if (firebaseFiles.length === 0) {
      console.log('📭 No hay archivos para migrar');
      return;
    }
    
    const stats = {
      total: firebaseFiles.length,
      successful: 0,
      failed: 0,
      totalSize: 0
    };
    
    console.log(`\n📦 Iniciando migración de ${stats.total} archivos...\n`);
    
    // Procesar cada archivo
    for (let i = 0; i < firebaseFiles.length; i++) {
      const firebaseFile = firebaseFiles[i];
      const progress = `[${i + 1}/${stats.total}]`;
      
      console.log(`${progress} Procesando: ${firebaseFile.filename}`);
      
      try {
        // 1. Descargar de Firebase
        const tempFilePath = await downloadFromFirebase(firebaseFile, tempDir);
        
        // 2. Subir a S3
        const uploadSuccess = await uploadToS3(tempFilePath, firebaseFile);
        
        // 3. Limpiar archivo temporal
        fs.unlinkSync(tempFilePath);
        console.log(`   🗑️  Archivo temporal eliminado`);
        
        if (uploadSuccess) {
          stats.successful++;
          stats.totalSize += parseInt(firebaseFile.size);
        } else {
          stats.failed++;
        }
        
      } catch (error) {
        console.error(`${progress} ❌ Error procesando ${firebaseFile.filename}:`, error.message);
        stats.failed++;
      }
      
      console.log(`   📊 Progreso: ${stats.successful + stats.failed}/${stats.total}\n`);
    }
    
    // Limpiar directorio temporal
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
      console.log('🗑️  Directorio temporal eliminado');
    }
    
    // Resumen final
    console.log('🎉 MIGRACIÓN COMPLETADA');
    console.log('========================');
    console.log(`✅ Exitosos: ${stats.successful}`);
    console.log(`❌ Fallidos: ${stats.failed}`);
    console.log(`📊 Total: ${stats.total}`);
    console.log(`💾 Tamaño migrado: ${(stats.totalSize / 1024 / 1024).toFixed(2)} MB`);
    console.log(`💰 Coste S3 estimado: $${(stats.totalSize / 1024 / 1024 / 1024 * 0.023).toFixed(4)}/mes`);
    
  } catch (error) {
    console.error('❌ Error durante la migración:', error.message);
  }
}

/**
 * Verificar configuración
 */
function checkConfiguration() {
  const requiredVars = [
    'FIREBASE_PROJECT_ID',
    'FIREBASE_PRIVATE_KEY_ID', 
    'FIREBASE_PRIVATE_KEY',
    'FIREBASE_CLIENT_EMAIL',
    'FIREBASE_CLIENT_ID',
    'PUBLIC_FIREBASE_STORAGE_BUCKET',
    'AWS_ACCESS_KEY_ID',
    'AWS_SECRET_ACCESS_KEY',
    'S3_BUCKET_NAME'
  ];
  
  const missing = requiredVars.filter(varName => !process.env[varName]);
  
  if (missing.length > 0) {
    console.error('❌ Faltan variables de entorno:');
    missing.forEach(varName => console.error(`   - ${varName}`));
    console.error('\nAgrega estas variables al archivo .env');
    process.exit(1);
  }
  
  console.log('✅ Configuración verificada');
}

// Ejecutar migración
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('🔍 Verificando configuración...');
  checkConfiguration();
  
  console.log('\n⚠️  ATENCIÓN: Este script migrará TODOS los libros de Firebase Storage a S3');
  console.log('¿Estás seguro de continuar? (Ctrl+C para cancelar)\n');
  
  // Esperar 5 segundos antes de continuar
  setTimeout(() => {
    migrateAllBooks().catch(error => {
      console.error('💥 Error fatal:', error.message);
      process.exit(1);
    });
  }, 5000);
}

export { migrateAllBooks };