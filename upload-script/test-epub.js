#!/usr/bin/env node

import { extractEpubMetadata, scanEpubFolder } from './epub-parser.js';
import path from 'path';

/**
 * Script simple para probar la extracción de metadatos
 */
async function testEpubParsing() {
  try {
    console.log('🧪 PROBANDO EXTRACCIÓN DE METADATOS EPUB');
    console.log('=======================================\\n');
    
    const booksFolder = process.env.BOOKS_FOLDER || './libros';
    
    console.log(`📁 Carpeta de prueba: ${booksFolder}`);
    
    // Escanear carpeta
    const books = await scanEpubFolder(booksFolder);
    
    if (books.length === 0) {
      console.log('❌ No se encontraron archivos EPUB para probar');
      console.log('💡 Crea una carpeta "libros" y coloca algunos archivos EPUB');
      return;
    }
    
    console.log(`\\n📊 RESULTADOS (${books.length} libros):`);
    console.log('=====================================');
    
    books.forEach((book, index) => {
      console.log(`\\n${index + 1}. ${book.filename}`);
      console.log(`   📚 Título: ${book.title}`);
      console.log(`   👤 Autor: ${book.author}`);
      if (book.error) {
        console.log(`   ⚠️  Error: ${book.error}`);
      }
    });
    
    // Estadísticas rápidas
    const authorCount = new Set(books.map(b => b.author)).size;
    const withErrors = books.filter(b => b.error).length;
    
    console.log(`\\n📈 ESTADÍSTICAS:`);
    console.log(`   📚 Total libros: ${books.length}`);
    console.log(`   👥 Autores únicos: ${authorCount}`);
    console.log(`   ✅ Procesados OK: ${books.length - withErrors}`);
    console.log(`   ❌ Con errores: ${withErrors}`);
    
    if (withErrors > 0) {
      console.log(`\\n⚠️  Libros con errores:`);
      books.filter(b => b.error).forEach(book => {
        console.log(`   - ${book.filename}: ${book.error}`);
      });
    }
    
  } catch (error) {
    console.error('❌ Error en la prueba:', error.message);
    process.exit(1);
  }
}

// Ejecutar prueba
testEpubParsing();