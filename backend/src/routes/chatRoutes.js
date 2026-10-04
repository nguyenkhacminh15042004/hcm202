const express = require('express');
const { body, param, query } = require('express-validator');
const chatController = require('../controllers/chatController');
const { authOptional, rateLimiter } = require('../middleware');

const router = express.Router();

// Validation rules
const sendMessageValidation = [
  body('message')
    .trim()
    .isLength({ min: 1, max: 5000 })
    .withMessage('Tin nhắn phải có độ dài từ 1-5000 ký tự'),
  body('session_id')
    .optional()
    .isUUID()
    .withMessage('Session ID không hợp lệ'),
  body('category')
    .optional()
    .isString()
    .isLength({ max: 50 })
    .withMessage('Category không hợp lệ')
];

const rateMessageValidation = [
  param('message_id')
    .isUUID()
    .withMessage('Message ID không hợp lệ'),
  body('rating')
    .isInt({ min: 1, max: 5 })
    .withMessage('Rating phải là số từ 1-5'),
  body('feedback')
    .optional()
    .isString()
    .isLength({ max: 1000 })
    .withMessage('Feedback không được quá 1000 ký tự')
];

// Apply rate limiting to all chat routes
router.use('/chat', rateLimiter({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 30, // 30 requests per minute
  message: 'Quá nhiều yêu cầu, vui lòng thử lại sau'
}));

/**
 * @route POST /api/v1/chat/send
 * @description Gửi tin nhắn và nhận phản hồi từ AI
 * @access Public (hỗ trợ guest)
 */
router.post('/send', 
  authOptional,
  sendMessageValidation,
  chatController.sendMessage
);

/**
 * @route GET /api/v1/chat/history/:session_id
 * @description Lấy lịch sử chat của một session
 * @access Public
 */
router.get('/history/:session_id',
  authOptional,
  param('session_id').isUUID().withMessage('Session ID không hợp lệ'),
  query('page').optional().isInt({ min: 1 }).withMessage('Page phải là số dương'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit phải từ 1-100'),
  chatController.getChatHistory
);

/**
 * @route GET /api/v1/chat/sessions
 * @description Lấy danh sách sessions của user (chỉ cho logged in users)
 * @access Private
 */
router.get('/sessions',
  authOptional, // Sẽ return empty nếu guest
  chatController.getUserSessions
);

/**
 * @route POST /api/v1/chat/session
 * @description Tạo session mới
 * @access Public (hỗ trợ guest)
 */
router.post('/session',
  authOptional,
  chatController.createSession
);

/**
 * @route GET /api/v1/chat/suggestions
 * @description Lấy gợi ý câu hỏi
 * @access Public
 */
router.get('/suggestions',
  chatController.getSuggestions
);

/**
 * @route POST /api/v1/chat/rate/:message_id
 * @description Đánh giá tin nhắn
 * @access Public
 */
router.post('/rate/:message_id',
  authOptional,
  rateMessageValidation,
  chatController.rateMessage
);

/**
 * @route GET /api/v1/chat/export/:session_id
 * @description Export lịch sử chat
 * @access Public
 */
router.get('/export/:session_id',
  authOptional,
  param('session_id').isUUID().withMessage('Session ID không hợp lệ'),
  query('format').optional().isIn(['json', 'text']).withMessage('Format phải là json hoặc text'),
  chatController.exportChatHistory
);

/**
 * @route DELETE /api/v1/chat/session/:session_id
 * @description Xóa session (archived)
 * @access Private (cần đăng nhập)
 */
router.delete('/session/:session_id',
  authOptional, // Sẽ fail nếu không có user
  param('session_id').isUUID().withMessage('Session ID không hợp lệ'),
  chatController.deleteSession
);

module.exports = router;
