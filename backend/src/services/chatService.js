const { OpenAI } = require('openai');
const RAGService = require('./ragService');
const SettingsService = require('./settingsService');
const { ChatSession, Message, User } = require('../models');

class ChatService {
  constructor() {
    this.settingsService = new SettingsService();
    this.ragService = new RAGService();
    this.openai = null; // Will be initialized dynamically
    this.config = null; // Will be loaded from settings
  }

  /**
   * Initialize or refresh OpenAI configuration
   */
  async initializeOpenAI() {
    try {
      this.config = await this.settingsService.getCurrentOpenAIConfig();
      this.openai = new OpenAI({
        apiKey: this.config.apiKey,
        baseURL: this.config.baseURL
      });
      console.log(`🤖 ChatService initialized with model: ${this.config.chatModel}, baseURL: ${this.config.baseURL}`);
    } catch (error) {
      console.error('❌ Error initializing OpenAI:', error);
      // Fallback to environment variables
      this.openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
        baseURL: process.env.OPENAI_BASE_URL
      });
      this.config = {
        apiKey: process.env.OPENAI_API_KEY,
        baseURL: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
        chatModel: process.env.OPENAI_MODEL || 'gpt-3.5-turbo',
        maxTokens: 400000,
        temperature: 0.7
      };
    }
  }

  /**
   * Xử lý tin nhắn từ user và tạo response
   */
  async processMessage(sessionId, userId, content, options = {}) {
    const startTime = Date.now();
    
    try {
      // Ensure OpenAI is initialized with latest settings
      if (!this.openai || !this.config) {
        await this.initializeOpenAI();
      }

      console.log(`💬 Processing message from user ${userId} in session ${sessionId}`);
      
      // Chỉ chặn nội dung spam/có hại rõ ràng
      if (!this.isValidHCMQuestion(content)) {
        const restrictedContent = 'Xin lỗi, tôi không thể xử lý loại nội dung này. Vui lòng đặt câu hỏi một cách phù hợp. 🙏';
        
        // Lấy session
        const session = await ChatSession.findByPk(sessionId);
        if (!session) {
          throw new Error('Chat session not found');
        }
        
        // Lưu user message
        await Message.create({
          session_id: sessionId,
          user_id: userId,
          content: content.trim(),
          role: 'user',
          message_type: options.messageType || 'text'
        });
        
        // Lưu restricted response
        const assistantMessage = await Message.create({
          session_id: sessionId,
          user_id: userId,
          content: restrictedContent,
          role: 'assistant',
          message_type: 'text',
          metadata: { restricted: true, reason: 'off_topic' }
        });
        
        await session.incrementMessageCount(2);
        
        return {
          message: {
            role: 'assistant',
            content: restrictedContent
          },
          sources: [],
          totalChunks: 0,
          sessionId,
          processingTime: Date.now() - startTime
        };
      }
      
      // Lấy session và tạo user message
      const session = await ChatSession.findByPk(sessionId);
      if (!session) {
        throw new Error('Chat session not found');
      }
      
      // Lưu user message
      const userMessage = await Message.create({
        session_id: sessionId,
        user_id: userId,
        content: content.trim(),
        role: 'user',
        message_type: options.messageType || 'text'
      });

      // Update session activity
      await session.incrementMessageCount();
      
      // Tìm context từ RAG
      const ragContext = await this.ragService.searchRelevantChunks(content, {
        limit: 5,
        category: options.category
      });

      console.log(`🧠 Found ${ragContext.length} relevant chunks`);
      
      // Tạo prompt với context
      const { systemPrompt, sources } = this.createRAGPrompt(content, ragContext, {
        sessionId,
        includeHistory: options.includeHistory !== false
      });

      // Gọi OpenAI API với dynamic settings
      const aiResponse = await this.generateAIResponse(systemPrompt, content, {
        model: options.model || this.config.chatModel,
        maxTokens: options.maxTokens || this.config.maxTokens,
        temperature: options.temperature || this.config.temperature
      });

      // Lưu AI response
      const responseTime = Date.now() - startTime;
      const aiMessage = await Message.create({
        session_id: sessionId,
        user_id: userId,
        content: aiResponse.content,
        role: 'assistant',
        tokens_used: aiResponse.tokensUsed,
        response_time_ms: responseTime,
        context_used: ragContext.map(chunk => ({
          chunk_id: chunk.id,
          similarity_score: chunk.similarity_score || chunk.combined_score,
          section_title: chunk.section_title
        })),
        sources: sources,
        metadata: {
          model: aiResponse.model,
          temperature: options.temperature || this.config.temperature,
          rag_chunks_count: ragContext.length
        }
      });

      // Update session title if first exchange
      if (session.total_messages <= 2 && !session.title) {
        const title = this.generateSessionTitle(content);
        session.title = title;
        await session.save();
      }

      console.log(`✅ Generated response in ${responseTime}ms`);

      return {
        message: aiMessage,
        sources: sources,
        responseTime: responseTime,
        tokensUsed: aiResponse.tokensUsed,
        ragChunksUsed: ragContext.length
      };

    } catch (error) {
      console.error('❌ Error processing message:', error);
      
      // Tạo fallback response
      const fallbackMessage = await Message.create({
        session_id: sessionId,
        user_id: userId,
        content: 'Xin lỗi, tôi gặp sự cố khi xử lý câu hỏi của bạn. Bạn có thể thử lại hoặc diễn đạt câu hỏi khác không?',
        role: 'assistant',
        response_time_ms: Date.now() - startTime,
        metadata: {
          error: true,
          error_message: error.message
        }
      });

      return {
        message: fallbackMessage,
        error: error.message
      };
    }
  }

  /**
   * Kiểm tra xem câu hỏi có cần chặn không (chỉ chặn những nội dung spam/có hại rõ ràng)
   */
  isValidHCMQuestion(query) {
    const queryLower = query.toLowerCase().trim();
    
    // Chỉ chặn những nội dung spam/có hại rõ ràng
    const explicitlyBannedPatterns = [
      // Spam patterns
      /(.)\1{10,}/, // Repeated characters (aaaaaaaaaa...)
      /https?:\/\/[^\s]+/i, // URLs
      /<script|javascript:|on\w+=/i, // XSS attempts
      
      // Adult/inappropriate content
      /\b(sex|porn|xxx)\b/i,
      
      // Obvious tech support (only very specific ones)
      /\b(install|download|setup|config|debug|error|fix|bug)\s+(python|javascript|node|npm|git|code)\b/i,
      /\b(debug|fix|error)\s+.*(javascript|python|code|programming)\b/i
    ];
    
    // Kiểm tra các pattern bị cấm
    const hasExplicitlyBannedContent = explicitlyBannedPatterns.some(pattern => 
      pattern.test(queryLower)
    );
    
    if (hasExplicitlyBannedContent) {
      return false;
    }
    
    // Tất cả các trường hợp khác đều cho phép - để system prompt xử lý
    return true;
  }

  /**
   * Tạo prompt với RAG context
   */
  createRAGPrompt(userQuery, ragChunks, options = {}) {
    const { sessionId, includeHistory = false } = options;
    
    // System prompt
    let systemPrompt = `Bạn là trợ lý AI chuyên về Tư tưởng Hồ Chí Minh (HCM202). Nhiệm vụ của bạn:

1. CHUYÊN BIỆT trả lời các câu hỏi về Tư tưởng Hồ Chí Minh và môn học HCM202
2. Đối với các câu hỏi có thể liên quan: Hãy cố gắng tìm mối liên hệ với tư tưởng HCM nếu có thể
3. Trả lời dựa trên tài liệu học tập chính thống về Tư tưởng Hồ Chí Minh
4. Luôn trích dẫn nguồn cụ thể khi đưa ra thông tin
5. Nếu không có thông tin trong tài liệu, hãy nói rõ
6. Giải thích một cách dễ hiểu, phù hợp với sinh viên đại học
7. Kết nối kiến thức với thực tế Việt Nam hiện đại khi có thể

CÁC CHỦ ĐỀ ĐƯỢC HỖ TRỢ:
- Tư tưởng, quan điểm của Chủ tịch Hồ Chí Minh
- Chủ nghĩa Mác-Lênin trong tư tưởng HCM
- Vai trò của Đảng Cộng sản Việt Nam
- Đạo đức cách mạng: Cần, Kiệm, Liêm, Chính  
- Độc lập dân tộc và chủ nghĩa xã hội
- Đại đoàn kết dân tộc và đoàn kết quốc tế
- Văn hóa, giáo dục và con người mới
- Lịch sử cách mạng Việt Nam liên quan đến HCM
- Các tác phẩm và văn kiện của Chủ tịch Hồ Chí Minh

Phong cách trả lời:
- Tôn trọng, lịch sự và học thuật
- Khoa học, có căn cứ và chính xác
- Dễ hiểu, có cấu trúc logic
- Kích thích tư duy phản biện tích cực

CHỈ DẪN XỬ LÝ CÂU HỎI:
- Nếu câu hỏi HOÀN TOÀN không liên quan (công nghệ, thể thao, giải trí), từ chối lịch sự
- Nếu câu hỏi CÓ THỂ liên quan (như chính trị, lịch sử, triết học), hãy cố gắng kết nối với tư tưởng HCM
- Ưu tiên hướng dẫn người hỏi về các khía cạnh liên quan đến HCM202
- Với câu hỏi mơ hồ, đưa ra gợi ý cụ thể để làm rõ`;

    // RAG context
    const { context, sources } = this.ragService.generateRAGContext(ragChunks, userQuery);
    
    let fullSystemPrompt = systemPrompt + '\n\n' + context;
    
    // Add conversation history if requested
    if (includeHistory && sessionId) {
      // This would include recent messages from the session
      // For now, we'll keep it simple without history
    }
    
    return { systemPrompt: fullSystemPrompt, sources };
  }

  /**
   * Gọi OpenAI API để tạo response
   */
  async generateAIResponse(systemPrompt, userQuery, options = {}) {
    // Ensure config is loaded
    if (!this.config) {
      await this.initializeOpenAI();
    }

    const {
      model = this.config.chatModel,
      maxTokens = this.config.maxTokens,
      temperature = this.config.temperature
    } = options;

    try {
      const messages = [
        {
          role: 'system',
          content: systemPrompt
        },
        {
          role: 'user',
          content: userQuery
        }
      ];

      console.log(`🤖 Sending request to model ${model} with ${messages.length} messages`);

      const response = await this.openai.chat.completions.create({
        model: model,
        messages: messages,
        max_tokens: maxTokens,
        temperature: temperature,
        top_p: 0.95,
        frequency_penalty: 0.1,
        presence_penalty: 0.1
      });

      return {
        content: response.choices[0].message.content.trim(),
        tokensUsed: response.usage.total_tokens,
        model: response.model
      };

    } catch (error) {
      console.error('❌ OpenAI API Error:', error);
      console.error('Request details:', {
        model,
        systemPromptLength: systemPrompt.length,
        userQueryLength: userQuery.length,
        maxTokens,
        temperature
      });
      throw new Error('Failed to generate AI response: ' + error.message);
    }
  }

  /**
   * Tạo hoặc lấy chat session
   */
  async getOrCreateSession(userId, sessionId = null) {
    if (sessionId) {
      const session = await ChatSession.findByPk(sessionId);
      if (session && session.user_id === userId) {
        await session.updateActivity();
        return session;
      }
    }
    
    // Tạo session mới
    const session = await ChatSession.create({
      user_id: userId,
      status: 'active',
      metadata: {
        created_from: 'web_interface'
      }
    });
    
    // Tạo welcome message
    await Message.create({
      session_id: session.id,
      user_id: userId,
      content: 'Xin chào! Tôi là trợ lý AI về Tư tưởng Hồ Chí Minh. Bạn có thể hỏi tôi về các khái niệm, sự kiện lịch sử, hay bất kỳ điều gì liên quan đến học phần HCM202. Tôi sẽ trả lời dựa trên giáo trình chính thống và các tài liệu học tập.',
      role: 'assistant',
      message_type: 'text',
      metadata: {
        welcome_message: true
      }
    });
    
    return session;
  }

  /**
   * Lấy lịch sử chat của session
   */
  async getChatHistory(sessionId, options = {}) {
    const { limit = 50, offset = 0 } = options;
    
    return await Message.getBySessionWithPagination(sessionId, limit, offset);
  }

  /**
   * Tạo tiêu đề cho session
   */
  generateSessionTitle(firstMessage) {
    const message = firstMessage.trim();
    
    // Extract key topics
    if (message.includes('đảng') || message.includes('Đảng')) {
      return 'Về vai trò của Đảng';
    }
    if (message.includes('đạo đức') || message.includes('cách mạng')) {
      return 'Về đạo đức cách mạng';
    }
    if (message.includes('độc lập') || message.includes('dân tộc')) {
      return 'Về độc lập dân tộc';
    }
    if (message.includes('văn hóa')) {
      return 'Về văn hóa';
    }
    if (message.includes('giáo dục')) {
      return 'Về giáo dục';
    }
    
    // Fallback: use first 50 chars
    return message.length > 50 ? message.substring(0, 50) + '...' : message;
  }

  /**
   * Refresh configuration từ database
   */
  async refreshConfiguration() {
    await this.initializeOpenAI();
    await this.ragService.refreshConfiguration();
    console.log('🔄 Configuration refreshed for ChatService and RAGService');
  }

  /**
   * Lấy suggestions cho user
   */
  async getSuggestions() {
    try {
      const ragSuggestions = await this.ragService.generateSuggestedQuestions(5);
      
      // Chỉ trả về AI suggestions nếu có, không merge với default
      if (ragSuggestions && ragSuggestions.length > 0) {
        console.log('✅ Using AI-generated suggestions:', ragSuggestions.length);
        return ragSuggestions;
      }
      
      // Fallback chỉ khi AI hoàn toàn fail
      console.log('⚠️ AI suggestions failed, using fallback');
      const defaultSuggestions = [
        'Bối cảnh hình thành tư tưởng Hồ Chí Minh như thế nào?',
        'Vai trò của Đảng Cộng sản Việt Nam theo quan điểm Hồ Chí Minh?',
        'Quan điểm của Bác Hồ về đạo đức cách mạng?',
        'Tư tưởng Hồ Chí Minh về đại đoàn kết dân tộc?',
        'Quan điểm của Người về giáo dục và con người mới?'
      ];
      
      return defaultSuggestions;
    } catch (error) {
      console.error('❌ Error getting suggestions:', error);
      // Fallback suggestions khi có lỗi
      return [
        'Bối cảnh hình thành tư tưởng Hồ Chí Minh như thế nào?',
        'Vai trò của Đảng Cộng sản Việt Nam theo quan điểm Hồ Chí Minh?',
        'Quan điểm của Bác Hồ về đạo đức cách mạng?'
      ];
    }
  }

  /**
   * Đánh giá message (feedback)
   */
  async ratMessage(messageId, rating, feedback = null) {
    const message = await Message.findByPk(messageId);
    if (!message) {
      throw new Error('Message not found');
    }
    
    await message.addFeedback({
      rating,
      feedback,
      timestamp: new Date()
    });
    
    return message;
  }

  /**
   * Export chat history
   */
  async exportChatHistory(sessionId, format = 'json') {
    const session = await ChatSession.findByPk(sessionId, {
      include: [{
        model: Message,
        as: 'messages',
        where: { is_deleted: false },
        order: [['createdAt', 'ASC']]
      }]
    });
    
    if (!session) {
      throw new Error('Session not found');
    }
    
    if (format === 'json') {
      return {
        session: {
          id: session.id,
          title: session.title,
          created_at: session.createdAt,
          total_messages: session.total_messages
        },
        messages: session.messages.map(msg => ({
          role: msg.role,
          content: msg.content,
          created_at: msg.createdAt,
          sources: msg.sources,
          tokens_used: msg.tokens_used
        }))
      };
    }
    
    // Text format
    let text = `Cuộc trò chuyện: ${session.title}\nNgày: ${session.createdAt}\n\n`;
    
    session.messages.forEach(msg => {
      const role = msg.role === 'user' ? 'Bạn' : 'Trợ lý';
      text += `${role}: ${msg.content}\n\n`;
      
      if (msg.sources && msg.sources.length > 0) {
        text += `Nguồn tham khảo:\n`;
        msg.sources.forEach(source => {
          text += `- ${source.document_title}${source.section_title ? ': ' + source.section_title : ''}\n`;
        });
        text += '\n';
      }
    });
    
    return text;
  }
}

module.exports = ChatService;
