import AWS from 'aws-sdk';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

console.log('🔍 Debug S3 Upload');
console.log('==================');

// Configurar AWS
AWS.config.update({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION || 'eu-west-1'
});

const s3 = new AWS.S3();

async function testUpload() {
  try {
    // Archivo de prueba
    const testFile = './libros/La ultima noche en Los Angeles - Lauren Weisberger.epub';
    
    if (!fs.existsSync(testFile)) {
      console.error('❌ Archivo no encontrado:', testFile);
      return;
    }
    
    const fileContent = fs.readFileSync(testFile);
    const filename = path.basename(testFile);
    
    console.log('📄 Archivo:', filename);
    console.log('📊 Tamaño:', (fileContent.length / 1024 / 1024).toFixed(2), 'MB');
    console.log('🪣 Bucket:', process.env.S3_BUCKET_NAME);
    console.log('🌍 Región:', process.env.AWS_REGION);
    
    const uploadParams = {
      Bucket: process.env.S3_BUCKET_NAME,
      Key: filename,
      Body: fileContent,
      ContentType: 'application/epub+zip'
    };
    
    console.log('\n⬆️ Subiendo...');
    const result = await s3.upload(uploadParams).promise();
    
    console.log('✅ ÉXITO!');
    console.log('🔗 URL:', result.Location);
    
  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
    
    if (error.code === 'SignatureDoesNotMatch') {
      console.log('\n🔍 Diagnóstico del error:');
      console.log('1. Verifica que AWS_SECRET_ACCESS_KEY no tenga espacios');
      console.log('2. Verifica que la región sea correcta (eu-west-1)');
      console.log('3. El bucket debe estar en la misma región');
      
      // Mostrar parte de las credenciales para debug
      const key = process.env.AWS_SECRET_ACCESS_KEY;
      if (key) {
        console.log('\n📋 Info de la Secret Key:');
        console.log('   Longitud:', key.length, 'caracteres');
        console.log('   Empieza con:', key.substring(0, 5) + '...');
        console.log('   Termina con:', '...' + key.substring(key.length - 5));
        console.log('   Tiene espacios:', key.includes(' ') ? '⚠️ SÍ' : '✅ NO');
        console.log('   Tiene saltos de línea:', key.includes('\n') ? '⚠️ SÍ' : '✅ NO');
      }
    }
  }
}

testUpload();