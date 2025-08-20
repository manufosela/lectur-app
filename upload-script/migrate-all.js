#!/usr/bin/env node

import { spawn } from 'child_process';
import fs from 'fs';

const MIGRATION_STATE_FILE = './migration-state.json';

/**
 * Script para ejecutar la migración completa de forma continua
 * Ejecuta migrate-firebase-to-s3-batch.js repetidamente hasta completar todos los archivos
 */

function loadMigrationState() {
  if (!fs.existsSync(MIGRATION_STATE_FILE)) {
    return { totalFiles: 0, processedFiles: [] };
  }
  
  try {
    return JSON.parse(fs.readFileSync(MIGRATION_STATE_FILE, 'utf8'));
  } catch (error) {
    console.error('❌ Error cargando estado de migración');
    return { totalFiles: 0, processedFiles: [] };
  }
}

function formatTime(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  if (hours > 0) {
    return `${hours}h ${minutes}m ${secs}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  }
  return `${secs}s`;
}

async function runMigrationBatch() {
  return new Promise((resolve, reject) => {
    const childProcess = spawn('node', ['migrate-firebase-to-s3-batch.js'], {
      stdio: 'inherit',
      cwd: process.cwd()
    });
    
    childProcess.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Proceso terminó con código ${code}`));
      }
    });
    
    childProcess.on('error', (err) => {
      reject(err);
    });
  });
}

async function main() {
  console.log(`
🚀 INICIANDO MIGRACIÓN COMPLETA DE FIREBASE STORAGE A AWS S3
==============================================================
`);
  
  const startTime = Date.now();
  let batchCount = 0;
  let consecutiveErrors = 0;
  const MAX_CONSECUTIVE_ERRORS = 3;
  
  // Cargar estado inicial
  let state = loadMigrationState();
  const initialProcessed = state.processedFiles?.length || 0;
  
  console.log(`📊 Estado inicial: ${initialProcessed} archivos ya procesados`);
  
  if (state.totalFiles > 0) {
    console.log(`📁 Total de archivos a migrar: ${state.totalFiles}`);
    console.log(`📈 Progreso actual: ${((initialProcessed / state.totalFiles) * 100).toFixed(2)}%\n`);
  }
  
  while (true) {
    try {
      // Cargar estado actualizado
      state = loadMigrationState();
      const processedCount = state.processedFiles?.length || 0;
      const remainingFiles = state.totalFiles - processedCount;
      
      // Verificar si ya terminamos
      if (state.totalFiles > 0 && remainingFiles <= 0) {
        console.log(`
✅ MIGRACIÓN COMPLETADA
=======================
📊 Total de archivos migrados: ${processedCount}
⏱️  Tiempo total: ${formatTime((Date.now() - startTime) / 1000)}
💾 Tamaño total migrado: ${(state.totalSize / (1024 * 1024)).toFixed(2)} MB
💰 Coste total estimado: $${(state.totalSize * 0.00009 / 1024 / 1024).toFixed(4)}
        `);
        break;
      }
      
      // Ejecutar siguiente lote
      batchCount++;
      console.log(`\n🔄 Ejecutando lote #${batchCount}`);
      console.log(`📊 Archivos restantes: ${remainingFiles}`);
      
      if (state.totalFiles > 0) {
        const progress = ((processedCount / state.totalFiles) * 100).toFixed(2);
        console.log(`📈 Progreso total: ${progress}%`);
        
        // Estimación de tiempo restante
        const elapsedSeconds = (Date.now() - startTime) / 1000;
        const filesProcessedInSession = processedCount - initialProcessed;
        if (filesProcessedInSession > 0) {
          const rate = filesProcessedInSession / elapsedSeconds;
          const estimatedSecondsRemaining = remainingFiles / rate;
          console.log(`⏰ Tiempo estimado restante: ${formatTime(estimatedSecondsRemaining)}`);
        }
      }
      
      console.log('─'.repeat(50));
      
      await runMigrationBatch();
      
      // Reset contador de errores consecutivos
      consecutiveErrors = 0;
      
      // Pequeña pausa entre lotes para no sobrecargar
      console.log('\n⏸️  Pausa de 2 segundos antes del siguiente lote...');
      await new Promise(resolve => setTimeout(resolve, 2000));
      
    } catch (error) {
      consecutiveErrors++;
      console.error(`\n❌ Error en lote #${batchCount}:`, error.message);
      
      if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
        console.error(`\n🛑 Deteniendo migración después de ${MAX_CONSECUTIVE_ERRORS} errores consecutivos`);
        console.error('Puedes reanudar ejecutando este script nuevamente');
        process.exit(1);
      }
      
      console.log(`⚠️  Reintentando en 10 segundos... (Error ${consecutiveErrors}/${MAX_CONSECUTIVE_ERRORS})`);
      await new Promise(resolve => setTimeout(resolve, 10000));
    }
  }
  
  console.log('\n✨ Proceso de migración finalizado exitosamente');
}

// Manejar interrupciones
process.on('SIGINT', () => {
  console.log('\n\n⚠️  Migración interrumpida por el usuario');
  console.log('El progreso se ha guardado. Puedes continuar ejecutando este script nuevamente.');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n\n⚠️  Migración detenida');
  console.log('El progreso se ha guardado. Puedes continuar ejecutando este script nuevamente.');
  process.exit(0);
});

// Ejecutar
main().catch(error => {
  console.error('❌ Error fatal:', error);
  process.exit(1);
});