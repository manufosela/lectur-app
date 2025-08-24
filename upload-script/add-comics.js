#!/usr/bin/env node

/**
 * Script para añadir cómics organizados por carpetas a Firebase Database
 * Los cómics están en formato CBZ/CBR organizados en carpetas
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import admin from 'firebase-admin';

// Configurar variables de entorno
dotenv.config();

// Para ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configurar Firebase Admin SDK
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      privateKeyId: process.env.FIREBASE_PRIVATE_KEY_ID,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      clientId: process.env.FIREBASE_CLIENT_ID,
    }),
    databaseURL: process.env.FIREBASE_DATABASE_URL
  });
}

const db = admin.database();

// Configuración
const NAS_COMICS_PATH = path.join(process.env.HOME, 'servidorix', 'COMICS'); // Ruta directa al NAS
const COMICS_BASE_PATH = process.env.COMICS_PATH || NAS_COMICS_PATH; // Ruta base de cómics
const STORAGE_BASE_URL = 'https://storage.lecturapp.es/COMICS'; // URL base para servir archivos

console.log(`📂 Usando ruta de cómics: ${COMICS_BASE_PATH}`);
console.log(`🌐 URL base de storage: ${STORAGE_BASE_URL}`);

// Extensiones de cómics soportadas
const COMIC_EXTENSIONS = ['.cbz', '.cbr', '.zip', '.rar'];

/**
 * Verificar si un archivo es un cómic válido
 */
function isComicFile(filename) {
  const ext = path.extname(filename).toLowerCase();
  return COMIC_EXTENSIONS.includes(ext);
}

/**
 * Explorar recursivamente directorios para encontrar cómics
 */
function exploreComicsDirectory(baseDir, relativePath = '') {
  const fullPath = path.join(baseDir, relativePath);
  const structure = {
    folders: {},
    comics: []
  };
  
  try {
    const items = fs.readdirSync(fullPath, { withFileTypes: true });
    
    for (const item of items) {
      if (item.isDirectory()) {
        // Es una carpeta, explorar recursivamente
        const folderPath = path.join(relativePath, item.name);
        console.log(`📁 Explorando carpeta: ${folderPath}`);
        structure.folders[item.name] = exploreComicsDirectory(baseDir, folderPath);
      } else if (item.isFile() && isComicFile(item.name)) {
        // Es un archivo de cómic
        const comicInfo = {
          filename: item.name,
          path: path.join(relativePath, item.name).replace(/\\/g, '/'),
          title: extractComicTitle(item.name),
          series: extractComicSeries(relativePath),
          folder: relativePath || 'root',
          extension: path.extname(item.name).toLowerCase(),
          url: `${STORAGE_BASE_URL}/${path.join(relativePath, item.name).replace(/\\/g, '/')}`
        };
        
        structure.comics.push(comicInfo);
        console.log(`📖 Encontrado cómic: ${comicInfo.title} en ${comicInfo.folder}`);
      }
    }
  } catch (error) {
    console.error(`Error explorando ${fullPath}:`, error.message);
  }
  
  return structure;
}

/**
 * Extraer título del cómic desde el nombre del archivo
 */
function extractComicTitle(filename) {
  let title = path.basename(filename, path.extname(filename));
  
  // Limpiar el nombre
  title = title.replace(/_/g, ' ');
  title = title.replace(/\s+/g, ' ');
  title = title.trim();
  
  // Remover números de volumen/capítulo comunes
  title = title.replace(/\s*[-_]\s*\d+$/, '');
  title = title.replace(/\s*vol\s*\d+/i, '');
  title = title.replace(/\s*cap\s*\d+/i, '');
  title = title.replace(/\s*#\d+/i, '');
  
  return title || filename;
}

/**
 * Extraer serie del cómic desde la ruta de la carpeta
 */
function extractComicSeries(folderPath) {
  if (!folderPath) return 'Sin serie';
  
  // Usar el último directorio como serie
  const pathParts = folderPath.split('/').filter(p => p);
  return pathParts[pathParts.length - 1] || 'Sin serie';
}

/**
 * Aplanar estructura de cómics para Firebase
 */
function flattenComicsStructure(structure, result = [], currentPath = '') {
  // Añadir cómics de este nivel
  structure.comics.forEach(comic => {
    result.push({
      ...comic,
      fullPath: currentPath ? `${currentPath}/${comic.filename}` : comic.filename
    });
  });
  
  // Procesar subcarpetas
  Object.entries(structure.folders).forEach(([folderName, subStructure]) => {
    const newPath = currentPath ? `${currentPath}/${folderName}` : folderName;
    flattenComicsStructure(subStructure, result, newPath);
  });
  
  return result;
}

/**
 * Guardar estructura de cómics en Firebase
 */
async function saveComicsToFirebase(comicsStructure, flatComics) {
  try {
    console.log('\n📊 Preparando datos para Firebase...');
    
    // Obtener datos actuales de Firebase
    console.log('📥 Obteniendo datos actuales de Firebase...');
    const snapshot = await db.ref().once('value');
    const currentData = snapshot.val() || {};
    
    // Preparar actualizaciones sin sobrescribir datos existentes
    const updates = {};
    
    // 1. Lista plana de cómics (similar a libros/audiolibros)
    const comicsList = flatComics.map(comic => comic.path);
    updates['comics'] = [...(currentData.comics || []), ...comicsList.filter(comic => !(currentData.comics || []).includes(comic))];
    
    // 2. Estructura de carpetas de cómics
    if (!currentData.comicsStructure) {
      updates['comicsStructure'] = comicsStructure;
    } else {
      // Mergear con estructura existente
      updates['comicsStructure'] = {
        ...currentData.comicsStructure,
        ...comicsStructure
      };
    }
    
    // 3. Metadatos de cómics por archivo
    const comicsMetadata = {};
    flatComics.forEach(comic => {
      // Limpiar key para Firebase (no permite . # $ / [ ])
      const key = comic.path
        .replace(/[.#$/\[\]]/g, '|')
        .replace(/\s+/g, '_')
        .replace(/\|+/g, '|');
      
      comicsMetadata[key] = {
        title: comic.title,
        series: comic.series,
        folder: comic.folder,
        extension: comic.extension,
        url: comic.url,
        path: comic.path
      };
    });
    
    if (!currentData.comicsMetadata) {
      updates['comicsMetadata'] = comicsMetadata;
    } else {
      updates['comicsMetadata'] = {
        ...currentData.comicsMetadata,
        ...comicsMetadata
      };
    }
    
    // 4. Índice de cómics por carpeta
    const comicsByFolder = {};
    flatComics.forEach(comic => {
      // Limpiar key de carpeta para Firebase
      const folderKey = comic.folder
        .replace(/[.#$/\[\]]/g, '|')
        .replace(/\s+/g, '_')
        .replace(/\|+/g, '|') || 'root';
        
      if (!comicsByFolder[folderKey]) {
        comicsByFolder[folderKey] = [];
      }
      comicsByFolder[folderKey].push(comic.path);
    });
    
    if (!currentData.comicsByFolder) {
      updates['comicsByFolder'] = comicsByFolder;
    } else {
      Object.entries(comicsByFolder).forEach(([folder, comics]) => {
        updates[`comicsByFolder/${folder}`] = [
          ...(currentData.comicsByFolder?.[folder] || []),
          ...comics.filter(comic => !(currentData.comicsByFolder?.[folder] || []).includes(comic))
        ];
      });
    }
    
    console.log('\n📤 Guardando en Firebase...');
    console.log(`📊 Total de cómics a añadir: ${flatComics.length}`);
    console.log(`📁 Total de carpetas: ${Object.keys(comicsByFolder).length}`);
    
    // Ejecutar actualizaciones
    await db.ref().update(updates);
    
    console.log('\n✅ Cómics añadidos exitosamente a Firebase!');
    console.log('\n📋 Resumen:');
    console.log(`   • Cómics totales: ${updates.comics?.length || 0}`);
    console.log(`   • Carpetas: ${Object.keys(comicsByFolder).length}`);
    console.log(`   • Nuevos cómics añadidos: ${flatComics.length}`);
    
    return {
      totalComics: updates.comics?.length || 0,
      newComics: flatComics.length,
      folders: Object.keys(comicsByFolder).length
    };
    
  } catch (error) {
    console.error('❌ Error guardando en Firebase:', error);
    throw error;
  }
}

/**
 * Función principal
 */
async function main() {
  console.log('🚀 Iniciando exploración de cómics...');
  console.log(`📂 Directorio base: ${COMICS_BASE_PATH}`);
  
  // Verificar si el directorio existe
  if (!fs.existsSync(COMICS_BASE_PATH)) {
    console.error(`❌ El directorio ${COMICS_BASE_PATH} no existe`);
    console.log('💡 Opciones para continuar:');
    console.log('   1. Montar el NAS en /mnt/nas/COMICS');
    console.log('   2. Usar variable COMICS_PATH: export COMICS_PATH=/tu/ruta/comics');
    console.log('   3. Crear directorio de prueba local');
    
    // Para testing, crear directorio local
    const testDir = path.join(__dirname, 'test-comics');
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
      fs.mkdirSync(path.join(testDir, 'Marvel'), { recursive: true });
      fs.mkdirSync(path.join(testDir, 'DC Comics'), { recursive: true });
      fs.mkdirSync(path.join(testDir, 'Manga'), { recursive: true });
      
      // Crear archivos de ejemplo
      fs.writeFileSync(path.join(testDir, 'Marvel', 'Spider-Man Vol 1.cbz'), 'ejemplo');
      fs.writeFileSync(path.join(testDir, 'DC Comics', 'Batman Vol 1.cbr'), 'ejemplo');
      fs.writeFileSync(path.join(testDir, 'Manga', 'One Piece Vol 1.cbz'), 'ejemplo');
      
      console.log(`📁 Directorio de prueba creado: ${testDir}`);
      console.log('💡 Ejecuta de nuevo usando: COMICS_PATH=upload-script/test-comics npm run add-comics-auto');
      return;
    } else {
      console.log(`📁 Usando directorio de prueba existente: ${testDir}`);
      // Actualizar COMICS_BASE_PATH para usar el directorio de prueba
      process.env.COMICS_PATH = testDir;
    }
  }
  
  try {
    // Explorar estructura de cómics
    console.log('\n🔍 Explorando estructura de cómics...');
    const comicsStructure = exploreComicsDirectory(COMICS_BASE_PATH);
    
    // Aplanar para Firebase
    const flatComics = flattenComicsStructure(comicsStructure);
    
    console.log(`\n📊 Resumen de exploración:`);
    console.log(`   • Total de cómics encontrados: ${flatComics.length}`);
    
    if (flatComics.length === 0) {
      console.log('⚠️ No se encontraron cómics. Verifica la ruta y los archivos.');
      return;
    }
    
    // Mostrar algunos ejemplos
    console.log('\n📖 Ejemplos de cómics encontrados:');
    flatComics.slice(0, 5).forEach(comic => {
      console.log(`   • ${comic.series} - ${comic.title} (${comic.folder})`);
    });
    
    if (flatComics.length > 5) {
      console.log(`   ... y ${flatComics.length - 5} más`);
    }
    
    // Confirmar antes de guardar
    console.log('\n❓ ¿Continuar con la carga a Firebase? (y/N)');
    
    // En modo automático para el script
    const shouldContinue = process.argv.includes('--auto') || process.argv.includes('-y');
    
    if (!shouldContinue) {
      console.log('💡 Usa --auto o -y para ejecutar automáticamente');
      console.log('🔍 Para probar: node add-comics.js --dry-run');
      return;
    }
    
    // Guardar en Firebase
    const result = await saveComicsToFirebase(comicsStructure, flatComics);
    
    console.log('\n🎉 ¡Proceso completado exitosamente!');
    
  } catch (error) {
    console.error('❌ Error en el proceso:', error);
    process.exit(1);
  }
}

// Ejecutar si es llamado directamente
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export {
  exploreComicsDirectory,
  saveComicsToFirebase,
  extractComicTitle,
  extractComicSeries
};