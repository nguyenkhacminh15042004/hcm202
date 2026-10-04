// API Client cho HCM202 Frontend
class HCM202API {
    constructor() {
        this.baseURL = CONFIG.API.BASE_URL;
        this.timeout = CONFIG.API.TIMEOUT;
        this.retryAttempts = CONFIG.API.RETRY_ATTEMPTS;
        this.retryDelay = CONFIG.API.RETRY_DELAY;
    }

    // Session management
    getSessionToken() {
        let token = localStorage.getItem(CONFIG.APP.SESSION_STORAGE_KEY);
        if (!token) {
            token = 'guest-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
            localStorage.setItem(CONFIG.APP.SESSION_STORAGE_KEY, token);
        }
        return token;
    }

    getCurrentSessionId() {
        return localStorage.getItem(CONFIG.APP.CURRENT_SESSION_KEY) || null;
    }

    setCurrentSessionId(sessionId) {
        localStorage.setItem(CONFIG.APP.CURRENT_SESSION_KEY, sessionId);
    }

    // Base fetch with retry logic
    async fetchWithRetry(url, options = {}, attempt = 1) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);

        const requestOptions = {
            ...options,
            signal: controller.signal,
            headers: {
                'Content-Type': 'application/json',
                'X-Session-Token': this.getSessionToken(),
                ...options.headers
            }
        };

        try {
            const response = await fetch(url, requestOptions);
            clearTimeout(timeoutId);

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            return await response.json();
        } catch (error) {
            clearTimeout(timeoutId);
            
            if (attempt < this.retryAttempts && !controller.signal.aborted) {
                console.warn(`Request failed, retrying (${attempt}/${this.retryAttempts}):`, error.message);
                await this.delay(this.retryDelay * attempt);
                return this.fetchWithRetry(url, options, attempt + 1);
            }
            
            throw error;
        }
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Chat API methods
    async sendMessage(message, sessionId = null, category = null) {
        const url = `${this.baseURL}/chat/send`;
        const body = {
            message: message.trim()
        };

        const currentSessionId = sessionId || this.getCurrentSessionId();
        if (currentSessionId) {
            body.session_id = currentSessionId;
        }

        if (category) {
            body.category = category;
        }

        const response = await this.fetchWithRetry(url, {
            method: 'POST',
            body: JSON.stringify(body)
        });

        if (response.success && response.data.session && !this.getCurrentSessionId()) {
            this.setCurrentSessionId(response.data.session.id);
        }

        return response;
    }

    async getChatHistory(sessionId, page = 1, limit = 50) {
        const url = `${this.baseURL}/chat/history/${sessionId}?page=${page}&limit=${limit}`;
        return this.fetchWithRetry(url, { method: 'GET' });
    }

    async getUserSessions() {
        const url = `${this.baseURL}/chat/sessions`;
        return this.fetchWithRetry(url, { method: 'GET' });
    }

    async createSession() {
        const url = `${this.baseURL}/chat/session`;
        const response = await this.fetchWithRetry(url, { method: 'POST' });
        
        if (response.success) {
            this.setCurrentSessionId(response.data.session.id);
        }
        
        return response;
    }

    async initializeSession() {
        try {
            if (!this.getCurrentSessionId()) {
                await this.createSession();
                console.log('Session initialized successfully');
            }
        } catch (error) {
            console.log('Session initialization failed (will create on first message):', error.message);
        }
    }

    async getSuggestions() {
        const url = `${this.baseURL}/chat/suggestions`;
        return this.fetchWithRetry(url, { method: 'GET' });
    }

    async rateMessage(messageId, rating, feedback = null) {
        const url = `${this.baseURL}/chat/rate/${messageId}`;
        return this.fetchWithRetry(url, {
            method: 'POST',
            body: JSON.stringify({ rating, feedback })
        });
    }

    // Quiz API methods
    async getQuizzes(category = null, difficulty = null, page = 1, limit = 20) {
        let url = `${this.baseURL}/quiz?page=${page}&limit=${limit}`;
        if (category) url += `&category=${encodeURIComponent(category)}`;
        if (difficulty) url += `&difficulty=${difficulty}`;
        
        return this.fetchWithRetry(url, { method: 'GET' });
    }

    async getQuizDetail(quizId) {
        const url = `${this.baseURL}/quiz/${quizId}`;
        return this.fetchWithRetry(url, { method: 'GET' });
    }

    async startQuiz(quizId) {
        const url = `${this.baseURL}/quiz/${quizId}/start`;
        return this.fetchWithRetry(url, { method: 'POST' });
    }

    async submitAnswer(attemptId, questionId, answer) {
        const url = `${this.baseURL}/quiz/attempt/${attemptId}/answer`;
        return this.fetchWithRetry(url, {
            method: 'POST',
            body: JSON.stringify({
                question_id: questionId,
                answer
            })
        });
    }

    async finishQuiz(attemptId) {
        const url = `${this.baseURL}/quiz/attempt/${attemptId}/finish`;
        return this.fetchWithRetry(url, { method: 'POST' });
    }

    async getUserQuizResults(quizId = null, page = 1, limit = 20) {
        let url = `${this.baseURL}/quiz/results/user?page=${page}&limit=${limit}`;
        if (quizId) url += `&quiz_id=${quizId}`;
        
        return this.fetchWithRetry(url, { method: 'GET' });
    }

    // AI Quiz (RAG-based) methods
    async aiGenerateQuiz(count = 10, documentFileName = 'ontap.pdf', difficulty = 'medium') {
        const url = `${this.baseURL}/quiz/ai/generate`;
        return this.fetchWithRetry(url, {
            method: 'POST',
            body: JSON.stringify({ count, documentFileName, difficulty })
        });
    }

    async aiGradeQuiz(questions, answers) {
        const url = `${this.baseURL}/quiz/ai/grade`;
        return this.fetchWithRetry(url, {
            method: 'POST',
            body: JSON.stringify({ questions, answers })
        });
    }

    // Health check
    async healthCheck() {
        const url = `${this.baseURL}/health`;
        return this.fetchWithRetry(url, { method: 'GET' });
    }
}

const api = new HCM202API();
