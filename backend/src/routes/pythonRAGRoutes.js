const express = require('express');
const { body } = require('express-validator');
const pythonRAGController = require('../controllers/pythonRAGController');

const router = express.Router();

/**
 * @route GET /api/python-rag/status
 * @desc Check Python RAG environment status
 * @access Public
 */
router.get('/status', pythonRAGController.checkEnvironment);

/**
 * @route POST /api/python-rag/initialize
 * @desc Initialize Python RAG service
 * @access Public
 */
router.post('/initialize', pythonRAGController.initialize);

/**
 * @route POST /api/python-rag/install-deps
 * @desc Install Python dependencies
 * @access Public
 */
router.post('/install-deps', pythonRAGController.installDependencies);

/**
 * @route POST /api/python-rag/process
 * @desc Process PDF using Python RAG pipeline
 * @access Public
 */
router.post('/process', [
  body('filePath')
    .notEmpty()
    .withMessage('File path is required'),
  body('query')
    .optional()
    .isLength({ min: 5 })
    .withMessage('Query must be at least 5 characters long'),
  body('saveToDatabase')
    .optional()
    .isBoolean()
    .withMessage('saveToDatabase must be a boolean')
], pythonRAGController.processPDF);

/**
 * @route POST /api/python-rag/query
 * @desc Query PDF using Python RAG
 * @access Public
 */
router.post('/query', [
  body('filePath')
    .notEmpty()
    .withMessage('File path is required'),
  body('query')
    .notEmpty()
    .isLength({ min: 5 })
    .withMessage('Query must be at least 5 characters long')
], pythonRAGController.queryPDF);

/**
 * @route GET /api/python-rag/demo
 * @desc Run Python RAG demo with existing PDF
 * @access Public
 */
router.get('/demo', pythonRAGController.demo);

module.exports = router;
