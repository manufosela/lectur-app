/**
 * Firebase Cloud Functions
 *
 * Actualmente no hay funciones activas.
 * El frontend usa descargas protegidas directamente desde el NAS.
 */

const functions = require("firebase-functions");

// Placeholder para evitar error de deploy sin funciones
exports.healthCheck = functions
    .region("europe-west1")
    .https
    .onRequest((request, response) => {
      response.json({status: "ok", timestamp: new Date().toISOString()});
    });
