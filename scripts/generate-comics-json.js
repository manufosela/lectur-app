#!/usr/bin/env node

/**
 * Script para generar un JSON estructurado de todos los cómics
 * con formato CBR y CBZ del directorio /COMICS
 *
 * Genera relpath en lugar de URLs absolutas.
 * Para URLs absolutas, usar getProtectedUrl(relpath) en runtime.
 *
 * Uso: node scripts/generate-comics-json.js [output-file.json]
 */

import { promises as fs } from 'fs';
import { join, dirname, basename, extname, relative } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class ComicsJSONGenerator {
  constructor(comicsDir) {
    this.comicsDir = comicsDir;
    this.comics = [];
    this.stats = {
      totalSeries: 0,
      totalIssues: 0,
      cbr: 0,
      cbz: 0,
      errors: 0
    };
  }

  /**
   * Buscar todos los archivos de cómics recursivamente
   */
  async findComicFiles(dir, relativePath = '') {
    const comicFiles = [];
    
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = join(dir, entry.name);
        const entryRelativePath = join(relativePath, entry.name);
        
        if (entry.isDirectory()) {
          const subFiles = await this.findComicFiles(fullPath, entryRelativePath);
          comicFiles.push(...subFiles);
        } else if (entry.isFile()) {
          const ext = extname(entry.name).toLowerCase();
          if (ext === '.cbr' || ext === '.cbz') {
            comicFiles.push({
              name: entry.name,
              path: fullPath,
              relativePath: entryRelativePath,
              extension: ext,
              size: 0 // Se llenará después si es necesario
            });
          }
        }
      }
    } catch (error) {
      console.warn(`⚠️  Error reading directory ${dir}:`, error.message);
      this.stats.errors++;
    }
    
    return comicFiles;
  }

  /**
   * Extraer información del nombre del archivo
   */
  parseComicInfo(filename) {
    // Remover extensión
    const nameWithoutExt = filename.replace(/\.(cbr|cbz)$/i, '');
    
    // Patrones comunes para extraer serie y número
    const patterns = [
      // "Batman #001 - Dark Knight" o "Batman 001 - Dark Knight"
      /^(.+?)[\s#]*(\d+)[\s\-]*(.*)$/,
      // "001 - Batman - Dark Knight"
      /^(\d+)[\s\-]+(.+?)[\s\-]*(.*)$/,
      // Solo nombre sin número
      /^(.+)$/
    ];
    
    let series = nameWithoutExt;
    let issueNumber = null;
    let issueTitle = nameWithoutExt;
    
    for (const pattern of patterns) {
      const match = nameWithoutExt.match(pattern);
      if (match) {
        if (match.length >= 3 && /^\d+$/.test(match[2])) {
          // Patrón con serie y número
          series = match[1].trim();
          issueNumber = parseInt(match[2]);
          issueTitle = match[3] ? `${series} #${issueNumber} - ${match[3].trim()}` : `${series} #${issueNumber}`;
        } else if (match.length >= 2 && /^\d+$/.test(match[1])) {
          // Patrón con número al inicio
          issueNumber = parseInt(match[1]);
          series = match[2] ? match[2].trim() : 'Unknown Series';
          issueTitle = match[3] ? `${series} #${issueNumber} - ${match[3].trim()}` : `${series} #${issueNumber}`;
        }
        break;
      }
    }
    
    return {
      series: this.cleanSeriesName(series),
      issueNumber: issueNumber || 1,
      issueTitle: issueTitle.trim()
    };
  }

  /**
   * Limpiar nombre de serie
   */
  cleanSeriesName(seriesName) {
    return seriesName
      .replace(/^\d+[\s\-]*/, '') // Remover números al inicio
      .replace(/[\s\-]*\d+$/, '') // Remover números al final
      .replace(/[_\-\s]+/g, ' ') // Normalizar espacios
      .trim()
      .replace(/^(.+?)\s*\-.*$/, '$1') // Remover todo después del primer guión
      .trim();
  }

  /**
   * Organizar archivos por series con prioridad CBZ
   */
  organizeComics(comicFiles) {
    const seriesMap = new Map();
    const issueMap = new Map(); // Para detectar duplicados CBR/CBZ
    
    // Primer paso: indexar todos los archivos por serie e issue
    for (const file of comicFiles) {
      const { series, issueNumber, issueTitle } = this.parseComicInfo(file.name);
      const issueKey = `${series}|${issueNumber}|${issueTitle}`;
      
      if (!issueMap.has(issueKey)) {
        issueMap.set(issueKey, []);
      }
      
      issueMap.get(issueKey).push({
        series,
        issueNumber,
        issueTitle,
        file,
        relpath: `COMICS/${file.relativePath}`,
        format: file.extension.substring(1)
      });
    }
    
    // Segundo paso: seleccionar mejor versión por issue (CBZ > CBR)
    for (const [issueKey, versions] of issueMap) {
      // Priorizar CBZ sobre CBR
      const selectedVersion = versions.find(v => v.format === 'cbz') || versions[0];
      const { series } = selectedVersion;
      
      if (!seriesMap.has(series)) {
        seriesMap.set(series, {
          title: series,
          issues: []
        });
      }
      
      const seriesData = seriesMap.get(series);
      seriesData.issues.push({
        number: selectedVersion.issueNumber,
        title: selectedVersion.issueTitle,
        relpath: selectedVersion.relpath,
        format: selectedVersion.format,
        filename: selectedVersion.file.name,
        path: selectedVersion.file.relativePath
      });
      
      // Estadísticas
      if (selectedVersion.format === 'cbr') {
        this.stats.cbr++;
      } else {
        this.stats.cbz++;
      }
      this.stats.totalIssues++;
      
      // Reportar duplicados eliminados
      if (versions.length > 1) {
        const eliminated = versions.filter(v => v !== selectedVersion);
        console.log(`🔄 Duplicado eliminado: ${eliminated[0].file.name} (mantenido: ${selectedVersion.file.name})`);
      }
    }
    
    // Convertir Map a Array y ordenar
    this.comics = Array.from(seriesMap.values()).map(series => ({
      ...series,
      issues: series.issues.sort((a, b) => a.number - b.number)
    })).sort((a, b) => a.title.localeCompare(b.title));
    
    this.stats.totalSeries = this.comics.length;
    console.log(`📊 Procesados ${this.stats.totalIssues} issues únicos de ${comicFiles.length} archivos totales`);
  }

  /**
   * Generar el JSON final
   */
  generateJSON() {
    return {
      metadata: {
        generatedAt: new Date().toISOString(),
        note: 'Usar getProtectedUrl(relpath) para URLs absolutas',
        stats: this.stats
      },
      comics: this.comics
    };
  }

  /**
   * Proceso principal
   */
  async generate(outputFile = null) {
    console.log(`🔍 Escaneando directorio de cómics: ${this.comicsDir}`);
    
    // Verificar que el directorio existe
    try {
      const stats = await fs.stat(this.comicsDir);
      if (!stats.isDirectory()) {
        throw new Error(`${this.comicsDir} no es un directorio`);
      }
    } catch (error) {
      throw new Error(`Error accediendo a ${this.comicsDir}: ${error.message}`);
    }
    
    // Buscar archivos de cómics
    console.log('📚 Buscando archivos CBR y CBZ...');
    const comicFiles = await this.findComicFiles(this.comicsDir);
    
    if (comicFiles.length === 0) {
      console.log('⚠️  No se encontraron archivos de cómics');
      return null;
    }
    
    console.log(`📋 Encontrados ${comicFiles.length} archivos de cómics`);
    
    // Organizar por series
    console.log('🏗️  Organizando cómics por series...');
    this.organizeComics(comicFiles);
    
    // Generar JSON
    console.log('📄 Generando estructura JSON...');
    const jsonData = this.generateJSON();
    
    // Guardar archivo si se especificó
    if (outputFile) {
      console.log(`💾 Guardando en: ${outputFile}`);
      await fs.writeFile(outputFile, JSON.stringify(jsonData, null, 2), 'utf8');
    }
    
    // Mostrar estadísticas
    console.log('\n📊 Estadísticas:');
    console.log(`   📚 Series encontradas: ${this.stats.totalSeries}`);
    console.log(`   📖 Issues totales: ${this.stats.totalIssues}`);
    console.log(`   📁 Archivos CBR: ${this.stats.cbr}`);
    console.log(`   📁 Archivos CBZ: ${this.stats.cbz}`);
    console.log(`   ❌ Errores: ${this.stats.errors}`);
    
    // Mostrar muestra de series
    if (this.comics.length > 0) {
      console.log('\n🎯 Primeras 5 series encontradas:');
      for (let i = 0; i < Math.min(5, this.comics.length); i++) {
        const series = this.comics[i];
        console.log(`   ${i + 1}. ${series.title} (${series.issues.length} issues)`);
      }
    }
    
    return jsonData;
  }
}

// Función principal
async function main() {
  const args = process.argv.slice(2);
  
  if (args[0] === '--help' || args[0] === '-h') {
    console.log(`
📚 Generador de JSON de Cómics para LecturAPP

Uso: node scripts/generate-comics-json.js [archivo-salida.json]

Este script:
• Escanea recursivamente el directorio ~/servidorix/COMICS
• Encuentra todos los archivos .cbr y .cbz
• Los organiza por series detectando patrones en nombres
• Genera un JSON estructurado con títulos, números y URLs

Ejemplos:
  node scripts/generate-comics-json.js
  node scripts/generate-comics-json.js comics-catalog.json
  node scripts/generate-comics-json.js > comics.json

El JSON generado incluye:
• Metadata con estadísticas
• Series ordenadas alfabéticamente
• Issues ordenados por número
• relpath para cada archivo (usar getProtectedUrl en runtime)
`);
    process.exit(0);
  }
  
  const comicsDir = process.env.COMICS_DIR || `${process.env.HOME}/servidorix/COMICS`;
  const outputFile = args[0] || null;
  
  try {
    const generator = new ComicsJSONGenerator(comicsDir);
    const jsonData = await generator.generate(outputFile);
    
    if (!outputFile && jsonData) {
      // Si no hay archivo de salida, imprimir a stdout
      console.log('\n' + '='.repeat(50));
      console.log(JSON.stringify(jsonData, null, 2));
    }
    
    console.log('\n🎉 ¡Generación completada!');
    
  } catch (error) {
    console.error('💥 Error:', error.message);
    process.exit(1);
  }
}

// Ejecutar script
main().catch(error => {
  console.error('💥 Error fatal:', error);
  process.exit(1);
});