require('dotenv').config();
const path = require('path');
const fs = require('fs').promises;
const PDFProcessor = require('../services/pdfProcessor');
const { testConnection } = require('../models');

async function processPDF() {
  try {
    await testConnection();
    
    const pdfProcessor = new PDFProcessor();
    
    const pdfPath = process.argv[2];
    if (!pdfPath) {
      console.log(`
📖 HCM202 PDF Processor

Sử dụng: node process-pdf.js <path-to-pdf> [title] [category] [tags]

Ví dụ:
  node process-pdf.js "../fe/Giao trinh Tu tuong Ho Chi Minh.pdf" "Giáo trình Tư tưởng Hồ Chí Minh" "giáo trình" "hcm202,official"
      `);
      process.exit(1);
    }
    
    try {
      await fs.access(pdfPath);
    } catch {
      console.error('❌ File PDF không tồn tại:', pdfPath);
      process.exit(1);
    }
    
    const title = process.argv[3] || null;
    const category = process.argv[4] || 'Tài liệu học tập';
    const tagsArg = process.argv[5] || '';
    const tags = tagsArg ? tagsArg.split(',').map(tag => tag.trim()).filter(Boolean) : [];
    
    console.log(`
🔄 Đang xử lý PDF:
📁 File: ${pdfPath}
📄 Tiêu đề: ${title || 'Tự động từ tên file'}
📂 Phân loại: ${category}
🏷️  Tags: ${tags.length > 0 ? tags.join(', ') : 'Không có'}
    `);
    
    const result = await pdfProcessor.processPDF(pdfPath, title, category, tags);
    
    console.log(`
✅ Xử lý PDF thành công!

📊 Thống kê:
- Document ID: ${result.document.id}
- Tổng số trang: ${result.total_pages}
- Số chunks được tạo: ${result.chunks_count}
- Trạng thái: ${result.document.processing_status}

💡 Bây giờ bạn có thể bắt đầu chat và hệ thống sẽ sử dụng nội dung từ PDF này!
    `);
    
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Lỗi xử lý PDF:', error);
    process.exit(1);
  }
}

async function processKnownFiles() {
  console.log('🔍 Đang tìm file PDF có sẵn...');
  
  const knownPaths = [
    '../fe/Giao trinh Tu tuong Ho Chi Minh.pdf',
    '../Giao trinh Tu tuong Ho Chi Minh.pdf',
    'fe/Giao trinh Tu tuong Ho Chi Minh.pdf',
    'Giao trinh Tu tuong Ho Chi Minh.pdf'
  ];
  
  for (const pdfPath of knownPaths) {
    try {
      const fullPath = path.resolve(pdfPath);
      await fs.access(fullPath);
      
      console.log(`✅ Tìm thấy file: ${fullPath}`);
      
      const pdfProcessor = new PDFProcessor();
      const result = await pdfProcessor.processPDF(
        fullPath,
        'Giáo trình Tư tưởng Hồ Chí Minh',
        'Giáo trình chính thống',
        ['hcm202', 'giáo trình', 'chính thống', 'bộ giáo dục']
      );
      
      console.log(`✅ Đã xử lý thành công file: ${pdfPath}`);
      console.log(`📊 Tạo được ${result.chunks_count} chunks từ ${result.total_pages} trang`);
      
      return result;
    } catch (error) {
      console.log(`⏭️ Bỏ qua ${pdfPath} - không tồn tại`);
      continue;
    }
  }
  
  console.log('❌ Không tìm thấy file PDF nào!');
  console.log('💡 Sử dụng: node process-pdf.js <path-to-pdf>');
  return null;
}

if (require.main === module) {
  if (process.argv.length > 2) {
    processPDF();
  } else {
    testConnection()
      .then(() => processKnownFiles())
      .then((result) => {
        if (result) {
          console.log('✅ Hoàn tất xử lý PDF!');
        }
        process.exit(0);
      })
      .catch((error) => {
        console.error('❌ Lỗi:', error);
        process.exit(1);
      });
  }
}
