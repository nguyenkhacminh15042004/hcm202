const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const QuizBank = sequelize.define('QuizBank', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false,
    comment: 'Tên bộ câu hỏi',
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Mô tả bộ câu hỏi',
  },
}, {
  tableName: 'quiz_banks',
});

const QuizQuestion = sequelize.define('QuizQuestion', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  bank_id: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: QuizBank,
      key: 'id',
    },
  },
  question_text: {
    type: DataTypes.TEXT,
    allowNull: false,
    comment: 'Nội dung câu hỏi',
  },
  options: {
    type: DataTypes.JSONB,
    allowNull: false,
    comment: 'Các lựa chọn, ví dụ: { "A": "Lựa chọn A", "B": "Lựa chọn B" }',
  },
  correct_answer: {
    type: DataTypes.STRING,
    allowNull: false,
    comment: 'Đáp án đúng, ví dụ: "A"',
  },
  explanation: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Giải thích đáp án',
  },
}, {
  tableName: 'quiz_questions',
});

QuizBank.hasMany(QuizQuestion, { foreignKey: 'bank_id', as: 'questions' });
QuizQuestion.belongsTo(QuizBank, { foreignKey: 'bank_id', as: 'bank' });

module.exports = {
  QuizBank,
  QuizQuestion,
};

