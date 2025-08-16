import AWS from 'aws-sdk';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

AWS.config.update({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION || 'eu-west-1'
});

const s3 = new AWS.S3();

async function uploadMissing() {
  const file = './libros/Y_llenarte_el_muro_de_flores_Helen_C_Rogue.epub';
  
  console.log('📄 Subiendo archivo faltante:', file);
  
  try {
    const fileContent = fs.readFileSync(file);
    
    const result = await s3.upload({
      Bucket: process.env.S3_BUCKET_NAME,
      Key: 'Y_llenarte_el_muro_de_flores_Helen_C_Rogue.epub',
      Body: fileContent,
      ContentType: 'application/epub+zip'
    }).promise();
    
    console.log('✅ Subido exitosamente!');
    console.log('🔗 URL:', result.Location);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

uploadMissing();