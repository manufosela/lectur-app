import JSZip from 'jszip';
import xml2js from 'xml2js';
import fs from 'fs';
import path from 'path';

/**
 * Extrae metadatos (título y autor) de un archivo EPUB
 * @param {string} epubPath - Ruta al archivo EPUB
 * @returns {Object} - {title, author, filename}
 */
export async function extractEpubMetadata(epubPath) {
  try {
    console.log(`📖 Procesando: ${path.basename(epubPath)}`);
    
    // Leer el archivo EPUB
    const data = fs.readFileSync(epubPath);
    const zip = new JSZip();
    const epub = await zip.loadAsync(data);
    
    // Leer container.xml para encontrar el archivo OPF
    const containerXml = await epub.file('META-INF/container.xml').async('text');
    const containerResult = await xml2js.parseStringPromise(containerXml);
    const opfPath = containerResult.container.rootfiles[0].rootfile[0].$['full-path'];
    
    // Leer el archivo OPF (metadatos)
    const opfContent = await epub.file(opfPath).async('text');
    const opfResult = await xml2js.parseStringPromise(opfContent);
    
    // Extraer metadatos
    const metadata = opfResult.package.metadata[0];
    
    // Título
    let title = 'Título desconocido';
    if (metadata['dc:title'] && metadata['dc:title'][0]) {
      if (typeof metadata['dc:title'][0] === 'string') {
        title = metadata['dc:title'][0];
      } else if (metadata['dc:title'][0]._) {
        title = metadata['dc:title'][0]._;
      }
    }
    
    // Autor
    let author = 'Autor desconocido';
    if (metadata['dc:creator'] && metadata['dc:creator'][0]) {
      if (typeof metadata['dc:creator'][0] === 'string') {
        author = metadata['dc:creator'][0];
      } else if (metadata['dc:creator'][0]._) {
        author = metadata['dc:creator'][0]._;
      }
    }
    
    // Limpiar título y autor
    title = cleanText(title);
    author = cleanText(author);
    
    const filename = path.basename(epubPath);
    
    console.log(`✅ Metadatos extraídos:`);
    console.log(`   📚 Título: ${title}`);
    console.log(`   👤 Autor: ${author}`);
    console.log(`   📄 Archivo: ${filename}`);
    
    return {
      title,
      author,
      filename,
      filePath: epubPath
    };
    
  } catch (error) {
    console.error(`❌ Error procesando ${epubPath}:`, error.message);
    
    // Fallback: usar nombre del archivo
    const filename = path.basename(epubPath, '.epub');
    const parts = filename.split(' - ');
    
    return {
      title: parts.length > 1 ? parts[1] : filename,
      author: parts.length > 1 ? parts[0] : 'Autor desconocido',
      filename: path.basename(epubPath),
      filePath: epubPath,
      error: error.message
    };
  }
}

/**
 * Limpia y normaliza texto
 * @param {string} text 
 * @returns {string}
 */
function cleanText(text) {
  if (!text) return 'Desconocido';
  
  return text
    .replace(/\s+/g, ' ')  // Múltiples espacios a uno
    .replace(/[\n\r\t]/g, ' ')  // Saltos de línea a espacios
    .trim()  // Eliminar espacios al inicio y final
    .substring(0, 200);  // Limitar longitud
}

/**
 * Escanea una carpeta y extrae metadatos de todos los EPUB
 * @param {string} folderPath - Ruta a la carpeta con libros
 * @returns {Array} - Array de metadatos
 */
export async function scanEpubFolder(folderPath) {
  try {
    console.log(`📁 Escaneando carpeta: ${folderPath}`);
    
    if (!fs.existsSync(folderPath)) {
      throw new Error(`La carpeta ${folderPath} no existe`);
    }
    
    const files = fs.readdirSync(folderPath);
    const epubFiles = files.filter(file => file.toLowerCase().endsWith('.epub'));
    
    console.log(`📚 Encontrados ${epubFiles.length} archivos EPUB`);
    
    const metadataList = [];
    
    for (const file of epubFiles) {
      const filePath = path.join(folderPath, file);
      const metadata = await extractEpubMetadata(filePath);
      metadataList.push(metadata);
      
      // Pequeña pausa para no sobrecargar
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    return metadataList;
    
  } catch (error) {
    console.error('❌ Error escaneando carpeta:', error.message);
    throw error;
  }
}