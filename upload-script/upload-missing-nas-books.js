#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { initializeFirebaseAdmin } from './firebase-manager.js';
import { initializeS3, listS3Files } from './s3-manager.js';
import { extractEpubMetadata } from './epub-parser.js';
import AWS from 'aws-sdk';

dotenv.config();

/**
 * Enhanced script to upload missing books from NAS to AWS S3 and Firebase
 * 
 * Features:
 * - Scans NAS directory for EPUB files NOT in S3 yet
 * - Cost-optimized: checks S3 first before uploading
 * - Uploads missing EPUBs to AWS S3 bucket
 * - Adds uploaded books to Firebase Realtime Database
 * - Handles errors gracefully with progress reporting
 * - Uses batch operations for database updates
 * - Resumable operations with state tracking
 */

// Configuration
const NAS_FOLDER = process.env.NAS_BOOKS_FOLDER || '/home/manu/servidorix/LIBROS';
const STATE_FILE = './upload-missing-state.json';
const BATCH_SIZE = 10; // Files to process in parallel
const DB_BATCH_SIZE = 20; // Database batch update size

// Global state
let state = {
  totalNasFiles: 0,
  s3Files: new Set(),
  firebaseFiles: new Set(),
  missingFiles: [],
  processed: 0,
  uploaded: 0,
  errors: 0,
  skipped: 0,
  startTime: null,
  lastProcessedFile: null,
  uploadedFiles: [],
  failedFiles: []
};

/**
 * Load previous state if exists
 */
function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const savedState = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
      state = { 
        ...state, 
        ...savedState,
        s3Files: new Set(savedState.s3Files || []),
        firebaseFiles: new Set(savedState.firebaseFiles || [])
      };
      console.log(`📊 Estado previo cargado: ${state.processed} archivos procesados`);
    }
  } catch (error) {
    console.log('⚠️  No se pudo cargar estado previo, empezando desde cero');
  }
}

/**
 * Save current state
 */
function saveState() {
  try {
    const stateToSave = {
      ...state,
      s3Files: Array.from(state.s3Files),
      firebaseFiles: Array.from(state.firebaseFiles)
    };
    fs.writeFileSync(STATE_FILE, JSON.stringify(stateToSave, null, 2));
  } catch (error) {
    console.error('❌ Error guardando estado:', error.message);
  }
}

/**
 * Scan NAS directory recursively for EPUB files
 */
function scanNasDirectory(dir = NAS_FOLDER) {
  const files = [];
  
  function walkDirectory(currentDir) {
    try {
      const items = fs.readdirSync(currentDir);
      
      for (const item of items) {
        const fullPath = path.join(currentDir, item);
        
        try {
          const stat = fs.statSync(fullPath);
          
          if (stat.isDirectory()) {
            walkDirectory(fullPath);
          } else if (item.toLowerCase().endsWith('.epub')) {
            files.push({
              name: item,
              fullPath: fullPath,
              size: stat.size,
              relativePath: path.relative(NAS_FOLDER, fullPath)
            });
          }
        } catch (error) {
          console.warn(`⚠️  Error accediendo a ${fullPath}: ${error.message}`);
        }
      }
    } catch (error) {
      console.error(`❌ Error leyendo directorio ${currentDir}: ${error.message}`);
    }
  }
  
  walkDirectory(dir);
  return files;
}

/**
 * Get existing files from S3 (cost-optimized check)
 */
async function getS3Files() {
  try {
    console.log('☁️  Obteniendo lista de archivos en S3...');
    const s3Files = await listS3Files();
    const fileNames = new Set(s3Files.map(file => file.key));
    console.log(`📊 Archivos en S3: ${fileNames.size}`);
    return fileNames;
  } catch (error) {
    console.error('❌ Error obteniendo archivos S3:', error.message);
    return new Set();
  }
}

/**
 * Get existing files from Firebase Database
 */
async function getFirebaseFiles() {
  try {
    console.log('🔥 Obteniendo lista de libros en Firebase...');
    const firebaseAdmin = initializeFirebaseAdmin();
    const database = firebaseAdmin.database();
    
    const snapshot = await database.ref('/libros').once('value');
    const existingBooks = snapshot.exists() ? snapshot.val() : [];
    const fileNames = new Set(existingBooks);
    
    console.log(`📊 Libros en Firebase: ${fileNames.size}`);
    return fileNames;
  } catch (error) {
    console.error('❌ Error obteniendo libros Firebase:', error.message);
    return new Set();
  }
}

/**
 * Find missing files that need to be uploaded
 */
function findMissingFiles(nasFiles, s3Files, firebaseFiles) {
  console.log('🔍 Identificando archivos faltantes...');
  
  const missingInS3 = nasFiles.filter(file => !s3Files.has(file.name));
  const missingInFirebase = nasFiles.filter(file => !firebaseFiles.has(file.name));
  
  // Files missing in either S3 or Firebase (or both)
  const missingFiles = nasFiles.filter(file => 
    !s3Files.has(file.name) || !firebaseFiles.has(file.name)
  );
  
  console.log(`📊 Análisis de archivos faltantes:`);
  console.log(`   📁 Total en NAS: ${nasFiles.length}`);
  console.log(`   ☁️  Faltantes en S3: ${missingInS3.length}`);
  console.log(`   🔥 Faltantes en Firebase: ${missingInFirebase.length}`);
  console.log(`   📦 Total a procesar: ${missingFiles.length}`);
  
  return missingFiles;
}

/**
 * Upload a single file to S3
 */
async function uploadFileToS3(file) {
  try {
    const s3 = initializeS3();
    const bucketName = process.env.S3_BUCKET_NAME;
    
    console.log(`⬆️  Subiendo: ${file.name}`);
    console.log(`   📊 Tamaño: ${(file.size / 1024 / 1024).toFixed(2)} MB`);
    
    // Check if already exists in S3 (double-check)
    try {
      await s3.headObject({
        Bucket: bucketName,
        Key: file.name
      }).promise();
      
      console.log(`   ⏭️  Ya existe en S3: ${file.name}`);
      return { success: true, skipped: true };
    } catch (error) {
      if (error.code !== 'NotFound') {
        throw error;
      }
    }
    
    // Extract metadata first
    const metadata = await extractEpubMetadata(file.fullPath);
    
    // Read file content
    const fileContent = fs.readFileSync(file.fullPath);
    
    // Upload parameters
    const uploadParams = {
      Bucket: bucketName,
      Key: file.name,
      Body: fileContent,
      ContentType: 'application/epub+zip',
      Metadata: {
        'title': metadata.title || 'Título desconocido',
        'author': metadata.author || 'Autor desconocido',
        'uploaded-from': 'nas',
        'upload-date': new Date().toISOString(),
        'original-path': file.relativePath
      },
      ServerSideEncryption: 'AES256',
      StorageClass: 'STANDARD_IA' // Cost-optimized storage class
    };
    
    // Upload to S3
    await s3.upload(uploadParams).promise();
    
    console.log(`   ✅ Subido exitosamente a S3`);
    
    return { 
      success: true, 
      skipped: false, 
      metadata: metadata
    };
    
  } catch (error) {
    console.error(`   ❌ Error subiendo ${file.name}: ${error.message}`);
    return { 
      success: false, 
      error: error.message,
      filename: file.name
    };
  }
}

/**
 * Process files in batches
 */
async function processFilesBatch(files) {
  console.log(`📦 Procesando lote de ${files.length} archivos...`);
  
  const results = [];
  
  // Process files in parallel within batch
  const promises = files.map(async (file) => {
    const result = await uploadFileToS3(file);
    state.processed++;
    
    if (result.success) {
      if (result.skipped) {
        state.skipped++;
      } else {
        state.uploaded++;
        state.uploadedFiles.push({
          filename: file.name,
          metadata: result.metadata
        });
      }
    } else {
      state.errors++;
      state.failedFiles.push({
        filename: result.filename,
        error: result.error
      });
    }
    
    state.lastProcessedFile = file.name;
    return result;
  });
  
  const batchResults = await Promise.allSettled(promises);
  
  // Save state after each batch
  saveState();
  
  console.log(`📊 Lote completado: ${state.processed}/${state.totalNasFiles}`);
  console.log(`   ✅ Subidos: ${state.uploaded} | ⏭️  Saltados: ${state.skipped} | ❌ Errores: ${state.errors}`);
  
  return batchResults;
}

/**
 * Update Firebase Database with uploaded books
 */
async function updateFirebaseDatabase() {
  if (state.uploadedFiles.length === 0) {
    console.log('📊 No hay nuevos archivos para actualizar en Firebase');
    return;
  }
  
  try {
    console.log(`🔥 Actualizando Firebase Database con ${state.uploadedFiles.length} libros...`);
    
    const firebaseAdmin = initializeFirebaseAdmin();
    const database = firebaseAdmin.database();
    
    // Get current data
    const [librosSnapshot, autoresSnapshot, librosPorAutorSnapshot] = await Promise.all([
      database.ref('/libros').once('value'),
      database.ref('/autores').once('value'),
      database.ref('/librosPorAutor').once('value')
    ]);
    
    const libros = librosSnapshot.exists() ? librosSnapshot.val() : [];
    const autores = autoresSnapshot.exists() ? new Set(autoresSnapshot.val()) : new Set();
    const librosPorAutor = librosPorAutorSnapshot.exists() ? librosPorAutorSnapshot.val() : {};
    
    // Update data with new books
    const newLibros = [...libros];
    const newAutores = new Set(autores);
    const newLibrosPorAutor = { ...librosPorAutor };
    
    for (const uploadedFile of state.uploadedFiles) {
      const { filename, metadata } = uploadedFile;
      
      // Add book to list if not already there
      if (!newLibros.includes(filename)) {
        newLibros.push(filename);
      }
      
      // Add author if not exists
      if (metadata.author && metadata.author !== 'Autor desconocido') {
        newAutores.add(metadata.author);
        
        // Link book to author
        const authorKey = metadata.author.replace(/[.#$[\]]/g, '_');
        if (!newLibrosPorAutor[authorKey]) {
          newLibrosPorAutor[authorKey] = {};
        }
        
        const bookKey = `libro_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        newLibrosPorAutor[authorKey][bookKey] = filename;
      }
    }
    
    // Batch update Firebase
    const updates = {
      '/libros': newLibros,
      '/autores': Array.from(newAutores),
      '/librosPorAutor': newLibrosPorAutor
    };
    
    await database.ref().update(updates);
    
    console.log('✅ Firebase Database actualizado exitosamente');
    console.log(`   📚 Total libros: ${newLibros.length}`);
    console.log(`   👥 Total autores: ${newAutores.size}`);
    
  } catch (error) {
    console.error('❌ Error actualizando Firebase Database:', error.message);
  }
}

/**
 * Generate final report
 */
function generateReport() {
  const endTime = new Date().toISOString();
  const duration = state.startTime ? 
    Math.round((new Date(endTime) - new Date(state.startTime)) / 1000) : 0;
  
  console.log('\n🎉 PROCESO COMPLETADO');
  console.log('='.repeat(50));
  console.log(`📊 Estadísticas finales:`);
  console.log(`   📁 Archivos escaneados: ${state.totalNasFiles}`);
  console.log(`   📦 Archivos faltantes: ${state.missingFiles.length}`);
  console.log(`   ✅ Subidos exitosamente: ${state.uploaded}`);
  console.log(`   ⏭️  Saltados (ya existían): ${state.skipped}`);
  console.log(`   ❌ Errores: ${state.errors}`);
  
  if (state.uploadedFiles.length > 0) {
    const totalSize = state.uploadedFiles.reduce((acc, file) => {
      // Estimate size (we don't store it in state, but we can estimate)
      return acc + 2; // Average 2MB per EPUB
    }, 0);
    const estimatedCost = (totalSize / 1024) * 0.023; // S3 Standard-IA pricing
    
    console.log(`   💾 Tamaño estimado subido: ${totalSize.toFixed(2)} MB`);
    console.log(`   💰 Coste estimado S3: $${estimatedCost.toFixed(4)}/mes`);
  }
  
  console.log(`   ⏰ Duración: ${duration} segundos`);
  console.log(`   🕐 Inicio: ${state.startTime}`);
  console.log(`   🕐 Fin: ${endTime}`);
  
  if (state.failedFiles.length > 0) {
    console.log(`\n❌ Archivos fallidos:`);
    state.failedFiles.slice(0, 10).forEach(failed => {
      console.log(`   - ${failed.filename}: ${failed.error}`);
    });
    if (state.failedFiles.length > 10) {
      console.log(`   ... y ${state.failedFiles.length - 10} más`);
    }
  }
  
  console.log(`\n📄 Estado guardado en: ${STATE_FILE}`);
}

/**
 * Check configuration
 */
function checkConfiguration() {
  const requiredVars = [
    'NAS_BOOKS_FOLDER',
    'FIREBASE_PROJECT_ID',
    'FIREBASE_PRIVATE_KEY',
    'FIREBASE_CLIENT_EMAIL',
    'FIREBASE_DATABASE_URL',
    'AWS_ACCESS_KEY_ID',
    'AWS_SECRET_ACCESS_KEY',
    'S3_BUCKET_NAME'
  ];
  
  const missing = requiredVars.filter(varName => !process.env[varName]);
  
  if (missing.length > 0) {
    console.error('❌ Faltan variables de entorno:');
    missing.forEach(varName => console.error(`   - ${varName}`));
    console.error('\nConfigura estas variables en tu archivo .env');
    process.exit(1);
  }
  
  if (!fs.existsSync(NAS_FOLDER)) {
    console.error(`❌ Directorio NAS no encontrado: ${NAS_FOLDER}`);
    console.error('Configura la variable NAS_BOOKS_FOLDER correctamente');
    process.exit(1);
  }
  
  console.log('✅ Configuración verificada');
}

/**
 * Main function
 */
async function main() {
  try {
    console.log('🚀 SUBIDA DE LIBROS FALTANTES DEL NAS');
    console.log('='.repeat(50));
    console.log(`📁 Origen: ${NAS_FOLDER}`);
    console.log(`☁️  Destino S3: ${process.env.S3_BUCKET_NAME}`);
    console.log(`🔥 Firebase: ${process.env.FIREBASE_PROJECT_ID}`);
    
    // Check configuration
    checkConfiguration();
    
    // Load previous state
    loadState();
    
    if (!state.startTime) {
      state.startTime = new Date().toISOString();
    }
    
    // Step 1: Scan NAS directory
    console.log('\n📡 Paso 1: Escaneando directorio NAS...');
    const nasFiles = scanNasDirectory();
    state.totalNasFiles = nasFiles.length;
    
    if (nasFiles.length === 0) {
      console.log('❌ No se encontraron archivos EPUB en el directorio NAS');
      return;
    }
    
    console.log(`📊 Archivos EPUB encontrados: ${nasFiles.length}`);
    
    // Step 2: Get existing files from S3 and Firebase
    console.log('\n📡 Paso 2: Verificando archivos existentes...');
    state.s3Files = await getS3Files();
    state.firebaseFiles = await getFirebaseFiles();
    
    // Step 3: Find missing files
    console.log('\n📡 Paso 3: Identificando archivos faltantes...');
    state.missingFiles = findMissingFiles(nasFiles, state.s3Files, state.firebaseFiles);
    
    if (state.missingFiles.length === 0) {
      console.log('✅ Todos los archivos ya están sincronizados');
      return;
    }
    
    // Show cost estimation
    const totalSize = state.missingFiles.reduce((acc, file) => acc + file.size, 0);
    const totalSizeMB = totalSize / 1024 / 1024;
    const estimatedCost = (totalSizeMB / 1024) * 0.023;
    
    console.log(`\n💰 Estimación de costes:`);
    console.log(`   📊 Tamaño total: ${totalSizeMB.toFixed(2)} MB`);
    console.log(`   💵 Coste estimado S3: $${estimatedCost.toFixed(4)}/mes`);
    
    // Confirm before proceeding
    const autoMode = process.argv.includes('--auto');
    if (!autoMode) {
      console.log('\n❓ ¿Continuar con la subida? (Ctrl+C para cancelar)');
      console.log('   O ejecuta con --auto para saltar esta confirmación');
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
    
    // Step 4: Process missing files in batches
    console.log('\n📡 Paso 4: Subiendo archivos faltantes...');
    
    for (let i = 0; i < state.missingFiles.length; i += BATCH_SIZE) {
      const batch = state.missingFiles.slice(i, i + BATCH_SIZE);
      const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(state.missingFiles.length / BATCH_SIZE);
      
      console.log(`\n📦 Lote ${batchNumber}/${totalBatches} (${batch.length} archivos)`);
      
      await processFilesBatch(batch);
      
      // Pause between batches
      if (i + BATCH_SIZE < state.missingFiles.length) {
        console.log('⏸️  Pausa entre lotes (3 segundos)...');
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }
    
    // Step 5: Update Firebase Database
    console.log('\n📡 Paso 5: Actualizando Firebase Database...');
    await updateFirebaseDatabase();
    
    // Step 6: Generate final report
    generateReport();
    
    // Clean up state file if successful
    if (state.errors === 0) {
      if (fs.existsSync(STATE_FILE)) {
        fs.unlinkSync(STATE_FILE);
        console.log('🗑️  Archivo de estado eliminado (proceso completado exitosamente)');
      }
    }
    
  } catch (error) {
    console.error('\n💥 Error fatal:', error.message);
    console.error('Stack trace:', error.stack);
    
    // Save state before exit
    saveState();
    process.exit(1);
  }
}

// Handle interruption signals
process.on('SIGINT', () => {
  console.log('\n⚠️  Interrupción recibida, guardando estado...');
  saveState();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n⚠️  Terminación recibida, guardando estado...');
  saveState();
  process.exit(0);
});

// Show help
if (process.argv.includes('--help')) {
  console.log(`
📚 SUBIDOR DE LIBROS FALTANTES DEL NAS

Este script escanea tu directorio NAS, identifica libros EPUB que faltan 
en S3 o Firebase, y los sube automáticamente.

Uso:
  node upload-missing-nas-books.js [opciones]

Opciones:
  --auto    Ejecutar sin confirmación
  --help    Mostrar esta ayuda

Variables de entorno requeridas:
  NAS_BOOKS_FOLDER         Ruta al directorio de libros en NAS
  S3_BUCKET_NAME          Nombre del bucket S3
  AWS_ACCESS_KEY_ID       Clave de acceso AWS
  AWS_SECRET_ACCESS_KEY   Clave secreta AWS
  FIREBASE_PROJECT_ID     ID del proyecto Firebase
  FIREBASE_PRIVATE_KEY    Clave privada Firebase
  FIREBASE_CLIENT_EMAIL   Email del cliente Firebase
  FIREBASE_DATABASE_URL   URL de la base de datos Firebase

Características:
  ✅ Escaneo recursivo del directorio NAS
  ✅ Verificación en S3 antes de subir (optimización de costes)
  ✅ Extracción automática de metadatos EPUB
  ✅ Subida por lotes para mejor rendimiento
  ✅ Actualización automática de Firebase Database
  ✅ Manejo de errores y reinicio automático
  ✅ Reporte detallado de progreso y costes

Ejemplo:
  NAS_BOOKS_FOLDER=/mnt/nas/libros node upload-missing-nas-books.js --auto
`);
  process.exit(0);
}

// Execute main function
main();