const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Document = sequelize.define('Document', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  title: {
    type: DataTypes.STRING(200),
    allowNull: false
  },
  file_name: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  file_path: {
    type: DataTypes.STRING(500),
    allowNull: false
  },
  file_type: {
    type: DataTypes.STRING(10),
    allowNull: false,
    comment: 'pdf, doc, txt, etc.'
  },
  file_size: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: 'Size in bytes'
  },
  content_preview: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Preview của nội dung document (500 chars đầu)'
  },
  total_pages: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  total_chunks: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  processing_status: {
    type: DataTypes.ENUM('pending', 'processing', 'completed', 'failed'),
    defaultValue: 'pending'
  },
  processing_error: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  metadata: {
    type: DataTypes.JSONB,
    defaultValue: {},
    comment: 'Metadata khác như author, created date của document, etc.'
  },
  tags: {
    type: DataTypes.ARRAY(DataTypes.STRING),
    defaultValue: [],
    comment: 'Tags để classify document'
  },
  category: {
    type: DataTypes.STRING(50),
    allowNull: true,
    comment: 'Category của document (chapter, section, etc.)'
  },
  language: {
    type: DataTypes.STRING(5),
    defaultValue: 'vi'
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  uploaded_by: {
    type: DataTypes.UUID,
    allowNull: true,
    references: {
      model: 'users',
      key: 'id'
    }
  },
  last_processed: {
    type: DataTypes.DATE,
    allowNull: true
  }
}, {
  tableName: 'documents',
  indexes: [
    {
      fields: ['processing_status']
    },
    {
      fields: ['category']
    },
    {
      fields: ['tags'],
      using: 'gin'
    },
    {
      fields: ['is_active']
    },
    {
      fields: ['uploaded_by']
    }
  ]
});

// Method để update processing status
Document.prototype.updateProcessingStatus = async function(status, error = null) {
  this.processing_status = status;
  if (error) {
    this.processing_error = error;
  }
  if (status === 'completed') {
    this.last_processed = new Date();
  }
  await this.save();
};

// Method để update chunk count
Document.prototype.updateChunkCount = async function(count) {
  this.total_chunks = count;
  await this.save();
};

module.exports = Document;
