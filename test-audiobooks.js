// Script temporal para probar la carga de audiolibros
import { getAudiobooksList } from './public/js/firebase-config.js';

console.log('Testing audiobooks loading...');

getAudiobooksList()
  .then(audiobooks => {
    console.log('Audiobooks loaded successfully:', audiobooks.length);
    console.log('First 5 audiobooks:', audiobooks.slice(0, 5));
  })
  .catch(error => {
    console.error('Error loading audiobooks:', error);
  });