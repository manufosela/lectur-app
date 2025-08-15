const admin = require("firebase-admin");
const functions = require("firebase-functions");
const {Storage} = require("@google-cloud/storage");
const cors = require("cors")({origin: true});

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
