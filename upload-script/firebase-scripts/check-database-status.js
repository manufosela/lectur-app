import admin from 'firebase-admin';
import dotenv from 'dotenv';
import { initializeFirebase } from '../firebase-manager.js';

dotenv.config();

// Inicializar Firebase Admin usando el sistema existente
initializeFirebase();
const db = admin.database();

async function checkDatabaseStatus() {
  console.log('🔍 Verificando estado actual de Firebase Database...');
  
  try {
    // Verificar libros
    const librosSnapshot = await db.ref('libros').once('value');
    const libros = librosSnapshot.val();
    console.log(`📚 Libros actuales: ${libros ? (Array.isArray(libros) ? libros.length : Object.keys(libros).length) : 0}`);
    
    if (libros) {
      console.log(`   Tipo de datos: ${Array.isArray(libros) ? 'Array' : 'Object'}`);
      if (Array.isArray(libros)) {
        console.log(`   Primeros 3 libros:`, libros.slice(0, 3).map(l => l?.titulo || l));
      } else {
        const keys = Object.keys(libros);
        console.log(`   Primeras 3 claves:`, keys.slice(0, 3));
      }
    }
    
    // Verificar autores
    const autoresSnapshot = await db.ref('autores').once('value');
    const autores = autoresSnapshot.val();
    console.log(`👨‍💼 Autores actuales: ${autores ? (Array.isArray(autores) ? autores.length : Object.keys(autores).length) : 0}`);
    
    // Verificar libros por autor
    const librosPorAutorSnapshot = await db.ref('librosPorAutor').once('value');
    const librosPorAutor = librosPorAutorSnapshot.val();
    console.log(`📖 Libros por autor: ${librosPorAutor ? Object.keys(librosPorAutor).length : 0} autores`);
    
    // Verificar audiolibros
    const audiobooksSnapshot = await db.ref('audiobooks').once('value');
    const audiobooks = audiobooksSnapshot.val();
    console.log(`🎧 Audiolibros actuales: ${audiobooks ? (Array.isArray(audiobooks) ? audiobooks.length : Object.keys(audiobooks).length) : 0}`);
    
  } catch (error) {
    console.error('❌ Error verificando estado:', error);
  } finally {
    process.exit(0);
  }
}

// Ejecutar verificación
checkDatabaseStatus();