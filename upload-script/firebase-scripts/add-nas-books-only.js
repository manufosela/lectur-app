import admin from 'firebase-admin';
import path from 'path';
import dotenv from 'dotenv';
import { initializeFirebase } from '../firebase-manager.js';
import { exec } from 'child_process';
import { promisify } from 'util';

dotenv.config();

const execAsync = promisify(exec);

// Inicializar Firebase Admin usando el sistema existente
initializeFirebase();
const db = admin.database();

// Función para obtener todos los libros del NAS
async function getAllBooksFromNAS() {
  console.log('🔍 Escaneando libros en el NAS...');
  
  try {
    const command = `ssh manu@192.168.1.7 "find /media/raid5/LIBROS -name '*.epub' | wc -l"`;
    const { stdout: countOutput } = await execAsync(command);
    const totalCount = parseInt(countOutput.trim());
    
    console.log(`📊 Encontrados ${totalCount} libros en el NAS`);
    
    // Obtener nombres de archivos
    const booksCommand = `ssh manu@192.168.1.7 "find /media/raid5/LIBROS -name '*.epub' -exec basename {} \\\\;"`;
    const { stdout } = await execAsync(booksCommand, { maxBuffer: 1024 * 1024 * 50 }); // 50MB buffer
    
    const bookPaths = stdout.trim().split('\n').filter(line => line.trim());
    console.log(`📊 Procesados ${bookPaths.length} nombres de archivo`);
    
    return bookPaths;
  } catch (error) {
    console.error('❌ Error escaneando libros:', error);
    return [];
  }
}

async function addNASBooksOnly() {
  console.log('📚 Añadiendo SOLO libros del NAS sin borrar existentes...');
  
  try {
    // 1. Obtener libros actuales de Firebase (como array)
    console.log('🔄 Obteniendo libros actuales de Firebase...');
    const librosSnapshot = await db.ref('libros').once('value');
    const existingBooks = librosSnapshot.val() || [];
    console.log(`📊 Libros existentes en Firebase: ${existingBooks.length}`);
    
    // 2. Obtener libros del NAS
    const nasBooks = await getAllBooksFromNAS();
    if (nasBooks.length === 0) {
      console.log('⚠️ No se encontraron libros en el NAS');
      return;
    }
    
    // 3. Crear un Set con los libros existentes para búsqueda rápida
    const existingBooksSet = new Set(existingBooks);
    console.log(`🔍 Creado set con ${existingBooksSet.size} libros existentes`);
    
    // 4. Filtrar solo libros nuevos del NAS
    const newBooks = nasBooks.filter(book => !existingBooksSet.has(book));
    console.log(`✨ Libros nuevos encontrados: ${newBooks.length}`);
    
    if (newBooks.length === 0) {
      console.log('✅ Todos los libros del NAS ya están en Firebase Database');
      return;
    }
    
    // 5. Mostrar algunos ejemplos de libros nuevos
    console.log('📝 Ejemplos de libros nuevos:');
    newBooks.slice(0, 5).forEach((book, i) => {
      console.log(`   ${i + 1}. ${book}`);
    });
    
    // 6. Combinar listas: existentes + nuevos
    const combinedBooks = [...existingBooks, ...newBooks];
    console.log(`📊 Total después de combinación: ${combinedBooks.length} libros`);
    
    // 7. Guardar la lista combinada
    console.log('💾 Guardando lista combinada...');
    await db.ref('libros').set(combinedBooks);
    
    console.log('🎉 ¡Libros del NAS añadidos exitosamente!');
    console.log(`📈 Resumen:`);
    console.log(`   - Libros existentes: ${existingBooks.length}`);
    console.log(`   - Libros nuevos añadidos: ${newBooks.length}`);
    console.log(`   - Total final: ${combinedBooks.length}`);
    
  } catch (error) {
    console.error('❌ Error añadiendo libros:', error);
  } finally {
    process.exit(0);
  }
}

// Ejecutar el script
addNASBooksOnly();