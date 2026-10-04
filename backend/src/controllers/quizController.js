const quizService = require('../services/quizService');

const getQuizQuestions = async (req, res) => {
  try {
    const { bankId, count } = req.query;
    if (!bankId || !count) {
      return res.status(400).send('Missing bankId or count parameters.');
    }

    const questions = await quizService.getRandomQuestions(bankId, parseInt(count, 10));
    res.status(200).json(questions);
  } catch (error) {
    console.error(error);
    res.status(500).send('Error fetching quiz questions.');
  }
};

const getAllQuizBanks = async (req, res) => {
  try {
    const quizBanks = await quizService.getAllQuizBanks();
    res.status(200).json(quizBanks);
  } catch (error) {
    console.error(error);
    res.status(500).send('Error fetching quiz banks.');
  }
};

const submitQuiz = async (req, res) => {
  try {
    const { answers } = req.body;
    if (!answers) {
      return res.status(400).send('Missing answers.');
    }

    const result = await quizService.gradeQuiz(answers);
    res.status(200).json(result);
  } catch (error) {
    console.error(error);
    res.status(500).send('Error grading quiz.');
  }
};

module.exports = {
  getQuizQuestions,
  getAllQuizBanks,
  submitQuiz,
};
