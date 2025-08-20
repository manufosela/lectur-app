#!/usr/bin/env node

import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

// Configuración
const DESTINATION_FOLDER = process.env.NAS_BOOKS_FOLDER || '/home/manu/servidorix/LIBROS';
const BATCH_SIZE = 50; // Archivos a procesar en paralelo
const LOG_FILE = './firebase-to-nas.log';
const STATE_FILE = './firebase-to-nas-state.json';

// Estado de descarga
let state = {
  totalFiles: 0,
  processed: 0,
  downloaded: 0,
  errors: 0,
  currentBatch: 0,
  completed: false,
  startTime: null,
  lastFile: null
};

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
      client_x509_cert_url: `https://www.googleapis.com/service_accounts/v1/metadata/x509/${process.env.FIREBASE_CLIENT_EMAIL}`
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

function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const data = fs.readFileSync(STATE_FILE, 'utf8');
      state = { ...state, ...JSON.parse(data) };
      console.log(`📊 Estado cargado: ${state.processed}/${state.totalFiles} archivos procesados`);
    }
  } catch (error) {
    console.log('⚠️  No se pudo cargar el estado previo, empezando desde cero');
  }
}

function saveState() {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  } catch (error) {
    console.error('❌ Error guardando estado:', error.message);
  }
}

function logMessage(message) {
  const timestamp = new Date().toISOString();
  const logEntry = `[${timestamp}] ${message}\n`;
  
  console.log(message);
  
  try {
    fs.appendFileSync(LOG_FILE, logEntry);
  } catch (error) {
    console.error('Error escribiendo log:', error.message);
  }
}

async function ensureDirectoryExists(filePath) {
  const dir = path.dirname(filePath);
  try {
    await fs.promises.mkdir(dir, { recursive: true });
  } catch (error) {
    if (error.code !== 'EEXIST') {
      throw error;
    }
  }
}

function sanitizeFileName(fileName) {
  // Limpiar caracteres problemáticos pero mantener el nombre lo más parecido posible
  return fileName
    .replace(/[<>:"|?*]/g, '') // Caracteres prohibidos en Windows
    .replace(/\.\./g, '.') // Dobles puntos
    .replace(/\s+/g, ' ') // Múltiples espacios
    .trim();
}

async function downloadFile(file) {
  const originalName = file.name;
  const sanitizedName = sanitizeFileName(originalName);
  const localPath = path.join(DESTINATION_FOLDER, sanitizedName);
  
  try {
    // Verificar si el archivo ya existe
    if (fs.existsSync(localPath)) {
      const stats = fs.statSync(localPath);
      if (stats.size > 0) {
        logMessage(`⏭️  Saltando (ya existe): ${sanitizedName}`);
        state.processed++;
        state.lastFile = originalName;
        return { success: true, skipped: true };
      }
    }

    // Asegurar que el directorio existe
    await ensureDirectoryExists(localPath);

    // Descargar archivo
    const [buffer] = await file.download();
    
    // Escribir archivo
    await fs.promises.writeFile(localPath, buffer);
    
    logMessage(`✅ Descargado: ${sanitizedName} (${(buffer.length / 1024 / 1024).toFixed(2)} MB)`);
    
    state.processed++;
    state.downloaded++;
    state.lastFile = originalName;
    
    return { success: true, skipped: false };
    
  } catch (error) {
    const errorMsg = `❌ Error descargando ${sanitizedName}: ${error.message}`;
    logMessage(errorMsg);
    
    state.processed++;
    state.errors++;
    state.lastFile = originalName;
    
    return { success: false, error: error.message };
  }
}

async function processFiles(files) {
  logMessage(`🔄 Procesando lote de ${files.length} archivos...`);
  
  // Procesar archivos en lotes para evitar sobrecarga
  const promises = files.map(file => downloadFile(file));
  const results = await Promise.allSettled(promises);
  
  const successful = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
  const errors = results.filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value.success)).length;
  
  logMessage(`📊 Lote completado: ${successful} exitosos, ${errors} errores`);
  
  // Guardar estado cada lote
  saveState();
}

async function downloadAllFiles() {
  const bucket = admin.storage().bucket();
  
  if (!state.startTime) {
    state.startTime = new Date().toISOString();
  }
  
  logMessage('🚀 Iniciando descarga masiva de Firebase Storage...');
  logMessage(`📁 Destino: ${DESTINATION_FOLDER}`);
  
  try {
    let allFiles = [];
    let pageToken = undefined;
    
    // Obtener lista completa de archivos
    logMessage('📋 Obteniendo lista de archivos...');
    
    do {
      const [files, , nextPageToken] = await bucket.getFiles({
        pageToken,
        maxResults: 1000
      });
      
      allFiles.push(...files);
      pageToken = nextPageToken;
      
      process.stdout.write(`\r📋 Archivos encontrados: ${allFiles.length}`);
    } while (pageToken);
    
    console.log(''); // Nueva línea
    
    state.totalFiles = allFiles.length;
    logMessage(`📊 Total de archivos a descargar: ${state.totalFiles}`);
    
    // Filtrar archivos ya procesados (si es una reanudación)
    const filesToProcess = state.processed > 0 ? allFiles.slice(state.processed) : allFiles;
    
    if (filesToProcess.length === 0) {
      logMessage('✅ Todos los archivos ya han sido procesados');
      state.completed = true;
      saveState();
      return;
    }
    
    logMessage(`🔄 Archivos pendientes: ${filesToProcess.length}`);
    
    // Procesar archivos en lotes
    for (let i = 0; i < filesToProcess.length; i += BATCH_SIZE) {
      const batch = filesToProcess.slice(i, i + BATCH_SIZE);
      const batchNumber = Math.floor((state.processed + i) / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(state.totalFiles / BATCH_SIZE);
      
      logMessage(`📦 Lote ${batchNumber}/${totalBatches}`);
      
      await processFiles(batch);
      
      // Mostrar progreso
      const progress = ((state.processed / state.totalFiles) * 100).toFixed(1);
      logMessage(`📈 Progreso: ${state.processed}/${state.totalFiles} (${progress}%)`);
      
      // Pausa pequeña entre lotes para no sobrecargar
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    state.completed = true;
    saveState();
    
    const endTime = new Date().toISOString();
    logMessage('🎉 DESCARGA COMPLETADA');
    logMessage(`📊 Estadísticas finales:`);
    logMessage(`   - Total archivos: ${state.totalFiles}`);
    logMessage(`   - Descargados: ${state.downloaded}`);
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
    // Verificar que el directorio de destino existe
    if (!fs.existsSync(DESTINATION_FOLDER)) {
      console.log(`📁 Creando directorio destino: ${DESTINATION_FOLDER}`);
      fs.mkdirSync(DESTINATION_FOLDER, { recursive: true });
    }
    
    initializeFirebaseAdmin();
    loadState();
    
    if (state.completed) {
      console.log('✅ La descarga ya está completada');
      return;
    }
    
    await downloadAllFiles();
    
  } catch (error) {
    logMessage(`❌ Error fatal en main: ${error.message}`);
    console.error('Stack trace:', error.stack);
    process.exit(1);
  }
}

main();