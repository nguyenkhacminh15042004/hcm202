const PythonRAGService = require('../services/pythonRAGService');
const { validationResult } = require('express-validator');
const path = require('path');

/**
 * Controller for Python RAG operations
 */
class PythonRAGController {
  constructor() {
    this.pythonRAGService = new PythonRAGService();
  }

  /**
   * Check Python RAG environment status
   */
  async checkEnvironment(req, res) {
    try {
      const status = await this.pythonRAGService.checkEnvironment();
      const config = this.pythonRAGService.getConfiguration();

      res.json({
        success: status.success,
        environment: status,
        configuration: config
      });
    } catch (error) {
      console.error('Environment check error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to check Python environment',
        details: error.message
      });
    }
  }

  /**
   * Process PDF using Python RAG pipeline
   */
  async processPDF(req, res) {
    try {
      // Validate request
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: errors.array()
        });
      }

      const { filePath, query, saveToDatabase = true } = req.body;

      // Validate file path
      if (!filePath) {
        return res.status(400).json({
          success: false,
          error: 'File path is required'
        });
      }

      // Resolve absolute path
      let absolutePath;
      if (path.isAbsolute(filePath)) {
        absolutePath = filePath;
      } else {
        absolutePath = path.resolve(filePath);
      }

      console.log(`🔄 Processing PDF via Python RAG: ${absolutePath}`);

      // Process PDF
      const result = await this.pythonRAGService.processPDF(absolutePath, {
        query,
        saveToDatabase
      });

      if (result.success) {
        res.json({
          success: true,
          message: 'PDF processed successfully',
          data: {
            processingInfo: result.processingInfo,
            query: result.query,
            answer: result.answer
          }
        });
      } else {
        res.status(500).json({
          success: false,
          error: 'PDF processing failed',
          details: result.output
        });
      }

    } catch (error) {
      console.error('PDF processing error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        details: error.message
      });
    }
  }

  /**
   * Query PDF using Python RAG
   */
  async queryPDF(req, res) {
    try {
      // Validate request
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: errors.array()
        });
      }

      const { filePath, query } = req.body;

      if (!filePath || !query) {
        return res.status(400).json({
          success: false,
          error: 'File path and query are required'
        });
      }

      // Resolve absolute path
      let absolutePath;
      if (path.isAbsolute(filePath)) {
        absolutePath = filePath;
      } else {
        absolutePath = path.resolve(filePath);
      }

      console.log(`❓ Querying PDF: ${query}`);

      // Query PDF
      const result = await this.pythonRAGService.queryPDF(absolutePath, query);

      if (result.success) {
        res.json({
          success: true,
          query: query,
          answer: result.answer,
          processingInfo: result.processingInfo
        });
      } else {
        res.status(500).json({
          success: false,
          error: 'Query processing failed',
          details: result.output
        });
      }

    } catch (error) {
      console.error('Query processing error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        details: error.message
      });
    }
  }

  /**
   * Install Python dependencies
   */
  async installDependencies(req, res) {
    try {
      console.log('📦 Installing Python dependencies...');
      
      const result = await this.pythonRAGService.installDependencies();

      if (result.success) {
        res.json({
          success: true,
          message: 'Dependencies installed successfully',
          output: result.output
        });
      } else {
        res.status(500).json({
          success: false,
          error: 'Failed to install dependencies',
          details: result.error
        });
      }

    } catch (error) {
      console.error('Dependency installation error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        details: error.message
      });
    }
  }

  /**
   * Initialize Python RAG service
   */
  async initialize(req, res) {
    try {
      const initialized = await this.pythonRAGService.initialize();

      if (initialized) {
        res.json({
          success: true,
          message: 'Python RAG service initialized successfully',
          configuration: this.pythonRAGService.getConfiguration()
        });
      } else {
        res.status(500).json({
          success: false,
          error: 'Failed to initialize Python RAG service'
        });
      }

    } catch (error) {
      console.error('Initialization error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        details: error.message
      });
    }
  }

  /**
   * Demo endpoint to showcase Python RAG with existing PDF
   */
  async demo(req, res) {
    try {
      // Use the existing PDF in uploads
      const pdfPath = path.join(__dirname, '../../uploads/Giao trinh Tu tuong Ho Chi Minh.pdf');
      
      // Test queries
      const testQueries = [
        "Tư tưởng Hồ Chí Minh về độc lập dân tộc là gì?",
        "Quan điểm của Bác Hồ về đạo đức cách mạng?",
        "Vai trò của Đảng Cộng sản Việt Nam theo Hồ Chí Minh?"
      ];

      const results = [];

      // Initialize service
      await this.pythonRAGService.initialize();

      // Test each query
      for (const query of testQueries) {
        try {
          const result = await this.pythonRAGService.queryPDF(pdfPath, query);
          results.push({
            query,
            success: result.success,
            answer: result.answer,
            processingInfo: result.processingInfo
          });
        } catch (error) {
          results.push({
            query,
            success: false,
            error: error.message
          });
        }
      }

      res.json({
        success: true,
        message: 'Python RAG demo completed',
        pdfPath,
        results,
        configuration: this.pythonRAGService.getConfiguration()
      });

    } catch (error) {
      console.error('Demo error:', error);
      res.status(500).json({
        success: false,
        error: 'Demo failed',
        details: error.message
      });
    }
  }
}

module.exports = new PythonRAGController();
