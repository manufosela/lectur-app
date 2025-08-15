// // Copyright 2023 manufosela.
// // License: Apache-2.0

// const axios = require("axios");
// const dropboxV2Api = require('dropbox-v2-api');
// const fs = require("fs");

// const accessToken = "sl.BYTL78wlT9rcOkTU01g1DWYizXfNQoQSlC_6VhpQ8lYYw3zw742z
// 3xRpZ1zZohmLg0W3Qm-YxJedTOeIjNZKc32VqhN4MJc
// TSFeN9BIdfqmPAV9om9kWc_lPTBTVDASRgPD91IE";
// const path = "/libreriapp";


// async function getDirectoryContents(accessToken, path) {
//   const res = await axios({
//     method: "post",
//     url: "https://api.dropboxapi.com/2/files/list_folder",
//     headers: {
//       "Content-Type": "application/json",
//       Authorization: `Bearer ${accessToken}`
//     },
//     data: {
//       path: path,
//       include_media_info: false,
//       include_deleted: false,
//       include_has_explicit_shared_members: false,
//       include_mounted_folders: true
//     }
//   });

//   return res.data.entries;
// }
// exports.getDirectoryContents = getDirectoryContents;

// async function getFileContent(accessToken, fileName) {
//   const dropbox = dropboxV2Api.authenticate({
//     token: accessToken
//   });
//   dropbox({
//     resource: 'files/download',
//     parameters: {
//       path: `${path}/${fileName}`
//     }
//   }, (err, result, response) => {
//       //download completed
//       console.log('EXITO');
//   })
//   .pipe(fs.createWriteStream('./MIFICHERO.epub'));
// }
// exports.getFileContent = getFileContent;


// // getDirectoryContents(accessToken, path)
// //   .then(entries => {
// //     console.log(entries);
// //   })
// //   .catch(error => {
// //     console.error(error);
// //   });

// // getFileContent(accessToken,
// "1998 Atlas de geografia humana - Almudena Grandes.epub");
