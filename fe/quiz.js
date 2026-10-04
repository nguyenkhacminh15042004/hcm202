document.addEventListener('DOMContentLoaded', () => {
    const quizRoot = document.getElementById('quiz-root');
    if (!quizRoot) return;

    const API_BASE_URL = CONFIG.API.BASE_URL;

    let state = {
        quizBanks: [],
        selectedBank: '',
        questionCount: 10,
        questions: [],
        currentQuestionIndex: 0,
        userAnswers: {},
        quizStarted: false,
        quizFinished: false,
        results: null,
    };

    function setState(newState) {
        state = { ...state, ...newState };
        render();
    }

    function render() {
        quizRoot.innerHTML = ''; // Clear previous content

        if (!state.quizStarted) {
            quizRoot.appendChild(renderQuizSetup());
        } else if (state.quizFinished) {
            quizRoot.appendChild(renderQuizResult());
        } else {
            quizRoot.appendChild(renderQuizInProgress());
        }
        attachEventListeners();
    }

    function renderQuizSetup() {
        const container = document.createElement('div');
        container.className = 'quiz-container';
        container.innerHTML = `
            <div class="page-header">
                <h1>Kiểm tra Trắc nghiệm</h1>
            </div>
            <div class="ai-quiz-controls">
                <div class="control-row">
                    <label for="quiz-bank-select">Chọn bộ đề</label>
                    <select id="quiz-bank-select">
                        ${state.quizBanks.map(bank => `<option value="${bank.id}" ${state.selectedBank === bank.id ? 'selected' : ''}>${bank.name}</option>`).join('')}
                    </select>
                    <label for="ai-quiz-count">Số câu hỏi</label>
                    <select id="ai-quiz-count">
                        ${[10, 15, 20, 25, 30].map(c => `<option value="${c}" ${state.questionCount === c ? 'selected' : ''}>${c}</option>`).join('')}
                    </select>
                    <button id="start-quiz-btn" type="button" class="primary-btn">Bắt đầu</button>
                </div>
            </div>
        `;
        return container;
    }

    function renderQuizInProgress() {
        const question = state.questions[state.currentQuestionIndex];
        if (!question) {
            const loadingDiv = document.createElement('div');
            loadingDiv.textContent = 'Đang tải câu hỏi...';
            return loadingDiv;
        }

        const container = document.createElement('div');
        container.className = 'ai-quiz-area';

        const selectedAnswers = state.userAnswers[question.id] || [];

        container.innerHTML = `
            <p class="question-counter">Câu ${state.currentQuestionIndex + 1}/${state.questions.length}</p>
            <div class="ai-question">
                <h3 class="question-text">${question.question_text}</h3>
                <div class="options-grid">
                    ${Object.entries(question.options).map(([key, value]) => `
                        <button
                            class="option ${selectedAnswers.includes(key) ? 'selected' : ''}"
                            data-question-id="${question.id}"
                            data-option-key="${key}"
                        >
                            ${value.trim().startsWith(`${key}.`) ? value : `${key}. ${value}`}
                        </button>
                    `).join('')}
                </div>
            </div>
            <div class="ai-quiz-actions">
                <button id="prev-question-btn" type="button" ${state.currentQuestionIndex === 0 ? 'disabled' : ''}>Trước</button>
                <button id="next-question-btn" type="button" ${state.currentQuestionIndex === state.questions.length - 1 ? 'disabled' : ''}>Tiếp</button>
                <button id="submit-quiz-btn" type="button">Nộp bài</button>
            </div>
        `;
        return container;
    }

    function renderQuizResult() {
        if (!state.results) {
            const loadingDiv = document.createElement('div');
            loadingDiv.textContent = 'Đang tải kết quả...';
            return loadingDiv;
        }
        const container = document.createElement('div');
        container.id = 'ai-quiz-result';
        container.innerHTML = `
            <h3>Kết quả</h3>
            <p><strong>Đúng:</strong> ${state.results.correct} / ${state.results.total} (${state.results.percentage}%)</p>
            <div id="ai-detailed-results">
                ${state.results.details.map((detail, index) => {
                    const question = state.questions.find(q => q.id === detail.question_id);
                    const userAnswersText = detail.user_option_ids.length > 0
                        ? detail.user_option_ids.map(id => `${id}. ${question.options[id]}`).join('<br>')
                        : 'Không trả lời';
                    return `
                        <div class="result-item ${detail.is_correct ? 'correct' : 'incorrect'}">
                            <p><strong>Câu ${index + 1}:</strong> ${question.question_text}</p>
                            <p><strong>Câu trả lời của bạn:</strong></p>
                            <div>${userAnswersText}</div>
                            ${!detail.is_correct ? `<p><strong>Đáp án đúng:</strong> ${detail.correct_option_id}</p>` : ''}
                            <button class="explain-btn" data-question-index="${index}">
                                <i data-feather="message-circle"></i>
                                Giải thích với HCM202
                            </button>
                        </div>
                    `;
                }).join('')}
            </div>
            <div class="quiz-result-actions">
                <button id="retake-quiz-btn" class="primary-btn">
                    <i data-feather="refresh-cw"></i>
                    Làm lại bài thi
                </button>
                <button id="explain-all-btn" class="secondary-btn">
                    <i data-feather="help-circle"></i>
                    Giải thích tất cả câu hỏi
                </button>
            </div>
        `;
        return container;
    }

    function attachEventListeners() {
        const startBtn = document.getElementById('start-quiz-btn');
        if (startBtn) startBtn.addEventListener('click', startQuiz);

        const bankSelect = document.getElementById('quiz-bank-select');
        if (bankSelect) bankSelect.addEventListener('change', e => setState({ selectedBank: e.target.value }));

        const countSelect = document.getElementById('ai-quiz-count');
        if (countSelect) countSelect.addEventListener('change', e => setState({ questionCount: parseInt(e.target.value, 10) }));

        document.querySelectorAll('.option').forEach(btn => {
            btn.addEventListener('click', handleAnswerSelect);
        });

        const prevBtn = document.getElementById('prev-question-btn');
        if (prevBtn) prevBtn.addEventListener('click', () => setState({ currentQuestionIndex: state.currentQuestionIndex - 1 }));

        const nextBtn = document.getElementById('next-question-btn');
        if (nextBtn) nextBtn.addEventListener('click', () => setState({ currentQuestionIndex: state.currentQuestionIndex + 1 }));

        const submitBtn = document.getElementById('submit-quiz-btn');
        if (submitBtn) submitBtn.addEventListener('click', submitQuiz);

        // Event listeners for quiz result actions
        document.querySelectorAll('.explain-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const questionIndex = parseInt(e.target.closest('.explain-btn').dataset.questionIndex);
                explainQuestion(questionIndex);
            });
        });

        const retakeBtn = document.getElementById('retake-quiz-btn');
        if (retakeBtn) retakeBtn.addEventListener('click', retakeQuiz);

        const explainAllBtn = document.getElementById('explain-all-btn');
        if (explainAllBtn) explainAllBtn.addEventListener('click', explainAllQuestions);
    }

    function handleAnswerSelect(event) {
        const { questionId, optionKey } = event.target.dataset;
        const question = state.questions.find(q => q.id == questionId);
        if (!question) return;

        const correctAnswersCount = question.correct_answer.split(',').length;
        const currentAnswers = state.userAnswers[questionId] || [];
        let newAnswers;

        if (correctAnswersCount > 1) {
            if (currentAnswers.includes(optionKey)) {
                newAnswers = currentAnswers.filter(k => k !== optionKey);
            } else {
                newAnswers = [...currentAnswers, optionKey];
            }
        } else {
            if (currentAnswers.includes(optionKey)) {
                newAnswers = []; // Deselect if clicked again
            } else {
                newAnswers = [optionKey]; // Select new option
            }
        }

        setState({
            userAnswers: {
                ...state.userAnswers,
                [questionId]: newAnswers
            }
        });
    }

    async function startQuiz() {
        try {
            const res = await fetch(`${API_BASE_URL}/quiz/questions?bankId=${state.selectedBank}&count=${state.questionCount}`);
            const data = await res.json();
            if (!Array.isArray(data)) throw new Error('Invalid data from server');
            setState({
                questions: data,
                quizStarted: true,
                quizFinished: false,
                currentQuestionIndex: 0,
                userAnswers: {},
                results: null,
            });
        } catch (err) {
            console.error("Không thể tải câu hỏi", err);
            quizRoot.innerHTML = `<p>Lỗi khi tải câu hỏi. Vui lòng thử lại.</p>`;
        }
    }

    async function submitQuiz() {
        const answers = state.questions.map(q => ({
            question_id: q.id,
            option_ids: state.userAnswers[q.id] || []
        }));

        try {
            const res = await fetch(`${API_BASE_URL}/quiz/submit`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ answers }),
            });
            const data = await res.json();
            setState({ results: data, quizFinished: true });
        } catch (err) {
            console.error("Không thể nộp bài", err);
            quizRoot.innerHTML = `<p>Lỗi khi nộp bài. Vui lòng thử lại.</p>`;
        }
    }

    // Functions for quiz explanation feature
    function explainQuestion(questionIndex) {
        const question = state.questions[questionIndex];
        const resultDetail = state.results.details[questionIndex];
        
        if (!question || !resultDetail) return;

        // Create explanation prompt
        const explanationPrompt = createExplanationPrompt(question, resultDetail);
        
        // Switch to chat interface
        switchToChatInterface(explanationPrompt);
    }

    function explainAllQuestions() {
        // Create a comprehensive explanation prompt for all questions
        let explanationPrompt = "Tôi vừa hoàn thành bài trắc nghiệm về Tư tưởng Hồ Chí Minh. Hãy giải thích chi tiết cho tôi về các câu hỏi sau:\n\n";
        
        state.results.details.forEach((detail, index) => {
            const question = state.questions.find(q => q.id === detail.question_id);
            if (question) {
                explanationPrompt += `Câu ${index + 1}: ${question.question_text}\n`;
                explanationPrompt += `Câu trả lời của tôi: ${detail.user_option_ids.length > 0 ? detail.user_option_ids.join(', ') : 'Không trả lời'}\n`;
                explanationPrompt += `Đáp án đúng: ${detail.correct_option_id}\n`;
                explanationPrompt += `Kết quả: ${detail.is_correct ? 'Đúng' : 'Sai'}\n\n`;
            }
        });
        
        explanationPrompt += "Hãy giải thích chi tiết từng câu hỏi, tại sao đáp án đó đúng, và nếu tôi trả lời sai thì giải thích tại sao sai. Sử dụng kiến thức về Tư tưởng Hồ Chí Minh để giải thích.";
        
        switchToChatInterface(explanationPrompt);
    }

    function createExplanationPrompt(question, resultDetail) {
        const userAnswersText = resultDetail.user_option_ids.length > 0
            ? resultDetail.user_option_ids.map(id => `${id}. ${question.options[id]}`).join(', ')
            : 'Không trả lời';
        
        const correctAnswersText = resultDetail.correct_option_id;
        
        return `Tôi vừa làm câu hỏi trắc nghiệm về Tư tưởng Hồ Chí Minh:

Câu hỏi: ${question.question_text}

Câu trả lời của tôi: ${userAnswersText}
Đáp án đúng: ${correctAnswersText}
Kết quả: ${resultDetail.is_correct ? 'Đúng' : 'Sai'}

Hãy giải thích chi tiết cho tôi về câu hỏi này, tại sao đáp án đó đúng, và nếu tôi trả lời sai thì giải thích tại sao sai. Sử dụng kiến thức về Tư tưởng Hồ Chí Minh để giải thích một cách đầy đủ và chính xác.`;
    }

    function switchToChatInterface(message) {
        // Switch to chat interface
        const chatNavItem = document.querySelector('.nav-item[data-page="chat-interface"]');
        if (chatNavItem) {
            chatNavItem.click();
        }
        
        // Set the message in the input field and send it
        setTimeout(() => {
            const messageInput = document.getElementById('message-input');
            const sendBtn = document.getElementById('send-btn');
            
            if (messageInput && sendBtn) {
                messageInput.value = message;
                messageInput.focus();
                // Trigger the send button click
                sendBtn.click();
            }
            
            // Re-initialize feather icons after switching to chat
            if (typeof feather !== 'undefined') {
                feather.replace();
            }
        }, 500); // Small delay to ensure chat interface is loaded
    }

    function retakeQuiz() {
        setState({
            quizStarted: false,
            quizFinished: false,
            currentQuestionIndex: 0,
            userAnswers: {},
            results: null,
            questions: []
        });
    }

    // Initial Load
    (async function init() {
        try {
            const res = await fetch(`${API_BASE_URL}/quiz/banks`);
            const data = await res.json();
            setState({ quizBanks: data, selectedBank: data.length > 0 ? data[0].id : '' });
        } catch (err) {
            console.error("Không thể tải danh sách bộ đề", err);
            quizRoot.innerHTML = `<p>Lỗi khi tải danh sách bộ đề. Vui lòng làm mới trang.</p>`;
        }
    })();
});