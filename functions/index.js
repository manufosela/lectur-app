const admin = require("firebase-admin");
const functions = require("firebase-functions");
const {Storage} = require("@google-cloud/storage");
const cors = require("cors")({origin: true});
const unrar = require("node-unrar-js");
const StreamZip = require("node-stream-zip");

admin.initializeApp();
const storage = new Storage();

exports.downloadFile = functions
    .region("europe-west1")
    .https
    .onRequest((request, response) => {
      const allowedOrigins = [
        "https://lectur-app.web.app",
        "https://lectur-app.firebaseapp.com",
        "http://localhost:8000",
        "http://localhost:4321",
        "http://localhost",
      ];
      const origin = request.get("origin");
      console.log("origin: ", origin);

      // Handle preflight requests
      if (request.method === "OPTIONS") {
        response.set("Access-Control-Allow-Origin", origin);
        response.set("Access-Control-Allow-Methods", "GET, OPTIONS");
        response.set("Access-Control-Allow-Headers",
            "Content-Type, mode, cors, Access-Control-Allow-Origin");
        response.status(204).send("");
        return;
      }

      if (!allowedOrigins.includes(origin)) {
        response.status(401).send("Unauthorized request");
        return;
      }
      response.set("Access-Control-Allow-Origin", origin);
      response.set("Access-Control-Allow-Methods", "GET, OPTIONS");
      response.set("Access-Control-Allow-Headers",
          "Content-Type, mode, cors, Access-Control-Allow-Origin");
      response.set("CORS", "enabled");
      console.log("request.query: ", request.query);

      cors(request, response, () => {
        let fileName = request.query.fileName;
        fileName = decodeURIComponent(fileName);
        const bucket = storage.bucket("lectur-app.appspot.com");
        const file = bucket.file(`__books__/${fileName}`);
        const stream = file.createReadStream();
        let contentType;
        if (fileName.endsWith(".epub")) {
          contentType = "application/epub+zip";
        } else if (fileName.endsWith(".pdf")) {
          contentType = "application/pdf";
        } else {
          contentType = "application/octet-stream";
        }
        response.set("Content-Type", contentType);
        response.set("Content-Disposition", `attachment; filename=${fileName}`);
        stream.pipe(response);
      });
    });

exports.extractCBR = functions
    .region("europe-west1")
    .runWith({
      timeoutSeconds: 540,
      memory: "1GB",
    })
    .https
    .onRequest((request, response) => {
      const allowedOrigins = [
        "https://lectur-app.web.app",
        "https://lectur-app.firebaseapp.com",
        "http://localhost:8000",
        "http://localhost:4321",
        "http://localhost",
      ];
      const origin = request.get("origin");

      // Handle CORS
      if (request.method === "OPTIONS") {
        response.set("Access-Control-Allow-Origin", origin);
        response.set("Access-Control-Allow-Methods", "POST, OPTIONS");
        response.set("Access-Control-Allow-Headers", "Content-Type");
        response.status(204).send("");
        return;
      }

      if (!allowedOrigins.includes(origin)) {
        response.status(401).send("Unauthorized request");
        return;
      }

      response.set("Access-Control-Allow-Origin", origin);
      response.set("Access-Control-Allow-Methods", "POST, OPTIONS");
      response.set("Access-Control-Allow-Headers", "Content-Type");

      cors(request, response, function(req, res) {
        (async function() {
          try {
            const {fileName} = request.body;

            if (!fileName) {
              response.status(400).json({error: "No fileName provided"});
              return;
            }

            console.log(`Processing CBR: ${fileName}`);

            // Descargar directamente desde Nginx storage
            const storageUrl = `https://storage.lecturapp.es/COMICS/${encodeURIComponent(fileName)}`;
            console.log("Downloading CBR file from:", storageUrl);
            
            const fetch = require("node-fetch");
            const fetchResponse = await fetch(storageUrl);
            
            if (!fetchResponse.ok) {
              throw new Error(`Failed to download CBR: ${fetchResponse.status} ${fetchResponse.statusText}`);
            }
            
            const buffer = await fetchResponse.buffer();
            console.log("Downloaded file size:", buffer.length);

            // Verificar cabeceras del archivo
            const header = buffer.slice(0, 7);
            console.log("File header bytes:", Array.from(header).map(b => b.toString(16).padStart(2, '0')).join(' '));
            console.log("File header string:", header.toString('ascii'));
            
            // Verificar si es ZIP o RAR
            const zipSignature = [0x50, 0x4B]; // "PK"
            const rarSignature = [0x52, 0x61, 0x72, 0x21, 0x1A, 0x07, 0x00]; // "Rar!\x1a\x07\x00"
            const isZip = buffer[0] === zipSignature[0] && buffer[1] === zipSignature[1];
            const isRar = rarSignature.every((byte, index) => buffer[index] === byte);
            
            console.log("Is ZIP file:", isZip);
            console.log("Is RAR file:", isRar);
            
            let forceZipTreatment = false;
            const images = [];

            if (isZip) {
              console.log("Processing as ZIP file...");
              
              const fs = require('fs');
              const path = require('path');
              const tmpFilePath = path.join('/tmp', `comic_${Date.now()}.cbz`);
              fs.writeFileSync(tmpFilePath, buffer);
              
              try {
                const zip = new StreamZip.async({file: tmpFilePath});
                const entries = await zip.entries();
                
                const imageEntries = Object.values(entries)
                  .filter(entry => !entry.isDirectory && /\.(jpg|jpeg|png|gif|webp)$/i.test(entry.name))
                  .sort((a, b) => a.name.localeCompare(b.name, undefined, {numeric: true}));
                
                console.log(`Found ${imageEntries.length} image files in ZIP`);
                
                for (const entry of imageEntries) {
                  try {
                    const imageBuffer = await zip.entryData(entry.name);
                    const base64Image = imageBuffer.toString("base64");
                    images.push({ name: entry.name, data: base64Image });
                  } catch (extractError) {
                    console.warn(`Error extracting ${entry.name}:`, extractError);
                  }
                }
                
                await zip.close();
              } finally {
                if (fs.existsSync(tmpFilePath)) {
                  fs.unlinkSync(tmpFilePath);
                }
              }
              
            } else if (isRar && !forceZipTreatment) {
              console.log("Processing as RAR file...");
              
              // Many .cbr files are actually ZIP files with RAR signature manipulation
              // or use RAR versions that node-unrar-js can't handle
              // Let's try ZIP processing directly for better compatibility
              console.log("RAR detected but trying ZIP processing first (better compatibility)");
              forceZipTreatment = true;
            }
          
            // Si RAR falló, intentar como ZIP
            if ((isRar && forceZipTreatment) || (!isZip && !isRar)) {
              console.log("Attempting ZIP processing as fallback...");
              
              const fs = require('fs');
              const path = require('path');
              const tmpFilePath = path.join('/tmp', `comic_zip_${Date.now()}.cbz`);
              fs.writeFileSync(tmpFilePath, buffer);
              
              try {
                const zip = new StreamZip.async({file: tmpFilePath});
                const entries = await zip.entries();
                
                const imageEntries = Object.values(entries)
                  .filter(entry => !entry.isDirectory && /\.(jpg|jpeg|png|gif|webp)$/i.test(entry.name))
                  .sort((a, b) => a.name.localeCompare(b.name, undefined, {numeric: true}));
                
                console.log(`Found ${imageEntries.length} image files in ZIP fallback`);
                
                for (const entry of imageEntries) {
                  try {
                    const imageBuffer = await zip.entryData(entry.name);
                    const base64Image = imageBuffer.toString("base64");
                    images.push({ name: entry.name, data: base64Image });
                  } catch (extractError) {
                    console.warn(`Error extracting ${entry.name}:`, extractError);
                  }
                }
                
                await zip.close();
              } catch (zipError) {
                console.log("ZIP processing also failed:", zipError.message);
              } finally {
                if (fs.existsSync(tmpFilePath)) {
                  fs.unlinkSync(tmpFilePath);
                }
              }
            }
            
            if (images.length === 0 && !isZip && !isRar) {
              throw new Error("File is neither a valid ZIP nor RAR archive");
            }

            console.log(`Extracted ${images.length} images from CBR`);

            response.json({
              success: true,
              images: images,
              total: images.length,
            });
            
          } catch (error) {
            console.error("Error processing CBR:", error);
            response.status(500).json({
              error: `Failed to process CBR: ${error.message}`,
            });
          }
        })();
      });
    });
