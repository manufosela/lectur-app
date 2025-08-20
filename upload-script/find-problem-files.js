#!/usr/bin/env node

import fs from 'fs';

// Leer el estado de la migración
const migrationState = JSON.parse(fs.readFileSync('./migration-state.json', 'utf8'));

console.log('🔍 Analizando archivos con caracteres especiales...\n');

// Buscar archivos que puedan tener problemas de codificación
const problematicFiles = migrationState.processedFiles.filter(filename => {
  return (
    filename.includes(' ') ||      // Espacios
    filename.includes('ñ') ||      // Ñ
    filename.includes('á') ||      // Acentos
    filename.includes('é') ||
    filename.includes('í') ||
    filename.includes('ó') ||
    filename.includes('ú') ||
    filename.includes('ü') ||
    filename.includes('(') ||      // Paréntesis
    filename.includes(')') ||
    filename.includes('[') ||      // Corchetes
    filename.includes(']') ||
    filename.includes('–') ||      // Guiones especiales
    filename.includes('—')
  );
});

console.log(`📊 Total de archivos problemáticos encontrados: ${problematicFiles.length}`);
console.log(`📊 Total de archivos migrados: ${migrationState.processedFiles.length}\n`);

// Buscar específicamente el archivo que estás probando
const searchTerm = '50_cosas_que_hay_que_saber_sobre_el_universo';
const matchingFiles = migrationState.processedFiles.filter(filename => 
  filename.toLowerCase().includes(searchTerm.toLowerCase())
);

if (matchingFiles.length > 0) {
  console.log('🎯 Archivos que coinciden con tu búsqueda:');
  matchingFiles.forEach((file, index) => {
    console.log(`${index + 1}. "${file}"`);
  });
} else {
  console.log('❌ No se encontró el archivo buscado en la migración');
  console.log('🔍 Archivos similares (con "universo"):');
  
  const universeFiles = migrationState.processedFiles.filter(filename => 
    filename.toLowerCase().includes('universo')
  );
  
  universeFiles.forEach((file, index) => {
    console.log(`${index + 1}. "${file}"`);
  });
}

console.log('\n📋 Primeros 10 archivos con caracteres especiales:');
problematicFiles.slice(0, 10).forEach((file, index) => {
  console.log(`${index + 1}. "${file}"`);
});

// Buscar por Joanne Baker específicamente
const joanneFiles = migrationState.processedFiles.filter(filename => 
  filename.toLowerCase().includes('joanne') && filename.toLowerCase().includes('baker')
);

if (joanneFiles.length > 0) {
  console.log('\n🔍 Archivos de Joanne Baker encontrados:');
  joanneFiles.forEach((file, index) => {
    console.log(`${index + 1}. "${file}"`);
  });
} else {
  console.log('\n❌ No se encontraron archivos de Joanne Baker');
}