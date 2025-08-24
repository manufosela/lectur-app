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

// Función para limpiar nombres de archivo
function cleanFileName(filename) {
  return filename
    .replace(/\.epub$/i, '')
    .replace(/\d+\s*-?\s*/, '') // Remover números al inicio
    .replace(/^[\d\s-]+/, '') // Remover números, espacios y guiones al inicio
    .trim();
}

// Función para extraer autor y título del nombre del archivo
function parseBookName(filename) {
  const cleanName = cleanFileName(filename);
  
  // Intentar varios patrones para separar autor y título
  let author = 'Autor Desconocido';
  let title = cleanName;
  
  // Patrón: "Autor - Título"
  if (cleanName.includes(' - ')) {
    const parts = cleanName.split(' - ');
    if (parts.length >= 2) {
      author = parts[0].trim();
      title = parts.slice(1).join(' - ').trim();
    }
  }
  // Patrón: "Autor. Título"
  else if (cleanName.includes('. ')) {
    const parts = cleanName.split('. ');
    if (parts.length >= 2 && parts[0].length < 50) { // Solo si el autor parece razonable
      author = parts[0].trim();
      title = parts.slice(1).join('. ').trim();
    }
  }
  // Patrón: "Autor_Título" o "Autor-Título"
  else if (cleanName.includes('_') || cleanName.includes('-')) {
    const separator = cleanName.includes('_') ? '_' : '-';
    const parts = cleanName.split(separator);
    if (parts.length >= 2 && parts[0].length < 50) {
      author = parts[0].trim();
      title = parts.slice(1).join(separator).trim();
    }
  }
  
  return { author, title };
}

// Función para obtener todos los libros del NAS
async function getAllBooksFromNAS() {
  console.log('🔍 Escaneando todos los libros en el NAS...');
  
  try {
    const command = `ssh manu@192.168.1.7 "find /media/raid5/LIBROS -name '*.epub' | wc -l"`;
    const { stdout: countOutput } = await execAsync(command);
    const totalCount = parseInt(countOutput.trim());
    
    console.log(`📊 Encontrados ${totalCount} libros en total`);
    
    // Usar find con exec para procesar por lotes
    const booksCommand = `ssh manu@192.168.1.7 "find /media/raid5/LIBROS -name '*.epub' -exec basename {} \\;"`;
    const { stdout } = await execAsync(booksCommand, { maxBuffer: 1024 * 1024 * 50 }); // 50MB buffer
    
    const bookPaths = stdout.trim().split('\n').filter(line => line.trim());
    console.log(`📊 Procesados ${bookPaths.length} nombres de archivo`);
    
    return bookPaths;
  } catch (error) {
    console.error('❌ Error escaneando libros:', error);
    return [];
  }
}

async function addAllBooksToFirebase() {
  console.log('📚 Añadiendo TODOS los libros a Firebase Database...');
  
  try {
    // Obtener todos los libros del NAS
    const books = await getAllBooksFromNAS();
    
    if (books.length === 0) {
      console.log('⚠️ No se encontraron libros');
      return;
    }
    
    console.log(`📖 Procesando ${books.length} libros...`);
    
    // Limpiar la colección existente
    console.log('🧹 Limpiando libros existentes...');
    await db.ref('libros').remove();
    
    // Procesar en lotes para evitar problemas de memoria
    const batchSize = 50;
    let processed = 0;
    
    for (let i = 0; i < books.length; i += batchSize) {
      const batch = books.slice(i, i + batchSize);
      
      console.log(`📦 Procesando lote ${Math.floor(i/batchSize) + 1}/${Math.ceil(books.length/batchSize)} (${batch.length} libros)`);
      
      const batchPromises = batch.map(async (filename, batchIndex) => {
        const globalIndex = i + batchIndex;
        const { author, title } = parseBookName(filename);
        
        const bookData = {
          id: `book_${globalIndex + 1}`,
          titulo: title,
          autor: author,
          archivo: filename,
          fechaSubida: new Date().toISOString(),
          genero: "General",
          descripcion: `Libro: ${title} por ${author}`,
          formato: "epub",
          tamaño: "Desconocido",
          url: `https://storage.lecturapp.es/LIBROS/${encodeURIComponent(filename)}`
        };
        
        // Subir a Firebase
        await db.ref(`libros/book_${globalIndex + 1}`).set(bookData);
        processed++;
        
        if (processed % 10 === 0) {
          console.log(`✅ Procesados ${processed}/${books.length} libros`);
        }
      });
      
      // Esperar a que termine el lote
      await Promise.all(batchPromises);
      
      // Pequeña pausa entre lotes
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    console.log(`🎉 ${books.length} libros añadidos correctamente a Firebase Database`);
    console.log(`📊 Total procesados: ${processed}`);
    
  } catch (error) {
    console.error('❌ Error añadiendo libros:', error);
  } finally {
    process.exit(0);
  }
}

// Ejecutar el script
addAllBooksToFirebase();