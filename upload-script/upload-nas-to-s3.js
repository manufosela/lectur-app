#!/usr/bin/env node

import AWS from 'aws-sdk';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

// Configuración
const BOOKS_FOLDER = process.env.NAS_BOOKS_FOLDER || '/home/manu/servidorix/LIBROS';
const PROCESSED_LOG = './nas-to-s3-processed.json';
const STATE_FILE = './nas-to-s3-state.json';
const BATCH_SIZE = 10; // Archivos en paralelo

// Estado de subida
let state = {
  totalFiles: 0,
  processed: 0,
  uploaded: 0,
  errors: 0,
  skipped: 0,
  startTime: null,
  lastFile: null,
  processedFiles: new Set()
};

// Configurar AWS S3
const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION
});

function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const data = fs.readFileSync(STATE_FILE, 'utf8');
      const savedState = JSON.parse(data);
      state = { ...state, ...savedState };
      state.processedFiles = new Set(savedState.processedFiles || []);
      console.log(`📊 Estado cargado: ${state.processed}/${state.totalFiles} archivos procesados`);
    }
  } catch (error) {
    console.log('⚠️  Estado previo no encontrado, empezando desde cero');
  }

  try {
    if (fs.existsSync(PROCESSED_LOG)) {
      const data = fs.readFileSync(PROCESSED_LOG, 'utf8');
      const processedList = JSON.parse(data);
      processedList.forEach(file => state.processedFiles.add(file));
      console.log(`📋 Cargados ${state.processedFiles.size} archivos ya procesados`);
    }
  } catch (error) {
    console.log('⚠️  Log de procesados no encontrado');
  }
}

function saveState() {
  try {
    const stateToSave = {
      ...state,
      processedFiles: Array.from(state.processedFiles)
    };
    fs.writeFileSync(STATE_FILE, JSON.stringify(stateToSave, null, 2));
    fs.writeFileSync(PROCESSED_LOG, JSON.stringify(Array.from(state.processedFiles), null, 2));
  } catch (error) {
    console.error('❌ Error guardando estado:', error.message);
  }
}

function logMessage(message) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${message}`);
}

function sanitizeFileName(fileName) {
  // Limpiar caracteres problemáticos para S3
  return fileName
    .replace(/[<>:"|?*]/g, '') // Caracteres prohibidos
    .replace(/\.\./g, '.') // Dobles puntos
    .replace(/\s+/g, ' ') // Múltiples espacios
    .trim();
}

async function uploadFileToS3(filePath, fileName) {
  try {
    // Si ya está procesado, saltar
    if (state.processedFiles.has(fileName)) {
      logMessage(`⏭️  Saltando (ya procesado): ${fileName}`);
      state.processed++;
      state.skipped++;
      return { success: true, skipped: true };
    }

    // Verificar si ya existe en S3
    try {
      await s3.headObject({ 
        Bucket: process.env.S3_BUCKET_NAME, 
        Key: fileName 
      }).promise();
      
      logMessage(`⏭️  Saltando (ya existe en S3): ${fileName}`);
      state.processedFiles.add(fileName);
      state.processed++;
      state.skipped++;
      return { success: true, skipped: true };
    } catch (headError) {
      // El archivo no existe en S3, continuar con la subida
    }

    // Leer archivo
    const fileContent = fs.readFileSync(filePath);
    const fileSizeMB = (fileContent.length / 1024 / 1024).toFixed(2);

    // Subir a S3
    const uploadParams = {
      Bucket: process.env.S3_BUCKET_NAME,
      Key: fileName,
      Body: fileContent,
      ContentType: fileName.endsWith('.epub') ? 'application/epub+zip' : 'application/pdf'
    };

    await s3.upload(uploadParams).promise();
    
    logMessage(`✅ Subido: ${fileName} (${fileSizeMB} MB)`);
    
    state.processedFiles.add(fileName);
    state.processed++;
    state.uploaded++;
    state.lastFile = fileName;
    
    return { success: true, skipped: false };

  } catch (error) {
    logMessage(`❌ Error subiendo ${fileName}: ${error.message}`);
    state.processed++;
    state.errors++;
    return { success: false, error: error.message };
  }
}

async function processFiles(files) {
  logMessage(`🔄 Procesando lote de ${files.length} archivos...`);
  
  const promises = files.map(file => uploadFileToS3(file.path, file.name));
  const results = await Promise.allSettled(promises);
  
  const successful = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
  const errors = results.filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value.success)).length;
  
  logMessage(`📊 Lote completado: ${successful} exitosos, ${errors} errores`);
  
  // Guardar estado cada lote
  saveState();
}

function getAllEpubFiles(dir) {
  const files = [];
  
  function walkDir(currentDir) {
    const items = fs.readdirSync(currentDir);
    
    for (const item of items) {
      const fullPath = path.join(currentDir, item);
      const stat = fs.statSync(fullPath);
      
      if (stat.isDirectory()) {
        walkDir(fullPath);
      } else if (item.toLowerCase().endsWith('.epub')) {
        const sanitizedName = sanitizeFileName(item);
        files.push({
          path: fullPath,
          name: sanitizedName,
          originalName: item
        });
      }
    }
  }
  
  walkDir(dir);
  return files;
}

async function uploadAllFiles() {
  if (!state.startTime) {
    state.startTime = new Date().toISOString();
  }
  
  logMessage('🚀 Iniciando subida de libros del NAS a S3...');
  logMessage(`📁 Origen: ${BOOKS_FOLDER}`);
  logMessage(`☁️  Destino: s3://${process.env.S3_BUCKET_NAME}/`);
  
  try {
    // Obtener lista de archivos EPUB
    logMessage('📋 Escaneando archivos EPUB en el NAS...');
    const allFiles = getAllEpubFiles(BOOKS_FOLDER);
    
    state.totalFiles = allFiles.length;
    logMessage(`📊 Total archivos EPUB encontrados: ${state.totalFiles}`);
    
    // Filtrar archivos ya procesados
    const filesToProcess = allFiles.filter(file => !state.processedFiles.has(file.name));
    
    if (filesToProcess.length === 0) {
      logMessage('✅ Todos los archivos ya han sido procesados');
      return;
    }
    
    logMessage(`🔄 Archivos pendientes: ${filesToProcess.length}`);
    
    // Procesar archivos en lotes
    for (let i = 0; i < filesToProcess.length; i += BATCH_SIZE) {
      const batch = filesToProcess.slice(i, i + BATCH_SIZE);
      const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(filesToProcess.length / BATCH_SIZE);
      
      logMessage(`📦 Lote ${batchNumber}/${totalBatches}`);
      
      await processFiles(batch);
      
      // Mostrar progreso
      const progress = ((state.processed / state.totalFiles) * 100).toFixed(1);
      logMessage(`📈 Progreso: ${state.processed}/${state.totalFiles} (${progress}%)`);
      
      // Pausa entre lotes
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    const endTime = new Date().toISOString();
    logMessage('🎉 SUBIDA COMPLETADA');
    logMessage(`📊 Estadísticas finales:`);
    logMessage(`   - Total archivos: ${state.totalFiles}`);
    logMessage(`   - Subidos: ${state.uploaded}`);
    logMessage(`   - Saltados: ${state.skipped}`);
    logMessage(`   - Errores: ${state.errors}`);
    logMessage(`   - Inicio: ${state.startTime}`);
    logMessage(`   - Fin: ${endTime}`);
    
  } catch (error) {
    logMessage(`❌ Error fatal: ${error.message}`);
    throw error;
  }
}

// Manejo de señales para guardado seguro
process.on('SIGINT', () => {
  console.log('\n⚠️  Recibida señal de interrupción, guardando estado...');
  saveState();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n⚠️  Recibida señal de terminación, guardando estado...');
  saveState();
  process.exit(0);
});

// Ejecutar
async function main() {
  try {
    if (!fs.existsSync(BOOKS_FOLDER)) {
      console.error(`❌ Directorio no encontrado: ${BOOKS_FOLDER}`);
      process.exit(1);
    }
    
    loadState();
    await uploadAllFiles();
    
  } catch (error) {
    logMessage(`❌ Error fatal en main: ${error.message}`);
    console.error('Stack trace:', error.stack);
    process.exit(1);
  }
}

main();