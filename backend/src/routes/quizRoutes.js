const express = require('express');
const quizController = require('../controllers/quizController');

const router = express.Router();

router.get('/questions', quizController.getQuizQuestions);

router.get('/banks', quizController.getAllQuizBanks);

router.post('/submit', quizController.submitQuiz);

module.exports = router;
