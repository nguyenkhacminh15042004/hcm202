const express = require('express');
const { body, param, query } = require('express-validator');
const settingsController = require('../controllers/settingsController');
const { authenticateToken, requireRole } = require('../middleware');

const router = express.Router();

/**
 * @route GET /api/v1/settings/public
 * @desc Lấy tất cả settings công khai
 * @access Public
 */
router.get('/public', [
  query('category').optional().isIn(['openai', 'chat', 'rag'])
], settingsController.getPublicSettings);

/**
 * @route GET /api/v1/settings
 * @desc Lấy tất cả settings (bao gồm private) - Admin only
 * @access Admin
 */
router.get('/', [
  authenticateToken,
  requireRole(['admin']),
  query('category').optional().isIn(['openai', 'chat', 'rag', 'system', 'security'])
], settingsController.getAllSettings);

/**
 * @route PUT /api/v1/settings/:key
 * @desc Cập nhật một setting
 * @access Admin (for sensitive), Authenticated (for public)
 */
router.put('/:key', [
  authenticateToken,
  param('key').notEmpty().withMessage('Setting key là bắt buộc'),
  body('value').notEmpty().withMessage('Value là bắt buộc'),
  body('test_first').optional().isBoolean()
], settingsController.updateSetting);

/**
 * @route POST /api/v1/settings/test-openai
 * @desc Test kết nối OpenAI
 * @access Admin
 */
router.post('/test-openai', [
  authenticateToken,
  requireRole(['admin']),
  body('api_key').optional().isString(),
  body('chat_model').optional().isString(),
  body('embedding_model').optional().isString()
], settingsController.testOpenAIConnection);

/**
 * @route POST /api/v1/settings/reset
 * @desc Reset settings về default
 * @access Admin
 */
router.post('/reset', [
  authenticateToken,
  requireRole(['admin']),
  body('category').optional().isIn(['openai', 'chat', 'rag', 'system', 'security'])
], settingsController.resetSettings);

/**
 * @route GET /api/v1/settings/models/available
 * @desc Lấy danh sách models có sẵn từ OpenAI
 * @access Admin
 */
router.get('/models/available', [
  authenticateToken,
  requireRole(['admin']),
  body('api_key').optional().isString()
], settingsController.getAvailableModels);

/**
 * @route GET /api/v1/settings/export
 * @desc Export settings (public only)
 * @access Admin
 */
router.get('/export', [
  authenticateToken,
  requireRole(['admin'])
], settingsController.exportSettings);

module.exports = router;
