#!/usr/bin/env node

import admin from 'firebase-admin';
import dotenv from 'dotenv';

dotenv.config();

function initializeFirebaseAdmin() {
  try {
    const serviceAccount = {
      type: "service_account",
      project_id: process.env.FIREBASE_PROJECT_ID,
      private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
      private_key: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      client_email: process.env.FIREBASE_CLIENT_EMAIL,
      client_id: process.env.FIREBASE_CLIENT_ID,
      auth_uri: "https://accounts.google.com/o/oauth2/auth",
      token_uri: "https://oauth2.googleapis.com/token",
      auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
      client_x509_cert_url: `https://www.googleapis.com/service_accounts/v1/metadata/x509/${process.env.FIREBASE_CLIENT_EMAIL}`
    };

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      databaseURL: process.env.FIREBASE_DATABASE_URL
    });

    console.log('🔥 Firebase Admin inicializado');
    return admin;
  } catch (error) {
    console.error('❌ Error:', error.message);
    throw error;
  }
}

async function checkBook(bookName) {
  const app = initializeFirebaseAdmin();
  const database = admin.database();
  
  try {
    console.log(`🔍 Buscando: "${bookName}"`);
    
    // Obtener lista de libros
    const snapshot = await database.ref('/libros').once('value');
    const libros = snapshot.val() || [];
    
    // Buscar coincidencias exactas
    const exactMatch = libros.find(libro => libro === bookName);
    
    if (exactMatch) {
      console.log('✅ Encontrado (coincidencia exacta)');
      return;
    }
    
    // Buscar coincidencias parciales
    const partialMatches = libros.filter(libro => 
      libro.toLowerCase().includes(bookName.toLowerCase()) ||
      bookName.toLowerCase().includes(libro.toLowerCase())
    );
    
    if (partialMatches.length > 0) {
      console.log('⚠️  Coincidencias parciales encontradas:');
      partialMatches.forEach((match, index) => {
        console.log(`${index + 1}. "${match}"`);
      });
    } else {
      console.log('❌ No encontrado en Firebase Database');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

// Buscar el libro problemático
checkBook("OAS-Silver Kane.epub").then(() => process.exit(0));