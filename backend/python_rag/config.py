import os
import psycopg2
from psycopg2.extras import RealDictCursor
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

class DatabaseConfig:
    """Database configuration and connection management"""
    
    def __init__(self):
        self.host = os.getenv('DB_HOST', 'localhost')
        self.port = os.getenv('DB_PORT', 5432)
        self.database = os.getenv('DB_NAME', 'hcm202_db')
        self.username = os.getenv('DB_USER', 'postgres')
        self.password = os.getenv('DB_PASSWORD', '')
        
    def get_connection(self):
        """Get database connection"""
        try:
            conn = psycopg2.connect(
                host=self.host,
                port=self.port,
                database=self.database,
                user=self.username,
                password=self.password,
                cursor_factory=RealDictCursor
            )
            return conn
        except Exception as e:
            print(f"❌ Database connection error: {e}")
            raise

class OpenAIConfig:
    """OpenAI configuration"""
    
    def __init__(self):
        self.api_key = os.getenv('OPENAI_API_KEY')
        self.base_url = os.getenv('OPENAI_BASE_URL', 'https://api.openai.com/v1')
        self.embedding_model = os.getenv('OPENAI_EMBEDDING_MODEL', 'text-embedding-ada-002')
        self.chat_model = os.getenv('OPENAI_MODEL', 'gpt-4')
        
        if not self.api_key:
            raise ValueError("OPENAI_API_KEY environment variable is required")

class RAGConfig:
    """RAG processing configuration"""
    
    def __init__(self):
        self.chunk_size = int(os.getenv('CHUNK_SIZE', 1000))
        self.chunk_overlap = int(os.getenv('CHUNK_OVERLAP', 200))
        self.top_k_results = int(os.getenv('TOP_K_RESULTS', 5))
        self.similarity_threshold = float(os.getenv('SIMILARITY_THRESHOLD', 0.7))
