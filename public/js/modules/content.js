/**
 * Content Management Module
 * Single Responsibility: Handle content loading and display operations
 */

import { 
  getBooksNamesList, 
  getAudiobooksList,
  getComicsList,
  getAutorsNamesList, 
  getAutorsBooks,
  saveReadingProgressToFirebase,
  getReadingHistoryFromFirebase
} from '../firebase-config.js';

export class ContentService {
  constructor() {
    this.books = [];
    this.audiobooks = [];
    this.comics = [];
    this.authors = [];
    this.authorBooks = {};
  }

  /**
   * Load all content from Firebase
   */
  async loadAllContent() {
    try {
      const [books, audiobooks, comics, authors, authorBooks] = await Promise.all([
        getBooksNamesList().catch((error) => { 
          console.warn('Error loading books:', error);
          return [];
        }),
        getAudiobooksList().catch((error) => { 
          console.warn('Error loading audiobooks:', error);
          return [];
        }),
        getComicsList().catch((error) => { 
          console.warn('Error loading comics:', error);
          return [];
        }),
        getAutorsNamesList().catch((error) => { 
          console.warn('Error loading authors:', error);
          return [];
        }),
        getAutorsBooks().catch((error) => { 
          console.warn('Error loading author books:', error);
          return {};
        })
      ]);

      // Ensure all values are arrays/objects
      this.books = Array.isArray(books) ? books : [];
      this.audiobooks = Array.isArray(audiobooks) ? audiobooks : [];
      this.comics = Array.isArray(comics) ? comics : [];
      this.authors = Array.isArray(authors) ? authors : [];
      this.authorBooks = typeof authorBooks === 'object' && authorBooks !== null ? authorBooks : {};

      console.log(`📚 Content loaded: ${this.books.length} books, ${this.audiobooks.length} audiobooks, ${this.comics.length} comics`);
      
      return {
        books: this.books,
        audiobooks: this.audiobooks,
        comics: this.comics,
        authors: this.authors,
        authorBooks: this.authorBooks
      };
    } catch (error) {
      console.error('Error loading content:', error);
      throw error;
    }
  }

  /**
   * Get books list
   */
  getBooks() {
    return this.books;
  }

  /**
   * Get audiobooks list
   */
  getAudiobooks() {
    return this.audiobooks;
  }

  /**
   * Get comics list
   */
  getComics() {
    return this.comics;
  }

  /**
   * Get authors list
   */
  getAuthors() {
    return this.authors;
  }

  /**
   * Get books by author
   */
  getBooksByAuthor(author) {
    return this.authorBooks[author] || [];
  }

  /**
   * Search content by title
   */
  searchByTitle(query, contentType = 'books') {
    const content = this.getContentByType(contentType);
    if (!query.trim()) {
      return content;
    }
    
    const normalizedQuery = query.toLowerCase();
    return content.filter(item => 
      item.toLowerCase().includes(normalizedQuery)
    );
  }

  /**
   * Search books by author
   */
  searchByAuthor(query) {
    if (!query.trim()) {
      return this.books;
    }
    
    const normalizedQuery = query.toLowerCase();
    const matchingAuthors = this.authors.filter(author => 
      author.toLowerCase().includes(normalizedQuery)
    );
    
    // Get books from matching authors
    let foundBooks = [];
    matchingAuthors.forEach(author => {
      if (this.authorBooks[author]) {
        foundBooks.push(...this.authorBooks[author]);
      }
    });
    
    // Remove duplicates
    return [...new Set(foundBooks)];
  }

  /**
   * Filter content by first letter
   */
  filterByLetter(letter, contentType = 'books') {
    const content = this.getContentByType(contentType);
    if (letter === 'all') {
      return content;
    }
    
    return content.filter(item => 
      item.toUpperCase().startsWith(letter.toUpperCase())
    );
  }

  /**
   * Get content by type
   */
  getContentByType(type) {
    switch (type) {
      case 'books':
        return this.books;
      case 'audiobooks':
        return this.audiobooks;
      case 'comics':
        return this.comics;
      default:
        return this.books;
    }
  }

  /**
   * Get content counts
   */
  getContentCounts() {
    return {
      books: this.books.length,
      audiobooks: this.audiobooks.length,
      comics: this.comics.length,
      authors: this.authors.length
    };
  }

  /**
   * Generate content URL for Nginx serving
   */
  generateContentUrl(contentPath, contentType) {
    const baseUrl = 'https://storage.lecturapp.es';
    let directory;
    
    switch (contentType) {
      case 'books':
        directory = 'LIBROS';
        break;
      case 'audiobooks':
        directory = 'AUDIOLIBROS';
        break;
      case 'comics':
        directory = 'COMICS';
        break;
      default:
        directory = 'LIBROS';
    }
    
    return `${baseUrl}/${directory}/${encodeURIComponent(contentPath)}`;
  }

  /**
   * Save reading progress to Firebase
   */
  async saveProgress(userEmail, contentPath, title, author, currentChapter, totalChapters, contentType = 'book', additionalData = {}) {
    try {
      await saveReadingProgressToFirebase(
        userEmail,
        contentPath,
        title,
        author,
        currentChapter,
        totalChapters,
        contentType,
        additionalData
      );
      console.log('Progress saved:', contentPath);
    } catch (error) {
      console.error('Error saving progress:', error);
      throw error;
    }
  }

  /**
   * Get reading history from Firebase
   */
  async getHistory(userEmail) {
    try {
      const history = await getReadingHistoryFromFirebase(userEmail);
      return history;
    } catch (error) {
      console.error('Error loading history:', error);
      throw error;
    }
  }
}

// Create and export singleton instance
export const contentService = new ContentService();