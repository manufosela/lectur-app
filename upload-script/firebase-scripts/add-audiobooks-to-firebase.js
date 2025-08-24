import admin from 'firebase-admin';
import path from 'path';
import dotenv from 'dotenv';
import { initializeFirebase } from '../firebase-manager.js';

dotenv.config();

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

// Lista de audiolibros a procesar
const audiobooks = [
  'Marilena Sommer - El amor es un proceso complicado.mp3',
  'Javier_Esparza_La_cruzada_del_océano_La_gran_aventura_de_la_conquista.m4a',
  'Captivating History - Ciudades de Mesopotamia (2).m4a',
  '40 Ciudades De Papel.mp3',
  '15 El Caso Hartung.mp3',
  'Iris Murdoch. Amigos y amantes.mp3',
  '05 - La tierra en llamas - Bernard Cornwell - Alvaro.mp3',
  '26 Arderás en la tormenta.mp3',
  'J.K. Rowling - 6 - Harry Potter y el Misterio del Príncipe.mp3',
  'Arturo Pérez-Reverte - El italiano.m4a',
  '06 Papel y tinta.mp3',
  'Esposa de mi jefe - es - 1252702-audio-tagged.mp3',
  '72 El Día Que Se Perdió La Cordura.mp3',
  'Anne Jacobs - Reencuentro en la villa de las telas.m4a',
  'Arthur Conan Doyle - El signo de los cuatro.m4a',
  'Carlos Ruiz Zafón - La ciudad de vapor (2).m4a',
  'Emperadores de Roma - Yanabo Navajo.mp3',
  'Rupi Kaur - Todo lo que necesito existe ya en mí.mp3',
  '33 27. REVELACIÓN.mp3',
  'Susan Elizabeth Phillips - Cuando colisionan las estrellas.mp3'
];

async function addAudiobooksToFirebase() {
  console.log('🎧 Añadiendo audiolibros a Firebase Database...');
  
  try {
    for (let i = 0; i < audiobooks.length; i++) {
      const filename = audiobooks[i];
      const { author, title } = parseAudiobookName(filename);
      
      const audiobookData = {
        id: `audiobook_${i + 1}`,
        titulo: title,
        autor: author,
        archivo: filename,
        duracion: "Desconocida", // Se podría extraer con metadata
        fechaSubida: new Date().toISOString(),
        genero: "General",
        descripcion: `Audiolibro: ${title} por ${author}`,
        formato: path.extname(filename).toLowerCase().replace('.', ''),
        tamaño: "Desconocido",
        url: `https://storage.lecturapp.es/audiolibros/${encodeURIComponent(filename)}`
      };
      
      // Subir a Firebase
      await db.ref(`audiolibros/audiobook_${i + 1}`).set(audiobookData);
      
      console.log(`✅ Añadido: ${title} - ${author}`);
    }
    
    console.log(`🎉 ${audiobooks.length} audiolibros añadidos correctamente a Firebase Database`);
    
  } catch (error) {
    console.error('❌ Error añadiendo audiolibros:', error);
  } finally {
    process.exit(0);
  }
}

// Ejecutar el script
addAudiobooksToFirebase();