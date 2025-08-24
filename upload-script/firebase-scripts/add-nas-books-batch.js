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

async function addNASBooksInBatches() {
  console.log('📚 Añadiendo libros del NAS en lotes sin borrar existentes...');
  
  try {
    // 1. Obtener libros actuales de Firebase (puede ser array o object)
    console.log('🔄 Obteniendo libros actuales de Firebase...');
    const librosSnapshot = await db.ref('libros').once('value');
    const librosData = librosSnapshot.val() || [];
    
    // Convertir a array si es un objeto con claves numéricas
    const existingBooks = Array.isArray(librosData) 
      ? librosData 
      : Object.values(librosData).filter(book => book && typeof book === 'string');
    
    console.log(`📊 Libros existentes en Firebase: ${existingBooks.length}`);
    console.log(`📊 Tipo de datos: ${Array.isArray(librosData) ? 'Array' : 'Object'}`);
    
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
    
    // 5. Añadir libros nuevos en lotes pequeños usando push()
    console.log('💾 Añadiendo libros nuevos en lotes...');
    const BATCH_SIZE = 100;
    let added = 0;
    
    for (let i = 0; i < newBooks.length; i += BATCH_SIZE) {
      const batch = newBooks.slice(i, i + BATCH_SIZE);
      const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(newBooks.length / BATCH_SIZE);
      
      console.log(`📦 Procesando lote ${batchNumber}/${totalBatches} (${batch.length} libros)`);
      
      // Usar transacción para añadir cada libro individualmente
      for (const book of batch) {
        await db.ref('libros').push(book);
        added++;
        
        if (added % 500 === 0) {
          console.log(`   ✅ Añadidos ${added}/${newBooks.length} libros...`);
        }
      }
      
      // Pequeña pausa entre lotes
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    console.log('🎉 ¡Todos los libros del NAS añadidos exitosamente!');
    console.log(`📈 Resumen:`);
    console.log(`   - Libros existentes: ${existingBooks.length}`);
    console.log(`   - Libros nuevos añadidos: ${added}`);
    console.log(`   - Total esperado: ${existingBooks.length + added}`);
    
  } catch (error) {
    console.error('❌ Error añadiendo libros:', error);
  } finally {
    process.exit(0);
  }
}

// Ejecutar el script
addNASBooksInBatches();