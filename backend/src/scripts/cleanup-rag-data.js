#!/usr/bin/env node

/**
 * Script to clean up existing RAG data from database
 * This will remove old documents and chunks to prepare for new Python RAG processing
 */

const { Document, DocumentChunk, sequelize } = require('../models');

async function cleanupRAGData() {
  console.log('🧹 Starting RAG data cleanup...');
  console.log('=' * 50);

  try {
    // Start transaction for safety
    const transaction = await sequelize.transaction();

    try {
      // Get current data statistics
      const documentCount = await Document.count({ transaction });
      const chunkCount = await DocumentChunk.count({ transaction });
      
      console.log(`📊 Current database state:`);
      console.log(`   Documents: ${documentCount}`);
      console.log(`   Chunks: ${chunkCount}`);

      if (documentCount === 0 && chunkCount === 0) {
        console.log('✅ Database is already clean, no data to remove');
        await transaction.rollback();
        return;
      }

      // Ask for confirmation
      console.log('\n⚠️  This will permanently delete:');
      console.log(`   - ${documentCount} document records`);
      console.log(`   - ${chunkCount} chunk records`);
      console.log(`   - All associated embeddings and metadata`);

      // For script automation, we'll proceed (in production, you might want user input)
      console.log('\n🗑️  Proceeding with cleanup...');

      // Delete chunks first (due to foreign key constraints)
      console.log('🔄 Deleting document chunks...');
      const deletedChunks = await DocumentChunk.destroy({
        where: {},
        transaction,
        truncate: true // More efficient for large datasets
      });
      console.log(`✅ Deleted ${deletedChunks} chunks`);

      // Delete documents
      console.log('🔄 Deleting documents...');
      const deletedDocuments = await Document.destroy({
        where: {},
        transaction,
        truncate: true
      });
      console.log(`✅ Deleted ${deletedDocuments} documents`);

      // Reset sequences (PostgreSQL specific)
      console.log('🔄 Resetting ID sequences...');
      await sequelize.query('ALTER SEQUENCE documents_id_seq RESTART WITH 1', { transaction });
      await sequelize.query('ALTER SEQUENCE document_chunks_id_seq RESTART WITH 1', { transaction });
      console.log('✅ ID sequences reset');

      // Commit transaction
      await transaction.commit();

      console.log('\n🎉 RAG data cleanup completed successfully!');
      console.log('📝 Database is now ready for new Python RAG processing');

      // Show final state
      const finalDocumentCount = await Document.count();
      const finalChunkCount = await DocumentChunk.count();
      
      console.log('\n📊 Final database state:');
      console.log(`   Documents: ${finalDocumentCount}`);
      console.log(`   Chunks: ${finalChunkCount}`);

    } catch (error) {
      // Rollback on error
      await transaction.rollback();
      throw error;
    }

  } catch (error) {
    console.error('❌ Cleanup failed:', error);
    console.error(error.stack);
    process.exit(1);
  }
}

async function showCurrentData() {
  console.log('📋 Current RAG data in database:');
  
  try {
    const documents = await Document.findAll({
      attributes: ['id', 'title', 'file_name', 'processing_status', 'chunk_count', 'createdAt'],
      order: [['createdAt', 'DESC']]
    });

    if (documents.length === 0) {
      console.log('   No documents found');
      return;
    }

    console.log('\n📄 Documents:');
    documents.forEach(doc => {
      console.log(`   ID: ${doc.id} | ${doc.title} | Status: ${doc.processing_status} | Chunks: ${doc.chunk_count || 0}`);
    });

    // Show chunk statistics
    const chunkStats = await DocumentChunk.findAll({
      attributes: [
        'document_id',
        [sequelize.fn('COUNT', sequelize.col('id')), 'chunk_count'],
        [sequelize.fn('AVG', sequelize.col('word_count')), 'avg_words'],
        [sequelize.fn('COUNT', sequelize.fn('COALESCE', sequelize.col('embedding'), null)), 'with_embeddings']
      ],
      group: ['document_id'],
      raw: true
    });

    if (chunkStats.length > 0) {
      console.log('\n📊 Chunk Statistics:');
      chunkStats.forEach(stat => {
        console.log(`   Doc ${stat.document_id}: ${stat.chunk_count} chunks, avg ${Math.round(stat.avg_words)} words, ${stat.with_embeddings} with embeddings`);
      });
    }

  } catch (error) {
    console.error('❌ Error showing current data:', error);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (command === 'show') {
    await showCurrentData();
  } else if (command === 'cleanup' || command === 'clean') {
    await cleanupRAGData();
  } else {
    console.log('📋 RAG Data Management');
    console.log('Usage:');
    console.log('  node cleanup-rag-data.js show     # Show current data');
    console.log('  node cleanup-rag-data.js cleanup  # Clean up all RAG data');
    console.log('');
    console.log('🔍 Showing current data first...');
    await showCurrentData();
  }

  // Close database connection
  await sequelize.close();
  process.exit(0);
}

// Run if called directly
if (require.main === module) {
  main().catch(error => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });
}

module.exports = { cleanupRAGData, showCurrentData };
