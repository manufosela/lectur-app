#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { listS3Files } from './s3-manager.js';

dotenv.config();

/**
 * Script para mover archivos del NAS que ya están en S3 a una carpeta /S3
 * 
 * Este script es previo a la subida - organiza primero lo que ya existe
 * para que el script de subida solo procese archivos que realmente faltan.
 */

// Configuración
const NAS_FOLDER = process.env.NAS_BOOKS_FOLDER || '/home/manu/servidorix/LIBROS';
const S3_FOLDER = path.join(NAS_FOLDER, 'S3');
const STATE_FILE = './move-s3-files-state.json';

// Estado global
let state = {
  totalNasFiles: 0,
  s3Files: new Set(),
  movedFiles: 0,
  alreadyInS3Folder: 0,
  notInS3: 0,
  errors: 0,
  startTime: null,
  processedFiles: []
};

/**
 * Crear carpeta S3 si no existe
 */
function ensureS3Folder() {
  if (!fs.existsSync(S3_FOLDER)) {
    fs.mkdirSync(S3_FOLDER, { recursive: true });
    console.log(`✅ Creada carpeta: ${S3_FOLDER}`);
  } else {
    console.log(`📁 Carpeta S3 ya existe: ${S3_FOLDER}`);
  }
}

/**
 * Cargar estado previo
 */
function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const savedState = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
      state = { 
        ...state, 
        ...savedState,
        s3Files: new Set(savedState.s3Files || [])
      };
      console.log(`📊 Estado cargado: ${state.processedFiles.length} archivos procesados`);
    }
  } catch (error) {
    console.log('⚠️  Empezando desde cero');
  }
}

/**
 * Guardar estado
 */
function saveState() {
  try {
    const stateToSave = {
      ...state,
      s3Files: Array.from(state.s3Files)
    };
    fs.writeFileSync(STATE_FILE, JSON.stringify(stateToSave, null, 2));
  } catch (error) {
    console.error('❌ Error guardando estado:', error.message);
  }
}

/**
 * Escanear directorio NAS (excluyendo carpeta S3)
 */
function scanNasDirectory() {
  const files = [];
  
  function walkDirectory(currentDir) {
    try {
      const items = fs.readdirSync(currentDir);
      
      for (const item of items) {
        const fullPath = path.join(currentDir, item);
        
        // Saltar la carpeta S3
        if (fullPath === S3_FOLDER) {
          console.log(`⏭️  Saltando carpeta S3: ${fullPath}`);
          continue;
        }
        
        try {
          const stat = fs.statSync(fullPath);
          
          if (stat.isDirectory()) {
            walkDirectory(fullPath);
          } else if (item.toLowerCase().endsWith('.epub')) {
            files.push({
              name: item,
              fullPath: fullPath,
              size: stat.size,
              relativePath: path.relative(NAS_FOLDER, fullPath)
            });
          }
        } catch (error) {
          console.warn(`⚠️  Error accediendo a ${fullPath}: ${error.message}`);
        }
      }
    } catch (error) {
      console.error(`❌ Error leyendo directorio ${currentDir}: ${error.message}`);
    }
  }
  
  walkDirectory(NAS_FOLDER);
  return files;
}

/**
 * Obtener archivos de S3
 */
async function getS3Files() {
  try {
    console.log('☁️  Obteniendo lista completa de archivos en S3...');
    const s3Files = await listS3Files();
    const fileNames = new Set(s3Files.map(file => file.key));
    console.log(`📊 Archivos en S3: ${fileNames.size}`);
    return fileNames;
  } catch (error) {
    console.error('❌ Error obteniendo archivos S3:', error.message);
    return new Set();
  }
}

/**
 * Mover archivo a carpeta S3
 */
function moveToS3Folder(file) {
  try {
    const destPath = path.join(S3_FOLDER, file.name);
    
    // Verificar si ya existe en destino
    if (fs.existsSync(destPath)) {
      console.log(`   ⚠️  Ya existe en carpeta S3: ${file.name}`);
      state.alreadyInS3Folder++;
      return true;
    }
    
    // Mover archivo
    fs.renameSync(file.fullPath, destPath);
    console.log(`   ✅ Movido a S3: ${file.name}`);
    state.movedFiles++;
    return true;
    
  } catch (error) {
    console.error(`   ❌ Error moviendo ${file.name}: ${error.message}`);
    state.errors++;
    return false;
  }
}

/**
 * Procesar archivos del NAS
 */
function processNasFiles(nasFiles) {
  console.log(`\n🔄 Procesando ${nasFiles.length} archivos del NAS...`);
  
  let processed = 0;
  
  for (const file of nasFiles) {
    processed++;
    console.log(`\n📖 [${processed}/${nasFiles.length}] ${file.name}`);
    
    if (state.s3Files.has(file.name)) {
      console.log(`   ☁️  Existe en S3 - moviendo a carpeta /S3`);
      const moved = moveToS3Folder(file);
      
      if (moved) {
        state.processedFiles.push({
          filename: file.name,
          action: 'moved_to_s3_folder',
          originalPath: file.fullPath
        });
      }
    } else {
      console.log(`   📤 No está en S3 - mantener en NAS para subida posterior`);
      state.notInS3++;
    }
    
    // Guardar estado cada 50 archivos
    if (processed % 50 === 0) {
      saveState();
      console.log(`📊 Progreso: ${processed}/${nasFiles.length} archivos procesados`);
      console.log(`   ✅ Movidos: ${state.movedFiles} | ⏭️  Ya en S3 folder: ${state.alreadyInS3Folder} | 📤 No en S3: ${state.notInS3} | ❌ Errores: ${state.errors}`);
    }
  }
  
  // Guardar estado final
  saveState();
}

/**
 * Generar reporte final
 */
function generateReport() {
  const endTime = new Date().toISOString();
  const duration = state.startTime ? 
    Math.round((new Date(endTime) - new Date(state.startTime)) / 1000) : 0;
  
  console.log('\n🎉 ORGANIZACIÓN COMPLETADA');
  console.log('='.repeat(50));
  console.log(`📊 Estadísticas finales:`);
  console.log(`   📁 Archivos escaneados en NAS: ${state.totalNasFiles}`);
  console.log(`   ☁️  Archivos encontrados en S3: ${state.s3Files.size}`);
  console.log(`   ✅ Archivos movidos a /S3: ${state.movedFiles}`);
  console.log(`   ⏭️  Ya estaban en /S3: ${state.alreadyInS3Folder}`);
  console.log(`   📤 Archivos que NO están en S3: ${state.notInS3}`);
  console.log(`   ❌ Errores: ${state.errors}`);
  console.log(`   ⏰ Duración: ${duration} segundos`);
  
  console.log(`\n📁 Estructura resultante:`);
  console.log(`   📂 Archivos ya en S3: ${S3_FOLDER} (${state.movedFiles + state.alreadyInS3Folder} archivos)`);
  console.log(`   📂 Archivos pendientes de subir: ${NAS_FOLDER} (${state.notInS3} archivos)`);
  
  if (state.notInS3 > 0) {
    console.log(`\n🚀 Siguiente paso:`);
    console.log(`   Ejecutar script de subida para los ${state.notInS3} archivos restantes`);
    console.log(`   Comando: npm run upload-missing-auto`);
  }
  
  console.log(`\n💾 Beneficios de esta organización:`);
  console.log(`   ✅ Archivos ya subidos organizados y fuera del proceso`);
  console.log(`   ✅ Solo se procesarán ${state.notInS3} archivos nuevos`);
  console.log(`   ✅ Proceso de subida será mucho más rápido y eficiente`);
}

/**
 * Verificar configuración
 */
function checkConfiguration() {
  const requiredVars = [
    'NAS_BOOKS_FOLDER',
    'S3_BUCKET_NAME',
    'AWS_ACCESS_KEY_ID',
    'AWS_SECRET_ACCESS_KEY'
  ];
  
  const missing = requiredVars.filter(varName => !process.env[varName]);
  
  if (missing.length > 0) {
    console.error('❌ Faltan variables de entorno:');
    missing.forEach(varName => console.error(`   - ${varName}`));
    process.exit(1);
  }
  
  if (!fs.existsSync(NAS_FOLDER)) {
    console.error(`❌ Directorio NAS no encontrado: ${NAS_FOLDER}`);
    process.exit(1);
  }
  
  console.log('✅ Configuración verificada');
}

/**
 * Función principal
 */
async function main() {
  try {
    console.log('📁 ORGANIZADOR DE ARCHIVOS YA EN S3');
    console.log('='.repeat(50));
    console.log(`📁 NAS: ${NAS_FOLDER}`);
    console.log(`📁 Carpeta destino: ${S3_FOLDER}`);
    console.log(`☁️  S3 Bucket: ${process.env.S3_BUCKET_NAME}`);
    
    // Verificar configuración
    checkConfiguration();
    
    // Crear carpeta S3
    ensureS3Folder();
    
    // Cargar estado
    loadState();
    
    if (!state.startTime) {
      state.startTime = new Date().toISOString();
    }
    
    // Paso 1: Obtener lista de S3
    console.log('\n📡 Paso 1: Obteniendo lista completa de S3...');
    state.s3Files = await getS3Files();
    
    if (state.s3Files.size === 0) {
      console.log('⚠️  No hay archivos en S3 - nada que organizar');
      return;
    }
    
    // Paso 2: Escanear NAS
    console.log('\n📡 Paso 2: Escaneando directorio NAS...');
    const nasFiles = scanNasDirectory();
    state.totalNasFiles = nasFiles.length;
    
    if (nasFiles.length === 0) {
      console.log('✅ No hay archivos EPUB en el NAS para organizar');
      return;
    }
    
    console.log(`📊 Archivos EPUB encontrados en NAS: ${nasFiles.length}`);
    
    // Confirmar antes de proceder
    const autoMode = process.argv.includes('--auto');
    if (!autoMode) {
      console.log(`\n❓ ¿Proceder a mover archivos que ya están en S3?`);
      console.log(`   Se moverán archivos de ${NAS_FOLDER} a ${S3_FOLDER}`);
      console.log(`   Archivos en S3: ${state.s3Files.size}`);
      console.log(`   Archivos en NAS: ${nasFiles.length}`);
      console.log(`   (Ctrl+C para cancelar, o espera 5 segundos para continuar)`);
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
    
    // Paso 3: Procesar archivos
    console.log('\n📡 Paso 3: Organizando archivos...');
    processNasFiles(nasFiles);
    
    // Paso 4: Reporte final
    generateReport();
    
    // Limpiar estado si todo salió bien
    if (state.errors === 0) {
      if (fs.existsSync(STATE_FILE)) {
        fs.unlinkSync(STATE_FILE);
        console.log('🗑️  Archivo de estado eliminado');
      }
    }
    
  } catch (error) {
    console.error('\n💥 Error fatal:', error.message);
    saveState();
    process.exit(1);
  }
}

// Manejo de señales
process.on('SIGINT', () => {
  console.log('\n⚠️  Interrupción recibida, guardando estado...');
  saveState();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n⚠️  Terminación recibida, guardando estado...');
  saveState();
  process.exit(0);
});

// Ayuda
if (process.argv.includes('--help')) {
  console.log(`
📁 ORGANIZADOR DE ARCHIVOS YA EN S3

Este script organiza tu biblioteca del NAS antes de la subida:
1. Obtiene lista completa de archivos en S3
2. Escanea el directorio NAS
3. Mueve archivos que YA están en S3 a carpeta /S3
4. Deja en el NAS solo los archivos que necesitan subirse

Esto hace que el proceso posterior de subida sea mucho más eficiente.

Uso:
  node move-existing-s3-files.js [--auto]

Opciones:
  --auto    Ejecutar sin confirmación
  --help    Mostrar esta ayuda

Variables de entorno requeridas:
  NAS_BOOKS_FOLDER      Ruta al directorio de libros en NAS
  S3_BUCKET_NAME        Nombre del bucket S3
  AWS_ACCESS_KEY_ID     Clave de acceso AWS
  AWS_SECRET_ACCESS_KEY Clave secreta AWS

Después de ejecutar este script, puedes ejecutar:
  npm run upload-missing-auto

Para subir solo los archivos que realmente faltan.
`);
  process.exit(0);
}

// Ejecutar
main();