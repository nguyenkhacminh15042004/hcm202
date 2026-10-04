const express = require('express');
const chatRoutes = require('./chatRoutes');
const settingsRoutes = require('./settingsRoutes');
const pythonRAGRoutes = require('./pythonRAGRoutes');
const quizRoutes = require('./quizRoutes');

const router = express.Router();

// Health check endpoint
router.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'HCM202 Backend đang hoạt động tốt',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0',
    environment: process.env.NODE_ENV || 'development'
  });
});

// API info endpoint
router.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'HCM202 API',
    description: 'Backend API cho hệ thống hỏi đáp về Tư tưởng Hồ Chí Minh với RAG',
    version: '1.0.0',
    endpoints: {
      chat: '/api/v1/chat',
      settings: '/api/v1/settings',
      'python-rag': '/api/v1/python-rag',
      health: '/api/v1/health'
    },
    documentation: '/api/v1/docs'
  });
});

// Mount route modules
router.use('/chat', chatRoutes);
router.use('/settings', settingsRoutes);
router.use('/python-rag', pythonRAGRoutes);
router.use('/quiz', quizRoutes);

// API documentation endpoint (simple)
router.get('/docs', (req, res) => {
  res.status(200).json({
    success: true,
    title: 'HCM202 API Documentation',
    version: '1.0.0',
    baseUrl: `${req.protocol}://${req.get('host')}/api/v1`,
    endpoints: {
      chat: {
        'POST /chat/send': 'Gửi tin nhắn và nhận phản hồi',
        'GET /chat/history/:session_id': 'Lấy lịch sử chat',
        'GET /chat/sessions': 'Lấy danh sách sessions của user',
        'POST /chat/session': 'Tạo session mới',
        'GET /chat/suggestions': 'Lấy gợi ý câu hỏi',
        'POST /chat/rate/:message_id': 'Đánh giá tin nhắn',
        'GET /chat/export/:session_id': 'Export lịch sử chat',
        'DELETE /chat/session/:session_id': 'Xóa session'
      },
      settings: {
        'GET /settings/public': 'Lấy cấu hình công khai',
        'GET /settings': 'Lấy tất cả cấu hình (Admin)',
        'PUT /settings/:key': 'Cập nhật cấu hình',
        'POST /settings/test-openai': 'Test kết nối OpenAI',
        'POST /settings/reset': 'Reset cấu hình về mặc định',
        'GET /settings/models/available': 'Lấy danh sách models OpenAI',
        'GET /settings/export': 'Export cấu hình'
      },
      'python-rag': {
        'GET /python-rag/status': 'Kiểm tra trạng thái Python environment',
        'POST /python-rag/initialize': 'Khởi tạo Python RAG service',
        'POST /python-rag/install-deps': 'Cài đặt dependencies Python',
        'POST /python-rag/process': 'Xử lý PDF bằng Python RAG pipeline',
        'POST /python-rag/query': 'Truy vấn PDF đã xử lý',
        'GET /python-rag/demo': 'Demo Python RAG với PDF có sẵn'
      },
      quiz: {
        'POST /quiz/upload': 'Tải lên file quiz DOCX'
      }
    },
    authentication: {
      type: 'Optional Bearer Token hoặc X-Session-Token header',
      note: 'Hỗ trợ guest users với session token'
    },
    rateLimit: {
      chat: '30 requests/minute',
      general: '100 requests/15 minutes'
    }
  });
});

module.exports = router;
