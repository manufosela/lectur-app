// TODO: All audio fetching must go exclusively through downloadProtectedFile()
/**
 * Reproductor de audiolibros para LecturAPP
 * Incluye controles avanzados, guardado de progreso y gestión de historial
 *
 * Firebase solo se usa para historial de escucha
 */

import {
  auth,
  saveAudiobookProgressToFirebase,
  getAudiobookHistoryFromFirebase
} from './firebase-config.js';

import { downloadProtectedFile } from './modules/protected-download.js';
import { contentService } from './modules/content.js';

// Variables globales
let currentAudiobook = null;
let audioElement = null;
let audiobooksList = [];
let currentUser = null;
let progressSaveInterval = null;
let sleepTimer = null;
let isPlaying = false;
let isDragging = false;

// Configuración
const SAVE_INTERVAL = 5 * 60 * 1000; // 5 minutos en milisegundos
const REWIND_SECONDS = 30;
const FORWARD_SECONDS = 30;

// Detectar usuario actual
auth.onAuthStateChanged((user) => {
  currentUser = user;
  if (user) {
    document.getElementById('user-email').textContent = user.email;
    initializeAudiobook();
    loadAudiobooks();
    loadListeningHistory();
  } else {
    window.location.href = '/';
  }
});

/**
 * Inicializar reproductor de audio
 */
function initializeAudiobook() {
  audioElement = document.getElementById('audio-element');
  if (!audioElement) return;
  
  // Event listeners del elemento de audio
  audioElement.addEventListener('loadedmetadata', onAudioLoaded);
  audioElement.addEventListener('timeupdate', onTimeUpdate);
  audioElement.addEventListener('ended', onAudioEnded);
  audioElement.addEventListener('error', onAudioError);
  audioElement.addEventListener('canplay', onCanPlay);
  audioElement.addEventListener('waiting', onWaiting);
  
  // Event listeners adicionales para controlar el estado de reproducción
  audioElement.addEventListener('play', () => {
    console.log('🎵 Evento "play" detectado');
    isPlaying = true;
    updatePlayPauseIcon();
  });
  
  audioElement.addEventListener('pause', () => {
    console.log('⏸️ Evento "pause" detectado');
    isPlaying = false;
    updatePlayPauseIcon();
  });
  
  // Inicializar controles
  setupAudioControls();
}

/**
 * Configurar controles de audio
 */
function setupAudioControls() {
  // Play/Pause
  const playPauseBtn = document.getElementById('play-pause');
  if (playPauseBtn) {
    playPauseBtn.addEventListener('click', togglePlayPause);
  }
  
  // Avance/retroceso
  const rewindBtn = document.getElementById('rewind');
  const forwardBtn = document.getElementById('forward');
  if (rewindBtn) rewindBtn.addEventListener('click', () => skipTime(-REWIND_SECONDS));
  if (forwardBtn) forwardBtn.addEventListener('click', () => skipTime(FORWARD_SECONDS));
  
  // Velocidad de reproducción
  const speedSelect = document.getElementById('playback-speed');
  if (speedSelect) {
    speedSelect.addEventListener('change', (e) => {
      if (audioElement) {
        audioElement.playbackRate = parseFloat(e.target.value);
      }
    });
  }
  
  // Control de volumen
  const volumeSlider = document.getElementById('volume-slider');
  if (volumeSlider) {
    volumeSlider.addEventListener('input', (e) => {
      if (audioElement) {
        audioElement.volume = parseFloat(e.target.value);
      }
    });
  }
  
  // Barra de progreso
  setupProgressBar();
  
  // Sleep timer
  const sleepTimerBtn = document.getElementById('sleep-timer');
  if (sleepTimerBtn) {
    sleepTimerBtn.addEventListener('click', toggleSleepTimer);
  }
  
  // Minimizar/cerrar reproductor
  const minimizeBtn = document.getElementById('minimize-player');
  const closeBtn = document.getElementById('close-player');
  if (minimizeBtn) minimizeBtn.addEventListener('click', minimizePlayer);
  if (closeBtn) closeBtn.addEventListener('click', closePlayer);
}

/**
 * Configurar barra de progreso
 */
function setupProgressBar() {
  const progressBar = document.getElementById('progress-bar');
  const progressHandle = document.getElementById('progress-handle');
  
  if (!progressBar || !progressHandle) return;
  
  // Click en la barra
  progressBar.addEventListener('click', (e) => {
    if (!audioElement || !audioElement.duration) return;
    
    const rect = progressBar.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    const newTime = percent * audioElement.duration;
    
    seekToTime(newTime);
  });
  
  // Arrastrar el handle
  let startX = 0;
  let startTime = 0;
  
  progressHandle.addEventListener('mousedown', (e) => {
    isDragging = true;
    startX = e.clientX;
    startTime = audioElement ? audioElement.currentTime : 0;
    progressHandle.classList.add('dragging');
    document.addEventListener('mousemove', onProgressDrag);
    document.addEventListener('mouseup', onProgressDragEnd);
  });
  
  function onProgressDrag(e) {
    if (!isDragging || !audioElement || !audioElement.duration) return;
    
    const rect = progressBar.getBoundingClientRect();
    const deltaX = e.clientX - startX;
    const deltaPercent = deltaX / rect.width;
    const deltaTime = deltaPercent * audioElement.duration;
    const newTime = Math.max(0, Math.min(audioElement.duration, startTime + deltaTime));
    
    updateProgressDisplay(newTime, audioElement.duration);
  }
  
  function onProgressDragEnd(e) {
    if (!isDragging) return;
    
    isDragging = false;
    progressHandle.classList.remove('dragging');
    document.removeEventListener('mousemove', onProgressDrag);
    document.removeEventListener('mouseup', onProgressDragEnd);
    
    if (audioElement && audioElement.duration) {
      const rect = progressBar.getBoundingClientRect();
      const deltaX = e.clientX - startX;
      const deltaPercent = deltaX / rect.width;
      const deltaTime = deltaPercent * audioElement.duration;
      const newTime = Math.max(0, Math.min(audioElement.duration, startTime + deltaTime));
      
      seekToTime(newTime);
    }
  }
}

/**
 * Cargar lista de audiolibros desde el catálogo del NAS
 */
async function loadAudiobooks() {
  try {
    showLoader(true);

    // Cargar solo el catálogo de audiolibros (no todos los catálogos)
    await contentService.loadContentType('audiobooks');

    // Obtener lista de audiolibros del contentService
    audiobooksList = contentService.getAudiobooks();
    const counts = contentService.getContentCounts();

    // Actualizar contador
    const audiobooksCount = document.getElementById('header-num-audiobooks');
    if (audiobooksCount) {
      audiobooksCount.textContent = counts.audiobooks;
      console.log(`🎧 Catálogo cargado: ${counts.audiobooks} audiolibros`);
    }

    // Mostrar audiolibros en la galería
    displayAudiobooks(audiobooksList);

    showLoader(false);
  } catch (error) {
    console.error('Error cargando audiolibros:', error);
    showLoader(false);
  }
}

/**
 * Mostrar audiolibros en tabla compacta
 */
function displayAudiobooks(audiobooks) {
  const container = document.getElementById('audiobooks');
  const resultsCount = document.getElementById('num-audiobooks-results');

  if (!container) return;

  // Actualizar contador de resultados
  if (resultsCount) {
    resultsCount.textContent = `${audiobooks.length} audiolibros encontrados`;
  }

  if (audiobooks.length === 0) {
    container.innerHTML = `
      <div class="initial-message">
        <h3>🎧 No hay audiolibros disponibles</h3>
        <p>Los audiolibros aparecerán aquí cuando se añadan a la biblioteca</p>
        <p class="audiobook-count">Total: 0 audiolibros</p>
      </div>
    `;
    return;
  }

  // Crear tabla compacta como la de libros
  container.innerHTML = `
    <table class="audiobooks-table">
      <thead>
        <tr>
          <th style="width: 2rem;">🎧</th>
          <th>Título</th>
          <th>Autor</th>
          <th>Narrador</th>
          <th style="width: 8rem;">Duración</th>
          <th style="width: 9rem;">Acciones</th>
        </tr>
      </thead>
      <tbody>
        ${audiobooks.map(audiobook => {
          // Soportar tanto formato catálogo NAS (name, fullRelpath) como formato legacy (archivo, titulo)
          const fileName = audiobook.name || audiobook.archivo || audiobook.path || audiobook;
          const filePath = audiobook.fullRelpath || audiobook.relpath || fileName;
          const originalTitle = audiobook.titulo || audiobook.title || extractTitle(fileName);
          const originalAuthor = audiobook.autor || audiobook.author || 'Desconocido';

          // Normalizar metadatos si parece ser un nombre de archivo crudo
          let displayTitle = originalTitle;
          let displayAuthor = originalAuthor;

          if (originalTitle === extractTitle(fileName) && (originalTitle.includes('_') || originalTitle.match(/\d+\s*[-_]/))) {
            const normalized = normalizeAudiobookMetadata(originalTitle);
            displayTitle = normalized.title;
            displayAuthor = normalized.author !== 'Autor desconocido' ? normalized.author : originalAuthor;
          }

          return `
            <tr class="audiobook-row" data-path="${filePath}">
              <td class="audiobook-icon">🎧</td>
              <td class="audiobook-title">
                <span class="clickable-title" title="${displayTitle}">
                  ${displayTitle}
                </span>
              </td>
              <td class="audiobook-author">${displayAuthor}</td>
              <td class="audiobook-narrator">${audiobook.narrator || 'Desconocido'}</td>
              <td class="audiobook-duration">${audiobook.duracion || audiobook.duration || 'N/A'}</td>
              <td class="audiobook-action">
                <button class="play-btn" onclick="playAudiobook('${filePath}')" title="Reproducir">
                  ▶
                </button>
                <button class="info-btn" onclick="showAudiobookInfo('${filePath}')" title="Información">
                  ℹ️
                </button>
              </td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>
  `;

  // Añadir event listeners a los títulos clicables
  document.querySelectorAll('.clickable-title').forEach(title => {
    title.addEventListener('click', (e) => {
      const row = e.target.closest('.audiobook-row');
      if (row) {
        playAudiobook(row.dataset.path);
      }
    });
  });
}

/**
 * Reproducir audiolibro directamente (cargar y reproducir automáticamente)
 */
async function playAudiobook(audiobookPath) {
  await openAudiobook(audiobookPath);
  // Dar un pequeño delay para que se cargue y luego reproducir
  setTimeout(() => {
    if (audioElement && !isPlaying) {
      togglePlayPause();
    }
  }, 500);
}

/**
 * Mostrar información del audiolibro
 */
async function showAudiobookInfo(audiobookPath) {
  try {
    // Buscar el audiolibro en la lista - soportar formato catálogo NAS y legacy
    const audiobook = audiobooksList.find(a => {
      const aPath = a.fullRelpath || a.relpath || a.archivo || a.path || a;
      return aPath === audiobookPath;
    });

    // Extraer nombre de archivo del path
    const fileName = audiobookPath.split('/').pop() || audiobookPath;

    const title = audiobook?.titulo || audiobook?.title || extractTitle(fileName);
    const author = audiobook?.autor || audiobook?.author || 'Autor desconocido';
    const narrator = audiobook?.narrator || 'Narrador desconocido';
    const duration = audiobook?.duracion || audiobook?.duration || 'Duración desconocida';
    const format = fileName.split('.').pop()?.toUpperCase() || 'MP3';

    // Buscar información adicional en servicios externos
    let additionalInfo = '';
    try {
      additionalInfo = await searchAudiobookMetadata(title, author);
    } catch (error) {
      console.log('No se pudo obtener información adicional:', error);
    }

    showAudiobookModal(title, author, narrator, duration, format, additionalInfo, audiobookPath);

  } catch (error) {
    console.error('Error mostrando información:', error);
    showNotification('❌ Error', 'Error al obtener información del audiolibro');
  }
}

/**
 * Normalizar y limpiar nombres de archivos de audiolibros
 * Intenta extraer título y autor de nombres de archivo diversos
 */
function normalizeAudiobookMetadata(filename) {
  let cleanName = filename;
  
  // Quitar extensión
  cleanName = cleanName.replace(/\.(mp3|m4a|ogg|wav)$/i, '');
  
  // Quitar números de capítulo/parte al inicio (ej: "01 - ", "Cap1 ", "Parte 1 ")
  cleanName = cleanName.replace(/^(cap(itulo)?[.\s]*\d+[.\s]*[-_]?\s*|parte[.\s]*\d+[.\s]*[-_]?\s*|\d+[.\s]*[-_]\s*)/i, '');
  
  // Quitar números finales que pueden ser capítulos (ej: " - 01", " Cap 5")
  cleanName = cleanName.replace(/\s*[-_]\s*(cap(itulo)?[.\s]*\d+|\d+)$/i, '');
  
  // Reemplazar guiones bajos y múltiples espacios
  cleanName = cleanName.replace(/_+/g, ' ').replace(/\s+/g, ' ').trim();
  
  let title = '';
  let author = 'Autor desconocido';
  
  // Lista de autores conocidos para mejorar la detección
  const knownAuthors = [
    'Arturo Pérez Reverte', 'Arturo Perez Reverte', 'Isabel Allende', 'Mario Vargas Llosa',
    'Gabriel García Márquez', 'Gabriel Garcia Marquez', 'Julio Cortázar', 'Julio Cortazar',
    'Carlos Ruiz Zafón', 'Carlos Ruiz Zafon', 'Javier Marías', 'Javier Marias',
    'Stephen King', 'J.K. Rowling', 'Dan Brown', 'Paulo Coelho', 'John Grisham',
    'Agatha Christie', 'George Orwell', 'Jane Austen', 'Charles Dickens',
    'Miguel de Cervantes', 'Federico García Lorca', 'Antonio Machado',
    'Benito Pérez Galdós', 'Benito Perez Galdos', 'Pío Baroja', 'Pio Baroja'
  ];
  
  // Función para detectar si una parte parece ser un autor conocido
  function looksLikeKnownAuthor(text) {
    const normalizedText = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return knownAuthors.some(author => {
      const normalizedAuthor = author.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      return normalizedText.includes(normalizedAuthor) || normalizedAuthor.includes(normalizedText);
    });
  }
  
  // Función para detectar si parece un nombre de autor (apellidos + nombre)
  function looksLikeAuthorName(text) {
    // Patrón para "Apellido Apellido Nombre" o "Apellido Nombre"
    return text.match(/^[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+){1,3}$/);
  }
  
  // Intentar detectar autor conocido al inicio
  const words = cleanName.split(/\s+/);
  if (words.length >= 4) {
    // Probar combinaciones de 2-3 palabras iniciales como autor
    for (let i = 2; i <= Math.min(4, words.length - 1); i++) {
      const potentialAuthor = words.slice(0, i).join(' ');
      const potentialTitle = words.slice(i).join(' ');
      
      if (looksLikeKnownAuthor(potentialAuthor) || 
          (looksLikeAuthorName(potentialAuthor) && potentialTitle.length > potentialAuthor.length)) {
        console.log(`📚 Detectado autor conocido: "${potentialAuthor}" -> "${potentialTitle}"`);
        return { title: potentialTitle, author: potentialAuthor };
      }
    }
  }
  
  // Patrones comunes para separar título y autor
  const patterns = [
    // "Título - Autor" o "Título by Autor"
    /^(.+?)\s*[-–]\s*(.+)$/,
    /^(.+?)\s+by\s+(.+)$/i,
    /^(.+?)\s+de\s+(.+)$/i,
    /^(.+?)\s+por\s+(.+)$/i,
    
    // "Autor - Título" (invertido)
    /^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s*[-–]\s*(.+)$/,
    
    // Paréntesis para autor "(Autor)"
    /^(.+?)\s*\((.+?)\)$/,
    
    // Formato con comas "Título, Autor"
    /^(.+?),\s*(.+)$/
  ];
  
  let matched = false;
  
  for (const pattern of patterns) {
    const match = cleanName.match(pattern);
    if (match) {
      // Determinar cuál es título y cuál es autor
      let part1 = match[1].trim();
      let part2 = match[2].trim();
      
      // Si part1 parece ser solo un nombre (apellido, nombre), probablemente sea el autor
      if (part1.match(/^[A-Z][a-z]+,?\s+[A-Z][a-z]+$/) && part2.length > part1.length) {
        author = part1;
        title = part2;
      } else {
        title = part1;
        author = part2;
      }
      
      matched = true;
      break;
    }
  }
  
  // Si no hay coincidencias, usar todo como título
  if (!matched) {
    title = cleanName;
  }
  
  // Limpiar título y autor
  title = title.replace(/^["']|["']$/g, '').trim();
  author = author.replace(/^["']|["']$/g, '').trim();
  
  // Si el autor está vacío o es muy corto, usar "Autor desconocido"
  if (!author || author.length < 3) {
    author = 'Autor desconocido';
  }
  
  // Si el título está vacío, usar el nombre original
  if (!title || title.length < 3) {
    title = filename.replace(/\.(mp3|m4a|ogg|wav)$/i, '');
  }
  
  console.log(`📝 Normalizado: "${filename}" -> Título: "${title}", Autor: "${author}"`);
  
  return { title, author };
}

/**
 * Buscar metadatos adicionales del audiolibro usando múltiples APIs especializadas
 */
async function searchAudiobookMetadata(title, author) {
  // Primero normalizar los metadatos del archivo
  const originalTitle = title;
  const originalAuthor = author;
  
  // Si el título parece ser un nombre de archivo crudo, intentar normalizarlo
  if (title.includes('_') || title.match(/\d+\s*[-_]/)) {
    const normalized = normalizeAudiobookMetadata(title);
    title = normalized.title;
    author = normalized.author !== 'Autor desconocido' ? normalized.author : author;
  }
  
  console.log(`🔍 Buscando metadatos para: "${title}" por ${author}`);
  
  // LibriVox API deshabilitada - requiere proxy backend debido a CORS
  // La API de LibriVox no permite peticiones directas desde el navegador
  // Se necesitaría implementar un endpoint en Firebase Functions para hacer de proxy
  // try {
  //   const libriVoxData = await searchLibriVoxAPI(title, author);
  //   if (libriVoxData) {
  //     console.log('📚 Información encontrada en LibriVox');
  //     return libriVoxData;
  //   }
  // } catch (error) {
  //   console.log('LibriVox API error:', error);
  // }

  // Intentar Open Library API (incluye audiolibros)
  try {
    const openLibraryData = await searchOpenLibraryAPI(title, author);
    if (openLibraryData) {
      console.log('📖 Información encontrada en Open Library');
      return openLibraryData;
    }
  } catch (error) {
    console.log('Open Library API error:', error);
  }

  // Fallback a Google Books API
  try {
    const googleBooksData = await searchGoogleBooksAPI(title, author);
    if (googleBooksData) {
      console.log('🔍 Información encontrada en Google Books');
      return googleBooksData;
    }
  } catch (error) {
    console.log('Google Books API error:', error);
  }
  
  console.log('❌ No se encontró información en ninguna API');
  return null;
}

/**
 * Buscar en LibriVox API (audiolibros gratuitos de dominio público)
 * NOTA: Esta función está deshabilitada debido a CORS. LibriVox no permite
 * peticiones directas desde el navegador. Se necesitaría un proxy backend.
 */
// async function searchLibriVoxAPI(title, author) {
//   try {
//     // LibriVox API para buscar audiolibros
//     const query = encodeURIComponent(`${title} ${author}`);
//     const response = await fetch(`https://librivox.org/api/feed/audiobooks/?title=^${query}&format=json&limit=1`);
//     
//     if (!response.ok) throw new Error(`LibriVox API error: ${response.status}`);
//     
//     const data = await response.json();
//     
//     if (data.books && data.books.length > 0) {
//       const book = data.books[0];
//       return {
//         description: book.description || 'Audiolibro gratuito de dominio público disponible en LibriVox',
//         publishedDate: book.copyright_year || 'Dominio público',
//         publisher: 'LibriVox',
//         categories: book.genres?.map(g => g.name).join(', ') || 'Clásicos',
//         pageCount: 'Audiolibro',
//         language: book.language || 'Inglés',
//         thumbnail: book.url_zip_file ? '/images/audiobook-placeholder.svg' : null,
//         infoLink: book.url_librivox || null,
//         duration: `${book.totaltime || 'Duración variable'}`,
//         narrator: book.readers?.map(r => r.display_name).join(', ') || 'Varios narradores',
//         source: 'LibriVox (Audiolibros gratuitos)'
//       };
//     }
//   } catch (error) {
//     console.log('LibriVox search error:', error);
//   }
//   
//   return null;
// }

/**
 * Buscar en Open Library API (Internet Archive)
 */
async function searchOpenLibraryAPI(title, author) {
  try {
    // Buscar el libro en Open Library
    const query = encodeURIComponent(`${title} ${author}`);
    const searchResponse = await fetch(`https://openlibrary.org/search.json?q=${query}&limit=1`);
    
    if (!searchResponse.ok) throw new Error(`Open Library search error: ${searchResponse.status}`);
    
    const searchData = await searchResponse.json();
    
    if (searchData.docs && searchData.docs.length > 0) {
      const book = searchData.docs[0];
      
      // Intentar obtener más detalles del trabajo
      let workData = null;
      if (book.key) {
        try {
          const workResponse = await fetch(`https://openlibrary.org${book.key}.json`);
          if (workResponse.ok) {
            workData = await workResponse.json();
          }
        } catch (e) {
          console.log('Error obteniendo detalles del trabajo:', e);
        }
      }
      
      return {
        description: workData?.description?.value || workData?.description || book.first_sentence?.[0] || 'Disponible en Open Library',
        publishedDate: book.first_publish_year ? book.first_publish_year.toString() : 'Fecha desconocida',
        publisher: book.publisher?.[0] || 'Open Library',
        categories: book.subject?.slice(0, 3).join(', ') || 'Literatura',
        pageCount: book.number_of_pages_median ? `${book.number_of_pages_median} páginas` : 'No disponible',
        language: book.language?.[0] || 'Inglés',
        thumbnail: book.cover_i ? `https://covers.openlibrary.org/b/id/${book.cover_i}-M.jpg` : null,
        infoLink: `https://openlibrary.org${book.key}`,
        source: 'Open Library (Internet Archive)'
      };
    }
  } catch (error) {
    console.log('Open Library search error:', error);
  }
  
  return null;
}

/**
 * Buscar en Google Books API (fallback)
 */
async function searchGoogleBooksAPI(title, author) {
  try {
    const query = encodeURIComponent(`${title} ${author} audiobook`);
    const response = await fetch(`https://www.googleapis.com/books/v1/volumes?q=${query}&maxResults=1`);
    
    if (!response.ok) throw new Error(`Google Books API error: ${response.status}`);
    
    const data = await response.json();
    
    if (data.items && data.items.length > 0) {
      const book = data.items[0].volumeInfo;
      return {
        description: book.description || 'Sin descripción disponible',
        publishedDate: book.publishedDate || 'Fecha desconocida',
        publisher: book.publisher || 'Editorial desconocida',
        categories: book.categories?.join(', ') || 'Sin categorías',
        pageCount: book.pageCount ? `${book.pageCount} páginas` : 'No disponible',
        language: book.language || 'Idioma desconocido',
        thumbnail: book.imageLinks?.thumbnail || null,
        infoLink: book.infoLink || null,
        source: 'Google Books'
      };
    }
  } catch (error) {
    console.log('Google Books search error:', error);
  }
  
  return null;
}

/**
 * Mostrar modal de información del audiolibro
 */
function showAudiobookModal(title, author, narrator, duration, format, additionalInfo, audiobookPath) {
  const modal = document.getElementById('audiobook-info-modal');
  if (!modal) return;

  // Elementos básicos
  document.getElementById('modal-audiobook-title').textContent = title;
  document.getElementById('modal-audiobook-author').textContent = author;
  document.getElementById('modal-audiobook-narrator').textContent = narrator;
  document.getElementById('modal-audiobook-duration').textContent = duration;
  document.getElementById('modal-audiobook-format').textContent = format;

  // Elementos adicionales
  const additionalInfoEl = document.getElementById('additional-info');
  const coverEl = document.getElementById('modal-audiobook-cover');
  const externalLinkEl = document.getElementById('modal-external-link');

  if (additionalInfo) {
    // Mostrar información adicional
    document.getElementById('modal-published-date').textContent = additionalInfo.publishedDate;
    document.getElementById('modal-publisher').textContent = additionalInfo.publisher;
    document.getElementById('modal-categories').textContent = additionalInfo.categories;
    document.getElementById('modal-language').textContent = additionalInfo.language;
    document.getElementById('modal-description').textContent = additionalInfo.description;
    document.getElementById('modal-source').textContent = additionalInfo.source || 'API externa';

    // Mostrar narradores adicionales si están disponibles (específico de LibriVox)
    const narratorInfoEl = document.getElementById('narrator-info');
    const additionalNarratorsEl = document.getElementById('modal-additional-narrators');
    if (additionalInfo.narrator && additionalInfo.narrator !== narrator) {
      additionalNarratorsEl.textContent = additionalInfo.narrator;
      narratorInfoEl.style.display = 'block';
    } else {
      narratorInfoEl.style.display = 'none';
    }

    if (additionalInfo.thumbnail) {
      coverEl.src = additionalInfo.thumbnail;
    }

    if (additionalInfo.infoLink) {
      externalLinkEl.href = additionalInfo.infoLink;
      externalLinkEl.target = '_blank';
      externalLinkEl.classList.remove('hidden');
    }

    additionalInfoEl.classList.remove('hidden');
  } else {
    // Sin información adicional
    document.getElementById('modal-source').textContent = 'Información local';
    document.getElementById('narrator-info').style.display = 'none';
    additionalInfoEl.classList.add('hidden');
    externalLinkEl.classList.add('hidden');
    coverEl.src = '/images/audiobook-placeholder.svg';
  }

  // Botón de reproducir
  const playBtn = document.getElementById('modal-play-btn');
  playBtn.onclick = () => {
    modal.classList.add('hidden');
    playAudiobook(audiobookPath);
  };

  // Mostrar modal
  modal.classList.remove('hidden');

  // Cerrar modal
  const closeBtn = document.getElementById('close-audiobook-info-modal');
  const closeModal = () => modal.classList.add('hidden');
  
  if (closeBtn) closeBtn.onclick = closeModal;
  
  modal.onclick = (e) => {
    if (e.target === modal) {
      closeModal();
    }
  };
}

/**
 * Extraer título del nombre del archivo
 */
function extractTitle(audiobook) {
  // Si es un objeto, usar la propiedad titulo o archivo
  if (typeof audiobook === 'object' && audiobook !== null) {
    return audiobook.titulo || audiobook.archivo?.replace(/\.(mp3|m4a|m4b|aac|ogg|flac)$/i, '').replace(/[_-]/g, ' ').trim() || 'Título desconocido';
  }
  // Si es un string (filename)
  if (typeof audiobook === 'string') {
    return audiobook
      .replace(/\.(mp3|m4a|m4b|aac|ogg|flac)$/i, '')
      .replace(/[_-]/g, ' ')
      .trim();
  }
  return 'Título desconocido';
}

/**
 * Abrir un audiolibro
 */
async function openAudiobook(audiobookPath) {
  try {
    showLoader(true);
    
    currentAudiobook = {
      path: audiobookPath,
      title: extractTitle(audiobookPath)
    };
    
    // Obtener URL del audiolibro
    const audioUrl = await getAudiobookUrl(audiobookPath);
    
    // Cargar en el elemento de audio
    audioElement.src = audioUrl;
    audioElement.load();
    
    // Actualizar UI del reproductor
    updatePlayerUI();
    
    // Mostrar reproductor
    showPlayer(true);
    
    // Cargar progreso guardado
    await loadSavedProgress();
    
  } catch (error) {
    console.error('Error abriendo audiolibro:', error);
    showNotification('❌ Error', 'Error al abrir el audiolibro: ' + error.message);
    showLoader(false);
  }
}

/**
 * Obtener URL del audiolibro
 */
async function getAudiobookUrl(audiobookPath) {
  console.log('🎵 Descargando audiolibro vía downloadProtectedFile:', audiobookPath);
  const path = audiobookPath?.path || audiobookPath;
  const lowerPath = path?.toLowerCase() || '';
  const relpath = lowerPath.startsWith('audiolibros/') ? path : `audiolibros/${path}`;
  const blob = await downloadProtectedFile(relpath);
  return URL.createObjectURL(blob);
}

/**
 * Actualizar UI del reproductor
 */
function updatePlayerUI() {
  if (!currentAudiobook) return;
  
  const playerTitle = document.getElementById('player-title');
  const playerAuthor = document.getElementById('player-author');
  const playerNarrator = document.getElementById('player-narrator');
  const playerCover = document.getElementById('player-cover');
  
  if (playerTitle) playerTitle.textContent = currentAudiobook.title || 'Título desconocido';
  if (playerAuthor) playerAuthor.textContent = currentAudiobook.author || 'Autor desconocido';
  if (playerNarrator) playerNarrator.textContent = currentAudiobook.narrator || 'Narrador desconocido';
  if (playerCover) playerCover.src = currentAudiobook.cover || '/images/audiobook-placeholder.svg';
}

/**
 * Event handlers del elemento de audio
 */
function onAudioLoaded() {
  showLoader(false);
  updateTimeDisplay();
}

function onTimeUpdate() {
  if (!isDragging && audioElement) {
    updateProgressDisplay(audioElement.currentTime, audioElement.duration);
    updateTimeDisplay();
  }
}

function onAudioEnded() {
  console.log('🏁 Audio terminado');
  isPlaying = false;
  updatePlayPauseIcon();
  saveProgress();
  stopProgressSaveInterval();
}

function onAudioError(e) {
  console.error('Error de audio:', e);
  showLoader(false);
  showNotification('❌ Error', 'Error al cargar el audiolibro');
}

function onCanPlay() {
  showLoader(false);
}

function onWaiting() {
  showLoader(true);
}

/**
 * Controles de reproducción
 */
function togglePlayPause() {
  if (!audioElement) {
    console.error('❌ No hay audioElement disponible');
    return;
  }
  
  console.log('🎵 togglePlayPause llamado, estado actual:', { isPlaying });
  
  if (isPlaying) {
    console.log('⏸️ Pausando audio...');
    audioElement.pause();
    stopProgressSaveInterval();
    saveProgress(); // Guardar al pausar
  } else {
    console.log('▶️ Reproduciendo audio...');
    audioElement.play().then(() => {
      console.log('✅ Audio iniciado correctamente');
      startProgressSaveInterval();
    }).catch(error => {
      console.error('Error al reproducir:', error);
      showNotification('❌ Error', 'Error al reproducir el audiolibro');
    });
  }
  
  // Los event listeners nativos 'play' y 'pause' se encargarán de actualizar isPlaying y el icono
}

function skipTime(seconds) {
  if (!audioElement) return;
  
  const newTime = Math.max(0, Math.min(audioElement.duration || 0, audioElement.currentTime + seconds));
  seekToTime(newTime);
}

function seekToTime(time) {
  if (!audioElement) return;
  
  audioElement.currentTime = time;
  updateProgressDisplay(time, audioElement.duration);
  saveProgress();
}

/**
 * Actualizar elementos de UI
 */
function updatePlayPauseIcon() {
  const playIcon = document.getElementById('play-icon');
  const pauseIcon = document.getElementById('pause-icon');
  
  console.log('🔄 Actualizando icono play/pause:', { isPlaying, playIcon, pauseIcon });
  
  if (playIcon && pauseIcon) {
    playIcon.style.display = isPlaying ? 'none' : 'block';
    pauseIcon.style.display = isPlaying ? 'block' : 'none';
    console.log('✅ Iconos actualizados:', { 
      playDisplay: playIcon.style.display, 
      pauseDisplay: pauseIcon.style.display 
    });
  } else {
    console.error('❌ No se encontraron los elementos play-icon o pause-icon');
  }
}

function updateProgressDisplay(currentTime, duration) {
  if (!duration) return;
  
  const progressFill = document.getElementById('progress-fill');
  const progressHandle = document.getElementById('progress-handle');
  
  const percent = (currentTime / duration) * 100;
  
  if (progressFill) {
    progressFill.style.width = `${percent}%`;
  }
  
  if (progressHandle) {
    progressHandle.style.left = `calc(${percent}% - 9px)`;
  }
}

function updateTimeDisplay() {
  const currentTimeEl = document.getElementById('current-time');
  const totalTimeEl = document.getElementById('total-time');
  
  if (currentTimeEl && audioElement) {
    currentTimeEl.textContent = formatTime(audioElement.currentTime);
  }
  
  if (totalTimeEl && audioElement && audioElement.duration) {
    totalTimeEl.textContent = formatTime(audioElement.duration);
  }
}

/**
 * Formatear tiempo en MM:SS
 */
function formatTime(seconds) {
  if (!seconds || isNaN(seconds)) return '0:00';
  
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}

/**
 * Guardar progreso automáticamente
 */
function startProgressSaveInterval() {
  if (progressSaveInterval) return;
  
  progressSaveInterval = setInterval(() => {
    saveProgress();
  }, SAVE_INTERVAL);
}

function stopProgressSaveInterval() {
  if (progressSaveInterval) {
    clearInterval(progressSaveInterval);
    progressSaveInterval = null;
  }
}

/**
 * Guardar progreso en Firebase
 */
async function saveProgress() {
  if (!currentUser || !currentAudiobook || !audioElement) return;
  
  try {
    await saveAudiobookProgressToFirebase(
      currentUser.email,
      currentAudiobook.path,
      audioElement.currentTime,
      audioElement.duration || 0,
      {
        title: currentAudiobook.title,
        author: currentAudiobook.author,
        narrator: currentAudiobook.narrator,
        cover: currentAudiobook.cover,
        lastPlayed: Date.now()
      }
    );
    
    // Actualizar historial de escucha
    loadListeningHistory();
  } catch (error) {
    console.error('Error guardando progreso:', error);
  }
}

/**
 * Cargar progreso guardado
 */
async function loadSavedProgress() {
  if (!currentUser || !currentAudiobook) return;
  
  try {
    const history = await getAudiobookHistoryFromFirebase(currentUser.email);
    const savedProgress = history[currentAudiobook.path];
    
    if (savedProgress && savedProgress.currentTime > 0 && audioElement) {
      audioElement.currentTime = savedProgress.currentTime;
      updateProgressDisplay(savedProgress.currentTime, audioElement.duration);
    }
  } catch (error) {
    console.error('Error cargando progreso guardado:', error);
  }
}

/**
 * Cargar historial de escucha
 */
async function loadListeningHistory() {
  if (!currentUser) return;
  
  try {
    const history = await getAudiobookHistoryFromFirebase(currentUser.email);
    const historyList = document.getElementById('history-list');
    const historyCount = document.getElementById('history-count');
    
    if (!historyList || !historyCount) return;
    
    const historyArray = Object.entries(history)
      .filter(([path, data]) => data.currentTime > 0 && data.currentTime < data.duration * 0.95)
      .sort(([,a], [,b]) => (b.lastPlayed || 0) - (a.lastPlayed || 0))
      .slice(0, 10);
    
    historyCount.textContent = historyArray.length;
    
    if (historyArray.length === 0) {
      historyList.innerHTML = '<p style="text-align: center; color: var(--text-muted); padding: 1rem;">No hay audiolibros en curso</p>';
      return;
    }
    
    historyList.innerHTML = historyArray.map(([path, data]) => {
      const progress = ((data.currentTime / data.duration) * 100).toFixed(1);
      return `
        <div class="history-item" data-path="${path}">
          <div class="history-info">
            <div class="history-title">${data.title || extractTitle(path)}</div>
            <div class="history-author">${data.author || 'Autor desconocido'}</div>
            <div class="history-progress">${progress}% completado • ${formatTime(data.currentTime)} / ${formatTime(data.duration)}</div>
          </div>
          <button class="continue-btn" title="Continuar escuchando">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polygon points="5,3 19,12 5,21"/>
            </svg>
          </button>
        </div>
      `;
    }).join('');
    
    // Añadir event listeners
    historyList.querySelectorAll('.continue-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const path = btn.closest('.history-item').dataset.path;
        playAudiobook(path);
      });
    });
    
  } catch (error) {
    console.error('Error cargando historial:', error);
  }
}

/**
 * Sleep timer
 */
function toggleSleepTimer() {
  const sleepTimerBtn = document.getElementById('sleep-timer');
  const sleepTimeEl = document.getElementById('sleep-time');
  
  if (sleepTimer) {
    // Cancelar timer existente
    clearTimeout(sleepTimer);
    sleepTimer = null;
    sleepTimerBtn.classList.remove('active');
    if (sleepTimeEl) sleepTimeEl.textContent = '💤';
    showNotification('⏰ Temporizador cancelado', 'El temporizador de sueño ha sido cancelado.');
    return;
  }
  
  // Mostrar modal de selección de tiempo
  showSleepTimerModal();
}

function showSleepTimerModal() {
  const modal = document.getElementById('sleep-timer-modal');
  if (!modal) return;
  
  modal.classList.remove('hidden');
  
  // Event listeners para botones predefinidos
  const timerBtns = document.querySelectorAll('.timer-btn[data-minutes]');
  timerBtns.forEach(btn => {
    btn.onclick = () => {
      const minutes = parseInt(btn.dataset.minutes);
      setSleepTimer(minutes);
      modal.classList.add('hidden');
    };
  });
  
  // Event listener para tiempo personalizado
  const customBtn = document.getElementById('set-custom-timer');
  const customInput = document.getElementById('custom-minutes');
  
  if (customBtn && customInput) {
    customBtn.onclick = () => {
      const minutes = parseInt(customInput.value);
      if (minutes && minutes > 0 && minutes <= 240) {
        setSleepTimer(minutes);
        modal.classList.add('hidden');
        customInput.value = '';
      } else {
        showNotification('⚠️ Tiempo inválido', 'Por favor ingresa un tiempo entre 1 y 240 minutos.');
      }
    };
  }
  
  // Cerrar modal
  const closeBtn = document.getElementById('close-sleep-modal');
  if (closeBtn) {
    closeBtn.onclick = () => modal.classList.add('hidden');
  }
  
  // Cerrar al hacer clic fuera
  modal.onclick = (e) => {
    if (e.target === modal) {
      modal.classList.add('hidden');
    }
  };
}

function setSleepTimer(minutes) {
  const sleepTimerBtn = document.getElementById('sleep-timer');
  const sleepTimeEl = document.getElementById('sleep-time');
  const milliseconds = minutes * 60 * 1000;
  
  sleepTimer = setTimeout(() => {
    if (isPlaying) {
      togglePlayPause();
    }
    sleepTimer = null;
    sleepTimerBtn.classList.remove('active');
    if (sleepTimeEl) sleepTimeEl.textContent = '💤';
    showNotification('😴 Temporizador activado', 'La reproducción se ha pausado automáticamente.');
  }, milliseconds);
  
  sleepTimerBtn.classList.add('active');
  if (sleepTimeEl) sleepTimeEl.textContent = minutes + 'm';
  
  showNotification('⏰ Temporizador configurado', `La reproducción se pausará en ${minutes} minutos.`);
}

function showNotification(title, message) {
  const modal = document.getElementById('notification-modal');
  const titleEl = document.getElementById('notification-title');
  const messageEl = document.getElementById('notification-message');
  const okBtn = document.getElementById('notification-ok');
  const closeBtn = document.getElementById('close-notification-modal');
  
  if (!modal || !titleEl || !messageEl) return;
  
  titleEl.textContent = title;
  messageEl.textContent = message;
  modal.classList.remove('hidden');
  
  // Cerrar modal
  const closeModal = () => modal.classList.add('hidden');
  
  if (okBtn) okBtn.onclick = closeModal;
  if (closeBtn) closeBtn.onclick = closeModal;
  
  // Cerrar al hacer clic fuera
  modal.onclick = (e) => {
    if (e.target === modal) {
      closeModal();
    }
  };
}

/**
 * Controles del reproductor
 */
function minimizePlayer() {
  const player = document.getElementById('audiobook-player');
  if (player) {
    player.classList.toggle('minimized');
  }
}

function closePlayer() {
  if (isPlaying) {
    audioElement.pause();
    isPlaying = false;
  }
  
  stopProgressSaveInterval();
  saveProgress();
  
  const player = document.getElementById('audiobook-player');
  if (player) {
    player.classList.add('hidden');
  }
  
  currentAudiobook = null;
}

/**
 * Mostrar/ocultar componentes
 */
function showPlayer(show) {
  const player = document.getElementById('audiobook-player');
  if (player) {
    player.classList.toggle('hidden', !show);
  }
}

function showLoader(show) {
  const overlay = document.getElementById('audiobook-overlay');
  if (overlay) {
    overlay.classList.toggle('hidden', !show);
  }
}

/**
 * Búsqueda de audiolibros
 */
function searchAudiobooks(query) {
  const filtered = audiobooksList.filter(audiobook => {
    // Soportar formato catálogo NAS (name) y formato legacy (titulo, archivo)
    const fileName = audiobook.name || audiobook.archivo || audiobook.path || '';
    const title = (audiobook.titulo || audiobook.title || extractTitle(fileName)).toLowerCase();
    const author = (audiobook.autor || audiobook.author || '').toLowerCase();
    const narrator = (audiobook.narrator || '').toLowerCase();
    const searchTerm = query.toLowerCase();

    return title.includes(searchTerm) ||
           author.includes(searchTerm) ||
           narrator.includes(searchTerm) ||
           fileName.toLowerCase().includes(searchTerm);
  });

  displayAudiobooks(filtered);
}

/**
 * Funciones del sistema de temas (igual que app.js)
 */
function getCurrentTheme() {
  return document.documentElement.hasAttribute('data-theme') ? 'dark' : 'light';
}

function applyTheme(theme) {
  const body = document.body;
  const html = document.documentElement;
  
  if (theme === 'dark') {
    html.setAttribute('data-theme', 'dark');
    body.setAttribute('data-theme', 'dark');
  } else {
    html.removeAttribute('data-theme');
    body.removeAttribute('data-theme');
  }
}

function setStoredTheme(theme) {
  try {
    localStorage.setItem('lectur-app-theme', theme);
  } catch (error) {
    console.warn('Error guardando tema en localStorage:', error);
  }
}

function initializeTheme() {
  try {
    const storedTheme = localStorage.getItem('lectur-app-theme') || 'light';
    applyTheme(storedTheme);
  } catch (error) {
    console.warn('Error cargando tema de localStorage:', error);
    applyTheme('light');
  }
}

// Event listeners iniciales
document.addEventListener('DOMContentLoaded', () => {
  // Inicializar tema
  initializeTheme();
  // Búsqueda
  document.getElementById('search-audiobooks')?.addEventListener('input', (e) => {
    searchAudiobooks(e.target.value);
  });
  
  // Volver al menú
  document.getElementById('back-to-menu')?.addEventListener('click', () => {
    if (isPlaying) {
      saveProgress();
    }
    window.location.href = '/';
  });
  
  // Logout
  document.getElementById('logout-btn')?.addEventListener('click', () => {
    if (isPlaying) {
      saveProgress();
    }
    auth.signOut();
  });
  
  // Theme toggle (usando el mismo sistema que la app principal)
  document.getElementById('theme-toggle')?.addEventListener('click', () => {
    const currentTheme = getCurrentTheme();
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    
    applyTheme(newTheme);
    setStoredTheme(newTheme);
  });
  
  // Event listener para logo clicable - volver al inicio
  const clickableLogo = document.querySelector('.clickable-logo');
  if (clickableLogo) {
    clickableLogo.addEventListener('click', () => {
      if (isPlaying) {
        saveProgress();
      }
      window.location.href = '/';
    });
  }
  
  // Event listeners para el historial desplegable
  const historyToggle = document.getElementById('history-toggle');
  const historyDropdown = document.getElementById('history-dropdown');
  const historyArrow = document.getElementById('history-arrow');
  const closeHistory = document.getElementById('close-history');
  
  if (historyToggle && historyDropdown && historyArrow) {
    historyToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      const isHidden = historyDropdown.classList.contains('hidden');
      
      if (isHidden) {
        historyDropdown.classList.remove('hidden');
        historyArrow.classList.add('rotated');
      } else {
        historyDropdown.classList.add('hidden');
        historyArrow.classList.remove('rotated');
      }
    });
    
    // Cerrar dropdown al hacer clic fuera
    document.addEventListener('click', (e) => {
      if (!historyToggle.contains(e.target) && !historyDropdown.contains(e.target)) {
        historyDropdown.classList.add('hidden');
        historyArrow.classList.remove('rotated');
      }
    });
  }
  
  if (closeHistory && historyDropdown && historyArrow) {
    closeHistory.addEventListener('click', () => {
      historyDropdown.classList.add('hidden');
      historyArrow.classList.remove('rotated');
    });
  }
  
  // Atajos de teclado
  document.addEventListener('keydown', (e) => {
    if (document.getElementById('audiobook-player')?.classList.contains('hidden')) return;
    
    switch(e.key) {
      case ' ':
        e.preventDefault();
        togglePlayPause();
        break;
      case 'ArrowLeft':
        skipTime(-REWIND_SECONDS);
        break;
      case 'ArrowRight':
        skipTime(FORWARD_SECONDS);
        break;
      case 'Escape':
        closePlayer();
        break;
    }
  });
});

// Exportar funciones para debugging
window.audiobookPlayer = {
  openAudiobook,
  togglePlayPause,
  skipTime,
  closePlayer,
  saveProgress
};

// Hacer funciones disponibles globalmente
window.openAudiobook = openAudiobook;
window.playAudiobook = playAudiobook;
window.showAudiobookInfo = showAudiobookInfo;
window.normalizeAudiobookMetadata = normalizeAudiobookMetadata; // Para debugging

// Función de testing para probar la normalización
window.testNormalization = function() {
  const examples = [
    "01 - Harry Potter - J.K. Rowling.mp3",
    "Stephen King - The Shining.mp3", 
    "Don Quijote de la Mancha - Miguel de Cervantes.mp3",
    "Arturo Perez Reverte El italiano.mp3",
    "Isabel Allende La casa de los espíritus.mp3",
    "Gabriel García Márquez Cien años de soledad.mp3",
    "¿Arrepentida ¡Jamás!    Tabitha Webb Autor desconocido.mp3",
    "Cap1_El_Nombre_del_Viento_Patrick_Rothfuss.mp3",
    "Orwell, George - 1984.mp3",
    "El Principito (Antoine de Saint-Exupéry).mp3",
    "123_Capitulo_Final.mp3",
    "Cien años de soledad por Gabriel García Márquez.mp3",
    "Jane Austen - Pride and Prejudice.mp3",
    "Carlos Ruiz Zafón La sombra del viento.mp3",
    "Mario Vargas Llosa La ciudad y los perros.mp3"
  ];
  
  console.log("🧪 Probando normalización de nombres de audiolibros:");
  examples.forEach(example => {
    const result = normalizeAudiobookMetadata(example);
    console.log(`📁 "${example}" -> Título: "${result.title}", Autor: "${result.author}"`);
  });
};

// Actualizar año del footer
document.addEventListener('DOMContentLoaded', () => {
  const yearEl = document.getElementById('current-year');
  if (yearEl) {
    yearEl.textContent = new Date().getFullYear();
  }
});
