require('dotenv').config();
const { syncDatabase, Settings } = require('../models');

async function initDatabase() {
  try {
    console.log('🔄 Đang khởi tạo database...');
    
    // Sync với force=true để tạo lại tables (cẩn thận với production!)
    const forceReset = process.argv.includes('--force');
    
    if (forceReset) {
      console.log('⚠️  CẢNH BÁO: Sẽ xóa tất cả dữ liệu existing!');
      console.log('⏳ Đợi 5 giây để hủy nếu không muốn...');
      
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
    
    await syncDatabase({ 
      force: forceReset,
      alter: !forceReset // Use alter if not forcing
    });
    
    console.log('✅ Database đã được khởi tạo thành công!');
    
    // Khởi tạo default settings
    console.log('🔄 Đang khởi tạo default settings...');
    await Settings.initializeDefaults();
    
    // Tạo sample data nếu cần
    if (process.argv.includes('--sample')) {
      await createSampleData();
    }
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Lỗi khởi tạo database:', error);
    process.exit(1);
  }
}

async function createSampleData() {
  const { Quiz, QuizQuestion, User } = require('../models');
  
  console.log('🔄 Đang tạo dữ liệu mẫu...');
  
  try {
    // Tạo admin user
    const adminUser = await User.create({
      username: 'admin',
      email: 'admin@hcm202.edu.vn',
      full_name: 'Administrator',
      role: 'admin',
      password_hash: 'admin123', // Will be hashed by hook
      is_active: true
    });
    
    // Tạo sample quiz
    const quiz = await Quiz.create({
      title: 'Quiz Chương 1: Khái niệm về Tư tưởng Hồ Chí Minh',
      description: 'Kiểm tra kiến thức về khái niệm, đối tượng và phương pháp nghiên cứu Tư tưởng Hồ Chí Minh',
      category: 'Chương 1',
      difficulty_level: 'medium',
      time_limit: 15, // 15 minutes
      passing_score: 5.0,
      max_attempts: 3,
      is_randomized: true,
      show_results_immediately: true,
      show_correct_answers: true,
      tags: ['chapter1', 'khái niệm', 'cơ bản'],
      created_by: adminUser.id
    });
    
    // Tạo sample questions
    const questions = [
      {
        question_text: 'Tư tưởng Hồ Chí Minh là gì?',
        question_type: 'multiple_choice',
        options: [
          { id: 'A', text: 'Hệ thống quan điểm lý luận toàn diện và sâu sắc về các vấn đề cơ bản của cách mạng Việt Nam', is_correct: true },
          { id: 'B', text: 'Tập hợp các bài viết của Hồ Chí Minh', is_correct: false },
          { id: 'C', text: 'Quan điểm cá nhân của Hồ Chí Minh', is_correct: false },
          { id: 'D', text: 'Lý thuyết chính trị của Đảng', is_correct: false }
        ],
        explanation: 'Tư tưởng Hồ Chí Minh là hệ thống quan điểm lý luận toàn diện và sâu sắc về các vấn đề cơ bản của cách mạng Việt Nam.',
        points: 2.0,
        order_index: 1,
        reference_source: 'Giáo trình Tư tưởng Hồ Chí Minh, chương 1'
      },
      {
        question_text: 'Đối tượng nghiên cứu của môn Tư tưởng Hồ Chí Minh là gì?',
        question_type: 'multiple_choice',
        options: [
          { id: 'A', text: 'Cuộc đời và sự nghiệp của Hồ Chí Minh', is_correct: false },
          { id: 'B', text: 'Hệ thống quan điểm lý luận của Hồ Chí Minh về các vấn đề cơ bản của cách mạng Việt Nam', is_correct: true },
          { id: 'C', text: 'Lịch sử Đảng Cộng sản Việt Nam', is_correct: false },
          { id: 'D', text: 'Văn hóa truyền thống Việt Nam', is_correct: false }
        ],
        explanation: 'Đối tượng nghiên cứu là hệ thống quan điểm lý luận của Hồ Chí Minh về các vấn đề cơ bản của cách mạng Việt Nam.',
        points: 2.0,
        order_index: 2,
        reference_source: 'Giáo trình Tư tưởng Hồ Chí Minh, chương 1'
      },
      {
        question_text: 'Phương pháp nào KHÔNG phải là phương pháp nghiên cứu Tư tưởng Hồ Chí Minh?',
        question_type: 'multiple_choice',
        options: [
          { id: 'A', text: 'Phương pháp lịch sử - logic', is_correct: false },
          { id: 'B', text: 'Phương pháp thống kê toán học', is_correct: true },
          { id: 'C', text: 'Phương pháp phân tích và tổng hợp', is_correct: false },
          { id: 'D', text: 'Phương pháp so sánh', is_correct: false }
        ],
        explanation: 'Phương pháp thống kê toán học không phải là phương pháp nghiên cứu chủ yếu trong Tư tưởng Hồ Chí Minh.',
        points: 2.0,
        order_index: 3,
        reference_source: 'Giáo trình Tư tưởng Hồ Chí Minh, chương 1'
      }
    ];
    
    for (const questionData of questions) {
      await QuizQuestion.create({
        quiz_id: quiz.id,
        ...questionData
      });
    }
    
    // Update quiz question count
    await quiz.updateQuestionCount();
    
    console.log(`✅ Đã tạo dữ liệu mẫu:
- Admin user: admin@hcm202.edu.vn (password: admin123)
- Sample quiz: ${quiz.title} (${questions.length} câu hỏi)`);
    
  } catch (error) {
    console.error('❌ Lỗi tạo dữ liệu mẫu:', error);
  }
}

// Chạy script
initDatabase();
