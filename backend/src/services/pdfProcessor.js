const fs = require('fs').promises;
const path = require('path');
const pdfParse = require('pdf-parse');
const crypto = require('crypto');
const { OpenAI } = require('openai');
const { Document, DocumentChunk } = require('../models');
const SettingsService = require('./settingsService');

class PDFProcessor {
  constructor() {
    this.settingsService = new SettingsService();
    this.openai = null; // Will be initialized dynamically
    this.config = null; // Will be loaded from settings
  }

  /**
   * Initialize configuration
   */
  async initializeConfig() {
    try {
      const openaiConfig = await this.settingsService.getCurrentOpenAIConfig();
      const ragConfig = await this.settingsService.getCurrentRAGConfig();
      
      this.config = { ...openaiConfig, ...ragConfig };
      this.openai = new OpenAI({
        apiKey: this.config.apiKey,
        baseURL: this.config.baseURL
      });
      
      console.log(`📖 PDFProcessor initialized with embedding model: ${this.config.embeddingModel}, baseURL: ${this.config.baseURL}`);
    } catch (error) {
      console.error('❌ Error initializing PDF processor config:', error);
      // Fallback to environment variables
      this.openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
        baseURL: process.env.OPENAI_BASE_URL
      });
      this.config = {
        apiKey: process.env.OPENAI_API_KEY,
        baseURL: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
        embeddingModel: process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-ada-002',
        chunkSize: parseInt(process.env.CHUNK_SIZE) || 1000,
        chunkOverlap: parseInt(process.env.CHUNK_OVERLAP) || 200
      };
    }
  }

  /**
   * Xử lý file PDF và lưu vào database
   */
  async processPDF(filePath, title = null, category = null, tags = []) {
    try {
      // Ensure config is loaded
      if (!this.config) {
        await this.initializeConfig();
      }

      console.log(`📖 Bắt đầu xử lý PDF: ${filePath}`);
      
      // Đọc file PDF
      const pdfBuffer = await fs.readFile(filePath);
      const pdfData = await pdfParse(pdfBuffer);
      
      const fileName = path.basename(filePath);
      const fileSize = pdfBuffer.length;
      
      // Tạo document record
      const document = await Document.create({
        title: title || fileName.replace('.pdf', ''),
        file_name: fileName,
        file_path: filePath,
        file_type: 'pdf',
        file_size: fileSize,
        total_pages: pdfData.numpages,
        content_preview: pdfData.text.substring(0, 500),
        processing_status: 'processing',
        category,
        tags,
        metadata: {
          pdf_info: pdfData.info,
          processed_at: new Date()
        }
      });

      console.log(`📄 Document created với ID: ${document.id}`);

      // Xử lý text thành chunks
      const chunks = await this.createTextChunks(pdfData.text, document.id);
      
      // Tạo embeddings cho từng chunk
      await this.generateEmbeddings(chunks);
      
      // Lưu chunks vào database
      await this.saveChunks(chunks, document.id);
      
      // Update document status
      await document.updateProcessingStatus('completed');
      await document.updateChunkCount(chunks.length);
      
      console.log(`✅ Hoàn thành xử lý PDF. Tạo được ${chunks.length} chunks`);
      
      return {
        document,
        chunks_count: chunks.length,
        total_pages: pdfData.numpages
      };
      
    } catch (error) {
      console.error('❌ Lỗi xử lý PDF:', error);
      
      // Update document status nếu có
      if (document) {
        await document.updateProcessingStatus('failed', error.message);
      }
      
      throw error;
    }
  }

  /**
   * Chia text thành các chunks nhỏ
   */
  async createTextChunks(text, documentId) {
    console.log('🔪 Đang chia text thành chunks...');
    
    // Làm sạch text
    const cleanText = this.cleanText(text);
    
    // Chia thành paragraphs trước
    const paragraphs = cleanText.split(/\n\s*\n/).filter(p => p.trim().length > 50);
    
    const chunks = [];
    let currentChunk = '';
    let chunkIndex = 0;
    let currentPosition = 0;
    
    for (const paragraph of paragraphs) {
      const paragraphWords = paragraph.trim().split(/\s+/);
      
      // Nếu paragraph này khi thêm vào sẽ vượt quá chunk size
      if (currentChunk.length + paragraph.length > this.config.chunkSize && currentChunk.length > 0) {
        // Lưu chunk hiện tại
        const chunk = await this.createChunkObject(
          currentChunk.trim(), 
          chunkIndex, 
          currentPosition - currentChunk.length,
          currentPosition
        );
        chunks.push(chunk);
        
        // Tạo chunk mới với overlap
        const overlapText = this.getOverlapText(currentChunk, this.config.chunkOverlap);
        currentChunk = overlapText + paragraph;
        chunkIndex++;
      } else {
        // Thêm paragraph vào chunk hiện tại
        currentChunk += (currentChunk ? '\n\n' : '') + paragraph;
      }
      
      currentPosition += paragraph.length;
    }
    
    // Lưu chunk cuối cùng
    if (currentChunk.trim().length > 0) {
      const chunk = await this.createChunkObject(
        currentChunk.trim(), 
        chunkIndex,
        currentPosition - currentChunk.length,
        currentPosition
      );
      chunks.push(chunk);
    }
    
    console.log(`✂️ Đã chia thành ${chunks.length} chunks`);
    return chunks;
  }

  /**
   * Tạo chunk object
   */
  async createChunkObject(content, index, startChar, endChar) {
    const contentHash = crypto.createHash('sha256').update(content).digest('hex');
    const wordCount = content.split(/\s+/).length;
    const keywords = await this.extractKeywords(content);
    
    // Detect section title
    const sectionTitle = this.extractSectionTitle(content);
    
    return {
      chunk_index: index,
      content,
      content_hash: contentHash,
      start_char: startChar,
      end_char: endChar,
      word_count: wordCount,
      token_count: this.estimateTokens(content),
      section_title: sectionTitle,
      keywords,
      chunk_type: this.detectChunkType(content),
      quality_score: this.calculateQualityScore(content)
    };
  }

  /**
   * Làm sạch text
   */
  cleanText(text) {
    return text
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  /**
   * Lấy text overlap
   */
  getOverlapText(text, overlapSize) {
    const words = text.split(/\s+/);
    if (words.length <= overlapSize) return text;
    
    return words.slice(-overlapSize).join(' ');
  }

  /**
   * Extract keywords từ content
   */
  async extractKeywords(content) {
    // Simple keyword extraction - có thể cải thiện bằng NLP
    const vietnameseStopWords = [
      'và', 'của', 'trong', 'với', 'là', 'một', 'có', 'được', 'các', 'cho', 'để', 'này', 'đó',
      'từ', 'về', 'như', 'theo', 'sau', 'trước', 'khi', 'nếu', 'mà', 'hay', 'hoặc', 'nhưng'
    ];
    
    const words = content.toLowerCase()
      .match(/\b[a-záàảạãăắằẳặẵâấầẩậẫéèẻẹẽêếềểệễíìỉịĩóòỏọõôốồổộỗơớờởợỡúùủụũưứừửựữýỳỷỵỹđ]+\b/g) || [];
    
    const wordFreq = {};
    words.forEach(word => {
      if (word.length > 3 && !vietnameseStopWords.includes(word)) {
        wordFreq[word] = (wordFreq[word] || 0) + 1;
      }
    });
    
    // Trả về top 10 keywords
    return Object.entries(wordFreq)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 10)
      .map(([word]) => word);
  }

  /**
   * Extract section title từ content
   */
  extractSectionTitle(content) {
    const lines = content.split('\n');
    for (const line of lines.slice(0, 5)) { // Check first 5 lines
      const trimmedLine = line.trim();
      if (trimmedLine.match(/^(CHƯƠNG|Chương|PHẦN|Phần|MỤCLỤC|Mục lục|\d+\.)/)) {
        return trimmedLine.substring(0, 200);
      }
    }
    return null;
  }

  /**
   * Detect chunk type
   */
  detectChunkType(content) {
    if (content.match(/^(CHƯƠNG|Chương|PHẦN|Phần|\d+\.)/)) {
      return 'heading';
    }
    if (content.includes('- ') || content.includes('• ')) {
      return 'list';
    }
    if (content.includes('|') && content.includes('---')) {
      return 'table';
    }
    if (content.startsWith('"') || content.includes('"')) {
      return 'quote';
    }
    return 'paragraph';
  }

  /**
   * Calculate quality score cho chunk
   */
  calculateQualityScore(content) {
    let score = 1.0;
    
    // Penalize quá ngắn
    if (content.length < 100) score -= 0.3;
    
    // Penalize quá dài
    if (content.length > 2000) score -= 0.2;
    
    // Bonus cho có keywords quan trọng
    const importantKeywords = ['hồ chí minh', 'chủ nghĩa', 'cách mạng', 'đảng', 'nhân dân'];
    for (const keyword of importantKeywords) {
      if (content.toLowerCase().includes(keyword)) {
        score += 0.1;
      }
    }
    
    return Math.max(0.1, Math.min(1.0, score));
  }

  /**
   * Estimate số tokens
   */
  estimateTokens(text) {
    // Rough estimation: Vietnamese có khoảng 1.3-1.5 tokens per word
    return Math.ceil(text.split(/\s+/).length * 1.4);
  }

  /**
   * Generate embeddings cho chunks
   */
  async generateEmbeddings(chunks) {
    console.log('🧠 Tạo embeddings cho chunks...');
    
    // Tuneable batch size; modern models can handle larger batches
    const batchSize = 64;
    // Simple per-run cache to avoid duplicate calls for identical content
    const embeddingCache = new Map();
    
    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize);
      console.log(`📊 Processing batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(chunks.length/batchSize)}`);
      // Determine which inputs are uncached
      const inputs = batch.map(chunk => chunk.content);
      const missingInputs = [];
      const inputIndexMap = new Map();
      inputs.forEach((text, idx) => {
        if (!embeddingCache.has(text)) {
          if (!inputIndexMap.has(text)) inputIndexMap.set(text, []);
          inputIndexMap.get(text).push(idx);
          missingInputs.push(text);
        }
      });

      // Create embeddings for missing via single batched API call when possible
      if (missingInputs.length > 0) {
        try {
          if (!this.openai || !this.config) {
            await this.initializeConfig();
          }
          const response = await this.openai.embeddings.create({
            model: this.config.embeddingModel,
            input: missingInputs
          });
          response.data.forEach((row, rIdx) => {
            embeddingCache.set(missingInputs[rIdx], row.embedding);
          });
        } catch (e) {
          console.warn('⚠️ Batch embedding failed, falling back to per-item:', e.message || e);
          // Fallback per item
          for (const text of missingInputs) {
            const single = await this.createEmbedding(text);
            embeddingCache.set(text, single);
          }
        }
      }
      
      const embeddings = inputs.map(text => embeddingCache.get(text) || null);
      
      // Assign embeddings back to chunks
      batch.forEach((chunk, index) => {
        chunk.embedding = embeddings[index];
      });
      
      // Rate limiting - delay giữa các batch
      // Reduce inter-batch delay now that we batch requests
      if (i + batchSize < chunks.length) await new Promise(resolve => setTimeout(resolve, 200));
    }
    
    console.log('✅ Hoàn thành tạo embeddings');
  }

  /**
   * Tạo embedding cho một đoạn text
   */
  async createEmbedding(text) {
    try {
      // Ensure OpenAI is initialized
      if (!this.openai || !this.config) {
        await this.initializeConfig();
      }

      const response = await this.openai.embeddings.create({
        model: this.config.embeddingModel,
        input: text,
      });
      
      return response.data[0].embedding;
    } catch (error) {
      console.error('❌ Lỗi tạo embedding:', error);
      return null;
    }
  }

  /**
   * Lưu chunks vào database
   */
  async saveChunks(chunks, documentId) {
    console.log('💾 Lưu chunks vào database...');
    
    const chunksToSave = chunks.map(chunk => ({
      document_id: documentId,
      ...chunk
    }));
    
    await DocumentChunk.bulkCreate(chunksToSave);
    
    console.log(`✅ Đã lưu ${chunksToSave.length} chunks`);
  }
}

module.exports = PDFProcessor;
