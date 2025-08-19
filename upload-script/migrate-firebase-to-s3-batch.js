#!/usr/bin/env node

import admin from 'firebase-admin';
import { initializeS3 } from './s3-manager.js';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Script para migrar libros de Firebase Storage a AWS S3 POR LOTES
 * Permite migrar gradualmente para controlar costes de tráfico
 */

let firebaseApp = null;
const MIGRATION_STATE_FILE = './migration-state.json';

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
 * Guardar estado de migración
 */
function saveMigrationState(state) {
  fs.writeFileSync(MIGRATION_STATE_FILE, JSON.stringify(state, null, 2));
}

/**
 * Cargar estado de migración
 */
function loadMigrationState() {
  if (!fs.existsSync(MIGRATION_STATE_FILE)) {
    return {
      totalFiles: 0,
      processedFiles: [],
      lastProcessedIndex: -1,
      batchesCompleted: 0,
      totalSize: 0,
      successful: 0,
      failed: 0,
      lastRunDate: null
    };
  }
  
  try {
    return JSON.parse(fs.readFileSync(MIGRATION_STATE_FILE, 'utf8'));
  } catch (error) {
    console.warn('⚠️  Error cargando estado, empezando desde cero');
    return loadMigrationState();
  }
}

/**
 * Listar archivos paginados de Firebase Storage
 */
async function listFirebaseStorageFilesPaginated(pageToken = null, maxResults = 1000) {
  try {
    const app = initializeFirebaseAdmin();
    const bucket = admin.storage().bucket();
    
    const options = {
      prefix: '__books__/',
      maxResults,
      autoPaginate: false
    };
    
    if (pageToken) {
      options.pageToken = pageToken;
    }
    
    const [files, query, apiResponse] = await bucket.getFiles(options);
    
    const bookFiles = files.filter(file => 
      file.name.endsWith('.epub') || file.name.endsWith('.pdf')
    );
    
    return {
      files: bookFiles.map(file => ({
        name: file.name,
        filename: path.basename(file.name),
        size: parseInt(file.metadata.size) || 0,
        contentType: file.metadata.contentType
      })),
      nextPageToken: query.pageToken || null,
      hasMore: !!query.pageToken
    };
    
  } catch (error) {
    console.error('❌ Error listando archivos Firebase:', error.message);
    return { files: [], nextPageToken: null, hasMore: false };
  }
}

/**
 * Obtener lote de archivos para migrar
 */
async function getFilesToMigrate(batchSize, state) {
  console.log('📋 Obteniendo lista de archivos...');
  
  let allFiles = [];
  let pageToken = null;
  let hasMore = true;
  
  // Cargar archivos en páginas
  while (hasMore && allFiles.length < (state.lastProcessedIndex + batchSize + 1000)) {
    const { files, nextPageToken, hasMore: more } = await listFirebaseStorageFilesPaginated(pageToken, 1000);
    allFiles = allFiles.concat(files);
    pageToken = nextPageToken;
    hasMore = more;
    
    console.log(`   📄 Cargados ${allFiles.length} archivos...`);
  }
  
  // Si es la primera vez, guardar total
  if (state.totalFiles === 0) {
    // Contar todos los archivos (solo una vez)
    let totalCount = allFiles.length;
    while (hasMore) {
      const { files, nextPageToken, hasMore: more } = await listFirebaseStorageFilesPaginated(pageToken, 1000);
      totalCount += files.length;
      pageToken = nextPageToken;
      hasMore = more;
    }
    state.totalFiles = totalCount;
    saveMigrationState(state);
    console.log(`📊 Total de archivos encontrados: ${totalCount}`);
  }
  
  // Retornar solo el lote requerido
  const startIndex = state.lastProcessedIndex + 1;
  const endIndex = startIndex + batchSize;
  
  return allFiles.slice(startIndex, endIndex);
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
    
    const downloadStream = file.createReadStream();
    const writeStream = fs.createWriteStream(tempFilePath);
    
    return new Promise((resolve, reject) => {
      downloadStream.pipe(writeStream)
        .on('error', reject)
        .on('finish', () => {
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
    
    const fileContent = fs.readFileSync(filePath);
    
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
    
    return true;
    
  } catch (error) {
    console.error(`❌ Error subiendo ${path.basename(filePath)} a S3:`, error.message);
    return false;
  }
}

/**
 * Migrar un lote de libros
 */
async function migrateBatch(batchSize = 50) {
  console.log(`🚀 MIGRACIÓN POR LOTES - Tamaño del lote: ${batchSize}`);
  console.log('='.repeat(60));
  
  // Cargar estado
  const state = loadMigrationState();
  
  // Crear directorio temporal
  const tempDir = path.join(process.cwd(), 'temp-migration');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }
  
  try {
    // Obtener archivos para este lote
    const filesToMigrate = await getFilesToMigrate(batchSize, state);
    
    if (filesToMigrate.length === 0) {
      console.log('🎉 ¡Migración completada! No hay más archivos para procesar.');
      return;
    }
    
    console.log(`\n📦 Procesando lote ${state.batchesCompleted + 1}`);
    console.log(`📄 Archivos en este lote: ${filesToMigrate.length}`);
    console.log(`📊 Progreso global: ${state.lastProcessedIndex + 1}/${state.totalFiles || '?'}\n`);
    
    // Calcular coste estimado de este lote
    const batchSizeBytes = filesToMigrate.reduce((sum, file) => sum + file.size, 0);
    const batchSizeMB = batchSizeBytes / 1024 / 1024;
    const estimatedCost = (batchSizeMB / 1024) * 0.12; // $0.12 per GB
    
    console.log(`💰 Coste estimado de este lote: $${estimatedCost.toFixed(4)} (${batchSizeMB.toFixed(2)} MB)\n`);
    
    let batchSuccessful = 0;
    let batchFailed = 0;
    let batchSize_bytes = 0;
    
    // Procesar cada archivo del lote
    for (let i = 0; i < filesToMigrate.length; i++) {
      const firebaseFile = filesToMigrate[i];
      const globalIndex = state.lastProcessedIndex + i + 1;
      
      console.log(`[${globalIndex}/${state.totalFiles || '?'}] Procesando: ${firebaseFile.filename}`);
      
      try {
        // 1. Descargar de Firebase
        const tempFilePath = await downloadFromFirebase(firebaseFile, tempDir);
        
        // 2. Subir a S3
        const uploadSuccess = await uploadToS3(tempFilePath, firebaseFile);
        
        // 3. Limpiar archivo temporal
        fs.unlinkSync(tempFilePath);
        
        if (uploadSuccess) {
          batchSuccessful++;
          batchSize_bytes += firebaseFile.size;
          state.processedFiles.push(firebaseFile.filename);
        } else {
          batchFailed++;
        }
        
        // Actualizar índice procesado
        state.lastProcessedIndex = globalIndex;
        
      } catch (error) {
        console.error(`❌ Error procesando ${firebaseFile.filename}:`, error.message);
        batchFailed++;
        state.lastProcessedIndex = globalIndex;
      }
      
      console.log(''); // Línea en blanco
    }
    
    // Actualizar estadísticas globales
    state.successful += batchSuccessful;
    state.failed += batchFailed;
    state.totalSize += batchSize_bytes;
    state.batchesCompleted++;
    state.lastRunDate = new Date().toISOString();
    
    // Guardar estado
    saveMigrationState(state);
    
    // Resumen del lote
    console.log('📊 RESUMEN DEL LOTE');
    console.log('===================');
    console.log(`✅ Exitosos: ${batchSuccessful}`);
    console.log(`❌ Fallidos: ${batchFailed}`);
    console.log(`💾 Tamaño migrado: ${(batchSize_bytes / 1024 / 1024).toFixed(2)} MB`);
    console.log(`💰 Coste real: $${((batchSize_bytes / 1024 / 1024 / 1024) * 0.12).toFixed(4)}`);
    
    console.log('\n📈 PROGRESO GLOBAL');
    console.log('===================');
    console.log(`📦 Lotes completados: ${state.batchesCompleted}`);
    console.log(`📄 Archivos procesados: ${state.lastProcessedIndex + 1}/${state.totalFiles || '?'}`);
    console.log(`✅ Total exitosos: ${state.successful}`);
    console.log(`❌ Total fallidos: ${state.failed}`);
    console.log(`💾 Tamaño total migrado: ${(state.totalSize / 1024 / 1024).toFixed(2)} MB`);
    console.log(`💰 Coste total acumulado: $${((state.totalSize / 1024 / 1024 / 1024) * 0.12).toFixed(4)}`);
    
    const remainingFiles = (state.totalFiles || 0) - (state.lastProcessedIndex + 1);
    if (remainingFiles > 0) {
      console.log(`\n📋 Archivos restantes: ${remainingFiles}`);
      console.log(`🔄 Para continuar: npm run migrate-batch`);
    }
    
  } catch (error) {
    console.error('❌ Error durante la migración por lotes:', error.message);
  } finally {
    // Limpiar directorio temporal
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }
}

/**
 * Mostrar estado actual
 */
function showMigrationStatus() {
  const state = loadMigrationState();
  
  console.log('📊 ESTADO DE LA MIGRACIÓN');
  console.log('==========================');
  
  if (state.totalFiles === 0) {
    console.log('❌ Aún no se ha iniciado la migración');
    return;
  }
  
  console.log(`📄 Total archivos: ${state.totalFiles}`);
  console.log(`📦 Lotes completados: ${state.batchesCompleted}`);
  console.log(`📄 Archivos procesados: ${state.lastProcessedIndex + 1}/${state.totalFiles}`);
  console.log(`✅ Exitosos: ${state.successful}`);
  console.log(`❌ Fallidos: ${state.failed}`);
  console.log(`💾 Tamaño migrado: ${(state.totalSize / 1024 / 1024).toFixed(2)} MB`);
  console.log(`💰 Coste acumulado: $${((state.totalSize / 1024 / 1024 / 1024) * 0.12).toFixed(4)}`);
  
  const progress = ((state.lastProcessedIndex + 1) / state.totalFiles) * 100;
  console.log(`📈 Progreso: ${progress.toFixed(2)}%`);
  
  if (state.lastRunDate) {
    console.log(`⏰ Última ejecución: ${new Date(state.lastRunDate).toLocaleString()}`);
  }
  
  const remainingFiles = state.totalFiles - (state.lastProcessedIndex + 1);
  if (remainingFiles > 0) {
    console.log(`\n📋 Archivos restantes: ${remainingFiles}`);
    console.log(`🔄 Para continuar: npm run migrate-batch`);
  } else {
    console.log('\n🎉 ¡Migración completada!');
  }
}

// Verificar configuración
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
}

// Ejecutar según argumentos
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  
  if (args.includes('--status')) {
    showMigrationStatus();
  } else if (args.includes('--reset')) {
    if (fs.existsSync(MIGRATION_STATE_FILE)) {
      fs.unlinkSync(MIGRATION_STATE_FILE);
      console.log('🗑️  Estado de migración reiniciado');
    }
  } else {
    const batchSize = parseInt(args.find(arg => arg.startsWith('--batch='))?.split('=')[1]) || 50;
    
    console.log('🔍 Verificando configuración...');
    checkConfiguration();
    console.log('✅ Configuración verificada\n');
    
    migrateBatch(batchSize).catch(error => {
      console.error('💥 Error fatal:', error.message);
      process.exit(1);
    });
  }
}

export { migrateBatch, showMigrationStatus };