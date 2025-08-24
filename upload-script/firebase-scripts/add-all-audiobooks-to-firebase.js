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
    .replace(/\.(mp3|m4a|wav|flac)$/i, '')
    .replace(/\d+\s*-?\s*/, '') // Remover números al inicio
    .replace(/^\d+\s+/, '') // Remover números al inicio con espacios
    .trim();
}

// Función para extraer autor y título del nombre del archivo
function parseAudiobookName(filename) {
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
    if (parts.length >= 2) {
      author = parts[0].trim();
      title = parts.slice(1).join('. ').trim();
    }
  }
  
  return { author, title };
}

// Función para obtener todos los audiolibros del NAS
async function getAllAudiobooksFromNAS() {
  console.log('🔍 Escaneando todos los audiolibros en el NAS...');
  
  try {
    const command = `ssh manu@192.168.1.7 "find /media/raid5/AUDIOLIBROS -name '*.mp3' -o -name '*.m4a' -o -name '*.wav' -o -name '*.flac'"`;
    const { stdout } = await execAsync(command);
    
    const audiobookPaths = stdout.trim().split('\n').filter(line => line.trim());
    console.log(`📊 Encontrados ${audiobookPaths.length} audiolibros en total`);
    
    return audiobookPaths.map(fullPath => path.basename(fullPath));
  } catch (error) {
    console.error('❌ Error escaneando audiolibros:', error);
    return [];
  }
}

async function addAllAudiobooksToFirebase() {
  console.log('🎧 Añadiendo TODOS los audiolibros a Firebase Database...');
  
  try {
    // Obtener todos los audiolibros del NAS
    const audiobooks = await getAllAudiobooksFromNAS();
    
    if (audiobooks.length === 0) {
      console.log('⚠️ No se encontraron audiolibros');
      return;
    }
    
    console.log(`📚 Procesando ${audiobooks.length} audiolibros...`);
    
    // Limpiar la colección existente
    console.log('🧹 Limpiando audiolibros existentes...');
    await db.ref('audiolibros').remove();
    
    // Procesar en lotes para evitar problemas de memoria
    const batchSize = 50;
    let processed = 0;
    
    for (let i = 0; i < audiobooks.length; i += batchSize) {
      const batch = audiobooks.slice(i, i + batchSize);
      
      console.log(`📦 Procesando lote ${Math.floor(i/batchSize) + 1}/${Math.ceil(audiobooks.length/batchSize)} (${batch.length} audiolibros)`);
      
      const batchPromises = batch.map(async (filename, batchIndex) => {
        const globalIndex = i + batchIndex;
        const { author, title } = parseAudiobookName(filename);
        
        const audiobookData = {
          id: `audiobook_${globalIndex + 1}`,
          titulo: title,
          autor: author,
          archivo: filename,
          duracion: "Desconocida",
          fechaSubida: new Date().toISOString(),
          genero: "General",
          descripcion: `Audiolibro: ${title} por ${author}`,
          formato: path.extname(filename).toLowerCase().replace('.', ''),
          tamaño: "Desconocido",
          url: `https://storage.lecturapp.es/AUDIOLIBROS/${encodeURIComponent(filename)}`
        };
        
        // Subir a Firebase
        await db.ref(`audiolibros/audiobook_${globalIndex + 1}`).set(audiobookData);
        processed++;
        
        if (processed % 10 === 0) {
          console.log(`✅ Procesados ${processed}/${audiobooks.length} audiolibros`);
        }
      });
      
      // Esperar a que termine el lote
      await Promise.all(batchPromises);
      
      // Pequeña pausa entre lotes
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    console.log(`🎉 ${audiobooks.length} audiolibros añadidos correctamente a Firebase Database`);
    console.log(`📊 Total procesados: ${processed}`);
    
  } catch (error) {
    console.error('❌ Error añadiendo audiolibros:', error);
  } finally {
    process.exit(0);
  }
}

// Ejecutar el script
addAllAudiobooksToFirebase();