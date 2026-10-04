const { OpenAI } = require('openai');
const { DocumentChunk, Document } = require('../models');
const SettingsService = require('./settingsService');
const { Op } = require('sequelize');

class RAGService {
  constructor() {
    this.settingsService = new SettingsService();
    this.openai = null; // Will be initialized dynamically
    this.config = null; // Will be loaded from settings
  }

  /**
   * Initialize or refresh configuration
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
      
      console.log(`🧠 RAGService initialized with embedding model: ${this.config.embeddingModel}, baseURL: ${this.config.baseURL}`);
    } catch (error) {
      console.error('❌ Error initializing RAG config:', error);
      // Fallback to environment variables
      this.openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
        baseURL: process.env.OPENAI_BASE_URL
      });
      this.config = {
        apiKey: process.env.OPENAI_API_KEY,
        baseURL: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
        embeddingModel: process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-ada-002',
        topKResults: parseInt(process.env.TOP_K_RESULTS) || 5,
        similarityThreshold: 0.7
      };
    }
  }

  /**
   * Refresh configuration từ database
   */
  async refreshConfiguration() {
    await this.initializeConfig();
  }

  /**
   * Tìm kiếm chunks relevant dựa trên query
   */
  async searchRelevantChunks(query, options = {}) {
    // Ensure config is loaded
    if (!this.config) {
      await this.initializeConfig();
    }

    const {
      limit = this.config.topKResults,
      minSimilarity = this.config.similarityThreshold,
      category = null,
      documentIds = null
    } = options;

    try {
      console.log(`🔍 Searching for: "${query}"`);
      
      // Tạo embedding cho query
      const queryEmbedding = await this.createQueryEmbedding(query);
      
      // Kết hợp semantic search và keyword search
      const semanticResults = await this.semanticSearch(queryEmbedding, {
        limit: Math.ceil(limit * 0.7), // 70% từ semantic search
        category,
        documentIds
      });
      
      const keywordResults = await this.keywordSearch(query, {
        limit: Math.ceil(limit * 0.3), // 30% từ keyword search
        category,
        documentIds,
        excludeIds: semanticResults.map(r => r.id)
      });
      
      // Merge và rank results
      const allResults = [...semanticResults, ...keywordResults];
      const rankedResults = this.rankAndDeduplicate(allResults, query);
      
      console.log(`📊 Found ${rankedResults.length} relevant chunks`);
      
      return rankedResults.slice(0, limit);
      
    } catch (error) {
      console.error('❌ Error in RAG search:', error);
      // Fallback to keyword search only
      return await this.keywordSearch(query, { limit, category, documentIds });
    }
  }

  /**
   * Tạo embedding cho query
   */
  async createQueryEmbedding(query) {
    // Ensure OpenAI is initialized
    if (!this.openai || !this.config) {
      await this.initializeConfig();
    }

    const response = await this.openai.embeddings.create({
      model: this.config.embeddingModel,
      input: query,
    });
    
    return response.data[0].embedding;
  }

  /**
   * Semantic search using embeddings
   */
  async semanticSearch(queryEmbedding, options = {}) {
    const { limit, category, documentIds } = options;
    
    // Build where condition
    let whereCondition = {
      embedding: {
        [Op.not]: null
      }
    };
    
    if (documentIds) {
      whereCondition.document_id = {
        [Op.in]: documentIds
      };
    }
    
    // Get chunks with embeddings
    const chunks = await DocumentChunk.findAll({
      where: whereCondition,
      include: [{
        model: Document,
        as: 'document',
        where: category ? { category } : {},
        attributes: ['id', 'title', 'category', 'file_name']
      }],
      limit: limit * 3 // Get more to calculate similarity
    });
    
    // Calculate cosine similarity
    const resultsWithSimilarity = chunks.map(chunk => {
      const similarity = this.cosineSimilarity.bind(this)(queryEmbedding, chunk.embedding);
      return {
        ...chunk.toJSON(),
        similarity_score: similarity
      };
    });
    
    // Filter by similarity threshold and sort
    return resultsWithSimilarity
      .filter(r => r.similarity_score >= this.config.similarityThreshold)
      .sort((a, b) => b.similarity_score - a.similarity_score)
      .slice(0, limit);
  }

  /**
   * Keyword-based search
   */
  async keywordSearch(query, options = {}) {
    const { limit, category, documentIds, excludeIds = [] } = options;
    
    // Prepare search terms
    const searchTerms = this.extractSearchTerms(query);
    
    let whereCondition = {
      [Op.or]: [
        {
          content: {
            [Op.iLike]: `%${query}%`
          }
        },
        {
          keywords: {
            [Op.overlap]: searchTerms
          }
        },
        {
          section_title: {
            [Op.iLike]: `%${query}%`
          }
        }
      ]
    };
    
    if (excludeIds.length > 0) {
      whereCondition.id = {
        [Op.notIn]: excludeIds
      };
    }
    
    if (documentIds) {
      whereCondition.document_id = {
        [Op.in]: documentIds
      };
    }
    
    const results = await DocumentChunk.findAll({
      where: whereCondition,
      include: [{
        model: Document,
        as: 'document',
        where: category ? { category } : {},
        attributes: ['id', 'title', 'category', 'file_name']
      }],
      order: [
        ['usage_count', 'DESC'],
        ['quality_score', 'DESC'],
        ['createdAt', 'DESC']
      ],
      limit
    });
    
    // Add keyword-based similarity score
    return results.map(chunk => ({
      ...chunk.toJSON(),
      similarity_score: this.calculateKeywordSimilarity(query, chunk.content, chunk.keywords)
    }));
  }

  /**
   * Extract search terms from query
   */
  extractSearchTerms(query) {
    return query.toLowerCase()
      .split(/\s+/)
      .filter(term => term.length > 2)
      .map(term => term.replace(/[^\w\sáàảạãăắằẳặẵâấầẩậẫéèẻẹẽêếềểệễíìỉịĩóòỏọõôốồổộỗơớờởợỡúùủụũưứừửựữýỳỷỵỹđ]/gi, ''));
  }

  /**
   * Calculate cosine similarity
   */
  cosineSimilarity(vecA, vecB) {
    if (!vecA || !vecB || vecA.length !== vecB.length) return 0;
    
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    
    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }
    
    if (normA === 0 || normB === 0) return 0;
    
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * Calculate keyword-based similarity
   */
  calculateKeywordSimilarity(query, content, keywords) {
    const queryTerms = this.extractSearchTerms(query);
    const contentTerms = this.extractSearchTerms(content);
    
    let score = 0;
    
    // Exact phrase match (highest weight)
    if (content.toLowerCase().includes(query.toLowerCase())) {
      score += 0.5;
    }
    
    // Keyword matches
    const keywordMatches = queryTerms.filter(term => 
      keywords.includes(term) || contentTerms.includes(term)
    );
    score += (keywordMatches.length / queryTerms.length) * 0.3;
    
    // Fuzzy matches (simple approach)
    queryTerms.forEach(queryTerm => {
      const matches = keywords.filter(keyword => 
        keyword.includes(queryTerm) || queryTerm.includes(keyword)
      );
      score += matches.length * 0.1;
    });
    
    return Math.min(1.0, score);
  }

  /**
   * Rank and deduplicate results
   */
  rankAndDeduplicate(results, query) {
    // Remove duplicates based on content hash
    const seen = new Set();
    const unique = results.filter(result => {
      if (seen.has(result.content_hash)) return false;
      seen.add(result.content_hash);
      return true;
    });
    
    // Re-calculate combined score
    return unique.map(result => ({
      ...result,
      combined_score: this.calculateCombinedScore(result, query)
    })).sort((a, b) => b.combined_score - a.combined_score);
  }

  /**
   * Calculate combined relevance score
   */
  calculateCombinedScore(result, query) {
    let score = result.similarity_score || 0;
    
    // Boost based on quality score
    score += (result.quality_score || 0) * 0.2;
    
    // Boost popular chunks
    if (result.usage_count > 10) score += 0.1;
    
    // Boost based on section importance
    if (result.section_title && result.section_title.toLowerCase().includes('chương')) {
      score += 0.1;
    }
    
    // Penalty for very short chunks
    if (result.word_count < 50) score -= 0.2;
    
    return Math.max(0, Math.min(1, score));
  }

  /**
   * Generate context for RAG prompt
   */
  generateRAGContext(chunks, query) {
    if (!chunks || chunks.length === 0) {
      return {
        context: '',
        sources: []
      };
    }
    
    let context = 'Dựa trên các tài liệu học tập về Tư tưởng Hồ Chí Minh:\n\n';
    const sources = [];
    
    chunks.forEach((chunk, index) => {
      const sourceId = index + 1;
      context += `[Nguồn ${sourceId}] ${chunk.content}\n\n`;
      
      sources.push({
        id: sourceId,
        chunk_id: chunk.id,
        document_title: chunk.document.title,
        section_title: chunk.section_title,
        page_number: chunk.page_number,
        similarity_score: chunk.similarity_score || chunk.combined_score,
        word_count: chunk.word_count
      });
      
      // Increment usage count
      this.incrementChunkUsage(chunk.id);
    });
    
    context += `\nCâu hỏi: ${query}\n\n`;
    
    // Check if this is a quiz explanation request
    const isQuizExplanation = query.includes('câu hỏi trắc nghiệm') || 
                              query.includes('câu trả lời của tôi') || 
                              query.includes('đáp án đúng') ||
                              query.includes('Kết quả:');
    
    if (isQuizExplanation) {
      context += 'Hãy giải thích chi tiết về câu hỏi trắc nghiệm này dựa trên thông tin từ các nguồn trên. Giải thích tại sao đáp án đó đúng, phân tích từng lựa chọn, và nếu người dùng trả lời sai thì giải thích tại sao sai. Sử dụng kiến thức về Tư tưởng Hồ Chí Minh để giải thích một cách đầy đủ, chính xác và dễ hiểu. Luôn luôn suy nghĩ dựa trên Tư Tưởng Hồ Chí Minh. Không được nghĩ sai trái và sai chế độ về Đảng cộng sản Việt Nam và Tư Tưởng Hồ Chí Minh. Không nói ra nguồn bạn lấy từ đâu nhé, trả lời trong khoảng 2000 từ.';
    } else {
      context += 'Hãy trả lời câu hỏi, nếu có nguồn được đưa cho bạn, hãy trả lời dựa trên thông tin từ các nguồn trên. Trả lời đúng, chi tiết, chính xác và đầy đủ. Nếu thông tin không đủ, hãy nói rằng cần thêm thông tin. Luôn luôn suy nghĩ dựa trên Tư Tưởng Hồ Chí Minh. Không được nghĩ sai trái và sai chế độ về Đảng cộng sản Việt Nam và Tư Tưởng Hồ Chí Minh. Không nói ra nguồn bạn lấy từ đâu nhé, trả lời trong khoảng 2000 từ.';
    }
    
    return { context, sources };
  }

  /**
   * Increment chunk usage count (async, don't wait)
   */
  incrementChunkUsage(chunkId) {
    DocumentChunk.findByPk(chunkId)
      .then(chunk => {
        if (chunk) {
          return chunk.incrementUsage();
        }
      })
      .catch(err => console.error('Error incrementing chunk usage:', err));
  }

  /**
   * Get popular chunks for suggestions
   */
  async getPopularChunks(limit = 10, category = null) {
    let whereCondition = {};
    if (category) {
      whereCondition = {
        '$document.category$': category
      };
    }
    
    return await DocumentChunk.findAll({
      where: whereCondition,
      include: [{
        model: Document,
        as: 'document',
        attributes: ['id', 'title', 'category']
      }],
      order: [
        ['usage_count', 'DESC'],
        ['quality_score', 'DESC']
      ],
      limit,
      attributes: ['id', 'content', 'section_title', 'keywords', 'usage_count']
    });
  }

  /**
   * Extracts a JSON object from a string, handling markdown code blocks.
   * @param {string} str The string to extract JSON from.
   * @returns {string} A JSON string or the original string if no JSON object is found.
   * @private
   */
  _extractJsonFromString(str) {
    if (!str || typeof str !== 'string') {
      return '{"questions": []}';
    }

    // First, try to clean up markdown code blocks
    let cleanedStr = str
      .replace(/^```json\s*/i, '')
      .replace(/```\s*$/i, '')
      .replace(/^```\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim();

    // Remove any leading/trailing backticks or other markdown artifacts
    cleanedStr = cleanedStr.replace(/^`+|`+$/g, '').trim();

    // Try to find JSON object boundaries more carefully
    const jsonMatch = cleanedStr.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      let jsonStr = jsonMatch[0];
      
      // Check if JSON appears to be truncated (missing closing brace)
      if (!jsonStr.endsWith('}')) {
        // Try to find the last complete question and close the JSON
        const lastCompleteQuestion = jsonStr.match(/"[^"]*"\s*\]/g);
        if (lastCompleteQuestion && lastCompleteQuestion.length > 0) {
          const lastMatch = lastCompleteQuestion[lastCompleteQuestion.length - 1];
          const lastIndex = jsonStr.lastIndexOf(lastMatch);
          if (lastIndex !== -1) {
            jsonStr = jsonStr.substring(0, lastIndex + lastMatch.length) + ']}';
          }
        }
      }
      
      try {
        // Validate the JSON before returning
        JSON.parse(jsonStr);
        return jsonStr;
      } catch (e) {
        // JSON is malformed, try to fix common issues
        try {
          // Try to fix common JSON issues
          let fixedJson = jsonStr
            .replace(/,(\s*[}\]])/g, '$1') // Remove trailing commas
            .replace(/([{,]\s*)(\w+):/g, '$1"$2":') // Add quotes to unquoted keys
            .replace(/:\s*([^",{\[\s][^,}\]\]]*?)(\s*[,\}\]])/g, ': "$1"$2'); // Add quotes to unquoted string values
          
          JSON.parse(fixedJson);
          return fixedJson;
        } catch (e2) {
          // Try to extract partial questions if JSON is incomplete
          const questionMatches = jsonStr.match(/"([^"]+?)"/g);
          if (questionMatches && questionMatches.length > 0) {
            const questions = questionMatches.map(q => q.replace(/"/g, '')).filter(q => q.trim().length > 0);
            if (questions.length > 0) {
              return JSON.stringify({ questions: questions });
            }
          }
          // Still not valid, fall through to other methods
        }
      }
    }

    // Try to find any JSON-like structure
    const firstBrace = cleanedStr.indexOf('{');
    const lastBrace = cleanedStr.lastIndexOf('}');

    if (firstBrace !== -1 && lastBrace > firstBrace) {
      const jsonStr = cleanedStr.substring(firstBrace, lastBrace + 1);
      try {
        JSON.parse(jsonStr);
        return jsonStr;
      } catch (e) {
        // Try to fix the JSON
        try {
          let fixedJson = jsonStr
            .replace(/,(\s*[}\]])/g, '$1')
            .replace(/([{,]\s*)(\w+):/g, '$1"$2":')
            .replace(/:\s*([^",{\[\s][^,}\]\]]*?)(\s*[,\}\]])/g, ': "$1"$2');
          
          JSON.parse(fixedJson);
          return fixedJson;
        } catch (e2) {
          // Still not valid
        }
      }
    }

    // If all else fails, return a safe default
    console.warn('Could not extract valid JSON from AI response. Length:', str.length);
    console.warn('First 500 chars:', str.substring(0, 500));
    console.warn('Last 200 chars:', str.substring(Math.max(0, str.length - 200)));
    return '{"questions": []}';
  }

  /**
   * Get suggested questions based on popular content using AI
   */
  async generateSuggestedQuestions(limit = 7) {
    try {
      const popularChunks = await this.getPopularChunks(5);
      if (popularChunks.length === 0) {
        return [];
      }

      const contextForAI = popularChunks.map((chunk, index) =>
        `Trích đoạn ${index + 1} (từ mục: ${chunk.section_title || 'Không rõ'}):\n"${chunk.content}"`
      ).join('\n\n---\n\n');

      const systemPrompt = `Bạn là một trợ lý AI chuyên tạo câu hỏi học tập về tư tưởng Hồ Chí Minh. Dựa vào các trích đoạn được cung cấp, hãy tạo ra ${limit} câu hỏi sâu sắc, gợi mở tư duy cho sinh viên.

QUY TẮC NGHIÊM NGẶT:
- Các câu hỏi phải bằng tiếng Việt.
- Chỉ đưa ra các câu hỏi ngắn gọn, không dài dòng. Từ 100 từ trở xuống.
- CHỈ trả lời bằng một đối tượng JSON hợp lệ, KHÔNG có markdown, KHÔNG có backticks.
- Đối tượng JSON phải có một khóa duy nhất là "questions".
- Giá trị của "questions" phải là một mảng chứa chính xác ${limit} chuỗi câu hỏi.
- KHÔNG thêm bất kỳ giải thích, văn bản, hoặc ký tự nào khác ngoài đối tượng JSON.
- KHÔNG sử dụng markdown code blocks.

Ví dụ JSON đầu ra chính xác:
{"questions":["Câu hỏi mẫu 1?","Câu hỏi mẫu 2?","Câu hỏi mẫu 3?","Câu hỏi mẫu 4?","Câu hỏi mẫu 5?"]}`;

      const userPrompt = `Hãy tạo câu hỏi từ các trích đoạn sau:\n\n${contextForAI}`;

      if (!this.openai || !this.config) {
        await this.initializeConfig();
      }

      const response = await this.openai.chat.completions.create({
        model: this.config.chatModel || 'gpt-3.5-turbo-1106',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.8,
        max_tokens: 3000,
      });

      const content = response.choices[0].message.content;
      console.log('🤖 AI Response length:', content.length);
      console.log('🤖 AI Response preview:', content.substring(0, 200) + '...');
      
      const jsonString = this._extractJsonFromString(content);
      console.log('🔧 Extracted JSON length:', jsonString.length);
      console.log('🔧 Extracted JSON preview:', jsonString.substring(0, 200) + '...');
      
      let suggestions = [];
      try {
        const parsedJson = JSON.parse(jsonString);
        suggestions = parsedJson.questions || [];
        
        // Ensure suggestions is an array
        if (!Array.isArray(suggestions)) {
          console.warn('AI returned non-array suggestions, converting to array');
          suggestions = Array.isArray(suggestions) ? suggestions : [suggestions];
        }
        
        // Filter out the literal word "questions" if the AI includes it
        suggestions = suggestions.filter(q => typeof q === 'string' && q.toLowerCase() !== 'questions');
        
        console.log('✅ Successfully parsed', suggestions.length, 'suggestions');
      } catch (error) {
        console.error('Error parsing AI response JSON:', error);
        console.error('Raw content length:', content.length);
        console.error('Raw content:', content);
        console.error('Extracted JSON string length:', jsonString.length);
        console.error('Extracted JSON string:', jsonString);
        suggestions = [];
      }

      if (Array.isArray(suggestions)) {
        return suggestions.slice(0, limit);
      }
      
      console.warn('AI did not return a valid array of suggestions, falling back to rule-based.');
      return this.generateRuleBasedSuggestions(limit);

    } catch (error) {
      console.error('Error generating AI suggestions, falling back to rule-based:', error);
      return this.generateRuleBasedSuggestions(limit);
    }
  }

  /**
   * Get suggested questions based on popular content (Rule-based fallback)
   */
  async generateRuleBasedSuggestions(limit = 5) {
    const popularChunks = await this.getPopularChunks(20);
    
    // Simple question generation based on content
    const suggestions = [];
    
    for (const chunk of popularChunks) {
      if (suggestions.length >= limit) break;
      
      const content = chunk.content;
      const sectionTitle = chunk.section_title;
      
      // Generate questions based on content patterns
      if (sectionTitle && sectionTitle.includes('Chương')) {
        suggestions.push(`${sectionTitle} nói về điều gì?`);
      }
      
      if (content.includes('Hồ Chí Minh')) {
        suggestions.push('Quan điểm của Hồ Chí Minh về vấn đề này là gì?');
      }
      
      // Extract key concepts
      const keywords = chunk.keywords.slice(0, 3);
      if (keywords.length > 0) {
        suggestions.push(`Giải thích về ${keywords.join(', ')} trong tư tưởng Hồ Chí Minh?`);
      }
    }
    
    // Remove duplicates and return unique suggestions
    return [...new Set(suggestions)].slice(0, limit);
  }
}

module.exports = RAGService;
