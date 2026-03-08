#!/usr/bin/env node

/**
 * Script para convertir archivos CBR a CBZ
 * 
 * Los archivos CBZ son más fáciles de manejar en el navegador ya que son 
 * simplemente archivos ZIP con extensión CBZ, mientras que CBR requiere
 * librerías especializadas para RAR.
 * 
 * Uso: node scripts/convert-cbr-to-cbz.js [directory]
 */

import { promises as fs } from 'fs';
import { join, dirname, basename, extname } from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class CBRConverter {
  constructor(sourceDir) {
    this.sourceDir = sourceDir;
    this.convertedCount = 0;
    this.failedCount = 0;
    this.skippedCount = 0;
  }

  /**
   * Buscar todos los archivos CBR recursivamente
   */
  async findCBRFiles(dir) {
    const cbrFiles = [];
    
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = join(dir, entry.name);
        
        if (entry.isDirectory()) {
          const subFiles = await this.findCBRFiles(fullPath);
          cbrFiles.push(...subFiles);
        } else if (entry.isFile() && extname(entry.name).toLowerCase() === '.cbr') {
          cbrFiles.push(fullPath);
        }
      }
    } catch (error) {
      console.warn(`⚠️  Error reading directory ${dir}:`, error.message);
    }
    
    return cbrFiles;
  }

  /**
   * Convertir un archivo CBR a CBZ
   */
  async convertFile(cbrPath) {
    const baseName = basename(cbrPath, '.cbr');
    const dirName = dirname(cbrPath);
    const cbzPath = join(dirName, baseName + '.cbz');
    
    // Verificar si ya existe el CBZ
    try {
      await fs.access(cbzPath);
      console.log(`⏭️  Ya existe: ${basename(cbzPath)}`);
      this.skippedCount++;
      return true;
    } catch {
      // No existe, continuar con conversión
    }
    
    try {
      console.log(`🔄 Convirtiendo: ${basename(cbrPath)} → ${basename(cbzPath)}`);
      
      // Crear directorio temporal
      const tempDir = join('/tmp', `cbr_convert_${Date.now()}`);
      await fs.mkdir(tempDir, { recursive: true });
      
      try {
        // Extraer CBR usando unrar
        console.log(`📦 Extrayendo ${basename(cbrPath)}...`);
        execSync(`unrar x -y "${cbrPath}" "${tempDir}/"`, { 
          stdio: 'pipe',
          maxBuffer: 50 * 1024 * 1024 // 50MB buffer
        });
        
        // Verificar que se extrajeron archivos
        const extractedFiles = await fs.readdir(tempDir);
        const imageFiles = extractedFiles.filter(f => 
          /\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(f)
        );
        
        if (imageFiles.length === 0) {
          throw new Error('No se encontraron imágenes en el archivo CBR');
        }
        
        console.log(`🖼️  ${imageFiles.length} imágenes extraídas`);
        
        // Crear archivo CBZ (ZIP)
        console.log(`📦 Creando ${basename(cbzPath)}...`);
        execSync(`cd "${tempDir}" && zip -r "${cbzPath}" .`, { 
          stdio: 'pipe'
        });
        
        // Verificar que se creó el CBZ
        const stats = await fs.stat(cbzPath);
        console.log(`✅ Creado: ${basename(cbzPath)} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
        
        this.convertedCount++;
        return true;
        
      } finally {
        // Limpiar directorio temporal
        try {
          execSync(`rm -rf "${tempDir}"`, { stdio: 'pipe' });
        } catch (cleanupError) {
          console.warn(`⚠️  Error limpiando ${tempDir}:`, cleanupError.message);
        }
      }
      
    } catch (error) {
      console.error(`❌ Error convirtiendo ${basename(cbrPath)}:`, error.message);
      this.failedCount++;
      return false;
    }
  }

  /**
   * Convertir todos los archivos CBR en el directorio
   */
  async convertAll() {
    console.log(`🔍 Buscando archivos CBR en: ${this.sourceDir}`);
    
    const cbrFiles = await this.findCBRFiles(this.sourceDir);
    console.log(`📋 Encontrados ${cbrFiles.length} archivos CBR`);
    
    if (cbrFiles.length === 0) {
      console.log('ℹ️  No se encontraron archivos CBR para convertir');
      return;
    }
    
    console.log('\n🚀 Iniciando conversión...\n');
    
    for (let i = 0; i < cbrFiles.length; i++) {
      const cbrFile = cbrFiles[i];
      const progress = `[${i + 1}/${cbrFiles.length}]`;
      
      console.log(`${progress} Procesando: ${cbrFile}`);
      await this.convertFile(cbrFile);
      console.log('');
    }
    
    // Resumen final
    console.log('📊 Resumen de conversión:');
    console.log(`   ✅ Convertidos: ${this.convertedCount}`);
    console.log(`   ⏭️  Omitidos: ${this.skippedCount}`);
    console.log(`   ❌ Fallidos: ${this.failedCount}`);
    console.log(`   📁 Total procesados: ${cbrFiles.length}`);
  }

  /**
   * Verificar dependencias del sistema
   */
  static checkDependencies() {
    const commands = ['unrar', 'zip'];
    
    for (const cmd of commands) {
      try {
        execSync(`which ${cmd}`, { stdio: 'pipe' });
        console.log(`✅ ${cmd} está disponible`);
      } catch (error) {
        console.error(`❌ ${cmd} no está instalado`);
        console.error(`   Instalar en Ubuntu/Debian: sudo apt install ${cmd === 'unrar' ? 'unrar' : 'zip'}`);
        console.error(`   Instalar en macOS: brew install ${cmd === 'unrar' ? 'unrar' : 'zip'}`);
        process.exit(1);
      }
    }
  }
}

// Función principal
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    console.log(`
📚 Convertidor CBR → CBZ para LecturAPP

Uso: node scripts/convert-cbr-to-cbz.js <directorio>

Este script:
• Busca todos los archivos .cbr recursivamente
• Los convierte a formato .cbz (ZIP)
• Omite archivos ya convertidos
• Muestra progreso detallado

Ejemplo:
  node scripts/convert-cbr-to-cbz.js /path/to/comics

Requisitos del sistema:
• unrar (para extraer archivos CBR)
• zip (para crear archivos CBZ)
`);
    process.exit(0);
  }
  
  const sourceDir = args[0];
  
  // Verificar que el directorio existe
  try {
    const stats = await fs.stat(sourceDir);
    if (!stats.isDirectory()) {
      console.error(`❌ ${sourceDir} no es un directorio válido`);
      process.exit(1);
    }
  } catch (error) {
    console.error(`❌ Error accediendo a ${sourceDir}:`, error.message);
    process.exit(1);
  }
  
  // Verificar dependencias
  console.log('🔍 Verificando dependencias del sistema...');
  CBRConverter.checkDependencies();
  
  // Iniciar conversión
  const converter = new CBRConverter(sourceDir);
  await converter.convertAll();
  
  console.log('\n🎉 ¡Conversión completada!');
}

// Ejecutar script
main().catch(error => {
  console.error('💥 Error fatal:', error);
  process.exit(1);
});