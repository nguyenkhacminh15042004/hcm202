const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const DocumentChunk = sequelize.define('DocumentChunk', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  document_id: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'documents',
      key: 'id'
    }
  },
  chunk_index: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: 'Thứ tự chunk trong document (0, 1, 2, ...)'
  },
  content: {
    type: DataTypes.TEXT,
    allowNull: false,
    comment: 'Nội dung text của chunk'
  },
  content_hash: {
    type: DataTypes.STRING(64),
    allowNull: false,
    comment: 'SHA256 hash của content để tránh duplicate'
  },
  embedding: {
    type: DataTypes.ARRAY(DataTypes.FLOAT),
    allowNull: true,
    comment: 'Vector embedding của chunk content'
  },
  page_number: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Số trang trong document gốc'
  },
  start_char: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Vị trí ký tự bắt đầu trong document'
  },
  end_char: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Vị trí ký tự kết thúc trong document'
  },
  word_count: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  token_count: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Số tokens của chunk (để tính toán context window)'
  },
  chunk_type: {
    type: DataTypes.ENUM('paragraph', 'heading', 'list', 'table', 'quote'),
    defaultValue: 'paragraph'
  },
  section_title: {
    type: DataTypes.STRING(200),
    allowNull: true,
    comment: 'Tiêu đề section/chapter chứa chunk này'
  },
  keywords: {
    type: DataTypes.ARRAY(DataTypes.STRING),
    defaultValue: [],
    comment: 'Keywords được extract từ chunk'
  },
  similarity_score: {
    type: DataTypes.FLOAT,
    allowNull: true,
    comment: 'Điểm tương đồng với query (được set khi search)'
  },
  usage_count: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    comment: 'Số lần chunk này được sử dụng trong responses'
  },
  quality_score: {
    type: DataTypes.FLOAT,
    allowNull: true,
    comment: 'Điểm chất lượng của chunk (để ranking)'
  },
  metadata: {
    type: DataTypes.JSONB,
    defaultValue: {},
    comment: 'Metadata khác của chunk'
  }
}, {
  tableName: 'document_chunks',
  indexes: [
    {
      fields: ['document_id']
    },
    {
      fields: ['document_id', 'chunk_index'],
      unique: true
    },
    {
      fields: ['content_hash']
    },
    {
      fields: ['keywords'],
      using: 'gin'
    },
    {
      fields: ['section_title']
    },
    {
      fields: ['chunk_type']
    },
    {
      fields: ['usage_count']
    },
    {
      fields: ['quality_score']
    }
  ]
});

// Method để tăng usage count
DocumentChunk.prototype.incrementUsage = async function() {
  this.usage_count += 1;
  await this.save();
};

// Method để search chunks theo similarity
DocumentChunk.searchBySimilarity = async function(queryEmbedding, limit = 5, minSimilarity = 0.7) {
  // Này sẽ được implement với vector database hoặc cosine similarity
  // Tạm thời return empty array
  return [];
};

// Method để search chunks theo text
DocumentChunk.searchByText = async function(query, limit = 5) {
  const { Op } = require('sequelize');
  
  return await DocumentChunk.findAll({
    where: {
      [Op.or]: [
        {
          content: {
            [Op.iLike]: `%${query}%`
          }
        },
        {
          keywords: {
            [Op.overlap]: query.toLowerCase().split(' ')
          }
        }
      ]
    },
    include: [{
      model: sequelize.models.Document,
      as: 'document',
      attributes: ['id', 'title', 'category']
    }],
    order: [['usage_count', 'DESC'], ['quality_score', 'DESC']],
    limit
  });
};

module.exports = DocumentChunk;
