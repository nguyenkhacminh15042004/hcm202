const { Sequelize } = require('sequelize');

// Database configuration từ environment variables
const dbConfig = {
  database: process.env.DB_NAME || 'hcm202_db',
  username: process.env.DB_USER || 'hcm202_user',
  password: process.env.DB_PASSWORD || 'password',
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  dialect: 'postgres',
  logging: process.env.NODE_ENV === 'development' ? console.log : false,
  pool: {
    max: 10,
    min: 0,
    acquire: 30000,
    idle: 10000
  },
  define: {
    timestamps: true,
    underscored: true,  // Use snake_case for created_at, updated_at
    freezeTableName: true
  },
  dialectOptions: {
    ssl: process.env.DB_SSL === 'true' ? {
      require: true,
      rejectUnauthorized: false
    } : false
  }
};

// Tạo Sequelize instance
const sequelize = new Sequelize(
  dbConfig.database,
  dbConfig.username,
  dbConfig.password,
  dbConfig
);

// Test connection function
const testConnection = async () => {
  try {
    await sequelize.authenticate();
    console.log('✅ Database connection thành công!');
    return true;
  } catch (error) {
    console.error('❌ Không thể kết nối database:', error);
    throw error;
  }
};

module.exports = {
  sequelize,
  testConnection,
  dbConfig
};
