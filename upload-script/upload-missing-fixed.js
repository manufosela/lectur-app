#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import admin from 'firebase-admin';
import AWS from 'aws-sdk';

dotenv.config();

/**
 * Script MEJORADO para subir libros del NAS a S3
 * Corrige problemas con caracteres especiales en metadatos
 */

const NAS_FOLDER = process.env.NAS_BOOKS_FOLDER || '/home/manu/servidorix/LIBROS';
const STATE_FILE = './upload-fixed-state.json';
const BATCH_SIZE = 5;

// Estado
let state = {
  totalFiles: 0,
  processed: 0,
  uploaded: 0,
  errors: 0,
  skipped: 0,
  startTime: null,
  uploadedFiles: [],
  failedFiles: []
};

// Inicializar Firebase Admin
function initializeFirebaseAdmin() {
  if (admin.apps.length === 0) {
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
      client_x509_cert_url: `https://www.googleapis.com/service-accounts/v1/metadata/x509/${process.env.FIREBASE_CLIENT_EMAIL}`
    };

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      databaseURL: process.env.FIREBASE_DATABASE_URL
    });
  }
  return admin;
}

// Inicializar S3
function initializeS3() {
  return new AWS.S3({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: process.env.AWS_REGION || 'eu-west-1'
  });
}

// Limpiar string para metadatos AWS (eliminar caracteres problemáticos)
function sanitizeForAWS(str) {
  if (!str) return 'unknown';
  // Eliminar caracteres no ASCII y problemáticos
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Quitar tildes
    .replace(/[ñÑ]/g, 'n')
    .replace(/[¡!¿?]/g, '')
    .replace(/[^\x00-\x7F]/g, '') // Solo ASCII
    .replace(/['"]/g, '') // Quitar comillas
    .substring(0, 100) // Limitar longitud
    .trim() || 'unknown';
}

// Escanear directorio NAS
function scanNasDirectory() {
  const files = [];
  const S3_FOLDER = path.join(NAS_FOLDER, 'S3');
  
  function walkDirectory(currentDir) {
    try {
      const items = fs.readdirSync(currentDir);
      
      for (const item of items) {
        const fullPath = path.join(currentDir, item);
        
        // Saltar carpeta S3
        if (fullPath === S3_FOLDER) continue;
        
        try {
          const stat = fs.statSync(fullPath);
          
          if (stat.isDirectory()) {
            walkDirectory(fullPath);
          } else if (item.toLowerCase().endsWith('.epub')) {
            files.push({
              name: item,
              fullPath: fullPath,
              size: stat.size
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

// Obtener lista de S3
async function getS3Files() {
  const s3 = initializeS3();
  const files = new Set();
  let continuationToken = null;
  
  do {
    try {
      const params = {
        Bucket: process.env.S3_BUCKET_NAME,
        MaxKeys: 1000,
        ContinuationToken: continuationToken
      };
      
      const response = await s3.listObjectsV2(params).promise();
      
      if (response.Contents) {
        response.Contents.forEach(obj => files.add(obj.Key));
      }
      
      continuationToken = response.NextContinuationToken;
    } catch (error) {
      console.error('❌ Error listando S3:', error.message);
      break;
    }
  } while (continuationToken);
  
  return files;
}

// Subir archivo a S3
async function uploadFileToS3(file) {
  const s3 = initializeS3();
  
  try {
    console.log(`⬆️  Subiendo: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`);
    
    // Verificar si ya existe
    const s3Files = await getS3Files();
    if (s3Files.has(file.name)) {
      console.log(`   ⏭️  Ya existe en S3`);
      return { success: true, skipped: true };
    }
    
    // Leer archivo
    const fileContent = fs.readFileSync(file.fullPath);
    
    // Extraer título y autor del nombre de archivo
    let title = 'Unknown';
    let author = 'Unknown';
    
    const nameWithoutExt = file.name.replace('.epub', '');
    if (nameWithoutExt.includes(' - ')) {
      const parts = nameWithoutExt.split(' - ');
      title = parts[0];
      author = parts[1] || 'Unknown';
    } else {
      title = nameWithoutExt;
    }
    
    // Limpiar metadatos para AWS
    const safeTitle = sanitizeForAWS(title);
    const safeAuthor = sanitizeForAWS(author);
    
    // Parámetros de subida (sin metadatos problemáticos)
    const uploadParams = {
      Bucket: process.env.S3_BUCKET_NAME,
      Key: file.name,
      Body: fileContent,
      ContentType: 'application/epub+zip',
      ServerSideEncryption: 'AES256',
      StorageClass: 'STANDARD_IA'
    };
    
    // Subir
    await s3.upload(uploadParams).promise();
    
    console.log(`   ✅ Subido exitosamente`);
    return { 
      success: true, 
      metadata: { title: safeTitle, author: safeAuthor }
    };
    
  } catch (error) {
    console.error(`   ❌ Error: ${error.message}`);
    return { success: false, error: error.message };
  }
}

// Procesar archivos en lotes
async function processFiles(files) {
  for (let i = 0; i < files.length; i += BATCH_SIZE) {
    const batch = files.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(files.length / BATCH_SIZE);
    
    console.log(`\n📦 Lote ${batchNum}/${totalBatches}`);
    
    for (const file of batch) {
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
          filename: file.name,
          error: result.error
        });
      }
    }
    
    // Guardar estado
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
    
    console.log(`📊 Progreso: ${state.processed}/${state.totalFiles}`);
    console.log(`   ✅ Subidos: ${state.uploaded} | ⏭️  Saltados: ${state.skipped} | ❌ Errores: ${state.errors}`);
    
    // Pausa entre lotes
    if (i + BATCH_SIZE < files.length) {
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
}

// Actualizar Firebase Database
async function updateFirebaseDatabase() {
  if (state.uploadedFiles.length === 0) {
    console.log('📊 No hay archivos nuevos para Firebase');
    return;
  }
  
  try {
    console.log(`\n🔥 Actualizando Firebase Database...`);
    
    const firebaseAdmin = initializeFirebaseAdmin();
    const database = firebaseAdmin.database();
    
    // Obtener datos actuales
    const snapshot = await database.ref('/libros').once('value');
    const libros = snapshot.exists() ? snapshot.val() : [];
    
    // Añadir nuevos libros
    const newLibros = [...libros];
    for (const file of state.uploadedFiles) {
      if (!newLibros.includes(file.filename)) {
        newLibros.push(file.filename);
      }
    }
    
    // Actualizar
    await database.ref('/libros').set(newLibros);
    
    console.log(`✅ Firebase actualizado: ${newLibros.length} libros totales`);
  } catch (error) {
    console.error('❌ Error actualizando Firebase:', error.message);
  }
}

// Main
async function main() {
  try {
    console.log('🚀 SUBIDOR MEJORADO DE LIBROS A S3');
    console.log('='.repeat(50));
    
    // Cargar estado previo si existe
    if (fs.existsSync(STATE_FILE)) {
      state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
      console.log(`📊 Continuando desde: ${state.processed} procesados`);
    } else {
      state.startTime = new Date().toISOString();
    }
    
    // Escanear NAS
    console.log('\n📡 Escaneando NAS...');
    const files = scanNasDirectory();
    state.totalFiles = files.length;
    console.log(`📊 Archivos encontrados: ${files.length}`);
    
    if (files.length === 0) {
      console.log('✅ No hay archivos para procesar');
      return;
    }
    
    // Procesar archivos
    console.log('\n📡 Subiendo archivos...');
    await processFiles(files);
    
    // Actualizar Firebase
    await updateFirebaseDatabase();
    
    // Reporte final
    const duration = Math.round((Date.now() - new Date(state.startTime)) / 1000);
    console.log('\n🎉 PROCESO COMPLETADO');
    console.log('='.repeat(50));
    console.log(`📊 Resultados:`);
    console.log(`   ✅ Subidos: ${state.uploaded}`);
    console.log(`   ⏭️  Ya existían: ${state.skipped}`);
    console.log(`   ❌ Errores: ${state.errors}`);
    console.log(`   ⏰ Duración: ${duration} segundos`);
    
    // Limpiar estado si todo bien
    if (state.errors === 0 && fs.existsSync(STATE_FILE)) {
      fs.unlinkSync(STATE_FILE);
    }
    
  } catch (error) {
    console.error('💥 Error fatal:', error.message);
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
    process.exit(1);
  }
}

// Manejo de señales
process.on('SIGINT', () => {
  console.log('\n⚠️  Guardando estado...');
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  process.exit(0);
});

// Ejecutar
main();