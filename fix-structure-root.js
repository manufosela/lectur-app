import { promises as fs } from 'fs';

async function main() {
  // Leer el archivo que ya tenemos bien estructurado
  const currentStructure = JSON.parse(await fs.readFile('firebase_comicsStructure_cbz_FINAL.json', 'utf8'));
  
  // Envolver toda la estructura en un objeto con "folders" en la raíz
  const rootStructure = {
    folders: currentStructure
  };
  
  await fs.writeFile('firebase_comicsStructure_cbz_WITH_ROOT.json', JSON.stringify(rootStructure, null, 2));
  
  console.log('Root structure created: firebase_comicsStructure_cbz_WITH_ROOT.json');
  console.log('Root has folders:', Object.keys(rootStructure.folders).length);
  console.log('Sample root structure:');
  console.log('  Root level has: folders');
  console.log('  First level folders:', Object.keys(rootStructure.folders).slice(0, 3).join(', '));
}

main().catch(console.error);