require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');

const { testConnection, syncDatabase } = require('./models');
const routes = require('./routes');
const { 
  errorHandler, 
  notFoundHandler, 
  corsOptions, 
  requestLogger,
  rateLimiter 
} = require('./middleware');
const quizService = require('./services/quizService');

class Server {
  constructor() {
    this.app = express();
    this.port = process.env.PORT || 3001;
    this.apiVersion = process.env.API_VERSION || 'v1';
  }

  async initialize() {
    await this.setupDatabase();
    this.setupMiddleware();
    this.setupRoutes();
    this.setupErrorHandling();
    await this.start();
  }

  async setupDatabase() {
    try {
      console.log('Đang kết nối database...');
      await testConnection();
      
      await syncDatabase({ 
        alter: process.env.NODE_ENV === 'development',
        force: false 
      });
      
      console.log('Database đã được khởi tạo thành công!');

      await quizService.processPredefinedQuizFile();

    } catch (error) {
      console.error('Lỗi kết nối database:', error);
      process.exit(1);
    }
  }

  setupMiddleware() {
    this.app.use(helmet({
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          "default-src": ["'self'"],
          "script-src": ["'self'", "'unsafe-inline'"],
          "style-src": ["'self'", "'unsafe-inline'"],
          "img-src": ["'self'", "data:", "https:"]
        }
      },
      crossOriginEmbedderPolicy: false
    }));

    this.app.use(cors(corsOptions));
    this.app.use(compression());
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    if (process.env.NODE_ENV === 'production') {
      this.app.use(morgan('combined'));
    } else {
      this.app.use(morgan('dev'));
    }
    
    this.app.use(requestLogger);

    this.app.use(rateLimiter({
      windowMs: 15 * 60 * 1000,
      max: 200,
      message: 'Quá nhiều yêu cầu từ IP này, vui lòng thử lại sau'
    }));

    this.app.set('trust proxy', 1);
  }

  setupRoutes() {
    this.app.use(`/api/${this.apiVersion}`, routes);

    this.app.get('/', (req, res) => {
      res.status(200).json({
        success: true,
        message: 'HCM202 Backend API',
        version: '1.0.0',
        description: 'Backend cho hệ thống hỏi đáp về Tư tưởng Hồ Chí Minh với RAG',
        api: {
          version: this.apiVersion,
          baseUrl: `/api/${this.apiVersion}`,
          documentation: `/api/${this.apiVersion}/docs`
        },
        status: 'running',
        timestamp: new Date().toISOString()
      });
    });

    this.app.use('/uploads', express.static('uploads'));
    this.app.use('/public', express.static('public'));
  }

  setupErrorHandling() {
    this.app.use(notFoundHandler);
    this.app.use(errorHandler);
  }

  async start() {
    return new Promise((resolve) => {
      this.server = this.app.listen(this.port, () => {
        console.log(`HCM202 Backend started on port ${this.port}`);
        resolve();
      });
    });
  }

  async stop() {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          console.log('Server đã được dừng');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }
}

const server = new Server();

process.on('SIGINT', async () => {
  console.log('\nĐang dừng server...');
  await server.stop();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\nĐang dừng server...');
  await server.stop();
  process.exit(0);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

if (require.main === module) {
  server.initialize().catch(error => {
    console.error('Failed to start server:', error);
    process.exit(1);
  });
}

module.exports = server;
