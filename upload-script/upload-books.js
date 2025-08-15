#!/usr/bin/env node

import { scanEpubFolder } from './epub-parser.js';
import { addBooksToFirebaseBatch } from './firebase-manager.js';
import { uploadBooksToS3Batch, listS3Files } from './s3-manager.js';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Carga la lista de libros ya procesados
 * @returns {Array}
 */
function loadProcessedBooks() {
  try {
    const logPath = process.env.PROCESSED_LOG || './processed-books.json';
    if (fs.existsSync(logPath)) {
      const data = fs.readFileSync(logPath, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.log('⚠️  No se pudo cargar log de procesados, empezando desde cero');
  }
  return [];
}

/**
 * Guarda la lista de libros procesados
 * @param {Array} processedBooks 
 */
function saveProcessedBooks(processedBooks) {
  try {
    const logPath = process.env.PROCESSED_LOG || './processed-books.json';
    fs.writeFileSync(logPath, JSON.stringify(processedBooks, null, 2));
    console.log(`💾 Log de procesados guardado: ${processedBooks.length} libros`);
  } catch (error) {
    console.error('❌ Error guardando log de procesados:', error.message);
  }
}

/**
 * Filtra libros ya procesados
 * @param {Array} allBooks 
 * @param {Array} processedBooks 
 * @returns {Array}
 */
function filterNewBooks(allBooks, processedBooks) {
  const processedSet = new Set(processedBooks.map(book => book.filename));
  const newBooks = allBooks.filter(book => !processedSet.has(book.filename));
  
  console.log(`📊 Resumen de filtrado:`);
  console.log(`   📚 Total encontrados: ${allBooks.length}`);
  console.log(`   ✅ Ya procesados: ${allBooks.length - newBooks.length}`);
  console.log(`   🆕 Nuevos por procesar: ${newBooks.length}`);
  
  return newBooks;
}

/**
 * Muestra estadísticas del procesamiento
 * @param {Array} books 
 */
function showStats(books) {
  console.log(`\n📊 ESTADÍSTICAS:`);
  console.log(`   📚 Total de libros: ${books.length}`);
  
  if (books.length === 0) return;
  
  // Agrupar por autor
  const authorCounts = {};
  books.forEach(book => {
    authorCounts[book.author] = (authorCounts[book.author] || 0) + 1;
  });
  
  console.log(`   👥 Autores únicos: ${Object.keys(authorCounts).length}`);
  
  // Top 5 autores
  const topAuthors = Object.entries(authorCounts)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 5);
  
  console.log(`   🏆 Top autores:`);
  topAuthors.forEach(([author, count], i) => {
    console.log(`      ${i + 1}. ${author}: ${count} libros`);
  });
  
  // Calcular tamaño total
  let totalSize = 0;
  books.forEach(book => {
    if (fs.existsSync(book.filePath)) {
      totalSize += fs.statSync(book.filePath).size;
    }
  });
  
  console.log(`   💾 Tamaño total: ${(totalSize / 1024 / 1024).toFixed(2)} MB`);
  console.log(`   💰 Coste S3 estimado: $${(totalSize / 1024 / 1024 / 1024 * 0.023).toFixed(4)}/mes`);
}

/**
 * Función principal
 */
async function main() {
  try {
    console.log('🚀 INICIANDO PROCESAMIENTO DE LIBROS EPUB');
    console.log('==========================================\\n');
    
    // Verificar configuración
    const booksFolder = process.env.BOOKS_FOLDER || './libros';
    if (!fs.existsSync(booksFolder)) {
      throw new Error(`La carpeta de libros no existe: ${booksFolder}`);
    }
    
    // Cargar libros ya procesados
    const processedBooks = loadProcessedBooks();
    
    // Escanear carpeta de libros
    console.log('📖 PASO 1: ESCANEANDO LIBROS EPUB');
    console.log('================================\\n');
    const allBooks = await scanEpubFolder(booksFolder);
    
    if (allBooks.length === 0) {
      console.log('⚠️  No se encontraron archivos EPUB en la carpeta');
      return;
    }
    
    // Filtrar libros nuevos
    const newBooks = filterNewBooks(allBooks, processedBooks);
    
    if (newBooks.length === 0) {
      console.log('✅ Todos los libros ya han sido procesados');
      showStats(allBooks);
      return;
    }
    
    // Mostrar estadísticas
    showStats(newBooks);
    
    // Confirmar procesamiento
    console.log(`\\n❓ ¿Procesar ${newBooks.length} libros nuevos? (y/N)`);
    
    // Para ambiente no interactivo, procesar automáticamente
    if (process.env.AUTO_CONFIRM === 'true') {
      console.log('🤖 Modo automático activado, procesando...');
    } else {
      // En ambiente interactivo, esperar confirmación
      const readline = await import('readline');
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });
      
      const answer = await new Promise(resolve => {
        rl.question('', resolve);
      });
      rl.close();
      
      if (answer.toLowerCase() !== 'y' && answer.toLowerCase() !== 'yes') {
        console.log('❌ Procesamiento cancelado');
        return;
      }
    }
    
    // Procesar Firebase
    console.log('\\n🔥 PASO 2: ACTUALIZANDO FIREBASE');
    console.log('=================================\\n');
    await addBooksToFirebaseBatch(newBooks, 5);
    
    // Procesar S3
    console.log('\\n☁️  PASO 3: SUBIENDO A S3');
    console.log('========================\\n');
    await uploadBooksToS3Batch(newBooks, 3);
    
    // Actualizar log de procesados
    const updatedProcessedBooks = [...processedBooks, ...newBooks];
    saveProcessedBooks(updatedProcessedBooks);
    
    console.log('\\n🎉 PROCESAMIENTO COMPLETADO');
    console.log('============================');
    console.log(`✅ ${newBooks.length} libros nuevos procesados exitosamente`);
    console.log(`📊 Total en sistema: ${updatedProcessedBooks.length} libros`);
    
  } catch (error) {
    console.error('💥 ERROR FATAL:', error.message);
    console.error('Stack trace:', error.stack);
    process.exit(1);
  }
}

// Manejar argumentos de línea de comandos
const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  console.log(`
📚 UPLOAD BOOKS - Script para subir libros EPUB a Firebase y S3

Uso:
  npm run upload              # Procesamiento interactivo
  npm run upload -- --auto   # Procesamiento automático
  
Variables de entorno necesarias:
  BOOKS_FOLDER               # Carpeta con archivos EPUB
  FIREBASE_PROJECT_ID        # ID del proyecto Firebase
  FIREBASE_PRIVATE_KEY       # Clave privada Firebase Admin
  FIREBASE_CLIENT_EMAIL      # Email Firebase Admin
  FIREBASE_DATABASE_URL      # URL de Firebase Realtime Database
  AWS_ACCESS_KEY_ID          # AWS Access Key
  AWS_SECRET_ACCESS_KEY      # AWS Secret Key
  S3_BUCKET_NAME            # Nombre del bucket S3
  
Comandos adicionales:
  --stats                   # Solo mostrar estadísticas
  --list-s3                # Listar archivos en S3
  --help                   # Mostrar esta ayuda
`);
  process.exit(0);
}

if (args.includes('--stats')) {
  const booksFolder = process.env.BOOKS_FOLDER || './libros';
  const allBooks = await scanEpubFolder(booksFolder);
  showStats(allBooks);
  process.exit(0);
}

if (args.includes('--list-s3')) {
  const files = await listS3Files();
  console.table(files);
  process.exit(0);
}

if (args.includes('--auto')) {
  process.env.AUTO_CONFIRM = 'true';
}

// Ejecutar función principal
main();