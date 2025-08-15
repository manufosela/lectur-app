// Script para crear el nodo usuariosAutorizados
// Ejecutar con: node create-authorized-users.js

const admin = require('firebase-admin');

// Configuración de Firebase Admin
const serviceAccount = {
  "type": "service_account",
  "project_id": "lectur-app",
  "private_key_id": "TU_PRIVATE_KEY_ID",
  "private_key": "-----BEGIN PRIVATE KEY-----\nTU_PRIVATE_KEY\n-----END PRIVATE KEY-----\n",
  "client_email": "firebase-adminsdk-xxxxx@lectur-app.iam.gserviceaccount.com",
  "client_id": "TU_CLIENT_ID",
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token",
  "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
  "client_x509_cert_url": "https://www.googleapis.com/service_accounts/v1/metadata/x509/firebase-adminsdk-xxxxx%40lectur-app.iam.gserviceaccount.com"
};

// Inicializar Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://lectur-app-default-rtdb.europe-west1.firebasedatabase.app"
});

async function createAuthorizedUsers() {
  try {
    const db = admin.database();
    const ref = db.ref('usuariosAutorizados');
    
    const authorizedUsers = {
      "mjfosela@gmail.com": true,
      "amorcd@gmail.com": true
    };
    
    await ref.set(authorizedUsers);
    console.log('✅ Nodo usuariosAutorizados creado exitosamente');
    
    // Verificar que se creó
    const snapshot = await ref.once('value');
    console.log('📋 Usuarios autorizados:', snapshot.val());
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error creando nodo:', error);
    process.exit(1);
  }
}

createAuthorizedUsers();