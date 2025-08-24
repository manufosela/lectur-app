import admin from 'firebase-admin';
import dotenv from 'dotenv';
import { initializeFirebase } from '../firebase-manager.js';

dotenv.config();

// Inicializar Firebase Admin usando el sistema existente
initializeFirebase();
const db = admin.database();

async function checkAudiobooks() {
  console.log('🔍 Verificando audiolibros en Firebase Database...');
  
  try {
    // Verificar si existe la ruta /audiolibros
    const audiobooksRef = db.ref('/audiolibros');
    const snapshot = await audiobooksRef.once('value');
    
    if (snapshot.exists()) {
      const audiobooks = snapshot.val();
      const keys = Object.keys(audiobooks);
      
      console.log(`✅ Encontrados ${keys.length} audiolibros en Firebase Database`);
      console.log('📋 Primeros 5 audiolibros:');
      
      keys.slice(0, 5).forEach(key => {
        const audiobook = audiobooks[key];
        console.log(`  - ${audiobook.titulo} por ${audiobook.autor}`);
      });
      
      console.log(`\n📊 Estructura de datos:`);
      console.log(`  - Total audiolibros: ${keys.length}`);
      console.log(`  - Primer ID: ${keys[0]}`);
      console.log(`  - Último ID: ${keys[keys.length - 1]}`);
      
      // Mostrar un audiolibro completo como ejemplo
      console.log(`\n📖 Ejemplo de audiolibro completo:`);
      console.log(JSON.stringify(audiobooks[keys[0]], null, 2));
      
    } else {
      console.log('❌ No se encontraron audiolibros en /audiolibros');
      
      // Verificar si hay datos en la raíz
      const rootRef = db.ref('/');
      const rootSnapshot = await rootRef.once('value');
      const rootData = rootSnapshot.val();
      
      console.log('📋 Rutas disponibles en la base de datos:');
      if (rootData) {
        Object.keys(rootData).forEach(key => {
          console.log(`  - /${key}`);
        });
      }
    }
    
  } catch (error) {
    console.error('❌ Error verificando audiolibros:', error);
  } finally {
    process.exit(0);
  }
}

// Ejecutar verificación
checkAudiobooks();