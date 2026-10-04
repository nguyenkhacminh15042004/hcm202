const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Message = sequelize.define('Message', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  session_id: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'chat_sessions',
      key: 'id'
    }
  },
  user_id: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'users',
      key: 'id'
    }
  },
  content: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  role: {
    type: DataTypes.ENUM('user', 'assistant', 'system'),
    allowNull: false
  },
  message_type: {
    type: DataTypes.ENUM('text', 'image', 'file', 'quick_reply'),
    defaultValue: 'text'
  },
  tokens_used: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Số tokens đã sử dụng cho OpenAI API'
  },
  response_time_ms: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Thời gian phản hồi của AI (milliseconds)'
  },
  context_used: {
    type: DataTypes.JSONB,
    allowNull: true,
    comment: 'Thông tin về context được sử dụng từ RAG'
  },
  sources: {
    type: DataTypes.JSONB,
    allowNull: true,
    comment: 'Nguồn tài liệu được tham khảo (citations)'
  },
  feedback: {
    type: DataTypes.JSONB,
    allowNull: true,
    comment: 'Feedback từ user: rating, helpful, etc.'
  },
  metadata: {
    type: DataTypes.JSONB,
    defaultValue: {},
    comment: 'Metadata khác như model version, temperature, etc.'
  },
  is_deleted: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  parent_message_id: {
    type: DataTypes.UUID,
    allowNull: true,
    references: {
      model: 'messages',
      key: 'id'
    },
    comment: 'Tham chiếu đến message trước đó (cho thread)'
  }
}, {
  tableName: 'messages',
  indexes: [
    {
      fields: ['session_id']
    },
    {
      fields: ['user_id']
    },
    {
      fields: ['role']
    },
    {
      fields: ['created_at']
    },
    {
      fields: ['parent_message_id']
    }
  ]
});

// Self-referential association cho parent-child messages
Message.belongsTo(Message, { 
  as: 'parentMessage', 
  foreignKey: 'parent_message_id' 
});
Message.hasMany(Message, { 
  as: 'childMessages', 
  foreignKey: 'parent_message_id' 
});

// Method để thêm feedback
Message.prototype.addFeedback = async function(feedbackData) {
  this.feedback = { ...this.feedback, ...feedbackData };
  await this.save();
};

// Method để lấy messages theo session với phân trang
Message.getBySessionWithPagination = async function(sessionId, limit = 50, offset = 0) {
  return await Message.findAndCountAll({
    where: { 
      session_id: sessionId,
      is_deleted: false
    },
    order: [['createdAt', 'ASC']],
    limit,
    offset,
    include: [
      {
        model: Message,
        as: 'parentMessage',
        attributes: ['id', 'content', 'role']
      }
    ]
  });
};

module.exports = Message;
