#!/usr/bin/env node

import { extractEpubMetadata, scanEpubFolder } from './epub-parser.js';
import { initializeFirebase } from './firebase-manager.js';
import AWS from 'aws-sdk';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

// Configurar AWS una sola vez
AWS.config.update({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION || 'eu-west-1'
});

const s3 = new AWS.S3();

/**
 * Genera el nombre correcto del archivo: "Título del libro - Autor.epub"
 * @param {Object} metadata - Metadatos del libro {title, author}
 * @returns {string} Nombre formateado
 */
function generateCorrectFilename(metadata) {
  // Limpiar título y autor
  const cleanTitle = metadata.title
    .replace(/[:\/\\*?"<>|]/g, '') // Eliminar caracteres no válidos para nombres de archivo
    .replace(/\s+/g, ' ')           // Múltiples espacios a uno
    .trim();
  
  const cleanAuthor = metadata.author
    .replace(/[:\/\\*?"<>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  
  // Formato: "Título del libro - Autor.epub"
  return `${cleanTitle} - ${cleanAuthor}.epub`;
}

/**
 * Verifica si un libro existe en Firebase (optimizado para arrays grandes)
 */
async function bookExistsInFirebase(metadata) {
  try {
    const db = initializeFirebase();
    const booksRef = db.ref('libros');
    
    // Generar nombre correcto
    const correctFilename = generateCorrectFilename(metadata);
    
    // Usar query en lugar de descargar todo el array
    const snapshot = await booksRef.orderByValue().equalTo(correctFilename).limitToFirst(1).once('value');
    return snapshot.exists();
  } catch (error) {
    console.error('Error verificando Firebase:', error.message);
    return false;
  }
}

/**
 * Verifica si un libro existe en S3
 */
async function bookExistsInS3(metadata) {
  try {
    const bucketName = process.env.S3_BUCKET_NAME;
    
    // Generar nombre correcto
    const correctFilename = generateCorrectFilename(metadata);
    
    try {
      await s3.headObject({
        Bucket: bucketName,
        Key: correctFilename
      }).promise();
      return true;
    } catch (error) {
      if (error.code === 'NotFound') {
        return false;
      }
      throw error;
    }
  } catch (error) {
    console.error('Error verificando S3:', error.message);
    return false;
  }
}

/**
 * Añadir libro a Firebase
 */
async function addToFirebase(bookData) {
  try {
    const db = initializeFirebase();
    const { title, author } = bookData;
    
    // Generar nombre correcto
    const correctFilename = generateCorrectFilename(bookData);
    
    // Para arrays grandes: NO descargar todo, usar transaction
    const booksRef = db.ref('libros');
    
    // Primero verificar si existe (con query limitada)
    const snapshot = await booksRef.orderByValue().equalTo(correctFilename).once('value');
    
    if (!snapshot.exists()) {
      // Obtener el siguiente índice sin descargar todo el array
      const countSnapshot = await booksRef.once('value');
      const currentLength = countSnapshot.numChildren();
      
      // Añadir SOLO el nuevo elemento en la posición correcta
      await booksRef.child(currentLength).set(correctFilename);
      console.log(`✅ Firebase: Libro añadido en posición ${currentLength} - ${correctFilename}`);
      return true;
    } else {
      console.log(`⚠️ Firebase: Libro ya existe - ${correctFilename}`);
      return false;
    }
    
  } catch (error) {
    console.error(`❌ Firebase: Error - ${error.message}`);
    return false;
  }
}

/**
 * Subir libro a S3
 */
async function uploadToS3(filePath, metadata) {
  try {
    const bucketName = process.env.S3_BUCKET_NAME;
    
    // Usar el nombre correcto generado
    const correctFilename = generateCorrectFilename(metadata);
    
    const fileContent = fs.readFileSync(filePath);
    
    const uploadParams = {
      Bucket: bucketName,
      Key: correctFilename,  // Usar nombre correcto
      Body: fileContent,
      ContentType: 'application/epub+zip',
      Metadata: {
        'title': metadata.title || 'Título desconocido',
        'author': metadata.author || 'Autor desconocido',
        'original-filename': path.basename(filePath),
        'uploaded-date': new Date().toISOString()
      },
      ServerSideEncryption: 'AES256',
      StorageClass: 'STANDARD_IA'
    };
    
    await s3.upload(uploadParams).promise();
    console.log(`✅ S3: Archivo subido - ${correctFilename}`);
    return true;
    
  } catch (error) {
    console.error(`❌ S3: Error - ${error.message}`);
    return false;
  }
}

/**
 * Verificar y sincronizar estado
 */
async function checkAndSync() {
  console.log('🔍 VERIFICANDO ESTADO ACTUAL');
  console.log('============================\\n');
  
  const booksFolder = process.env.BOOKS_FOLDER || './libros';
  
  // Escanear libros locales
  const localBooks = await scanEpubFolder(booksFolder);
  console.log(`📚 Libros locales: ${localBooks.length}`);
  
  const status = {
    local: localBooks.length,
    inFirebase: 0,
    inS3: 0,
    needFirebase: [],
    needS3: [],
    fullySynced: []
  };
  
  // Verificar cada libro
  for (const book of localBooks) {
    const correctFilename = generateCorrectFilename(book);
    console.log(`\\n📖 Verificando: ${correctFilename}`);
    console.log(`   (Archivo original: ${book.filename})`);
    
    const inFirebase = await bookExistsInFirebase(book);
    const inS3 = await bookExistsInS3(book);
    
    console.log(`   Firebase: ${inFirebase ? '✅' : '❌'}`);
    console.log(`   S3: ${inS3 ? '✅' : '❌'}`);
    
    if (inFirebase) status.inFirebase++;
    if (inS3) status.inS3++;
    
    if (!inFirebase && !inS3) {
      console.log(`   Estado: 🆕 Nuevo - necesita subir a ambos`);
      status.needFirebase.push(book);
      status.needS3.push(book);
    } else if (!inFirebase) {
      console.log(`   Estado: ⚠️ Solo en S3 - falta Firebase`);
      status.needFirebase.push(book);
    } else if (!inS3) {
      console.log(`   Estado: ⚠️ Solo en Firebase - falta S3`);
      status.needS3.push(book);
    } else {
      console.log(`   Estado: ✅ Completamente sincronizado`);
      status.fullySynced.push(book);
    }
  }
  
  // Resumen
  console.log(`\\n📊 RESUMEN DE SINCRONIZACIÓN`);
  console.log(`=============================`);
  console.log(`📚 Total libros locales: ${status.local}`);
  console.log(`🔥 En Firebase: ${status.inFirebase}`);
  console.log(`☁️  En S3: ${status.inS3}`);
  console.log(`✅ Sincronizados: ${status.fullySynced.length}`);
  console.log(`⚠️  Necesitan Firebase: ${status.needFirebase.length}`);
  console.log(`⚠️  Necesitan S3: ${status.needS3.length}`);
  
  return status;
}

/**
 * Sincronizar libros faltantes
 */
async function syncMissing() {
  const status = await checkAndSync();
  
  if (status.needFirebase.length === 0 && status.needS3.length === 0) {
    console.log(`\\n✅ Todo está sincronizado`);
    return;
  }
  
  console.log(`\\n🚀 INICIANDO SINCRONIZACIÓN`);
  console.log(`============================`);
  
  // Sincronizar Firebase
  if (status.needFirebase.length > 0) {
    console.log(`\\n🔥 Añadiendo a Firebase: ${status.needFirebase.length} libros`);
    for (const book of status.needFirebase) {
      await addToFirebase(book);
    }
  }
  
  // Sincronizar S3
  if (status.needS3.length > 0) {
    console.log(`\\n☁️  Subiendo a S3: ${status.needS3.length} libros`);
    for (const book of status.needS3) {
      await uploadToS3(book.filePath, book);
    }
  }
  
  console.log(`\\n🎉 SINCRONIZACIÓN COMPLETADA`);
}

// Ejecutar
const args = process.argv.slice(2);

if (args.includes('--check')) {
  // Solo verificar estado
  checkAndSync();
} else if (args.includes('--sync')) {
  // Sincronizar todo
  syncMissing();
} else {
  console.log(`
📚 SMART UPLOAD - Sincronización inteligente

Comandos:
  node smart-upload.js --check   # Verificar estado actual
  node smart-upload.js --sync    # Sincronizar libros faltantes
  
El script:
  ✅ Verifica si cada libro está en Firebase
  ✅ Verifica si cada libro está en S3
  ✅ Solo sube donde falta
  ✅ No duplica si ya existe
`);
}