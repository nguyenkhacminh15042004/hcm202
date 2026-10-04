const { QuizBank, QuizQuestion } = require('../models');
const { Sequelize } = require('sequelize');
const fs = require('fs');
const path = require('path');
const mammoth = require('mammoth');

const processPredefinedQuizFile = async () => {
    const predefinedFile = process.env.PREDEFINED_QUIZ_FILE;
    if (!predefinedFile) {
        console.log('📖 No predefined quiz file specified. Skipping auto-import.');
        return;
    }

    const filePath = path.join('uploads', predefinedFile);
    if (!fs.existsSync(filePath)) {
        console.error(`❌ Predefined quiz file not found at: ${filePath}`);
        return;
    }
    
    try {
        const quizName = path.basename(predefinedFile, path.extname(predefinedFile));
        const existingBank = await QuizBank.findOne({ where: { name: quizName } });

        if (existingBank) {
            console.log(`📖 Quiz bank "${quizName}" already exists. Skipping import.`);
            return;
        }

        console.log(`📖 Processing predefined quiz file: ${predefinedFile}`);
        const result = await mammoth.extractRawText({ path: filePath });
        const text = result.value;
        const quizData = parseQuizText(text, filePath);

        if (quizData && quizData.questions.length > 0) {
            await saveQuizToDatabase(quizData);
            console.log(`✅ Successfully imported quiz bank "${quizName}" from predefined file.`);
        } else {
            console.warn(`⚠️ No questions found in predefined quiz file: ${predefinedFile}`);
        }
    } catch (error) {
        console.error(`❌ Error processing predefined quiz file: ${error.message}`);
    }
};

const parseQuizText = (text, filePath) => {
    const filename = path.basename(filePath);
    const quizName = path.basename(filename, path.extname(filename));
    const quizDescription = `Câu hỏi trắc nghiệm từ file: ${filename}`;
    const questions = [];

    // Split the text into question blocks. Each block starts with "Câu hỏi".
    const questionBlocks = text.split(/Câu hỏi \d+:/);

    for (const block of questionBlocks) {
        if (block.trim() === '') continue;

        const traLoiIndex = block.indexOf('Trả lời:');
        const dapAnIndex = block.indexOf('Đáp án:');

        if (traLoiIndex === -1 || dapAnIndex === -1) {
            continue; // Skip blocks that don't have the required markers
        }

        const question_text = block.substring(0, traLoiIndex).trim();
        const optionsText = block.substring(traLoiIndex + 'Trả lời:'.length, dapAnIndex).trim();
        const answerLine = block.substring(dapAnIndex).trim();
        
        const correct_answer = answerLine.split(':')[1]?.trim();

        if (!question_text || !optionsText || !correct_answer) {
            continue;
        }

        const options = {};
        // The actual format has options listed without A., B., C., D. labels
        // We need to assign labels A, B, C, D, E to each option line
        const lines = optionsText.split('\n').map(line => line.trim()).filter(line => line);
        
        const optionLabels = ['A', 'B', 'C', 'D', 'E'];
        for (let i = 0; i < lines.length && i < optionLabels.length; i++) {
            const key = optionLabels[i];
            const value = lines[i].trim();
            if (value) {
                options[key] = value;
            }
        }

        if (Object.keys(options).length > 0) {
            questions.push({
                question_text,
                options,
                correct_answer,
                explanation: null 
            });
        }
    }

    return {
        name: quizName,
        description: quizDescription,
        questions,
    };
};


const saveQuizToDatabase = async (quizData) => {
    const quizBank = await QuizBank.create({
        name: quizData.name,
        description: quizData.description,
    });

    for (const question of quizData.questions) {
        await QuizQuestion.create({
            bank_id: quizBank.id,
            question_text: question.question_text,
            options: question.options,
            correct_answer: question.correct_answer,
            explanation: question.explanation,
        });
    }
};

const getRandomQuestions = async (bankId, count) => {
  const questions = await QuizQuestion.findAll({
    where: { bank_id: bankId },
    order: Sequelize.fn('RANDOM'),
    limit: count,
  });
  return questions;
};

const getAllQuizBanks = async () => {
  const quizBanks = await QuizBank.findAll();
  return quizBanks;
};

const gradeQuiz = async (answers) => {
    let correctCount = 0;
    const details = [];

    for (const answer of answers) {
        const question = await QuizQuestion.findByPk(answer.question_id);
        if (question) {
            const correctAnswers = question.correct_answer.split(',').map(s => s.trim()).sort();
            const userAnswers = Array.isArray(answer.option_ids) ? answer.option_ids.sort() : [];
            
            const isCorrect = correctAnswers.length === userAnswers.length && 
                              correctAnswers.every((value, index) => value === userAnswers[index]);

            if (isCorrect) {
                correctCount++;
            }
            details.push({
                question_id: answer.question_id,
                user_option_ids: answer.option_ids || [],
                correct_option_id: question.correct_answer,
                is_correct: isCorrect,
                explanation: question.explanation,
            });
        }
    }

    const total = answers.length;
    return {
        correct: correctCount,
        total: total,
        percentage: total > 0 ? ((correctCount / total) * 100).toFixed(2) : "0.00",
        details: details,
    };
};

module.exports = {
  saveQuizToDatabase,
  getRandomQuestions,
  getAllQuizBanks,
  gradeQuiz,
  processPredefinedQuizFile
};
