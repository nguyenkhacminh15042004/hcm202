#!/bin/bash

# Batch processing script for large PDFs
# Usage: ./batch_process.sh /path/to/pdf [batch_size]

PDF_PATH="$1"
BATCH_SIZE="${2:-50}"  # Default batch size of 50 pages

if [ -z "$PDF_PATH" ]; then
    echo "Usage: $0 /path/to/pdf [batch_size]"
    echo "Example: $0 'uploads/Giao trinh Tu tuong Ho Chi Minh.pdf' 50"
    exit 1
fi

# Get total pages (estimate from file - actual will be detected by PyMuPDF)
echo "🚀 Starting batch processing for: $PDF_PATH"
echo "📊 Batch size: $BATCH_SIZE pages per batch"

# Process batches
for start in $(seq 1 $BATCH_SIZE 152); do
    end=$((start + BATCH_SIZE - 1))
    if [ $end -gt 152 ]; then
        end=152
    fi
    
    echo ""
    echo "=" * 80
    echo "🔄 Processing batch $start-$end"
    echo "=" * 80
    
    # Run Python RAG processor for this batch
    python rag_processor.py "$PDF_PATH" \
        --batch-start $start \
        --batch-end $end \
        --no-db
    
    if [ $? -ne 0 ]; then
        echo "❌ Batch $start-$end failed!"
        exit 1
    fi
    
    echo "✅ Batch $start-$end completed"
    
    # Break if we've reached the end
    if [ $end -ge 152 ]; then
        break
    fi
    
    # Optional: Add delay between batches to avoid rate limits
    echo "⏳ Waiting 30 seconds before next batch..."
    sleep 30
done

echo ""
echo "🎉 All batches completed!"
echo "📁 Check for Excel files: phrases_embeddings_*.xlsx"
