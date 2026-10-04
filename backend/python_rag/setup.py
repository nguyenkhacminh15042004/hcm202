#!/usr/bin/env python3
"""
Setup script for Python RAG environment
"""

import subprocess
import sys
import os

def run_command(command):
    """Run shell command and return result"""
    try:
        result = subprocess.run(command, shell=True, check=True, 
                              capture_output=True, text=True)
        return True, result.stdout
    except subprocess.CalledProcessError as e:
        return False, e.stderr

def check_python_version():
    """Check if Python version is compatible"""
    version = sys.version_info
    print(f"🐍 Python version: {version.major}.{version.minor}.{version.micro}")
    
    if version.major < 3 or (version.major == 3 and version.minor < 8):
        print("❌ Python 3.8 or higher is required")
        return False
    
    print("✅ Python version is compatible")
    return True

def install_requirements():
    """Install required packages"""
    print("📦 Installing Python dependencies...")
    
    requirements_file = os.path.join(os.path.dirname(__file__), 'requirements.txt')
    
    if not os.path.exists(requirements_file):
        print("❌ requirements.txt not found")
        return False
    
    success, output = run_command(f"{sys.executable} -m pip install -r {requirements_file}")
    
    if success:
        print("✅ Dependencies installed successfully")
        return True
    else:
        print(f"❌ Failed to install dependencies: {output}")
        return False

def setup_nltk_data():
    """Download required NLTK data"""
    print("📚 Setting up NLTK data...")
    
    import nltk
    try:
        nltk.download('punkt', quiet=True)
        nltk.download('stopwords', quiet=True)
        print("✅ NLTK data downloaded")
        return True
    except Exception as e:
        print(f"❌ Failed to download NLTK data: {e}")
        return False

def test_imports():
    """Test if all required packages can be imported"""
    print("🧪 Testing imports...")
    
    packages = [
        'fitz',
        'openai', 
        'pandas',
        'numpy',
        'scipy',
        'rake_nltk',
        'langchain_text_splitters',
        'psycopg2',
        'nltk',
        'openpyxl',
        'tqdm'
    ]
    
    failed_imports = []
    
    for package in packages:
        try:
            __import__(package)
            print(f"  ✅ {package}")
        except ImportError:
            print(f"  ❌ {package}")
            failed_imports.append(package)
    
    if failed_imports:
        print(f"\n❌ Failed to import: {', '.join(failed_imports)}")
        return False
    
    print("✅ All packages imported successfully")
    return True

def create_env_file():
    """Create .env file template if it doesn't exist"""
    env_file = os.path.join(os.path.dirname(__file__), '.env')
    
    if os.path.exists(env_file):
        print("✅ .env file already exists")
        return True
    
    env_template = """# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=hcm202_db
DB_USER=postgres
DB_PASSWORD=your_password

# OpenAI Configuration
OPENAI_API_KEY=your_openai_api_key
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_EMBEDDING_MODEL=text-embedding-ada-002
OPENAI_MODEL=gpt-4

# RAG Configuration
CHUNK_SIZE=1000
CHUNK_OVERLAP=200
TOP_K_RESULTS=5
SIMILARITY_THRESHOLD=0.7
"""
    
    try:
        with open(env_file, 'w') as f:
            f.write(env_template)
        print(f"✅ Created .env template at {env_file}")
        print("⚠️  Please update the .env file with your actual credentials")
        return True
    except Exception as e:
        print(f"❌ Failed to create .env file: {e}")
        return False

def main():
    """Main setup function"""
    print("🚀 Python RAG Setup")
    print("=" * 50)
    
    # Check Python version
    if not check_python_version():
        sys.exit(1)
    
    # Install requirements
    if not install_requirements():
        sys.exit(1)
    
    # Setup NLTK
    if not setup_nltk_data():
        print("⚠️  NLTK setup failed, but continuing...")
    
    # Test imports
    if not test_imports():
        print("❌ Some imports failed. Please check your installation.")
        sys.exit(1)
    
    # Create env file
    create_env_file()
    
    print("\n🎉 Setup completed successfully!")
    print("\n📝 Next steps:")
    print("1. Update the .env file with your credentials")
    print("2. Test the setup: python rag_processor.py --help")
    print("3. Run demo: node ../src/scripts/demo-python-rag.js")

if __name__ == "__main__":
    main()
