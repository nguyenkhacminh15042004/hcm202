const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Settings = sequelize.define('Settings', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  key: {
    type: DataTypes.STRING(100),
    allowNull: false,
    unique: true
  },
  value: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  category: {
    type: DataTypes.ENUM('openai', 'rag', 'chat', 'system', 'security'),
    allowNull: false
  },
  data_type: {
    type: DataTypes.ENUM('string', 'number', 'boolean', 'json'),
    defaultValue: 'string'
  },
  is_encrypted: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  is_public: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  description: {
    type: DataTypes.STRING(500),
    allowNull: true
  },
  default_value: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  validation_rules: {
    type: DataTypes.JSONB,
    defaultValue: {}
  },
  last_updated_by: {
    type: DataTypes.UUID,
    allowNull: true,
    references: {
      model: 'users',
      key: 'id'
    }
  }
}, {
  tableName: 'settings',
  indexes: [
    {
      fields: ['key'],
      unique: true
    },
    {
      fields: ['category']
    },
    {
      fields: ['is_public']
    }
  ]
});

// Method để lấy giá trị parsed theo type
Settings.prototype.getParsedValue = function() {
  try {
    switch (this.data_type) {
      case 'number':
        return parseFloat(this.value);
      case 'boolean':
        return this.value === 'true';
      case 'json':
        return JSON.parse(this.value);
      default:
        return this.value;
    }
  } catch (error) {
    console.error(`Error parsing setting ${this.key}:`, error);
    return this.default_value || this.value;
  }
};

// Static method để lấy setting theo key
Settings.get = async function(key, defaultValue = null) {
  try {
    const setting = await Settings.findOne({ where: { key } });
    if (!setting) return defaultValue;
    return setting.getParsedValue();
  } catch (error) {
    console.error(`Error getting setting ${key}:`, error);
    return defaultValue;
  }
};

// Static method để set setting
Settings.set = async function(key, value, options = {}) {
  const {
    category = 'system',
    dataType = 'string',
    isEncrypted = false,
    isPublic = false,
    description = null,
    userId = null
  } = options;

  // Convert value to string for storage
  let stringValue;
  if (typeof value === 'object') {
    stringValue = JSON.stringify(value);
  } else {
    stringValue = String(value);
  }

  const [setting, created] = await Settings.upsert({
    key,
    value: stringValue,
    category,
    data_type: dataType,
    is_encrypted: isEncrypted,
    is_public: isPublic,
    description,
    last_updated_by: userId
  }, {
    returning: true
  });

  return setting;
};

// Static method để lấy nhiều settings theo category
Settings.getByCategory = async function(category, includePrivate = false) {
  const whereCondition = { category };
  if (!includePrivate) {
    whereCondition.is_public = true;
  }

  const settings = await Settings.findAll({
    where: whereCondition,
    order: [['key', 'ASC']]
  });

  const result = {};
  settings.forEach(setting => {
    result[setting.key] = setting.getParsedValue();
  });

  return result;
};

// Static method để validate API key
Settings.validateOpenAIKey = async function(apiKey) {
  try {
    const { OpenAI } = require('openai');
    const openai = new OpenAI({ apiKey });
    
    // Test với một request đơn giản
    await openai.models.list();
    return { valid: true };
  } catch (error) {
    return {
      valid: false,
      error: error.message
    };
  }
};

// Static method để khởi tạo default settings
Settings.initializeDefaults = async function() {
  const defaultSettings = [
    {
      key: 'openai_api_key',
      value: process.env.OPENAI_API_KEY || '',
      category: 'openai',
      data_type: 'string',
      is_encrypted: true,
      is_public: false,
      description: 'OpenAI API Key để truy cập GPT và Embedding APIs',
      default_value: ''
    },
    {
      key: 'openai_base_url',
      value: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
      category: 'openai',
      data_type: 'string',
      is_encrypted: false,
      is_public: true,
      description: 'Base URL cho OpenAI API (có thể thay đổi cho Azure OpenAI hoặc proxy)',
      default_value: 'https://api.openai.com/v1'
    },
    {
      key: 'openai_chat_model',
      value: process.env.OPENAI_MODEL || 'gpt-3.5-turbo',
      category: 'openai',
      data_type: 'string',
      is_public: true,
      description: 'Model OpenAI cho chat (gpt-3.5-turbo, gpt-4, etc.)',
      default_value: 'gpt-3.5-turbo'
    },
    {
      key: 'openai_embedding_model',
      value: process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-ada-002',
      category: 'openai',
      data_type: 'string',
      is_public: true,
      description: 'Model OpenAI cho embeddings',
      default_value: 'text-embedding-ada-002'
    },
    {
      key: 'chat_max_tokens',
      value: '4000',
      category: 'chat',
      data_type: 'number',
      is_public: true,
      description: 'Số tokens tối đa cho response',
      default_value: '4000'
    },
    {
      key: 'chat_temperature',
      value: '0.7',
      category: 'chat',
      data_type: 'number',
      is_public: true,
      description: 'Temperature cho creativity (0.0 - 2.0)',
      default_value: '0.7'
    },
    {
      key: 'rag_chunk_size',
      value: process.env.CHUNK_SIZE || '1000',
      category: 'rag',
      data_type: 'number',
      is_public: true,
      description: 'Kích thước chunk khi xử lý tài liệu',
      default_value: '1000'
    },
    {
      key: 'rag_chunk_overlap',
      value: process.env.CHUNK_OVERLAP || '200',
      category: 'rag',
      data_type: 'number',
      is_public: true,
      description: 'Số ký tự overlap giữa các chunks',
      default_value: '200'
    },
    {
      key: 'rag_top_k_results',
      value: process.env.TOP_K_RESULTS || '5',
      category: 'rag',
      data_type: 'number',
      is_public: true,
      description: 'Số chunks tối đa trả về từ RAG search',
      default_value: '5'
    },
    {
      key: 'rag_similarity_threshold',
      value: '0.7',
      category: 'rag',
      data_type: 'number',
      is_public: true,
      description: 'Ngưỡng similarity tối thiểu (0.0 - 1.0)',
      default_value: '0.7'
    }
  ];

  for (const setting of defaultSettings) {
    await Settings.upsert(setting);
  }

  console.log('✅ Đã khởi tạo default settings');
};

module.exports = Settings;
