const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const ChatSession = sequelize.define('ChatSession', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  user_id: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'users',
      key: 'id'
    }
  },
  title: {
    type: DataTypes.STRING(200),
    allowNull: true,
    comment: 'Tiêu đề session được tạo tự động từ câu hỏi đầu tiên'
  },
  status: {
    type: DataTypes.ENUM('active', 'inactive', 'archived'),
    defaultValue: 'active'
  },
  total_messages: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  last_activity: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  context_summary: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Tóm tắt ngữ cảnh cuộc trò chuyện để duy trì context'
  },
  metadata: {
    type: DataTypes.JSONB,
    defaultValue: {},
    comment: 'Thông tin thêm như chủ đề chính, tags, etc.'
  },
  ip_address: {
    type: DataTypes.STRING(45),
    allowNull: true
  },
  user_agent: {
    type: DataTypes.TEXT,
    allowNull: true
  }
}, {
  tableName: 'chat_sessions',
  indexes: [
    {
      fields: ['user_id']
    },
    {
      fields: ['status']
    },
    {
      fields: ['last_activity']
    }
  ]
});

// Method để update last activity
ChatSession.prototype.updateActivity = async function() {
  this.last_activity = new Date();
  await this.save();
};

// Method để tăng số lượng message
ChatSession.prototype.incrementMessageCount = async function() {
  this.total_messages += 1;
  this.last_activity = new Date();
  await this.save();
};

module.exports = ChatSession;
