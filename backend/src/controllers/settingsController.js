const SettingsService = require('../services/settingsService');
const ChatService = require('../services/chatService');
const { Settings, User } = require('../models');
const { validationResult } = require('express-validator');

class SettingsController {
  constructor() {
    this.settingsService = new SettingsService();
    this.chatService = new ChatService();
    
    // Bind methods to preserve 'this' context when used as route handlers
    this.getPublicSettings = this.getPublicSettings.bind(this);
    this.getAllSettings = this.getAllSettings.bind(this);
    this.updateSetting = this.updateSetting.bind(this);
    this.testOpenAIConnection = this.testOpenAIConnection.bind(this);
    this.resetSettings = this.resetSettings.bind(this);
    this.getAvailableModels = this.getAvailableModels.bind(this);
    this.exportSettings = this.exportSettings.bind(this);
  }

  /**
   * Lấy tất cả settings công khai
   */
  async getPublicSettings(req, res) {
    try {
      const { category } = req.query;
      
      let settings;
      if (category) {
        settings = await this.settingsService.getSettingsByCategory(category, false);
      } else {
        // Lấy tất cả categories công khai
        const categories = ['openai', 'chat', 'rag'];
        settings = {};
        
        for (const cat of categories) {
          const catSettings = await this.settingsService.getSettingsByCategory(cat, false);
          settings[cat] = catSettings;
        }
      }

      res.status(200).json({
        success: true,
        data: {
          settings
        }
      });

    } catch (error) {
      console.error('❌ Get Public Settings Error:', error);
      res.status(500).json({
        success: false,
        message: 'Lỗi khi lấy cấu hình',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Internal Server Error'
      });
    }
  }

  /**
   * Lấy tất cả settings (bao gồm private) - chỉ admin
   */
  async getAllSettings(req, res) {
    try {
      // Kiểm tra quyền admin
      if (!req.user || req.user.role !== 'admin') {
        return res.status(403).json({
          success: false,
          message: 'Chỉ admin mới có thể xem tất cả cấu hình'
        });
      }

      const { category } = req.query;
      
      let settings;
      if (category) {
        settings = await this.settingsService.getSettingsByCategory(category, true);
      } else {
        const categories = ['openai', 'chat', 'rag', 'system', 'security'];
        settings = {};
        
        for (const cat of categories) {
          const catSettings = await this.settingsService.getSettingsByCategory(cat, true);
          settings[cat] = catSettings;
        }
      }

      // Mask sensitive values
      this.maskSensitiveValues(settings);

      res.status(200).json({
        success: true,
        data: {
          settings
        }
      });

    } catch (error) {
      console.error('❌ Get All Settings Error:', error);
      res.status(500).json({
        success: false,
        message: 'Lỗi khi lấy cấu hình',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Internal Server Error'
      });
    }
  }

  /**
   * Cập nhật setting
   */
  async updateSetting(req, res) {
    try {
      // Kiểm tra validation
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Dữ liệu không hợp lệ',
          errors: errors.array()
        });
      }

      const { key } = req.params;
      const { value, test_first = false } = req.body;
      const userId = req.user?.id;

      // Kiểm tra quyền - chỉ admin mới được update sensitive settings
      if (this.settingsService.isSensitiveKey(key) && (!req.user || req.user.role !== 'admin')) {
        return res.status(403).json({
          success: false,
          message: 'Chỉ admin mới có thể thay đổi cấu hình này'
        });
      }

      // Test trước khi save nếu yêu cầu
      if (test_first && key === 'openai_api_key') {
        const testResult = await Settings.validateOpenAIKey(value);
        if (!testResult.valid) {
          return res.status(400).json({
            success: false,
            message: 'API key không hợp lệ',
            error: testResult.error
          });
        }
      }

      // Cập nhật setting
      const result = await this.settingsService.updateSetting(key, value, userId);

      // Refresh services nếu cần
      if (['openai_api_key', 'openai_base_url', 'openai_chat_model', 'openai_embedding_model', 'chat_temperature', 'chat_max_tokens'].includes(key)) {
        await this.chatService.refreshConfiguration();
      }

      res.status(200).json({
        success: true,
        data: result,
        message: 'Cập nhật cấu hình thành công'
      });

    } catch (error) {
      console.error('❌ Update Setting Error:', error);
      res.status(500).json({
        success: false,
        message: 'Lỗi khi cập nhật cấu hình',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Internal Server Error'
      });
    }
  }

  /**
   * Test OpenAI connection
   */
  async testOpenAIConnection(req, res) {
    try {
      const { api_key, base_url, chat_model, embedding_model } = req.body;

      let testConfig;
      if (api_key || base_url) {
        // Test với cấu hình mới
        testConfig = {
          apiKey: api_key || await this.settingsService.getSetting('openai_api_key'),
          baseURL: base_url || await this.settingsService.getSetting('openai_base_url', 'https://api.openai.com/v1'),
          chatModel: chat_model || await this.settingsService.getSetting('openai_chat_model', 'gpt-3.5-turbo'),
          embeddingModel: embedding_model || await this.settingsService.getSetting('openai_embedding_model', 'text-embedding-ada-002')
        };
      } else {
        // Test với cấu hình hiện tại
        testConfig = await this.settingsService.getCurrentOpenAIConfig();
      }

      const openai = new OpenAI({ 
        apiKey: testConfig.apiKey,
        baseURL: testConfig.baseURL 
      });

      // Test chat model
      const chatTest = await openai.chat.completions.create({
        model: testConfig.chatModel,
        messages: [{ 
          role: 'user', 
          content: 'Xin chào, đây là test kết nối.' 
        }],
        max_tokens: 10
      });

      // Test embedding model
      const embeddingTest = await openai.embeddings.create({
        model: testConfig.embeddingModel,
        input: 'test connection'
      });

      res.status(200).json({
        success: true,
        data: {
          chat_model: {
            model: testConfig.chatModel,
            status: 'connected',
            tokens_used: chatTest.usage.total_tokens,
            response: chatTest.choices[0].message.content
          },
          embedding_model: {
            model: testConfig.embeddingModel,
            status: 'connected',
            dimensions: embeddingTest.data[0].embedding.length,
            tokens_used: embeddingTest.usage.total_tokens
          }
        },
        message: 'Kết nối OpenAI thành công'
      });

    } catch (error) {
      console.error('❌ OpenAI Test Error:', error);
      res.status(400).json({
        success: false,
        message: 'Lỗi kết nối OpenAI',
        error: error.message
      });
    }
  }

  /**
   * Reset settings về default
   */
  async resetSettings(req, res) {
    try {
      // Kiểm tra quyền admin
      if (!req.user || req.user.role !== 'admin') {
        return res.status(403).json({
          success: false,
          message: 'Chỉ admin mới có thể reset cấu hình'
        });
      }

      const { category } = req.body;
      const userId = req.user.id;

      await this.settingsService.resetToDefaults(category, userId);

      // Refresh services
      await this.chatService.refreshConfiguration();

      res.status(200).json({
        success: true,
        message: `Đã reset cấu hình${category ? ` cho category ${category}` : ''} về mặc định`
      });

    } catch (error) {
      console.error('❌ Reset Settings Error:', error);
      res.status(500).json({
        success: false,
        message: 'Lỗi khi reset cấu hình',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Internal Server Error'
      });
    }
  }

  /**
   * Lấy models có sẵn từ OpenAI
   */
  async getAvailableModels(req, res) {
    try {
      const apiKey = req.body.api_key || await this.settingsService.getSetting('openai_api_key');
      
      if (!apiKey) {
        return res.status(400).json({
          success: false,
          message: 'Chưa cấu hình OpenAI API key'
        });
      }

      const baseURL = req.body.base_url || await this.settingsService.getSetting('openai_base_url', 'https://api.openai.com/v1');
      const openai = new OpenAI({ 
        apiKey,
        baseURL 
      });
      const models = await openai.models.list();

      // Filter relevant models
      const chatModels = models.data.filter(model => 
        model.id.includes('gpt') && !model.id.includes('instruct')
      );

      const embeddingModels = models.data.filter(model => 
        model.id.includes('embedding')
      );

      res.status(200).json({
        success: true,
        data: {
          chat_models: chatModels.map(m => ({
            id: m.id,
            owned_by: m.owned_by,
            created: m.created
          })),
          embedding_models: embeddingModels.map(m => ({
            id: m.id,
            owned_by: m.owned_by,
            created: m.created
          }))
        }
      });

    } catch (error) {
      console.error('❌ Get Available Models Error:', error);
      res.status(400).json({
        success: false,
        message: 'Lỗi khi lấy danh sách models',
        error: error.message
      });
    }
  }

  /**
   * Backup settings
   */
  async exportSettings(req, res) {
    try {
      // Kiểm tra quyền admin
      if (!req.user || req.user.role !== 'admin') {
        return res.status(403).json({
          success: false,
          message: 'Chỉ admin mới có thể export cấu hình'
        });
      }

      const allSettings = await Settings.findAll({
        where: { is_public: true }, // Chỉ export public settings
        attributes: ['key', 'value', 'category', 'data_type', 'description', 'default_value']
      });

      const exportData = {
        exported_at: new Date().toISOString(),
        exported_by: req.user.id,
        settings: allSettings.reduce((acc, setting) => {
          acc[setting.key] = {
            value: setting.value,
            category: setting.category,
            data_type: setting.data_type,
            description: setting.description,
            default_value: setting.default_value
          };
          return acc;
        }, {})
      };

      res.status(200).json({
        success: true,
        data: exportData
      });

    } catch (error) {
      console.error('❌ Export Settings Error:', error);
      res.status(500).json({
        success: false,
        message: 'Lỗi khi export cấu hình',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Internal Server Error'
      });
    }
  }

  /**
   * Mask sensitive values trong response
   */
  maskSensitiveValues(settings) {
    const traverse = (obj) => {
      if (typeof obj === 'object' && obj !== null) {
        Object.keys(obj).forEach(key => {
          if (this.settingsService.isSensitiveKey(key)) {
            obj[key] = '[MASKED]';
          } else if (typeof obj[key] === 'object') {
            traverse(obj[key]);
          }
        });
      }
    };
    
    traverse(settings);
  }
}

module.exports = new SettingsController();
