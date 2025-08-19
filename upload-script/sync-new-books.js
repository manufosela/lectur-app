#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { initializeFirebaseAdmin } from './firebase-manager.js';
import { initializeS3, uploadToS3 } from './s3-manager.js';
import { extractEpubMetadata } from './epub-parser.js';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Script inteligente para sincronizar solo libros nuevos
 * 1. Escanea tu carpeta NAS
 * 2. Compara con lo que ya está en S3
 * 3. Sube solo los archivos nuevos
 * 4. Los registra en Firebase Database
 */

const NAS_FOLDER = process.env.NAS_BOOKS_FOLDER || './libros-nas';
const BATCH_SIZE = 10; // Procesar de 10 en 10 para no saturar

async function scanNasFolder() {
  if (!fs.existsSync(NAS_FOLDER)) {
    console.error(`❌ No se encuentra la carpeta: ${NAS_FOLDER}`);
    console.log('💡 Configura la variable NAS_BOOKS_FOLDER en tu .env');
    process.exit(1);
  }

  console.log(`📁 Escaneando carpeta NAS: ${NAS_FOLDER}`);
  
  const files = fs.readdirSync(NAS_FOLDER)
    .filter(file => file.toLowerCase().endsWith('.epub'))
    .map(file => ({
      name: file,
      fullPath: path.join(NAS_FOLDER, file),
      size: fs.statSync(path.join(NAS_FOLDER, file)).size
    }));

  console.log(`📚 Encontrados ${files.length} archivos EPUB en NAS`);
  return files;
}

async function getExistingBooks() {
  console.log('🔍 Obteniendo lista de libros existentes...');
  
  // Obtener de Firebase Database (más rápido que S3)
  const firebaseAdmin = initializeFirebaseAdmin();
  const database = firebaseAdmin.database();
  
  try {
    const snapshot = await database.ref('/libros').once('value');
    const existingBooks = snapshot.exists() ? snapshot.val() : [];
    
    console.log(`📊 Libros existentes en Firebase: ${existingBooks.length}`);
    return new Set(existingBooks); // Set para búsqueda O(1)
    
  } catch (error) {
    console.error('❌ Error obteniendo libros existentes:', error.message);
    return new Set();
  }
}

async function findNewBooks(nasFiles, existingBooks) {
  console.log('🔍 Identificando libros nuevos...');
  
  const newBooks = nasFiles.filter(file => !existingBooks.has(file.name));
  
  console.log(`✨ Libros nuevos encontrados: ${newBooks.length}`);
  
  if (newBooks.length === 0) {
    console.log('✅ No hay libros nuevos que sincronizar');
    return [];
  }

  // Mostrar algunos ejemplos
  console.log('\n📋 Primeros 10 libros nuevos:');
  newBooks.slice(0, 10).forEach((book, index) => {
    console.log(`${index + 1}. ${book.name} (${(book.size / 1024 / 1024).toFixed(2)} MB)`);
  });

  if (newBooks.length > 10) {
    console.log(`... y ${newBooks.length - 10} más`);
  }

  return newBooks;
}

async function uploadNewBooks(newBooks) {
  if (newBooks.length === 0) return;

  console.log(`\n🚀 Subiendo ${newBooks.length} libros nuevos a S3...`);
  
  const s3 = await initializeS3();
  const firebaseAdmin = initializeFirebaseAdmin();
  const database = firebaseAdmin.database();
  
  // Obtener listas actuales
  const librosSnapshot = await database.ref('/libros').once('value');
  const autoresSnapshot = await database.ref('/autores').once('value');
  const librosPorAutorSnapshot = await database.ref('/librosPorAutor').once('value');
  
  const libros = librosSnapshot.exists() ? librosSnapshot.val() : [];
  const autores = autoresSnapshot.exists() ? autoresSnapshot.val() : [];
  const librosPorAutor = librosPorAutorSnapshot.exists() ? librosPorAutorSnapshot.val() : {};

  const newLibros = [...libros];
  const newAutores = new Set(autores);
  const newLibrosPorAutor = { ...librosPorAutor };
  
  let successful = 0;
  let failed = 0;

  // Procesar en lotes
  for (let i = 0; i < newBooks.length; i += BATCH_SIZE) {
    const batch = newBooks.slice(i, i + BATCH_SIZE);
    
    console.log(`\n📦 Procesando lote ${Math.floor(i/BATCH_SIZE) + 1}/${Math.ceil(newBooks.length/BATCH_SIZE)}`);
    
    for (const book of batch) {
      try {
        console.log(`[${successful + failed + 1}/${newBooks.length}] 📚 ${book.name}`);
        
        // 1. Extraer metadatos del EPUB
        console.log('  📖 Extrayendo metadatos...');
        const metadata = await extractEpubMetadata(book.fullPath);
        
        // 2. Subir a S3
        console.log('  ☁️  Subiendo a S3...');
        await uploadToS3(book.fullPath, book.name, metadata);
        
        // 3. Actualizar Firebase Database
        console.log('  🔥 Actualizando Firebase...');
        
        // Añadir libro a la lista
        newLibros.push(book.name);
        
        // Añadir autor si no existe
        if (metadata.author && !newAutores.has(metadata.author)) {
          newAutores.add(metadata.author);
        }
        
        // Vincular libro con autor
        if (metadata.author) {
          const authorKey = metadata.author.replace(/[.#$[\]]/g, '_');
          if (!newLibrosPorAutor[authorKey]) {
            newLibrosPorAutor[authorKey] = {};
          }
          const libroKey = `libro_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          newLibrosPorAutor[authorKey][libroKey] = book.name;
        }
        
        successful++;
        console.log(`  ✅ Éxito (${successful}/${successful + failed})`);
        
      } catch (error) {
        failed++;
        console.error(`  ❌ Error: ${error.message}`);
      }
    }
    
    // Pausa entre lotes
    if (i + BATCH_SIZE < newBooks.length) {
      console.log('  ⏸️  Pausa de 2 segundos...');
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  // Actualizar Firebase Database una sola vez al final
  console.log('\n🔥 Actualizando Firebase Database...');
  
  const updates = {
    '/libros': newLibros,
    '/autores': Array.from(newAutores),
    '/librosPorAutor': newLibrosPorAutor
  };
  
  await database.ref().update(updates);
  
  console.log(`\n✅ SINCRONIZACIÓN COMPLETADA`);
  console.log(`📊 Libros subidos exitosamente: ${successful}`);
  console.log(`❌ Libros fallidos: ${failed}`);
  console.log(`📚 Total de libros en sistema: ${newLibros.length}`);
  
  return { successful, failed };
}

async function main() {
  try {
    console.log('🔄 INICIANDO SINCRONIZACIÓN DE LIBROS NUEVOS');
    console.log('=' .repeat(50));
    
    // 1. Escanear carpeta NAS
    const nasFiles = await scanNasFolder();
    
    if (nasFiles.length === 0) {
      console.log('❌ No hay archivos EPUB en la carpeta NAS');
      return;
    }
    
    // 2. Obtener libros existentes
    const existingBooks = await getExistingBooks();
    
    // 3. Encontrar libros nuevos
    const newBooks = await findNewBooks(nasFiles, existingBooks);
    
    // 4. Confirmar antes de subir
    if (newBooks.length > 0) {
      const totalSize = newBooks.reduce((acc, book) => acc + book.size, 0);
      const totalSizeMB = (totalSize / 1024 / 1024).toFixed(2);
      const estimatedCost = (totalSize / 1024 / 1024 / 1024 * 0.023).toFixed(4);
      
      console.log(`\n💰 Estimación:`);
      console.log(`   📊 Tamaño total: ${totalSizeMB} MB`);
      console.log(`   💵 Coste estimado: $${estimatedCost}`);
      
      // En modo automático o pedir confirmación
      const autoMode = process.argv.includes('--auto');
      
      if (!autoMode) {
        console.log('\n❓ ¿Continuar con la subida? (Ctrl+C para cancelar)');
        console.log('   O ejecuta con --auto para saltar esta confirmación');
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
      
      // 5. Subir libros nuevos
      await uploadNewBooks(newBooks);
    }
    
  } catch (error) {
    console.error('❌ Error fatal:', error.message);
    process.exit(1);
  }
}

// Manejo de argumentos
if (process.argv.includes('--help')) {
  console.log(`
📚 SINCRONIZADOR DE LIBROS NUEVOS

Uso:
  node sync-new-books.js [opciones]

Opciones:
  --auto    Ejecutar sin confirmación
  --help    Mostrar esta ayuda

Variables de entorno necesarias:
  NAS_BOOKS_FOLDER    Ruta a tu carpeta de libros NAS

Ejemplo:
  NAS_BOOKS_FOLDER=/mnt/nas/libros node sync-new-books.js --auto
`);
  process.exit(0);
}

// Ejecutar
main();