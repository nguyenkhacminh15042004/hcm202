const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs').promises;

/**
 * Service to integrate Python RAG pipeline with Node.js backend
 */
class PythonRAGService {
  constructor() {
    this.pythonPath = process.env.PYTHON_PATH || 'python';
    this.scriptPath = path.join(__dirname, '../../python_rag/rag_processor.py');
    this.isInitialized = false;
  }

  /**
   * Initialize Python environment and check dependencies
   */
  async initialize() {
    try {
      console.log('🐍 Initializing Python RAG Service...');
      
      // Check if Python script exists
      await fs.access(this.scriptPath);
      
      // Test Python environment
      const testResult = await this.runPythonCommand(['-c', 'import sys; print(sys.version)']);
      console.log('🐍 Python version:', testResult.stdout.trim());
      
      // Check if required packages are installed
      const packagesCheck = await this.runPythonCommand(['-c', 
        'import fitz, openai, pandas, numpy, rake_nltk, langchain_text_splitters; print("All packages available")'
      ]);
      
      console.log('📦 Python packages:', packagesCheck.stdout.trim());
      this.isInitialized = true;
      
      return true;
    } catch (error) {
      console.error('❌ Python RAG Service initialization failed:', error);
      console.log('💡 To fix this, run:');
      console.log('   cd backend/python_rag && pip install -r requirements.txt');
      return false;
    }
  }

  /**
   * Process PDF file using Python RAG pipeline
   */
  async processPDF(pdfPath, options = {}) {
    if (!this.isInitialized) {
      const initialized = await this.initialize();
      if (!initialized) {
        throw new Error('Python RAG Service not properly initialized');
      }
    }

    const {
      query = null,
      saveToDatabase = true
    } = options;

    try {
      console.log(`📖 Processing PDF with Python RAG: ${pdfPath}`);
      
      // Prepare command arguments
      const args = [this.scriptPath, pdfPath];
      
      if (query) {
        args.push('--query', query);
      }
      
      if (!saveToDatabase) {
        args.push('--no-db');
      }

      // Run Python script
      const result = await this.runPythonCommand(args, {
        timeout: 300000 // 5 minutes timeout
      });

      // Parse result
      const output = result.stdout;
      const errors = result.stderr;

      if (errors && errors.includes('ERROR') || errors.includes('❌')) {
        throw new Error(`Python processing error: ${errors}`);
      }

      // Extract key information from output
      const processingInfo = this.parseProcessingOutput(output);
      
      console.log('✅ Python RAG processing completed');
      console.log(`📊 Processed ${processingInfo.pages} pages, ${processingInfo.chunks} chunks`);
      
      return {
        success: true,
        output: output,
        processingInfo: processingInfo,
        query: query,
        answer: processingInfo.answer || null
      };

    } catch (error) {
      console.error('❌ Python RAG processing failed:', error);
      throw error;
    }
  }

  /**
   * Query processed PDF using Python RAG pipeline
   */
  async queryPDF(pdfPath, query) {
    return await this.processPDF(pdfPath, {
      query: query,
      saveToDatabase: false // Just query, don't re-process
    });
  }

  /**
   * Run a Python command and return result
   */
  async runPythonCommand(args, options = {}) {
    const { timeout = 60000 } = options;

    return new Promise((resolve, reject) => {
      const python = spawn(this.pythonPath, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env },
        cwd: path.dirname(this.scriptPath)
      });

      let stdout = '';
      let stderr = '';

      python.stdout.on('data', (data) => {
        stdout += data.toString();
        // Log real-time output for long-running processes
        if (data.toString().includes('Step ') || data.toString().includes('✅') || data.toString().includes('🎉')) {
          console.log('🐍', data.toString().trim());
        }
      });

      python.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      python.on('close', (code) => {
        if (code === 0) {
          resolve({ stdout, stderr, code });
        } else {
          reject(new Error(`Python process exited with code ${code}. stderr: ${stderr}`));
        }
      });

      python.on('error', (error) => {
        reject(new Error(`Failed to start Python process: ${error.message}`));
      });

      // Set timeout
      setTimeout(() => {
        python.kill();
        reject(new Error('Python process timeout'));
      }, timeout);
    });
  }

  /**
   * Parse processing output to extract key information
   */
  parseProcessingOutput(output) {
    const info = {
      pages: 0,
      chunks: 0,
      phrases: 0,
      documentId: null,
      excelFile: null,
      answer: null
    };

    // Extract information using regex patterns
    const patterns = {
      pages: /Extracted text from (\d+) pages/,
      chunks: /Created (\d+) chunks/,
      phrases: /Extracted (\d+) phrases/,
      documentId: /Database document ID: (\d+)/,
      excelFile: /Excel file: ([^\n]+)/,
      answer: /💡 Answer:\s*📝 ([^\n]+)/
    };

    for (const [key, pattern] of Object.entries(patterns)) {
      const match = output.match(pattern);
      if (match) {
        if (key === 'answer' || key === 'excelFile') {
          info[key] = match[1].trim();
        } else {
          info[key] = parseInt(match[1]) || match[1];
        }
      }
    }

    return info;
  }

  /**
   * Check Python environment status
   */
  async checkEnvironment() {
    try {
      const result = await this.runPythonCommand(['-c', `
import sys
import pkg_resources

required_packages = [
    'PyMuPDF', 'rake-nltk', 'openai', 'pandas', 
    'numpy', 'scipy', 'psycopg2-binary', 'python-dotenv',
    'langchain-text-splitters', 'nltk', 'openpyxl', 'tqdm'
]

print("Python version:", sys.version)
print("Installed packages:")

for package in required_packages:
    try:
        version = pkg_resources.get_distribution(package).version
        print(f"✅ {package}: {version}")
    except pkg_resources.DistributionNotFound:
        print(f"❌ {package}: NOT INSTALLED")
        
print("Environment check complete")
      `]);

      return {
        success: true,
        output: result.stdout,
        pythonVersion: result.stdout.match(/Python version: ([^\n]+)/)?.[1] || 'Unknown'
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Install Python dependencies
   */
  async installDependencies() {
    try {
      console.log('📦 Installing Python dependencies...');
      
      const requirementsPath = path.join(__dirname, '../../python_rag/requirements.txt');
      
      const result = await this.runPythonCommand(['-m', 'pip', 'install', '-r', requirementsPath], {
        timeout: 300000 // 5 minutes for installation
      });

      console.log('✅ Python dependencies installed successfully');
      return {
        success: true,
        output: result.stdout
      };
    } catch (error) {
      console.error('❌ Failed to install Python dependencies:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get available Python models and configuration
   */
  getConfiguration() {
    return {
      pythonPath: this.pythonPath,
      scriptPath: this.scriptPath,
      isInitialized: this.isInitialized,
      supportedFeatures: [
        'PDF text extraction',
        'Text chunking with overlap',
        'RAKE phrase extraction',
        'OpenAI embeddings',
        'Cosine similarity search',
        'Excel export',
        'Database integration'
      ]
    };
  }
}

module.exports = PythonRAGService;
