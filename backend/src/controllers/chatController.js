const ChatService = require('../services/chatService');
const { User, ChatSession } = require('../models');
const { validationResult } = require('express-validator');
const { v4: uuidv4 } = require('uuid');

class ChatController {
  constructor() {
    this.chatService = new ChatService();
    
    // Bind methods to preserve 'this' context when used as route handlers
    this.sendMessage = this.sendMessage.bind(this);
    this.getChatHistory = this.getChatHistory.bind(this);
    this.getUserSessions = this.getUserSessions.bind(this);
    this.createSession = this.createSession.bind(this);
    this.getSuggestions = this.getSuggestions.bind(this);
    this.rateMessage = this.rateMessage.bind(this);
    this.exportChatHistory = this.exportChatHistory.bind(this);
    this.deleteSession = this.deleteSession.bind(this);
  }

  /**
   * Gửi tin nhắn và nhận response từ AI
   */
  async sendMessage(req, res) {
    try {
      // Validate input
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Dữ liệu không hợp lệ',
          errors: errors.array()
        });
      }

      const { message, session_id } = req.body;
      const userId = req.user?.id;
      
      // Xử lý guest user
      let user = req.user;
      if (!userId) {
        const sessionToken = req.headers['x-session-token'] || uuidv4();
        user = await User.findOne({ where: { session_token: sessionToken } });
        
        if (!user) {
          user = await User.createGuestUser(sessionToken);
        }
        
        // Set session token in response header for client
        res.setHeader('X-Session-Token', sessionToken);
      }

      // Lấy hoặc tạo chat session
      const session = await this.chatService.getOrCreateSession(user.id, session_id);

      // Xử lý tin nhắn
      const result = await this.chatService.processMessage(
        session.id, 
        user.id, 
        message,
        {
          includeHistory: true,
          category: req.body.category || null
        }
      );

      // Format response cho frontend
      const response = {
        success: true,
        data: {
          message: {
            id: result.message.id,
            content: result.message.content,
            role: result.message.role,
            created_at: result.message.createdAt,
            response_time_ms: result.responseTime
          },
          session: {
            id: session.id,
            title: session.title,
            total_messages: session.total_messages
          },
          sources: result.sources || [],
          metadata: {
            tokens_used: result.tokensUsed,
            rag_chunks_used: result.ragChunksUsed
          }
        }
      };

      // Nếu có lỗi, thêm thông tin error
      if (result.error) {
        response.data.error = result.error;
      }

      res.status(200).json(response);

    } catch (error) {
      console.error('❌ Chat Controller Error:', error);
      res.status(500).json({
        success: false,
        message: 'Lỗi server khi xử lý tin nhắn',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Internal Server Error'
      });
    }
  }

  /**
   * Lấy lịch sử chat
   */
  async getChatHistory(req, res) {
    try {
      const { session_id } = req.params;
      const { page = 1, limit = 50 } = req.query;
      
      const offset = (parseInt(page) - 1) * parseInt(limit);
      
      const history = await this.chatService.getChatHistory(session_id, {
        limit: parseInt(limit),
        offset
      });

      // Format messages cho frontend
      const messages = history.rows.map(msg => ({
        id: msg.id,
        content: msg.content,
        role: msg.role,
        created_at: msg.createdAt,
        sources: msg.sources,
        feedback: msg.feedback,
        tokens_used: msg.tokens_used,
        response_time_ms: msg.response_time_ms
      }));

      res.status(200).json({
        success: true,
        data: {
          messages,
          pagination: {
            current_page: parseInt(page),
            total_pages: Math.ceil(history.count / parseInt(limit)),
            total_messages: history.count,
            has_next: offset + messages.length < history.count
          }
        }
      });

    } catch (error) {
      console.error('❌ Get Chat History Error:', error);
      res.status(500).json({
        success: false,
        message: 'Lỗi khi lấy lịch sử chat',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Internal Server Error'
      });
    }
  }

  /**
   * Lấy danh sách sessions của user
   */
  async getUserSessions(req, res) {
    try {
      const userId = req.user?.id;
      
      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Cần đăng nhập để xem lịch sử'
        });
      }

      const sessions = await ChatSession.findAll({
        where: { user_id: userId },
        order: [['last_activity', 'DESC']],
        limit: 50,
        attributes: ['id', 'title', 'total_messages', 'last_activity', 'createdAt']
      });

      const formattedSessions = sessions.map(session => ({
        id: session.id,
        title: session.title || 'Cuộc trò chuyện',
        total_messages: session.total_messages,
        last_activity: session.last_activity,
        created_at: session.createdAt
      }));

      res.status(200).json({
        success: true,
        data: {
          sessions: formattedSessions
        }
      });

    } catch (error) {
      console.error('❌ Get User Sessions Error:', error);
      res.status(500).json({
        success: false,
        message: 'Lỗi khi lấy danh sách cuộc trò chuyện',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Internal Server Error'
      });
    }
  }

  /**
   * Tạo session mới
   */
  async createSession(req, res) {
    try {
      const userId = req.user?.id;
      
      // Xử lý guest user
      let user = req.user;
      if (!userId) {
        const sessionToken = req.headers['x-session-token'] || uuidv4();
        user = await User.findOne({ where: { session_token: sessionToken } });
        
        if (!user) {
          user = await User.createGuestUser(sessionToken);
        }
        
        res.setHeader('X-Session-Token', sessionToken);
      }

      const session = await this.chatService.getOrCreateSession(user.id);

      res.status(201).json({
        success: true,
        data: {
          session: {
            id: session.id,
            title: session.title,
            total_messages: session.total_messages,
            created_at: session.createdAt
          }
        }
      });

    } catch (error) {
      console.error('❌ Create Session Error:', error);
      res.status(500).json({
        success: false,
        message: 'Lỗi khi tạo cuộc trò chuyện mới',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Internal Server Error'
      });
    }
  }

  /**
   * Lấy gợi ý câu hỏi
   */
  async getSuggestions(req, res) {
    try {
      const suggestions = await this.chatService.getSuggestions();

      res.status(200).json({
        success: true,
        data: {
          suggestions
        }
      });

    } catch (error) {
      console.error('❌ Get Suggestions Error:', error);
      res.status(500).json({
        success: false,
        message: 'Lỗi khi lấy gợi ý câu hỏi',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Internal Server Error'
      });
    }
  }

  /**
   * Đánh giá tin nhắn
   */
  async rateMessage(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Dữ liệu không hợp lệ',
          errors: errors.array()
        });
      }

      const { message_id } = req.params;
      const { rating, feedback } = req.body;

      const message = await this.chatService.ratMessage(message_id, rating, feedback);

      res.status(200).json({
        success: true,
        data: {
          message_id: message.id,
          feedback: message.feedback
        }
      });

    } catch (error) {
      console.error('❌ Rate Message Error:', error);
      res.status(500).json({
        success: false,
        message: 'Lỗi khi đánh giá tin nhắn',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Internal Server Error'
      });
    }
  }

  /**
   * Export chat history
   */
  async exportChatHistory(req, res) {
    try {
      const { session_id } = req.params;
      const { format = 'json' } = req.query;

      const exportData = await this.chatService.exportChatHistory(session_id, format);

      if (format === 'json') {
        res.status(200).json({
          success: true,
          data: exportData
        });
      } else {
        res.status(200)
          .set({
            'Content-Type': 'text/plain; charset=utf-8',
            'Content-Disposition': `attachment; filename="chat-${session_id}.txt"`
          })
          .send(exportData);
      }

    } catch (error) {
      console.error('❌ Export Chat History Error:', error);
      res.status(500).json({
        success: false,
        message: 'Lỗi khi xuất lịch sử chat',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Internal Server Error'
      });
    }
  }

  /**
   * Xóa session
   */
  async deleteSession(req, res) {
    try {
      const { session_id } = req.params;
      const userId = req.user?.id;

      const session = await ChatSession.findOne({
        where: {
          id: session_id,
          user_id: userId
        }
      });

      if (!session) {
        return res.status(404).json({
          success: false,
          message: 'Không tìm thấy cuộc trò chuyện'
        });
      }

      // Soft delete - chuyển status thành archived
      session.status = 'archived';
      await session.save();

      res.status(200).json({
        success: true,
        message: 'Đã xóa cuộc trò chuyện'
      });

    } catch (error) {
      console.error('❌ Delete Session Error:', error);
      res.status(500).json({
        success: false,
        message: 'Lỗi khi xóa cuộc trò chuyện',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Internal Server Error'
      });
    }
  }
}

module.exports = new ChatController();
