const { Settings, User } = require('../models');
const { OpenAI } = require('openai');
const crypto = require('crypto');

class SettingsService {
  constructor() {
    this.cache = new Map();
    this.cacheExpiry = new Map();
    this.cacheTTL = 300000; // 5 minutes cache
  }

  /**
   * Lấy setting với cache
   */
  async getSetting(key, defaultValue = null) {
    // Check cache first
    if (this.cache.has(key) && this.cacheExpiry.get(key) > Date.now()) {
      return this.cache.get(key);
    }

    const value = await Settings.get(key, defaultValue);
    
    // Cache the value
    this.cache.set(key, value);
    this.cacheExpiry.set(key, Date.now() + this.cacheTTL);
    
    return value;
  }

  /**
   * Cập nhật setting
   */
  async updateSetting(key, value, userId = null, options = {}) {
    try {
      // Validate setting
      const validation = await this.validateSetting(key, value);
      if (!validation.valid) {
        throw new Error(validation.error);
      }

      // Encrypt sensitive values
      let finalValue = value;
      if (this.isSensitiveKey(key)) {
        finalValue = this.encryptValue(value);
        options.isEncrypted = true;
      }

      // Update in database
      const setting = await Settings.set(key, finalValue, {
        ...options,
        userId
      });

      // Clear cache
      this.cache.delete(key);
      this.cacheExpiry.delete(key);

      // Log the change
      console.log(`⚙️ Setting updated: ${key} by user ${userId || 'system'}`);

      return {
        success: true,
        setting: {
          key: setting.key,
          value: options.isEncrypted ? '[ENCRYPTED]' : setting.value,
          category: setting.category,
          description: setting.description
        }
      };

    } catch (error) {
      console.error(`❌ Error updating setting ${key}:`, error);
      throw error;
    }
  }

  /**
   * Lấy tất cả settings theo category
   */
  async getSettingsByCategory(category, includePrivate = false) {
    const cacheKey = `category_${category}_${includePrivate}`;
    
    if (this.cache.has(cacheKey) && this.cacheExpiry.get(cacheKey) > Date.now()) {
      return this.cache.get(cacheKey);
    }

    const settings = await Settings.getByCategory(category, includePrivate);
    
    // Cache results
    this.cache.set(cacheKey, settings);
    this.cacheExpiry.set(cacheKey, Date.now() + this.cacheTTL);
    
    return settings;
  }

  /**
   * Validate setting value
   */
  async validateSetting(key, value) {
    try {
      switch (key) {
        case 'openai_api_key':
          return await this.validateOpenAIKey(value);
        
        case 'openai_base_url':
          return this.validateBaseURL(value);
        
        case 'openai_chat_model':
          return await this.validateChatModel(value);
        
        case 'openai_embedding_model':
          return await this.validateEmbeddingModel(value);
        
        case 'chat_temperature':
          return this.validateTemperature(value);
        
        case 'chat_max_tokens':
          return this.validateMaxTokens(value);
        
        case 'rag_top_k_results':
          return this.validateTopK(value);
        
        case 'rag_similarity_threshold':
          return this.validateSimilarityThreshold(value);
        
        default:
          return { valid: true };
      }
    } catch (error) {
      return {
        valid: false,
        error: error.message
      };
    }
  }

  /**
   * Validate OpenAI API Key
   */
  async validateOpenAIKey(apiKey, baseURL = null) {
    if (!apiKey || typeof apiKey !== 'string') {
      return { valid: false, error: 'API key không hợp lệ' };
    }

    if (!apiKey.startsWith('sk-')) {
      return { valid: false, error: 'API key phải bắt đầu với "sk-"' };
    }

    try {
      const config = { apiKey };
      if (baseURL) {
        config.baseURL = baseURL;
      }
      
      const openai = new OpenAI(config);
      await openai.models.list();
      return { valid: true };
    } catch (error) {
      return {
        valid: false,
        error: `API key không hợp lệ: ${error.message}`
      };
    }
  }

  /**
   * Validate Base URL
   */
  validateBaseURL(url) {
    if (!url || typeof url !== 'string') {
      return { valid: false, error: 'Base URL không hợp lệ' };
    }

    try {
      const urlObj = new URL(url);
      
      // Check if it's HTTPS (recommended for production)
      if (urlObj.protocol !== 'https:' && urlObj.protocol !== 'http:') {
        return { valid: false, error: 'Base URL phải sử dụng http:// hoặc https://' };
      }

      // Common OpenAI-compatible endpoints
      const validPatterns = [
        /^https:\/\/api\.openai\.com\/v1\/?$/,                    // Official OpenAI
        /^https:\/\/.*\.openai\.azure\.com\/.*$/,                // Azure OpenAI
        /^https?:\/\/localhost:\d+\/.*$/,                        // Local development
        /^https?:\/\/.*\/v1\/?$/,                                // Generic v1 API
        /^https?:\/\/.*openai.*$/                                // Any OpenAI-like service
      ];

      const isValidPattern = validPatterns.some(pattern => pattern.test(url));
      
      if (!isValidPattern) {
        console.warn(`Base URL ${url} doesn't match common OpenAI patterns, but allowing it`);
      }

      return { valid: true };
    } catch (error) {
      return {
        valid: false,
        error: 'Base URL format không hợp lệ'
      };
    }
  }

  /**
   * Validate chat model
   */
  async validateChatModel(model) {
    const validModels = [
      'gpt-3.5-turbo',
      'gpt-3.5-turbo-16k',
      'gpt-4',
      'gpt-4-turbo-preview',
      'gpt-4o',
      'gpt-4o-mini'
    ];

    if (!validModels.includes(model)) {
      return {
        valid: false,
        error: `Model không được hỗ trợ. Các model hợp lệ: ${validModels.join(', ')}`
      };
    }

    return { valid: true };
  }

  /**
   * Validate embedding model
   */
  async validateEmbeddingModel(model) {
    const validModels = [
      'text-embedding-ada-002',
      'text-embedding-3-small',
      'text-embedding-3-large'
    ];

    if (!validModels.includes(model)) {
      return {
        valid: false,
        error: `Embedding model không được hỗ trợ. Các model hợp lệ: ${validModels.join(', ')}`
      };
    }

    return { valid: true };
  }

  /**
   * Validate temperature
   */
  validateTemperature(temp) {
    const temperature = parseFloat(temp);
    if (isNaN(temperature) || temperature < 0 || temperature > 2) {
      return {
        valid: false,
        error: 'Temperature phải là số từ 0.0 đến 2.0'
      };
    }
    return { valid: true };
  }

  /**
   * Validate max tokens
   */
  validateMaxTokens(tokens) {
    const maxTokens = parseInt(tokens);
    if (isNaN(maxTokens) || maxTokens < 100 || maxTokens > 400000) {
      return {
        valid: false,
        error: 'Max tokens phải là số từ 100 đến 400000'
      };
    }
    return { valid: true };
  }

  /**
   * Validate top K results
   */
  validateTopK(topK) {
    const k = parseInt(topK);
    if (isNaN(k) || k < 1 || k > 20) {
      return {
        valid: false,
        error: 'Top K phải là số từ 1 đến 20'
      };
    }
    return { valid: true };
  }

  /**
   * Validate similarity threshold
   */
  validateSimilarityThreshold(threshold) {
    const thresh = parseFloat(threshold);
    if (isNaN(thresh) || thresh < 0 || thresh > 1) {
      return {
        valid: false,
        error: 'Similarity threshold phải là số từ 0.0 đến 1.0'
      };
    }
    return { valid: true };
  }

  /**
   * Check if key is sensitive
   */
  isSensitiveKey(key) {
    const sensitiveKeys = ['openai_api_key', 'jwt_secret'];
    return sensitiveKeys.includes(key);
  }

  /**
   * Encrypt sensitive value
   */
  encryptValue(value) {
    // Simple encryption - trong production nên dùng proper encryption
    const algorithm = 'aes-256-cbc';
    const key = process.env.ENCRYPTION_KEY || process.env.JWT_SECRET || 'default-key-change-in-production';
    const iv = crypto.randomBytes(16);
    
    const cipher = crypto.createCipher(algorithm, key);
    let encrypted = cipher.update(value, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    return encrypted;
  }

  /**
   * Decrypt sensitive value
   */
  decryptValue(encryptedValue) {
    try {
      const algorithm = 'aes-256-cbc';
      const key = process.env.ENCRYPTION_KEY || process.env.JWT_SECRET || 'default-key-change-in-production';
      
      const decipher = crypto.createDecipher(algorithm, key);
      let decrypted = decipher.update(encryptedValue, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      return decrypted;
    } catch (error) {
      console.error('❌ Error decrypting value:', error);
      return encryptedValue; // Return as-is if decryption fails
    }
  }

  /**
   * Get current OpenAI configuration
   */
  async getCurrentOpenAIConfig() {
    return {
      apiKey: process.env.OPENAI_API_KEY,
      baseURL: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
      chatModel: process.env.OPENAI_MODEL || 'gpt-3.5-turbo',
      embeddingModel: process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-ada-002',
      maxTokens: parseInt(process.env.CHAT_MAX_TOKENS || '4000'),
      temperature: parseFloat(process.env.CHAT_TEMPERATURE || '0.7')
    };
  }

  /**
   * Get current RAG configuration
   */
  async getCurrentRAGConfig() {
    return {
      chunkSize: parseInt(process.env.CHUNK_SIZE || '1000'),
      chunkOverlap: parseInt(process.env.CHUNK_OVERLAP || '200'),
      topKResults: parseInt(process.env.TOP_K_RESULTS || '5'),
      similarityThreshold: parseFloat(process.env.SIMILARITY_THRESHOLD || '0.7')
    };
  }

  /**
   * Test OpenAI connection với settings hiện tại
   */
  async testCurrentOpenAIConnection() {
    try {
      const config = await this.getCurrentOpenAIConfig();
      const openai = new OpenAI({ apiKey: config.apiKey });
      
      // Test chat completion
      const chatTest = await openai.chat.completions.create({
        model: config.chatModel,
        messages: [{ role: 'user', content: 'Test' }],
        max_tokens: 5
      });

      // Test embeddings
      const embeddingTest = await openai.embeddings.create({
        model: config.embeddingModel,
        input: 'test'
      });

      return {
        success: true,
        chatModel: config.chatModel,
        embeddingModel: config.embeddingModel,
        chatTestTokens: chatTest.usage.total_tokens,
        embeddingDimensions: embeddingTest.data[0].embedding.length
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Reset settings về default
   */
  async resetToDefaults(category = null, userId = null) {
    try {
      let whereCondition = {};
      if (category) {
        whereCondition.category = category;
      }

      const settings = await Settings.findAll({ where: whereCondition });
      
      for (const setting of settings) {
        if (setting.default_value) {
          await this.updateSetting(setting.key, setting.default_value, userId);
        }
      }

      // Clear all cache
      this.cache.clear();
      this.cacheExpiry.clear();

      console.log(`✅ Reset settings to defaults${category ? ` for category: ${category}` : ''}`);
      return { success: true };

    } catch (error) {
      console.error('❌ Error resetting settings:', error);
      throw error;
    }
  }

  /**
   * Clear cache
   */
  clearCache() {
    this.cache.clear();
    this.cacheExpiry.clear();
    console.log('🔄 Settings cache cleared');
  }
}

module.exports = SettingsService;
