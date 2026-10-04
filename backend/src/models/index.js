const { sequelize } = require('../config/database');
const User = require('./User');
const ChatSession = require('./ChatSession');
const Message = require('./Message');
const Document = require('./Document');
const DocumentChunk = require('./DocumentChunk');
const { QuizBank, QuizQuestion } = require('./quizModel');
const Settings = require('./Settings');

// Định nghĩa các mối quan hệ
const setupAssociations = () => {
  // User có nhiều ChatSession
  User.hasMany(ChatSession, { 
    foreignKey: 'user_id', 
    as: 'chatSessions' 
  });
  ChatSession.belongsTo(User, { 
    foreignKey: 'user_id', 
    as: 'user' 
  });

  // ChatSession có nhiều Message
  ChatSession.hasMany(Message, { 
    foreignKey: 'session_id', 
    as: 'messages' 
  });
  Message.belongsTo(ChatSession, { 
    foreignKey: 'session_id', 
    as: 'session' 
  });

  // User có thể gửi nhiều Message (cho trường hợp guest users)
  User.hasMany(Message, { 
    foreignKey: 'user_id', 
    as: 'messages' 
  });
  Message.belongsTo(User, { 
    foreignKey: 'user_id', 
    as: 'user' 
  });

  // Document có nhiều DocumentChunk
  Document.hasMany(DocumentChunk, { 
    foreignKey: 'document_id', 
    as: 'chunks' 
  });
  DocumentChunk.belongsTo(Document, { 
    foreignKey: 'document_id', 
    as: 'document' 
  });

  // Message có thể tham chiếu đến nhiều DocumentChunk (cho RAG)
  Message.belongsToMany(DocumentChunk, {
    through: 'message_chunks',
    as: 'referencedChunks',
    foreignKey: 'message_id',
    otherKey: 'chunk_id'
  });
  DocumentChunk.belongsToMany(Message, {
    through: 'message_chunks',
    as: 'referencingMessages',
    foreignKey: 'chunk_id',
    otherKey: 'message_id'
  });
};

// Khởi tạo associations
setupAssociations();

// Sync database
const syncDatabase = async (options = {}) => {
  try {
    await sequelize.sync(options);
    console.log('✅ Database sync thành công!');
  } catch (error) {
    console.error('❌ Lỗi sync database:', error);
    throw error;
  }
};

module.exports = {
  sequelize,
  User,
  ChatSession,
  Message,
  Document,
  DocumentChunk,
  QuizBank,
  QuizQuestion,
  Settings,
  syncDatabase,
  testConnection: async () => {
    try {
      await sequelize.authenticate();
      console.log('✅ Database connection thành công!');
    } catch (error) {
      console.error('❌ Không thể kết nối database:', error);
      throw error;
    }
  }
};
