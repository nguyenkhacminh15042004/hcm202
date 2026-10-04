// Configuration cho HCM202 Frontend
const CONFIG = {
    // API Configuration
    API: {
        BASE_URL: (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') ? 'http://localhost:3001/api/v1' : window.location.origin + '/api/v1',
        TIMEOUT: 30000, // 30 seconds
        RETRY_ATTEMPTS: 3,
        RETRY_DELAY: 1000 // 1 second
    },
    
    // Application Settings
    APP: {
        NAME: 'HCM202',
        VERSION: '1.0.0',
        SESSION_STORAGE_KEY: 'hcm202-session',
        CURRENT_SESSION_KEY: 'hcm202-current-session'
    },
    
    // Chat Settings
    CHAT: {
        MAX_MESSAGE_LENGTH: 5000,
        TYPING_DELAY: 1500,
        AUTO_SCROLL: true,
        SAVE_HISTORY: true
    },
    
    // Quiz Settings
    QUIZ: {
        AUTO_SAVE_ANSWERS: true,
        SHOW_PROGRESS: true,
        CONFIRM_SUBMIT: true
    },
    
    // Environment Detection
    ENV: {
        IS_DEVELOPMENT: window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1',
        IS_PRODUCTION: window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1'
    }
};

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CONFIG;
}
