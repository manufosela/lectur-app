#!/usr/bin/env node

/**
 * Script para extraer solo archivos CBZ del JSON completo
 */

import { promises as fs } from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function extractCBZOnly(inputFile, outputFile) {
  console.log(`📖 Cargando ${inputFile}...`);
  
  const jsonContent = await fs.readFile(inputFile, 'utf8');
  const data = JSON.parse(jsonContent);
  
  console.log(`📊 JSON original: ${data.comics.length} series, ${data.metadata.stats.totalIssues} issues`);
  
  // Filtrar solo CBZ
  const cbzOnlyComics = [];
  const comics_cbz = []; // Lista plana para Firebase
  let totalCBZ = 0;
  let seriesSkipped = 0;
  
  for (const series of data.comics) {
    const cbzIssues = series.issues.filter(issue => issue.format === 'cbz');
    
    if (cbzIssues.length > 0) {
      cbzOnlyComics.push({
        title: series.title,
        issues: cbzIssues
      });
      
      // Agregar a lista plana
      cbzIssues.forEach(issue => {
        comics_cbz.push(issue.filename);
      });
      
      totalCBZ += cbzIssues.length;
    } else {
      seriesSkipped++;
    }
  }
  
  console.log(`✅ CBZ filtrados: ${cbzOnlyComics.length} series, ${totalCBZ} issues`);
  console.log(`⏭️  Series sin CBZ omitidas: ${seriesSkipped}`);
  
  // Crear estructura final
  const cbzData = {
    metadata: {
      generatedAt: new Date().toISOString(),
      baseUrl: data.metadata.baseUrl,
      stats: {
        totalSeries: cbzOnlyComics.length,
        totalIssues: totalCBZ,
        cbzOnly: totalCBZ,
        skipped: seriesSkipped
      },
      source: 'CBZ-only filtered from complete comics catalog'
    },
    comics: cbzOnlyComics,
    // Lista plana para Firebase
    comics_cbz: comics_cbz
  };
  
  // Guardar archivo
  console.log(`💾 Guardando en ${outputFile}...`);
  await fs.writeFile(outputFile, JSON.stringify(cbzData, null, 2), 'utf8');
  
  console.log('✅ Archivo CBZ-only creado exitosamente!');
  console.log(`📁 Tamaño: ${(JSON.stringify(cbzData).length / 1024 / 1024).toFixed(2)} MB`);
  
  return cbzData;
}

// Función principal
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length < 1 || args[0] === '--help') {
    console.log(`
📚 Extractor de CBZ para Firebase

Uso: node scripts/extract-cbz-only.js <input.json> [output.json]

Este script:
• Filtra solo archivos CBZ del JSON completo
• Crea estructura compatible con Firebase
• Genera lista plana comics_cbz

Ejemplo:
  node scripts/extract-cbz-only.js comics-complete.json comics-cbz-only.json
`);
    process.exit(0);
  }
  
  const inputFile = args[0];
  const outputFile = args[1] || 'comics-cbz-only.json';
  
  try {
    await extractCBZOnly(inputFile, outputFile);
    
    console.log('\n📋 Próximos pasos:');
    console.log('1. Ve a Firebase Console → Realtime Database');
    console.log('2. Importa el archivo comics-cbz-only.json');
    console.log('3. O copia la lista comics_cbz manualmente');
    
  } catch (error) {
    console.error('💥 Error:', error.message);
    process.exit(1);
  }
}

main().catch(error => {
  console.error('💥 Error crítico:', error);
  process.exit(1);
});