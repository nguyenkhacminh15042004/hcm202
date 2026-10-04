#!/usr/bin/env python3
"""
RAG Pipeline Implementation following the Python tutorial
Integrates with existing Node.js backend and PostgreSQL database
"""

import fitz  # PyMuPDF
import openai
import pandas as pd
import numpy as np
from scipy.spatial.distance import cosine
from rake_nltk import Rake
from pyvi import ViTokenizer
from langchain_text_splitters import RecursiveCharacterTextSplitter
import json
import hashlib
from datetime import datetime
import argparse
import os
import uuid
from tqdm import tqdm

# OCR imports
import pytesseract
from PIL import Image
from pdf2image import convert_from_path
import tempfile
import mammoth

from config import DatabaseConfig, OpenAIConfig, RAGConfig

class PyViTokenizer:
    def __call__(self, text):
        # ViTokenizer.tokenize returns a string with words separated by underscores
        # and phrases by spaces. We split by space to get the tokenized phrases.
        return ViTokenizer.tokenize(text).split()

class RAGProcessor:
    """Complete RAG Pipeline Implementation"""
    
    def __init__(self):
        self.db_config = DatabaseConfig()
        self.openai_config = OpenAIConfig()
        self.rag_config = RAGConfig()
        
        # Initialize OpenAI client
        openai.api_key = self.openai_config.api_key
        if self.openai_config.base_url != 'https://api.openai.com/v1':
            openai.api_base = self.openai_config.base_url
            
        self.openai_client = openai.OpenAI(
            api_key=self.openai_config.api_key,
            base_url=self.openai_config.base_url
        )
        
        # Initialize RAKE for phrase extraction
        self.rake = Rake()
        # Monkey-patch the word tokenizer to be Unicode-aware for Vietnamese
        # The default r'\\w+' tokenizer splits Vietnamese words with diacritics incorrectly.
        self.rake.word_tokenizer = PyViTokenizer()

        # Initialize text splitter
        self.text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=self.rag_config.chunk_size,
            chunk_overlap=self.rag_config.chunk_overlap
        )
        
        # Simple in-memory cache for embeddings within a single run
        self._embedding_cache = {}
        
        print(f"🐍 RAG Processor initialized")
        print(f"📊 Chunk size: {self.rag_config.chunk_size}, Overlap: {self.rag_config.chunk_overlap}")
        print(f"🤖 OpenAI Model: {self.openai_config.embedding_model}")
        
    def _extract_text_from_docx(self, docx_path):
        """
        Extract text from a .docx file using mammoth
        """
        print("📖 Extracting text from DOCX file...")
        try:
            with open(docx_path, "rb") as docx_file:
                result = mammoth.extract_raw_text(docx_file)
                text = result.value
            
            # DOCX files don't have pages, so return all text under a single key
            cleaned_text = self.clean_and_deduplicate_text(text)
            print(f"✅ Extracted {len(cleaned_text):,} characters from DOCX.")
            return {1: cleaned_text}
        except Exception as e:
            print(f"❌ Failed to extract text from DOCX: {e}")
            return {1: ""}

    def _extract_text_from_pdf(self, pdf_path):
        """
        Extract text from PDF using PyMuPDF + OCR for image-based PDFs
        """
        print(f"📖 Extracting text from PDF: {pdf_path}")
        
        # Open the PDF file
        document = fitz.open(pdf_path)
        
        # Initialize a dictionary to hold the text for each page
        pdf_text = {}
        
        # First attempt: Enhanced text extraction with multiple methods
        print("🔍 Attempting comprehensive text extraction...")
        for page_number in range(document.page_count):
            page = document.load_page(page_number)
            
            # Method 1: Regular text extraction
            text = page.get_text()
            
            # Method 2: Extract text with layout preservation
            text_with_layout = page.get_text("text")
            
            # Method 3: Extract text blocks (better for structured content)
            blocks = page.get_text("dict")
            block_text = ""
            for block in blocks["blocks"]:
                if "lines" in block:
                    for line in block["lines"]:
                        for span in line["spans"]:
                            block_text += span["text"] + " "
                        block_text += "\n"
            
            # Method 4: Extract text from annotations and forms
            annotations_text = ""
            for annot in page.annots():
                try:
                    # Try to get content from annotation
                    if hasattr(annot, 'content') and annot.content:
                        annotations_text += annot.content + " "
                    elif hasattr(annot, 'info') and 'content' in annot.info:
                        annotations_text += annot.info['content'] + " "
                    elif hasattr(annot, 'rect'):
                        # Try to extract text from annotation area
                        rect_text = page.get_textbox(annot.rect)
                        if rect_text:
                            annotations_text += rect_text + " "
                except Exception:
                    # Skip problematic annotations
                    continue
            
            # Combine all extraction methods
            combined_text = text + "\n" + text_with_layout + "\n" + block_text + "\n" + annotations_text
            
            # Clean and deduplicate text
            combined_text = self.clean_and_deduplicate_text(combined_text)
            
            # Ensure UTF-8 encoding
            pdf_text[page_number + 1] = combined_text.encode('utf-8', 'ignore').decode('utf-8')
            
        document.close()
        
        # Check if we got any text
        total_chars = sum(len(text) for text in pdf_text.values())
        total_pages = len(pdf_text)
        
        if total_chars < 100:  # Very low text, try OCR
            print("⚠️  Low text extraction. Using OCR for better results...")
            ocr_text = self.extract_text_with_ocr(pdf_path)
            # Merge OCR results with existing text
            for page_num, ocr_content in ocr_text.items():
                if page_num in pdf_text:
                    pdf_text[page_num] = pdf_text[page_num] + "\n" + ocr_content
                else:
                    pdf_text[page_num] = ocr_content
        
        # Final cleanup
        for page_num in pdf_text:
            pdf_text[page_num] = self.clean_and_deduplicate_text(pdf_text[page_num])
        
        total_chars = sum(len(text) for text in pdf_text.values())
        print(f"✅ Extracted text from {total_pages} pages ({total_chars:,} characters)")
        
        return pdf_text

    def step1_extract_text_from_file(self, file_path):
        """
        Step 1: Extract text from a file by detecting its type (.pdf, .docx, etc.)
        """
        print(f"📖 Step 1: Extracting text from: {file_path}")
        _, file_extension = os.path.splitext(file_path)
        
        if file_extension.lower() == '.pdf':
            return self._extract_text_from_pdf(file_path)
        elif file_extension.lower() == '.docx':
            return self._extract_text_from_docx(file_path)
        else:
            print(f"⚠️ Unsupported file type '{file_extension}'. Attempting to read as plain text.")
            try:
                with open(file_path, 'r', encoding='utf-8') as f:
                    text = f.read()
                return {1: self.clean_and_deduplicate_text(text)}
            except Exception as e:
                print(f"❌ Could not read file as plain text: {e}")
                return {1: ""}
    
    def clean_and_deduplicate_text(self, text):
        """
        Clean and deduplicate extracted text for better quality
        """
        if not text:
            return ""
        
        # Split into lines and remove duplicates while preserving order
        lines = text.split('\n')
        seen = set()
        unique_lines = []
        
        for line in lines:
            # Clean the line
            cleaned_line = line.strip()
            
            # Skip empty lines and very short lines (likely noise)
            if len(cleaned_line) < 3:
                continue
                
            # Skip lines that are mostly whitespace or special characters
            if len(cleaned_line.replace(' ', '').replace('\t', '')) < 2:
                continue
            
            # Create a normalized version for deduplication
            normalized = cleaned_line.lower().strip()
            
            # Skip if we've seen this line before
            if normalized in seen:
                continue
                
            seen.add(normalized)
            unique_lines.append(cleaned_line)
        
        # Join back together
        result = '\n'.join(unique_lines)
        
        # Remove excessive whitespace
        import re
        result = re.sub(r'\n\s*\n\s*\n+', '\n\n', result)  # Max 2 consecutive newlines
        result = re.sub(r' +', ' ', result)  # Multiple spaces to single space
        
        return result.strip()
        
    def extract_text_with_ocr(self, pdf_path):
        """
        Extract text using OCR for image-based PDFs
        """
        pdf_text = {}
        
        try:
            # Convert PDF to images
            print("🖼️  Converting PDF to images...")
            with tempfile.TemporaryDirectory() as temp_dir:
                # Process pages in batches
                first_page = getattr(self, 'batch_start', 1)
                last_page = getattr(self, 'batch_end', 50)
                print(f"🔄 Processing batch: pages {first_page}-{last_page}")
                pages = convert_from_path(pdf_path, first_page=first_page, last_page=last_page, dpi=200)
                
                print(f"🔤 Running OCR on {len(pages)} pages...")
                for i, page_image in enumerate(tqdm(pages, desc="OCR Processing")):
                    page_number = i + 1
                    
                    # Configure Tesseract for Vietnamese
                    custom_config = r'--oem 3 --psm 6 -l vie+eng'
                    
                    try:
                        # Extract text using OCR
                        text = pytesseract.image_to_string(page_image, config=custom_config)
                        pdf_text[page_number] = text
                        
                        if page_number <= 3:  # Show progress for first few pages
                            print(f"📄 Page {page_number}: {len(text)} characters extracted")
                            
                    except Exception as e:
                        print(f"❌ OCR failed for page {page_number}: {e}")
                        pdf_text[page_number] = ""
                        
        except Exception as e:
            print(f"❌ OCR process failed: {e}")
            # Return empty text for all pages if OCR completely fails
            document = fitz.open(pdf_path)
            for page_number in range(min(10, document.page_count)):  # Limit to first 10 pages
                pdf_text[page_number + 1] = ""
            document.close()
            
        return pdf_text
    
    def step2_chunk_text(self, pdf_text):
        """
        Step 2: Enhanced chunking with multiple strategies for better RAG
        """
        print(f"🔪 Step 2: Enhanced chunking with size={self.rag_config.chunk_size}, overlap={self.rag_config.chunk_overlap}")
        
        # Split text into chunks using multiple strategies
        page_chunks = {}
        for page, text in pdf_text.items():
            if not text.strip():
                page_chunks[page] = []
                continue
                
            # Strategy 1: RecursiveCharacterTextSplitter (preserves structure)
            recursive_chunks = self.text_splitter.split_text(text)
            
            # Strategy 2: Semantic chunking by paragraphs
            paragraph_chunks = self.chunk_by_paragraphs(text)
            
            # Strategy 3: Chunk by sentences for very dense content
            sentence_chunks = self.chunk_by_sentences(text)
            
            # Combine and deduplicate chunks
            all_chunks = recursive_chunks + paragraph_chunks + sentence_chunks
            unique_chunks = self.deduplicate_chunks(all_chunks)
            
            # Filter out very short chunks
            meaningful_chunks = [chunk for chunk in unique_chunks if len(chunk.strip()) > 50]
            
            page_chunks[page] = meaningful_chunks
            
        # Count total chunks
        total_chunks = sum(len(chunks) for chunks in page_chunks.values())
        print(f"✂️ Created {total_chunks} chunks across {len(page_chunks)} pages")
        
        # Output chunks for verification (first few)
        for page, chunks in list(page_chunks.items())[:2]:  # Show first 2 pages
            print(f"\n📄 Page {page} chunks:")
            for i, chunk in enumerate(chunks[:2], start=1):  # Show first 2 chunks per page
                print(f"  Chunk {i}: {chunk[:100]}...")
                
        return page_chunks
    
    def chunk_by_paragraphs(self, text):
        """Chunk text by paragraphs for better semantic coherence"""
        paragraphs = text.split('\n\n')
        chunks = []
        
        for para in paragraphs:
            para = para.strip()
            if len(para) > 50:  # Only meaningful paragraphs
                if len(para) <= self.rag_config.chunk_size:
                    chunks.append(para)
                else:
                    # Split long paragraphs using recursive splitter
                    sub_chunks = self.text_splitter.split_text(para)
                    chunks.extend(sub_chunks)
        
        return chunks
    
    def chunk_by_sentences(self, text):
        """Chunk text by sentences for dense content"""
        import re
        sentences = re.split(r'[.!?]+', text)
        chunks = []
        current_chunk = ""
        
        for sentence in sentences:
            sentence = sentence.strip()
            if not sentence:
                continue
                
            if len(current_chunk + " " + sentence) <= self.rag_config.chunk_size:
                current_chunk += " " + sentence if current_chunk else sentence
            else:
                if current_chunk:
                    chunks.append(current_chunk.strip())
                current_chunk = sentence
        
        if current_chunk:
            chunks.append(current_chunk.strip())
        
        return chunks
    
    def deduplicate_chunks(self, chunks):
        """Remove duplicate chunks while preserving order"""
        seen = set()
        unique = []
        
        for chunk in chunks:
            normalized = chunk.lower().strip()
            if normalized not in seen and len(normalized) > 10:
                seen.add(normalized)
                unique.append(chunk)
        
        return unique
    
    def step3_extract_phrases(self, page_chunks):
        """
        Step 3: Extract key phrases using RAKE + additional methods
        Enhanced for comprehensive phrase extraction
        """
        print(f"🔍 Step 3: Extracting key phrases using multiple methods")
        
        chunk_phrases = {}
        
        # Extract phrases for each chunk using multiple methods
        for page, chunks in page_chunks.items():
            for chunk_number, chunk in enumerate(chunks, start=1):
                all_phrases = []
                
                # Method 1: RAKE phrases
                self.rake.extract_keywords_from_text(chunk)
                rake_phrases = self.rake.get_ranked_phrases()
                all_phrases.extend(rake_phrases)
                
                # Method 2: Extract n-grams (2-4 words)
                ngrams = self.extract_ngrams(chunk, n_range=(2, 4))
                all_phrases.extend(ngrams)
                
                # Method 3: Extract important sentences (first and last sentences)
                sentences = self.extract_important_sentences(chunk)
                all_phrases.extend(sentences)
                
                # Method 4: Extract capitalized phrases (titles, proper nouns)
                capitalized = self.extract_capitalized_phrases(chunk)
                all_phrases.extend(capitalized)
                
                # Deduplicate and rank phrases
                unique_phrases = self.deduplicate_phrases(all_phrases)
                chunk_phrases[(page, chunk_number)] = unique_phrases
                
        # Count total phrases
        total_phrases = sum(len(phrases) for phrases in chunk_phrases.values())
        print(f"🏷️ Extracted {total_phrases} phrases from {len(chunk_phrases)} chunks")
        
        # Output sample phrases
        sample_keys = list(chunk_phrases.keys())[:3]
        for key in sample_keys:
            page, chunk_num = key
            phrases = chunk_phrases[key][:5]  # Top 5 phrases
            print(f"  Page {page}, Chunk {chunk_num}: {phrases}")
            
        return chunk_phrases
    
    def extract_ngrams(self, text, n_range=(2, 4)):
        """Extract n-grams from text"""
        words = ViTokenizer.tokenize(text.lower()).split()
        ngrams = []
        
        for n in range(n_range[0], n_range[1] + 1):
            for i in range(len(words) - n + 1):
                ngram = ' '.join(words[i:i+n])
                if len(ngram) > 5:  # Only meaningful n-grams
                    ngrams.append(ngram)
        
        return ngrams[:20]  # Limit to top 20 n-grams
    
    def extract_important_sentences(self, text):
        """Extract important sentences (first, last, and long sentences)"""
        import re
        sentences = re.split(r'[.!?]+', text)
        important = []
        
        # First and last sentences
        if sentences:
            if len(sentences[0].strip()) > 10:
                important.append(sentences[0].strip())
            if len(sentences) > 1 and len(sentences[-1].strip()) > 10:
                important.append(sentences[-1].strip())
        
        # Long sentences (likely important)
        for sentence in sentences:
            if len(sentence.strip()) > 50:
                important.append(sentence.strip())
        
        return important[:5]  # Limit to 5 important sentences
    
    def extract_capitalized_phrases(self, text):
        """Extract capitalized phrases (titles, proper nouns)"""
        import re
        # Find capitalized words and phrases
        capitalized = re.findall(r'\b[A-Z][a-zA-ZÀ-ỹ\s]{2,}\b', text)
        return [phrase.strip() for phrase in capitalized if len(phrase.strip()) > 3][:10]
    
    def deduplicate_phrases(self, phrases):
        """Remove duplicate phrases while preserving order"""
        seen = set()
        unique = []
        
        for phrase in phrases:
            normalized = phrase.lower().strip()
            if normalized not in seen and len(normalized) > 2:
                seen.add(normalized)
                unique.append(phrase)
        
        return unique
    
    def step4_generate_embeddings(self, chunk_phrases, page_chunks):
        """
        Step 4: Generate embeddings for phrases using OpenAI
        Following the tutorial exactly
        """
        print(f"🧠 Step 4: Generating embeddings using {self.openai_config.embedding_model}")
        
        # Dictionary to hold embeddings
        phrase_embeddings = {}
        
        # Generate embeddings for each phrase
        total_phrases = sum(len(phrases) for phrases in chunk_phrases.values())
        
        with tqdm(total=total_phrases, desc="Generating embeddings") as pbar:
            for (page, chunk_number), phrases in chunk_phrases.items():
                # Use batched API calls with cache
                embeddings = self.get_embeddings_batched_with_cache(phrases)
                pbar.update(len(phrases))
                phrase_embeddings[(page, chunk_number)] = list(zip(phrases, embeddings))
        
        print(f"✅ Generated embeddings for all phrases")
        
        # Prepare data for Excel export
        excel_data = []
        for (page, chunk_number), phrase_embedding_pairs in phrase_embeddings.items():
            chunk_content = page_chunks[page][chunk_number - 1]  # Get original chunk content
            
            for phrase, embedding in phrase_embedding_pairs:
                excel_data.append({
                    "Page": page,
                    "Chunk": chunk_number,
                    "Phrase": phrase,
                    "Embedding": embedding,
                    "Chunk_Content": chunk_content
                })
        
        # Create DataFrame and save to Excel
        df = pd.DataFrame(excel_data)
        excel_filename = f"phrases_embeddings_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
        excel_path = os.path.join(os.path.dirname(__file__), excel_filename)
        df.to_excel(excel_path, index=False)
        print(f"💾 Embeddings saved to {excel_filename}")
        
        return phrase_embeddings, excel_path
    
    def get_embedding(self, text):
        """
        Get embedding for a single text using OpenAI API
        Following the tutorial exactly
        """
        try:
            response = self.openai_client.embeddings.create(
                input=text,
                model=self.openai_config.embedding_model
            )
            return response.data[0].embedding
        except Exception as e:
            print(f"❌ Error getting embedding for '{text[:50]}...': {e}")
            return None
    
    def get_embeddings_batched_with_cache(self, phrases):
        """Get embeddings using one or more batched API calls, with de-dup caching."""
        if not phrases:
            return []
        # Determine which phrases are missing from cache (preserve order but unique for API)
        missing_unique = []
        seen_missing = set()
        for p in phrases:
            if p not in self._embedding_cache and p not in seen_missing:
                seen_missing.add(p)
                missing_unique.append(p)

        # Fetch missing in batches
        batch_size = getattr(self.rag_config, 'embedding_batch_size', 64)
        try:
            for i in range(0, len(missing_unique), batch_size):
                batch = missing_unique[i:i + batch_size]
                if not batch:
                    continue
                response = self.openai_client.embeddings.create(
                    input=batch,
                    model=self.openai_config.embedding_model
                )
                # Map back to cache
                for idx, phrase in enumerate(batch):
                    try:
                        self._embedding_cache[phrase] = response.data[idx].embedding
                    except Exception:
                        self._embedding_cache[phrase] = None
        except Exception as e:
            print(f"❌ Error in batched embedding call: {e}")
            # Fallback to single calls for remaining items
            for phrase in missing_unique:
                if phrase not in self._embedding_cache:
                    self._embedding_cache[phrase] = self.get_embedding(phrase)

        # Return embeddings in original order
        return [self._embedding_cache.get(p) for p in phrases]
    
    def step5_query_processing(self, query, phrase_embeddings, page_chunks):
        """
        Step 5: Process query and calculate similarity
        Following the tutorial exactly
        """
        print(f"🔍 Step 5: Processing query: '{query}'")
        
        # Extract phrases from the query
        query_phrases = self.extract_phrases_from_query(query)
        print(f"Query phrases: {query_phrases}")
        
        # Get embeddings for query phrases
        query_embeddings = self.get_embeddings(query_phrases)
        
        # Calculate cosine similarity for each chunk
        chunk_similarities = {}
        
        for (page, chunk_number), phrase_embedding_pairs in phrase_embeddings.items():
            similarities = []
            
            for phrase, embedding in phrase_embedding_pairs:
                if embedding is not None:
                    phrase_similarities = [
                        self.cosine_similarity(embedding, query_embedding) 
                        for query_embedding in query_embeddings 
                        if query_embedding is not None
                    ]
                    if phrase_similarities:
                        similarities.append(max(phrase_similarities))
            
            if similarities:
                average_similarity = np.mean(similarities)
                chunk_similarities[(page, chunk_number)] = average_similarity
        
        # Get top 5 chunks by similarity
        top_chunks = sorted(chunk_similarities.items(), key=lambda x: x[1], reverse=True)[:5]
        
        print("🏆 Top 5 most relevant chunks:")
        selected_chunks = []
        
        for (page, chunk_number), similarity in top_chunks:
            chunk_content = page_chunks[page][chunk_number - 1]
            print(f"  📄 Page: {page}, Chunk: {chunk_number}, Similarity: {similarity:.4f}")
            print(f"  📝 Content: {chunk_content[:200]}...")
            print()
            selected_chunks.append(chunk_content)
            
        return selected_chunks, top_chunks
    
    def extract_phrases_from_query(self, query):
        """Extract phrases from query using RAKE"""
        self.rake.extract_keywords_from_text(query)
        return self.rake.get_ranked_phrases()
    
    def get_embeddings(self, phrases):
        """Get embeddings for multiple phrases (batched + cached)."""
        embeddings = self.get_embeddings_batched_with_cache(phrases)
        # Drop None values to match previous behavior
        return [e for e in embeddings if e is not None]
    
    def cosine_similarity(self, embedding1, embedding2):
        """Calculate cosine similarity between two embeddings"""
        if embedding1 is None or embedding2 is None:
            return 0.0
        return 1 - cosine(embedding1, embedding2)
    
    def step6_generate_answer(self, query, selected_chunks):
        """
        Step 6: Generate answer using OpenAI GPT
        Following the tutorial exactly
        """
        print(f"🤖 Step 6: Generating answer using {self.openai_config.chat_model}")
        
        # Compose context from selected chunks
        context = "\n\n".join(selected_chunks)
        
        prompt = f"""Answer the following query based on the provided text:

{context}

Query: {query}
Answer:"""
        
        try:
            # Use OpenAI API to get response
            response = self.openai_client.chat.completions.create(
                model=self.openai_config.chat_model,
                messages=[
                    {"role": "system", "content": "You are a helpful assistant."},
                    {"role": "user", "content": prompt}
                ],
                max_tokens=300,
                temperature=0.1
            )
            
            answer = response.choices[0].message.content.strip()
            
            print(f"💡 Generated Answer:")
            print(f"📝 {answer}")
            
            return answer
            
        except Exception as e:
            print(f"❌ Error generating answer: {e}")
            return "Sorry, I couldn't generate an answer due to an error."
    
    def save_to_database(self, pdf_path, pdf_text, page_chunks, phrase_embeddings, excel_path):
        """
        Save processed data to PostgreSQL database
        Integrates with existing Node.js schema
        """
        print(f"💾 Saving data to database...")
        
        try:
            conn = self.db_config.get_connection()
            cursor = conn.cursor()
            
            # Insert document record
            file_name = os.path.basename(pdf_path)
            file_size = os.path.getsize(pdf_path)
            total_pages = len(pdf_text)
            content_preview = list(pdf_text.values())[0][:500] if pdf_text else ""
            
            # Generate UUID for document
            document_id = str(uuid.uuid4())
            
            # Create content hash
            content_hash = hashlib.sha256(str(pdf_text).encode()).hexdigest()
            
            cursor.execute("""
                INSERT INTO documents (id, title, file_name, file_path, file_type, file_size, 
                                     total_pages, content_preview, processing_status, metadata, 
                                     created_at, updated_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """, (
                document_id,  # id
                file_name.replace('.pdf', ''),  # title
                file_name,  # file_name
                pdf_path,  # file_path
                'pdf',  # file_type
                file_size,  # file_size
                total_pages,  # total_pages
                content_preview,  # content_preview
                'completed',  # processing_status
                json.dumps({
                    'processed_by': 'python_rag_processor',
                    'excel_export': excel_path,
                    'total_chunks': sum(len(chunks) for chunks in page_chunks.values()),
                    'processed_at': datetime.now().isoformat()
                }),  # metadata
                datetime.now(),  # created_at
                datetime.now()   # updated_at
            ))
            print(f"📄 Document saved with ID: {document_id}")
            
            # Insert chunks
            chunk_count = 0
            for page, chunks in page_chunks.items():
                for chunk_index, chunk_content in enumerate(chunks):
                    # Get phrases and embeddings for this chunk
                    chunk_key = (page, chunk_index + 1)
                    phrases_with_embeddings = phrase_embeddings.get(chunk_key, [])
                    
                    # Extract keywords from phrases and enforce DB varchar(255) constraint per item
                    keywords = [
                        (phrase[:255] if isinstance(phrase, str) else str(phrase)[:255])
                        for phrase, _ in phrases_with_embeddings[:10]
                    ]  # Top 10 phrases as keywords
                    
                    # Create chunk embedding (average of phrase embeddings)
                    embeddings = [emb for _, emb in phrases_with_embeddings if emb is not None]
                    chunk_embedding = None
                    if embeddings:
                        chunk_embedding = np.mean(embeddings, axis=0).tolist()
                    
                    # Generate UUID for chunk
                    chunk_id = str(uuid.uuid4())
                    
                    # Insert chunk
                    cursor.execute("""
                        INSERT INTO document_chunks (
                            id, document_id, chunk_index, content, content_hash, start_char, end_char,
                            word_count, token_count, page_number, keywords, embedding, chunk_type,
                            quality_score, created_at, updated_at
                        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    """, (
                        chunk_id,  # id
                        document_id,  # document_id
                        chunk_count,  # chunk_index
                        chunk_content,  # content
                        hashlib.sha256(chunk_content.encode('utf-8')).hexdigest(),  # content_hash
                        0,  # start_char (simplified)
                        len(chunk_content),  # end_char
                        len(chunk_content.split()),  # word_count
                        int(len(chunk_content.split()) * 1.3),  # token_count (estimate)
                        page,  # page_number
                        keywords,  # keywords (pass as Python list for PostgreSQL array)
                        chunk_embedding,  # embedding (pass as Python list for PostgreSQL array)
                        'paragraph',  # chunk_type
                        0.8,  # quality_score (default)
                        datetime.now(),  # created_at
                        datetime.now()   # updated_at
                    ))
                    
                    chunk_count += 1
            
            conn.commit()
            print(f"✅ Saved {chunk_count} chunks to database")
            
            # Update document total_chunks count (matches Sequelize model)
            cursor.execute("""
                UPDATE documents SET total_chunks = %s WHERE id = %s
            """, (chunk_count, document_id))
            
            conn.commit()
            cursor.close()
            conn.close()
            
            return document_id
            
        except Exception as e:
            print(f"❌ Database error: {e}")
            if 'conn' in locals():
                conn.rollback()
                conn.close()
            raise
    
    def process_pdf_complete_pipeline(self, pdf_path, query=None, save_to_db=True, batch_start=1, batch_end=50):
        """
        Complete RAG pipeline processing
        Follows the tutorial step by step
        """
        self.batch_start = batch_start
        self.batch_end = batch_end
        
        print(f"🚀 Starting complete RAG pipeline for: {pdf_path}")
        print(f"📄 Processing batch: pages {batch_start}-{batch_end}")
        print("=" * 80)
        
        # Step 1: Extract PDF text
        pdf_text = self.step1_extract_text_from_file(pdf_path)
        
        # Step 2: Chunk text
        page_chunks = self.step2_chunk_text(pdf_text)
        
        # Step 3: Extract phrases
        chunk_phrases = self.step3_extract_phrases(page_chunks)
        
        # Step 4: Generate embeddings
        phrase_embeddings, excel_path = self.step4_generate_embeddings(chunk_phrases, page_chunks)
        
        # Step 5 & 6: Query processing (if query provided)
        if query:
            selected_chunks, top_chunks = self.step5_query_processing(query, phrase_embeddings, page_chunks)
            answer = self.step6_generate_answer(query, selected_chunks)
        else:
            selected_chunks, top_chunks, answer = None, None, None
        
        # Save to database (if requested)
        document_id = None
        if save_to_db:
            document_id = self.save_to_database(pdf_path, pdf_text, page_chunks, phrase_embeddings, excel_path)
        
        print("=" * 80)
        print("🎉 RAG Pipeline Complete!")
        print(f"📊 Processed {len(page_chunks)} pages")
        print(f"📋 Created {sum(len(chunks) for chunks in page_chunks.values())} chunks")
        print(f"🏷️ Extracted {sum(len(phrases) for phrases in chunk_phrases.values())} phrases")
        print(f"💾 Excel file: {excel_path}")
        if document_id:
            print(f"🗄️ Database document ID: {document_id}")
        
        return {
            'pdf_text': pdf_text,
            'page_chunks': page_chunks,
            'chunk_phrases': chunk_phrases,
            'phrase_embeddings': phrase_embeddings,
            'excel_path': excel_path,
            'document_id': document_id,
            'query_result': {
                'query': query,
                'selected_chunks': selected_chunks,
                'top_chunks': top_chunks,
                'answer': answer
            } if query else None
        }

def main():
    """Main function for command line usage"""
    parser = argparse.ArgumentParser(description='RAG Pipeline Processor')
    parser.add_argument('pdf_path', help='Path to PDF file to process')
    parser.add_argument('--query', '-q', help='Query to test against the processed PDF')
    parser.add_argument('--no-db', action='store_true', help='Skip saving to database')
    parser.add_argument('--batch-start', type=int, default=1, help='Starting page for batch processing (default: 1)')
    parser.add_argument('--batch-end', type=int, default=50, help='Ending page for batch processing (default: 50)')
    
    args = parser.parse_args()
    
    if not os.path.exists(args.pdf_path):
        print(f"❌ PDF file not found: {args.pdf_path}")
        return
    
    # Initialize processor
    processor = RAGProcessor()
    
    # Run complete pipeline
    try:
        result = processor.process_pdf_complete_pipeline(
            pdf_path=args.pdf_path,
            query=args.query,
            save_to_db=not args.no_db,
            batch_start=args.batch_start,
            batch_end=args.batch_end
        )
        
        if args.query and result['query_result']['answer']:
            print("\n" + "="*80)
            print("🎯 FINAL ANSWER:")
            print("="*80)
            print(f"❓ Query: {args.query}")
            print(f"💡 Answer: {result['query_result']['answer']}")
        
    except Exception as e:
        print(f"❌ Pipeline failed: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    main()
