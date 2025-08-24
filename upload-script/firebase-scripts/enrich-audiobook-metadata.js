import admin from 'firebase-admin';
import dotenv from 'dotenv';
import { initializeFirebase } from '../firebase-manager.js';

dotenv.config();

// Inicializar Firebase Admin
initializeFirebase();
const db = admin.database();

// APIs para obtener metadatos
const GOOGLE_BOOKS_API = 'https://www.googleapis.com/books/v1/volumes';
const OPEN_LIBRARY_API = 'https://openlibrary.org/search.json';

/**
 * Buscar metadatos en Google Books API
 */
async function searchGoogleBooks(title, author) {
  try {
    const query = `${title}${author ? ` inauthor:${author}` : ''}`;
    const url = `${GOOGLE_BOOKS_API}?q=${encodeURIComponent(query)}&maxResults=5`;
    
    console.log(`🔍 Buscando en Google Books: ${query}`);
    
    const response = await fetch(url);
    if (!response.ok) return null;
    
    const data = await response.json();
    if (!data.items || data.items.length === 0) return null;
    
    // Buscar el primer resultado con información útil
    for (const item of data.items) {
      const volumeInfo = item.volumeInfo;
      if (!volumeInfo) continue;
      
      return {
        titulo: volumeInfo.title || title,
        autor: volumeInfo.authors?.[0] || author || 'Autor desconocido',
        descripcion: volumeInfo.description || '',
        genero: volumeInfo.categories?.[0] || 'General',
        fechaPublicacion: volumeInfo.publishedDate || '',
        isbn: volumeInfo.industryIdentifiers?.find(id => id.type === 'ISBN_13')?.identifier || '',
        portada: volumeInfo.imageLinks?.thumbnail?.replace('http:', 'https:') || '',
        idioma: volumeInfo.language || 'es',
        paginas: volumeInfo.pageCount || 0,
        editorial: volumeInfo.publisher || ''
      };
    }
    
    return null;
  } catch (error) {
    console.error('Error en Google Books API:', error.message);
    return null;
  }
}

/**
 * Buscar metadatos en Open Library API
 */
async function searchOpenLibrary(title, author) {
  try {
    const query = `title:"${title}"${author ? ` author:"${author}"` : ''}`;
    const url = `${OPEN_LIBRARY_API}?q=${encodeURIComponent(query)}&limit=5&fields=title,author_name,first_publish_year,isbn,cover_i,subject,language`;
    
    console.log(`🔍 Buscando en Open Library: ${query}`);
    
    const response = await fetch(url);
    if (!response.ok) return null;
    
    const data = await response.json();
    if (!data.docs || data.docs.length === 0) return null;
    
    // Tomar el primer resultado
    const book = data.docs[0];
    
    return {
      titulo: book.title || title,
      autor: book.author_name?.[0] || author || 'Autor desconocido',
      fechaPublicacion: book.first_publish_year || '',
      isbn: book.isbn?.[0] || '',
      portada: book.cover_i ? `https://covers.openlibrary.org/b/id/${book.cover_i}-M.jpg` : '',
      genero: book.subject?.[0] || 'General',
      idioma: book.language?.[0] || 'es'
    };
  } catch (error) {
    console.error('Error en Open Library API:', error.message);
    return null;
  }
}

/**
 * Combinar metadatos de múltiples fuentes
 */
function mergeMetadata(existing, googleData, openLibraryData) {
  return {
    // Mantener datos existentes si están presentes
    id: existing.id,
    titulo: existing.titulo || googleData?.titulo || openLibraryData?.titulo || 'Título desconocido',
    autor: existing.autor || googleData?.autor || openLibraryData?.autor || 'Autor desconocido',
    archivo: existing.archivo,
    url: existing.url,
    
    // Nuevos metadatos enriquecidos
    descripcion: existing.descripcion || googleData?.descripcion || 'Sin descripción disponible',
    genero: existing.genero === 'General' ? (googleData?.genero || openLibraryData?.genero || 'General') : existing.genero,
    fechaPublicacion: existing.fechaPublicacion || googleData?.fechaPublicacion || openLibraryData?.fechaPublicacion || '',
    isbn: existing.isbn || googleData?.isbn || openLibraryData?.isbn || '',
    portada: existing.portada || googleData?.portada || openLibraryData?.portada || '',
    idioma: existing.idioma || googleData?.idioma || openLibraryData?.idioma || 'es',
    editorial: existing.editorial || googleData?.editorial || '',
    paginas: existing.paginas || googleData?.paginas || 0,
    
    // Metadatos específicos de audiolibros
    narrador: existing.narrador || 'Narrador desconocido',
    duracion: existing.duracion || 'Duración desconocida',
    formato: existing.formato,
    tamaño: existing.tamaño,
    fechaSubida: existing.fechaSubida,
    
    // Timestamps
    fechaActualizacion: new Date().toISOString(),
    metadatosEnriquecidos: true
  };
}

/**
 * Procesar un audiolibro y enriquecer metadatos
 */
async function enrichAudiobook(audiobookId, audiobookData) {
  console.log(`\n📚 Procesando: ${audiobookData.titulo}`);
  
  // Si ya tiene metadatos enriquecidos, saltar
  if (audiobookData.metadatosEnriquecidos) {
    console.log(`⏭️ Ya tiene metadatos enriquecidos, saltando...`);
    return audiobookData;
  }
  
  // Extraer título y autor limpio
  const title = audiobookData.titulo;
  const author = audiobookData.autor !== 'Autor desconocido' ? audiobookData.autor : null;
  
  // Buscar en APIs
  const googleData = await searchGoogleBooks(title, author);
  const openLibraryData = await searchOpenLibrary(title, author);
  
  // Delay para no saturar las APIs
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Combinar metadatos
  const enrichedData = mergeMetadata(audiobookData, googleData, openLibraryData);
  
  console.log(`✅ Metadatos enriquecidos:`);
  console.log(`   - Género: ${enrichedData.genero}`);
  console.log(`   - Descripción: ${enrichedData.descripcion ? 'Sí' : 'No'}`);
  console.log(`   - Portada: ${enrichedData.portada ? 'Sí' : 'No'}`);
  console.log(`   - ISBN: ${enrichedData.isbn || 'No'}`);
  
  return enrichedData;
}

/**
 * Función principal
 */
async function enrichAllAudiobooks() {
  try {
    console.log('🚀 Iniciando enriquecimiento de metadatos de audiolibros...\n');
    
    // Obtener todos los audiolibros
    const snapshot = await db.ref('audiolibros').once('value');
    
    if (!snapshot.exists()) {
      console.log('❌ No se encontraron audiolibros en Firebase Database');
      return;
    }
    
    const audiobooks = snapshot.val();
    const audiobookIds = Object.keys(audiobooks);
    
    console.log(`📊 Encontrados ${audiobookIds.length} audiolibros para procesar\n`);
    
    let processed = 0;
    let enriched = 0;
    let errors = 0;
    
    for (const audiobookId of audiobookIds) {
      try {
        const originalData = audiobooks[audiobookId];
        const enrichedData = await enrichAudiobook(audiobookId, originalData);
        
        // Actualizar en Firebase
        await db.ref(`audiolibros/${audiobookId}`).set(enrichedData);
        
        processed++;
        if (enrichedData.metadatosEnriquecidos && !originalData.metadatosEnriquecidos) {
          enriched++;
        }
        
        console.log(`📈 Progreso: ${processed}/${audiobookIds.length} (${enriched} enriquecidos, ${errors} errores)`);
        
      } catch (error) {
        console.error(`❌ Error procesando ${audiobookId}:`, error.message);
        errors++;
      }
    }
    
    console.log(`\n🎉 ¡Proceso completado!`);
    console.log(`📊 Estadísticas:`);
    console.log(`   - Total procesados: ${processed}`);
    console.log(`   - Nuevos enriquecidos: ${enriched}`);
    console.log(`   - Errores: ${errors}`);
    
    process.exit(0);
    
  } catch (error) {
    console.error('💥 Error fatal:', error);
    process.exit(1);
  }
}

// Ejecutar si es llamado directamente
if (import.meta.url === `file://${process.argv[1]}`) {
  enrichAllAudiobooks();
}

export { enrichAllAudiobooks, enrichAudiobook };