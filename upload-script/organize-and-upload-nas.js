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
 * Script para organizar libros del NAS y subir solo los faltantes
 * 
 * 1. Escanea NAS y verifica qué libros están en S3
 * 2. Mueve libros existentes en S3 a carpeta /S3
 * 3. Sube solo los libros que realmente faltan
 * 4. Mueve los recién subidos también a /S3
 * 5. Actualiza Firebase Database
 */

// Configuración
const NAS_FOLDER = process.env.NAS_BOOKS_FOLDER || '/home/manu/servidorix/LIBROS';
const S3_FOLDER = path.join(NAS_FOLDER, 'S3');
const STATE_FILE = './organize-upload-state.json';
const BATCH_SIZE = 5; // Archivos a procesar en paralelo

// Estado global
let state = {
  totalNasFiles: 0,
  s3Files: new Set(),
  alreadyInS3: 0,
  movedToS3Folder: 0,
  needsUpload: 0,
  uploaded: 0,
  errors: 0,
  startTime: null,
  processedFiles: [],
  failedFiles: []
};

/**
 * Crear carpeta S3 si no existe
 */
function ensureS3Folder() {
  if (!fs.existsSync(S3_FOLDER)) {
    fs.mkdirSync(S3_FOLDER, { recursive: true });
    console.log(`📁 Creada carpeta: ${S3_FOLDER}`);
  } else {
    console.log(`📁 Carpeta S3 ya existe: ${S3_FOLDER}`);
  }
}

/**
 * Cargar estado previo
 */
function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const savedState = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
      state = { 
        ...state, 
        ...savedState,
        s3Files: new Set(savedState.s3Files || [])
      };
      console.log(`📊 Estado cargado: ${state.processedFiles.length} archivos procesados`);
    }
  } catch (error) {
    console.log('⚠️  Empezando desde cero');
  }
}

/**
 * Guardar estado
 */
function saveState() {
  try {
    const stateToSave = {
      ...state,
      s3Files: Array.from(state.s3Files)
    };
    fs.writeFileSync(STATE_FILE, JSON.stringify(stateToSave, null, 2));
  } catch (error) {
    console.error('❌ Error guardando estado:', error.message);
  }
}

/**
 * Escanear directorio NAS (excluyendo carpeta S3)
 */
function scanNasDirectory() {
  const files = [];
  
  function walkDirectory(currentDir) {
    try {
      const items = fs.readdirSync(currentDir);
      
      for (const item of items) {
        const fullPath = path.join(currentDir, item);
        
        // Saltar la carpeta S3
        if (fullPath === S3_FOLDER) {
          console.log(`⏭️  Saltando carpeta S3: ${fullPath}`);
          continue;
        }
        
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
  
  walkDirectory(NAS_FOLDER);
  return files;
}

/**
 * Obtener archivos de S3
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
 * Mover archivo a carpeta S3
 */
function moveToS3Folder(file) {
  try {
    const destPath = path.join(S3_FOLDER, file.name);
    
    // Verificar si ya existe en destino
    if (fs.existsSync(destPath)) {
      console.log(`   ⚠️  Ya existe en S3 folder: ${file.name}`);
      return true;
    }
    
    // Mover archivo
    fs.renameSync(file.fullPath, destPath);
    console.log(`   ✅ Movido a S3 folder: ${file.name}`);
    return true;
    
  } catch (error) {
    console.error(`   ❌ Error moviendo ${file.name}: ${error.message}`);
    return false;
  }
}

/**
 * Subir archivo a S3
 */
async function uploadFileToS3(file) {
  try {
    const s3 = initializeS3();
    const bucketName = process.env.S3_BUCKET_NAME;
    
    console.log(`   ⬆️  Subiendo: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`);
    
    // Extraer metadatos
    const metadata = await extractEpubMetadata(file.fullPath);
    
    // Leer archivo
    const fileContent = fs.readFileSync(file.fullPath);
    
    // Preparar metadatos seguros para S3 (sin caracteres especiales)
    const safeTitle = (metadata.title || 'Título desconocido')
      .replace(/[^\w\s-]/g, '') // Quitar caracteres especiales
      .substring(0, 100); // Limitar longitud
    
    const safeAuthor = (metadata.author || 'Autor desconocido')
      .replace(/[^\w\s-]/g, '') // Quitar caracteres especiales  
      .substring(0, 100); // Limitar longitud
    
    // Parámetros de subida
    const uploadParams = {
      Bucket: bucketName,
      Key: file.name,
      Body: fileContent,
      ContentType: 'application/epub+zip',
      Metadata: {
        'title': safeTitle,
        'author': safeAuthor,
        'uploaded-from': 'nas-organized',
        'upload-date': new Date().toISOString()
      },
      ServerSideEncryption: 'AES256',
      StorageClass: 'STANDARD_IA'
    };
    
    // Subir
    await s3.upload(uploadParams).promise();
    
    console.log(`   ✅ Subido exitosamente a S3`);
    return { success: true, metadata: metadata };
    
  } catch (error) {
    console.error(`   ❌ Error subiendo ${file.name}: ${error.message}`);
    return { success: false, error: error.message };
  }
}

/**
 * Procesar archivos en lotes
 */
async function processFiles(files) {
  console.log(`\n🔄 Procesando ${files.length} archivos...`);
  
  for (let i = 0; i < files.length; i += BATCH_SIZE) {
    const batch = files.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(files.length / BATCH_SIZE);
    
    console.log(`\n📦 Lote ${batchNum}/${totalBatches} (${batch.length} archivos)`);
    
    for (const file of batch) {
      console.log(`\n📖 Procesando: ${file.name}`);
      
      if (state.s3Files.has(file.name)) {
        // Archivo ya está en S3 - mover a carpeta S3
        console.log(`   ☁️  Ya existe en S3`);
        const moved = moveToS3Folder(file);
        if (moved) {
          state.alreadyInS3++;
          state.movedToS3Folder++;
        }
      } else {
        // Archivo no está en S3 - subir
        console.log(`   📤 Necesita subirse a S3`);
        state.needsUpload++;
        
        const uploadResult = await uploadFileToS3(file);
        
        if (uploadResult.success) {
          state.uploaded++;
          
          // Mover también a carpeta S3 después de subir
          const moved = moveToS3Folder(file);
          if (moved) {
            state.movedToS3Folder++;
          }
          
          // Agregar a lista de S3 para futuras verificaciones
          state.s3Files.add(file.name);
          
          state.processedFiles.push({
            filename: file.name,
            action: 'uploaded',
            metadata: uploadResult.metadata
          });
          
        } else {
          state.errors++;
          state.failedFiles.push({
            filename: file.name,
            error: uploadResult.error
          });
        }
      }
      
      // Guardar estado después de cada archivo
      saveState();
    }
    
    console.log(`📊 Progreso: ${i + batch.length}/${files.length} archivos procesados`);
    console.log(`   ☁️  Ya en S3: ${state.alreadyInS3} | 📤 Subidos: ${state.uploaded} | ❌ Errores: ${state.errors}`);
    
    // Pausa entre lotes
    if (i + BATCH_SIZE < files.length) {
      console.log('⏸️  Pausa entre lotes (2 segundos)...');
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
}

/**
 * Actualizar Firebase Database
 */
async function updateFirebaseDatabase() {
  const uploadedFiles = state.processedFiles.filter(f => f.action === 'uploaded');
  
  if (uploadedFiles.length === 0) {
    console.log('📊 No hay nuevos archivos para actualizar en Firebase');
    return;
  }
  
  try {
    console.log(`\n🔥 Actualizando Firebase Database con ${uploadedFiles.length} libros nuevos...`);
    
    const firebaseAdmin = initializeFirebaseAdmin();
    const database = firebaseAdmin.database();
    
    // Obtener datos actuales
    const [librosSnapshot, autoresSnapshot, librosPorAutorSnapshot] = await Promise.all([
      database.ref('/libros').once('value'),
      database.ref('/autores').once('value'), 
      database.ref('/librosPorAutor').once('value')
    ]);
    
    const libros = librosSnapshot.exists() ? librosSnapshot.val() : [];
    const autores = autoresSnapshot.exists() ? new Set(autoresSnapshot.val()) : new Set();
    const librosPorAutor = librosPorAutorSnapshot.exists() ? librosPorAutorSnapshot.val() : {};
    
    // Actualizar con libros nuevos
    const newLibros = [...libros];
    const newAutores = new Set(autores);
    const newLibrosPorAutor = { ...librosPorAutor };
    
    for (const uploadedFile of uploadedFiles) {
      const { filename, metadata } = uploadedFile;
      
      // Añadir libro si no existe
      if (!newLibros.includes(filename)) {
        newLibros.push(filename);
      }
      
      // Añadir autor si existe y es válido
      if (metadata.author && metadata.author !== 'Autor desconocido') {
        newAutores.add(metadata.author);
        
        // Vincular libro con autor
        const authorKey = metadata.author.replace(/[.#$[\]]/g, '_');
        if (!newLibrosPorAutor[authorKey]) {
          newLibrosPorAutor[authorKey] = {};
        }
        
        const bookKey = `libro_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        newLibrosPorAutor[authorKey][bookKey] = filename;
      }
    }
    
    // Actualizar Firebase
    const updates = {
      '/libros': newLibros,
      '/autores': Array.from(newAutores),
      '/librosPorAutor': newLibrosPorAutor
    };
    
    await database.ref().update(updates);
    
    console.log('✅ Firebase Database actualizado');
    console.log(`   📚 Total libros: ${newLibros.length}`);
    console.log(`   👥 Total autores: ${newAutores.size}`);
    
  } catch (error) {
    console.error('❌ Error actualizando Firebase:', error.message);
  }
}

/**
 * Generar reporte final
 */
function generateReport() {
  const endTime = new Date().toISOString();
  const duration = state.startTime ? 
    Math.round((new Date(endTime) - new Date(state.startTime)) / 1000) : 0;
  
  console.log('\n🎉 PROCESO COMPLETADO');
  console.log('='.repeat(50));
  console.log(`📊 Estadísticas finales:`);
  console.log(`   📁 Archivos escaneados en NAS: ${state.totalNasFiles}`);
  console.log(`   ☁️  Ya existían en S3: ${state.alreadyInS3}`);
  console.log(`   📤 Archivos que necesitaban subirse: ${state.needsUpload}`);
  console.log(`   ✅ Subidos exitosamente: ${state.uploaded}`);
  console.log(`   📁 Movidos a carpeta /S3: ${state.movedToS3Folder}`);
  console.log(`   ❌ Errores: ${state.errors}`);
  console.log(`   ⏰ Duración: ${duration} segundos`);
  
  if (state.failedFiles.length > 0) {
    console.log(`\n❌ Archivos fallidos (${state.failedFiles.length}):`);
    state.failedFiles.slice(0, 10).forEach(failed => {
      console.log(`   - ${failed.filename}: ${failed.error}`);
    });
    if (state.failedFiles.length > 10) {
      console.log(`   ... y ${state.failedFiles.length - 10} más`);
    }
  }
  
  console.log(`\n📁 Todos los archivos organizados en:`);
  console.log(`   📂 Archivos en S3: ${S3_FOLDER}`);
  console.log(`   📂 Resto de archivos: ${NAS_FOLDER}`);
}

/**
 * Verificar configuración
 */
function checkConfiguration() {
  const requiredVars = [
    'NAS_BOOKS_FOLDER',
    'S3_BUCKET_NAME',
    'AWS_ACCESS_KEY_ID',
    'AWS_SECRET_ACCESS_KEY'
  ];
  
  const missing = requiredVars.filter(varName => !process.env[varName]);
  
  if (missing.length > 0) {
    console.error('❌ Faltan variables de entorno:');
    missing.forEach(varName => console.error(`   - ${varName}`));
    process.exit(1);
  }
  
  if (!fs.existsSync(NAS_FOLDER)) {
    console.error(`❌ Directorio NAS no encontrado: ${NAS_FOLDER}`);
    process.exit(1);
  }
  
  console.log('✅ Configuración verificada');
}

/**
 * Función principal
 */
async function main() {
  try {
    console.log('🚀 ORGANIZADOR Y SUBIDOR DE LIBROS NAS');
    console.log('='.repeat(50));
    console.log(`📁 NAS: ${NAS_FOLDER}`);
    console.log(`📁 Carpeta S3: ${S3_FOLDER}`);
    console.log(`☁️  S3 Bucket: ${process.env.S3_BUCKET_NAME}`);
    
    // Verificar configuración
    checkConfiguration();
    
    // Crear carpeta S3
    ensureS3Folder();
    
    // Cargar estado
    loadState();
    
    if (!state.startTime) {
      state.startTime = new Date().toISOString();
    }
    
    // Paso 1: Escanear NAS (excluyendo carpeta S3)
    console.log('\n📡 Paso 1: Escaneando directorio NAS...');
    const nasFiles = scanNasDirectory();
    state.totalNasFiles = nasFiles.length;
    
    if (nasFiles.length === 0) {
      console.log('✅ No hay archivos EPUB para procesar (todos ya están organizados)');
      return;
    }
    
    console.log(`📊 Archivos EPUB encontrados: ${nasFiles.length}`);
    
    // Paso 2: Obtener archivos de S3
    console.log('\n📡 Paso 2: Verificando archivos en S3...');
    state.s3Files = await getS3Files();
    
    // Paso 3: Procesar archivos
    console.log('\n📡 Paso 3: Procesando archivos...');
    await processFiles(nasFiles);
    
    // Paso 4: Actualizar Firebase
    console.log('\n📡 Paso 4: Actualizando Firebase Database...');
    await updateFirebaseDatabase();
    
    // Paso 5: Reporte final
    generateReport();
    
    // Limpiar estado si todo salió bien
    if (state.errors === 0) {
      if (fs.existsSync(STATE_FILE)) {
        fs.unlinkSync(STATE_FILE);
        console.log('🗑️  Archivo de estado eliminado');
      }
    }
    
  } catch (error) {
    console.error('\n💥 Error fatal:', error.message);
    saveState();
    process.exit(1);
  }
}

// Manejo de señales
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

// Ayuda
if (process.argv.includes('--help')) {
  console.log(`
📚 ORGANIZADOR Y SUBIDOR DE LIBROS NAS

Este script organiza tu biblioteca del NAS:
1. Escanea el directorio NAS (excluyendo carpeta /S3)
2. Verifica qué libros ya están en S3
3. Mueve libros existentes en S3 a carpeta /S3
4. Sube solo los libros que realmente faltan
5. Mueve los recién subidos también a /S3
6. Actualiza Firebase Database

Uso:
  node organize-and-upload-nas.js

Variables de entorno requeridas:
  NAS_BOOKS_FOLDER    Ruta al directorio de libros en NAS
  S3_BUCKET_NAME      Nombre del bucket S3
  AWS_ACCESS_KEY_ID   Clave de acceso AWS
  AWS_SECRET_ACCESS_KEY   Clave secreta AWS

Características:
  ✅ Organización automática de archivos
  ✅ Solo sube archivos que realmente faltan
  ✅ Manejo seguro de metadatos con caracteres especiales
  ✅ Proceso resumible con estado persistente
  ✅ Actualización automática de Firebase Database
`);
  process.exit(0);
}

// Ejecutar
main();