#!/usr/bin/env node

/**
 * Demo script to test Python RAG integration
 * Usage: node src/scripts/demo-python-rag.js
 */

const path = require('path');
const PythonRAGService = require('../services/pythonRAGService');

async function runDemo() {
  console.log('🚀 Python RAG Integration Demo');
  console.log('=' * 50);

  const pythonRAG = new PythonRAGService();

  try {
    // Step 1: Check Python environment
    console.log('\n📋 Step 1: Checking Python environment...');
    const envCheck = await pythonRAG.checkEnvironment();
    
    if (!envCheck.success) {
      console.log('❌ Python environment check failed:', envCheck.error);
      console.log('💡 Try installing dependencies:');
      console.log('   cd backend/python_rag && pip install -r requirements.txt');
      return;
    }
    
    console.log('✅ Python environment is ready');
    console.log(envCheck.output);

    // Step 2: Initialize service
    console.log('\n🔧 Step 2: Initializing Python RAG service...');
    const initialized = await pythonRAG.initialize();
    
    if (!initialized) {
      console.log('❌ Failed to initialize Python RAG service');
      return;
    }

    // Step 3: Test with existing PDF
    console.log('\n📖 Step 3: Testing with PDF...');
    
    // Use the existing PDF in uploads folder
    const pdfPath = path.join(__dirname, '../../uploads/Giao trinh Tu tuong Ho Chi Minh.pdf');
    
    try {
      await require('fs').promises.access(pdfPath);
      console.log(`✅ Found PDF: ${pdfPath}`);
    } catch {
      console.log(`❌ PDF not found: ${pdfPath}`);
      console.log('💡 Please place a PDF file in the uploads folder first');
      return;
    }

    // Step 4: Process PDF without query (full processing)
    console.log('\n🔄 Step 4: Processing PDF (full pipeline)...');
    
    const processingResult = await pythonRAG.processPDF(pdfPath, {
      saveToDatabase: true
    });

    if (processingResult.success) {
      console.log('✅ PDF processing completed successfully');
      console.log('📊 Processing Info:', processingResult.processingInfo);
    } else {
      console.log('❌ PDF processing failed');
      return;
    }

    // Step 5: Test query processing
    console.log('\n❓ Step 5: Testing query processing...');
    
    const testQueries = [
      "Tư tưởng Hồ Chí Minh về độc lập dân tộc là gì?",
      "Quan điểm của Bác Hồ về đạo đức cách mạng?",
      "Vai trò của Đảng Cộng sản Việt Nam theo Hồ Chí Minh?"
    ];

    for (const query of testQueries) {
      console.log(`\n🔍 Querying: "${query}"`);
      
      try {
        const queryResult = await pythonRAG.queryPDF(pdfPath, query);
        
        if (queryResult.success && queryResult.answer) {
          console.log(`💡 Answer: ${queryResult.answer}`);
        } else {
          console.log('❌ No answer generated');
        }
      } catch (error) {
        console.log(`❌ Query failed: ${error.message}`);
      }
    }

    // Step 6: Show configuration
    console.log('\n⚙️ Step 6: Python RAG Configuration');
    const config = pythonRAG.getConfiguration();
    console.log(JSON.stringify(config, null, 2));

    console.log('\n🎉 Demo completed successfully!');
    console.log('\n📝 Next steps:');
    console.log('1. Integrate Python RAG calls into your existing chat endpoints');
    console.log('2. Add Python RAG processing to your PDF upload workflow');
    console.log('3. Use the Excel exports for analysis and debugging');
    console.log('4. Experiment with different queries and parameters');

  } catch (error) {
    console.error('❌ Demo failed:', error);
    console.error(error.stack);
  }
}

// Run demo if called directly
if (require.main === module) {
  runDemo().catch(console.error);
}

module.exports = runDemo;
