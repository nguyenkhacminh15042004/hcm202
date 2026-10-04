const rateLimit = require('express-rate-limit');
const { User } = require('../models');

/**
 * Rate limiter factory
 */
const rateLimiter = (options = {}) => {
  const defaultOptions = {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: {
      success: false,
      message: 'Quá nhiều yêu cầu từ IP này, vui lòng thử lại sau',
      retry_after: Math.ceil(options.windowMs / 1000) || 900
    },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      res.status(429).json(options.message || defaultOptions.message);
    }
  };

  return rateLimit({ ...defaultOptions, ...options });
};

/**
 * Authentication middleware (optional - không throw error nếu không có token)
 */
const authOptional = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const sessionToken = req.headers['x-session-token'];

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      
      // TODO: Implement JWT verification here
      // For now, we'll skip JWT and focus on guest users with session tokens
      
      // Temporary: assume token is user ID for development
      if (process.env.NODE_ENV === 'development' && token !== 'undefined') {
        const user = await User.findByPk(token);
        if (user) {
          req.user = user;
        }
      }
    }

    // Handle guest users with session token
    if (!req.user && sessionToken) {
      const user = await User.findOne({ 
        where: { session_token: sessionToken, role: 'guest' } 
      });
      
      if (user) {
        req.user = user;
      }
    }

    next();
  } catch (error) {
    console.error('Auth Optional Error:', error);
    next(); // Continue without user - đây là optional auth
  }
};

/**
 * Required authentication middleware
 */
const authRequired = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Token không hợp lệ'
      });
    }

    const token = authHeader.substring(7);
    
    // TODO: Implement JWT verification
    // For development, assume token is user ID
    if (process.env.NODE_ENV === 'development') {
      const user = await User.findByPk(token);
      if (!user) {
        return res.status(401).json({
          success: false,
          message: 'User không tồn tại'
        });
      }
      req.user = user;
    }

    next();
  } catch (error) {
    console.error('Auth Required Error:', error);
    res.status(401).json({
      success: false,
      message: 'Xác thực thất bại'
    });
  }
};

// Alias cho consistency
const authenticateToken = authRequired;

/**
 * Role-based authorization middleware
 */
const requireRole = (allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Cần đăng nhập để truy cập'
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Không có quyền truy cập chức năng này'
      });
    }

    next();
  };
};

/**
 * Error handling middleware
 */
const errorHandler = (error, req, res, next) => {
  console.error('Error Handler:', error);

  // Sequelize validation error
  if (error.name === 'SequelizeValidationError') {
    return res.status(400).json({
      success: false,
      message: 'Dữ liệu không hợp lệ',
      errors: error.errors.map(e => ({
        field: e.path,
        message: e.message
      }))
    });
  }

  // Sequelize unique constraint error
  if (error.name === 'SequelizeUniqueConstraintError') {
    return res.status(400).json({
      success: false,
      message: 'Dữ liệu đã tồn tại',
      errors: error.errors.map(e => ({
        field: e.path,
        message: 'Giá trị đã được sử dụng'
      }))
    });
  }

  // Sequelize foreign key error
  if (error.name === 'SequelizeForeignKeyConstraintError') {
    return res.status(400).json({
      success: false,
      message: 'Tham chiếu dữ liệu không hợp lệ'
    });
  }

  // JWT error
  if (error.name === 'JsonWebTokenError') {
    return res.status(401).json({
      success: false,
      message: 'Token không hợp lệ'
    });
  }

  if (error.name === 'TokenExpiredError') {
    return res.status(401).json({
      success: false,
      message: 'Token đã hết hạn'
    });
  }

  // Default error
  res.status(error.status || 500).json({
    success: false,
    message: error.message || 'Lỗi server',
    ...(process.env.NODE_ENV === 'development' && { 
      stack: error.stack,
      error: error 
    })
  });
};

/**
 * Not found handler
 */
const notFoundHandler = (req, res) => {
  res.status(404).json({
    success: false,
    message: `Không tìm thấy endpoint: ${req.method} ${req.originalUrl}`
  });
};

/**
 * CORS configuration
 */
const corsOptions = {
  origin: function (origin, callback) {
    const allowedOrigins = process.env.ALLOWED_ORIGINS 
      ? process.env.ALLOWED_ORIGINS.split(',')
      : ['http://localhost:3000', 'http://localhost:5000', 'http://localhost:8080'];
    
    // Allow requests with no origin (mobile apps, etc.)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Không được phép truy cập từ origin này'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Origin',
    'X-Requested-With', 
    'Content-Type',
    'Accept',
    'Authorization',
    'X-Session-Token'
  ],
  exposedHeaders: ['X-Session-Token']
};

/**
 * Request logging middleware
 */
const requestLogger = (req, res, next) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    const logData = {
      method: req.method,
      url: req.originalUrl,
      status: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      user: req.user ? req.user.id : 'guest'
    };
    
    console.log(`${req.method} ${req.originalUrl} - ${res.statusCode} - ${duration}ms`);
    
    // Log to file in production
    if (process.env.NODE_ENV === 'production') {
      // TODO: Implement proper logging with winston
    }
  });
  
  next();
};

module.exports = {
  rateLimiter,
  authOptional,
  authRequired,
  authenticateToken,
  requireRole,
  errorHandler,
  notFoundHandler,
  corsOptions,
  requestLogger
};
