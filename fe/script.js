document.addEventListener('DOMContentLoaded', () => {

    // Kích hoạt tất cả icon tĩnh ban đầu
    feather.replace();

    // Initialize settings page
    initializeSettingsPage();

    // ==================== LOGIC TRANG MỞ ĐẦU ====================
    const landingPage = document.getElementById('landing-page');
    const appContainer = document.getElementById('app-container');
    const startBtn = document.getElementById('start-btn');

    if (startBtn && landingPage && appContainer) {
        // Primary event listener with smooth transition
        startBtn.addEventListener('click', () => {
            console.log('Start button clicked!'); // Debug log
            landingPage.style.transition = 'opacity 0.5s ease';
            landingPage.style.opacity = '0';
            setTimeout(() => {
                landingPage.classList.add('hidden');
                appContainer.classList.remove('hidden');
                appContainer.style.opacity = '0';
                setTimeout(() => {
                    appContainer.style.transition = 'opacity 0.5s ease';
                    appContainer.style.opacity = '1';
                }, 50);
            }, 500);
        });
        
        // Fallback onclick handler for compatibility (keep flex layout)
        startBtn.onclick = function() {
            console.log('Fallback button handler triggered!');
            landingPage.style.display = 'none';
            appContainer.classList.remove('hidden');
            appContainer.style.display = 'flex';
            appContainer.style.opacity = '1';
        };
        
        console.log('Start button event listeners attached successfully');
    } else {
        console.error('Failed to find required elements:', {
            startBtn: !!startBtn,
            landingPage: !!landingPage,
            appContainer: !!appContainer
        });
        
        // Retry after a short delay in case DOM is still loading
        setTimeout(() => {
            const retryStartBtn = document.getElementById('start-btn');
            const retryLandingPage = document.getElementById('landing-page');
            const retryAppContainer = document.getElementById('app-container');
            
            if (retryStartBtn && retryLandingPage && retryAppContainer) {
                retryStartBtn.onclick = function() {
                    console.log('Retry button handler triggered!');
                    retryLandingPage.style.display = 'none';
                    retryAppContainer.classList.remove('hidden');
                    retryAppContainer.style.display = 'flex';
                    retryAppContainer.style.opacity = '1';
                };
                console.log('Button handler attached on retry');
            }
        }, 1000);
    }

    // ==================== LOGIC ĐIỀU HƯỚNG CHÍNH (CHUYỂN TRANG) ====================
    const navItems = document.querySelectorAll('.nav-item');
    const pages = document.querySelectorAll('.page');
    const mainNav = document.querySelector('.main-nav');

    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const pageId = item.dataset.page;

            // Bỏ active ở tất cả nav-item và ẩn tất cả các trang
            navItems.forEach(nav => nav.classList.remove('active'));
            pages.forEach(page => page.classList.remove('active'));
            
            // Thêm active cho nav-item được click
            item.classList.add('active');

            // Hiển thị trang tương ứng
            const targetPage = document.getElementById(pageId);
            if (targetPage) {
                targetPage.classList.add('active');
            }
        });
    });

    // ==================== COLLAPSIBLE MAIN NAV ====================
    const navToggle = document.getElementById('nav-toggle');
    if (navToggle && mainNav) {
        navToggle.addEventListener('click', () => {
            mainNav.classList.toggle('collapsed');
        });
    }

    const sidebarOverlay = document.querySelector('.sidebar-overlay');
    if (sidebarOverlay) {
        sidebarOverlay.addEventListener('click', () => {
            document.body.classList.remove('sidebar-open');
        });
    }

    // ==================== SIDEBAR TOGGLE (RESPONSIVE) ====================
    const sidebarToggle = document.getElementById('sidebar-toggle');
    if (sidebarToggle) {
        sidebarToggle.addEventListener('click', () => {
            document.body.classList.toggle('sidebar-open');
        });

        // Close on route change
        navItems.forEach(item => {
            item.addEventListener('click', () => {
                document.body.classList.remove('sidebar-open');
            });
        });
    }

    // ==================== LOGIC MỤC LỤC (ACCORDION) ====================
    const chapterHeaders = document.querySelectorAll('.chapter-header');
    chapterHeaders.forEach(header => {
        header.addEventListener('click', () => {
            header.parentElement.classList.toggle('open');
        });
    });

    // ==================== LOGIC GỢI Ý HỎI NHANH ====================
    const quickSuggestions = document.querySelectorAll('.quick-suggestions li');
    const messageInput = document.getElementById('message-input');
    
    quickSuggestions.forEach(suggestion => {
        suggestion.addEventListener('click', () => {
            // Chuyển về trang chat nếu đang ở trang khác
            document.querySelector('.nav-item[data-page="chat-interface"]').click();
            
            messageInput.value = suggestion.textContent;
            messageInput.focus();
            // Gửi luôn câu hỏi được gợi ý
            sendMessage();
        });
    });

    // ==================== QUOTE OF THE DAY (RANDOM) ====================
    const quotesOfTheDay = [
        { text: `Trời có bốn mùa: Xuân, Hạ, Thu, Đông\nĐất có bốn phương: Đông, Tây, Nam, Bắc\nNgười có bốn đức: Cần, Kiệm, Liêm, Chính`, source: `Thế nào là cần - 30/5/1949` },
        { text: `Cần mà không Kiệm thì làm chừng nào xào chừng ấy. Cũng như một cái thùng không có đáy, nước đổ vào chừng nào, chảy ra hết chừng ấy, không lại hoàn không.`, source: `Cần Kiệm Liêm Chính` },
        { text: `Cần, Kiệm, Liêm, là gốc rễ của Chính. Nhưng một cây cần có gốc rễ, lại cần có cành, lá, hoa, quả mới là hoàn toàn. Một người phải Cần, Kiệm, Liêm, nhưng còn phải Chính mới là người hoàn toàn.`, source: `Cần Kiệm Liêm Chính` },
        { text: `Không có đạo đức cách mạng thì tài cũng vô dụng.`, source: `Tư tưởng Hồ Chí Minh về rèn luyện đạo đức cách mạng cho cán bộ, đảng viên` },
        { text: `Đạo đức, ngày trước thì chỉ trung với vua, hiếu với cha mẹ. Ngày nay, thời đại mới, đạo đức cũng phải mới. Phải trung với nước. Phải hiếu với toàn dân, với đồng bào.`, source: `` },
        { text: `Làm cách mạng để cải tạo xã hội cũ thành xã hội mới là một sự nghiệp rất vẻ vang, nhưng nó cũng là một nhiệm vụ rất nặng nề, một cuộc đấu tranh rất phức tạp, lâu dài và gian khổ. Sức có mạnh mới gánh được nặng và đi được xa. Người cách mạng phải có đạo đức cách mạng làm nền tảng, mới hoàn thành được nhiệm vụ vẻ vang.`, source: `Đạo đức cách mạng` },
        { text: `Chính lòng yêu nước, chứ không phải lý tưởng cộng sản, là nguồn cảm hứng cho tôi`, source: `` },
        { text: `Việc gì, dù lợi cho mình, phải xét nó có lợi cho nước không? Nếu không có lợi, mà có hại cho nước thì quyết không làm. Mỗi ngày cố làm một việc có lợi cho nước…`, source: `Cần Kiệm Liêm Chính` },
        { text: `Chúng ta không sợ sai lầm, chỉ sợ phạm sai lầm mà không quyết tâm sửa chữa. Muốn sửa chữa cho tốt thì phải sẵn sàng nghe quần chúng phê bình và thật thà tự phê bình..`, source: `Đạo đức cách mạng` },
        { text: `Bây giờ học thuyết nhiều, chủ nghĩa nhiều, nhưng chủ nghĩa chân chính nhất, chắc chắn nhất, cách mệnh nhất là chủ nghĩa Lênin`, source: `` },
        { text: `Công cuộc giải phóng anh em chỉ có thể thực hiện được bằng sự nỗ lực của bản thân anh em`, source: `` },
        { text: `Muốn cứu nước và giải phóng dân tộc không có con đường nào khác con đường cách mạng vô sản`, source: `` },
        { text: `Hỡi đồng bào bị đọa đày đau khổ! Đây là cái cần thiết cho chúng ta, đây là con đường giải phóng chúng ta!`, source: `Luận cương Lenin` },
        { text: `Tất cả sinh lực của chủ nghĩa tư bản quốc tế đều lấy ở các xứ thuộc địa. Đó là nơi chủ nghĩa tư bản lấy nguyên liệu cho các nhà máy của nó, nơi nó đầu tư, tiêu thụ hàng, mộ nhân công rẻ mạt cho đạo quân lao động của nó, và nhất là tuyển những binh lính người bản xứ cho các đạo quân phản cách mạng của nó`, source: `` },
        { text: `Cũng như sông thì có nguồn mới có nước, không có nguồn thì sông cạn. Cây phải có gốc, không có gốc thì cây héo. Người cách mạng phải có đạo đức, không có đạo đức thì dù tài giỏi mấy cũng không lãnh đạo được nhân dân.`, source: `Đạo đức cách mạng` },
        { text: `Nó không mang gươm mang súng, mà nó nằm trong các tổ chức của ta, để làm hỏng công việc của ta" và dù cố ý hay không nó cũng là "bạn đồng minh của thực dân và phong kiến. Vì nó làm chậm trễ công cuộc kháng chiến và kiến quốc của ta. Nó làm hỏng tinh thần trong sạch và ý chí khắc khổ của cán bộ ta. Nó phá hoại đạo đức cách mạng của ta là cần, kiệm, liêm, chính.`, source: `Chủ tịch Hồ Chí Minh với phòng, chống tham nhũng` },
        { text: `Trước hết phải có đảng cách mệnh, để trong thì vận động và tổ chức dân chúng, ngoài thì liên lạc với dân tộc bị áp bức và vô sản giai cấp mọi nơi. Đảng có vững cách mệnh mới thành công, cũng như người cầm lái có vững thuyền mới chạy. Đảng muốn vững thì phải có chủ nghĩa làm cốt, trong đảng ai cũng phải hiểu, ai cũng phải theo chủ nghĩa ấy. Đảng mà không có chủ nghĩa cũng như người không có trí khôn, tàu không có bàn chỉ nam`, source: `Di chúc` },
        { text: `Đảng ta là một đảng cầm quyền. Mỗi đảng viên và cán bộ phải thực sự thấm nhuần đạo đức cách mạng, thật sự cần kiệm liêm chính, chí công vô tư. Phải giữ gìn Đảng ta thật trong sạch, phải xứng đáng là người lãnh đạo, là người đầy tớ thật trung thành của nhân dân`, source: `Di chúc` },
        { text: `“Bảy xin hiến pháp ban hành/ Trăm điều phải có thần linh pháp quyền”`, source: `Việt Nam yêu cầu ca` },
        { text: `Chủ nghĩa dân tộc là động lực lớn của đất nước`, source: `` },
        { text: `Chống tham ô, lãng phí và bệnh quan liêu cũng quan trọng, cần kíp như việc đánh giặc trên mặt trận.`, source: `Thực hành tiết kiệm, chống tham ô, lãng phí, chống bệnh quan liêu` },
        { text: `Chủ nghĩa xã hội là nhằm nâng cao đời sống vật chất và văn hóa của nhân dân và do nhân dân tự xây dựng lấy`, source: `` },
        { text: `Đảng cần phải có kế hoạch thật tốt để phát triển kinh tế và văn hóa, nhằm không ngừng nâng cao đời sống của nhân dân.`, source: `Di chúc` },
        { text: `Văn hóa soi đường cho quốc dân đi`, source: `` },
        { text: `Lực lượng của giai cấp công nhân và nhân dân lao động là rất to lớn, là vô cùng vô tận. Nhưng lực lượng ấy cần có Đảng lãnh đạo mới chắc chắn thắng lợi`, source: `Đạo đức cách mạng` },
        { text: `Đồng bào Nam Bộ là dân nước Việt Nam. Sông có thể cạn, núi có thể mòn, song chân lý đó không bao giờ thay đổi`, source: `Thư gửi đồng bào Nam bộ` },
        { text: `Nói đi đôi với làm, phải nêu gương đạo đức`, source: `` },
        { text: `Đảng cầm quyền, dân là chủ`, source: `` },
        { text: `Đảng vừa là người lãnh đạo, vừa là người đày tớ của nhân dân.`, source: `` },
        { text: `Toàn thể dân tộc Việt Nam quyết đem tất cả tinh thần và lực lượng, tính mạng và của cải để giữ vững quyền tự do độc lập ấy`, source: `Tuyên ngôn độc lập` },
        { text: `Tất cả các dân tộc trên thế giới đều sinh ra bình đẳng, dân tộc nào cũng có quyền sống, quyền sung sướng và quyền tự do`, source: `Tuyên ngôn độc lập` },
        { text: `Người cách mạng thì phải có đạo đức cách mạng mới gánh được nặng và đi được xa`, source: `Đạo đức cách mạng` },
        { text: `Dù phải đốt cháy cả dãy Trường Sơn cũng phải kiên quyết giành cho được độc lập`, source: `` },
        { text: `Tôi chỉ có một sự ham muốn, ham muốn tột bậc, là làm sao cho nước ta được hoàn toàn độc lập, dân ta được hoàn toàn tự do, đồng bào ai cũng có cơm ăn áo mặc, ai cũng được học hành.`, source: `Trả lời các nhà báo` },
        { text: `Đại đoàn kết tức là trước hết phải đoàn kết đại đa số nhân dân, mà đại đa số nhân dân là công nhân, nông dân và các tầng lớp nhân dân lao động khác. Đó là nền gốc của đại đoàn kết. Nó cũng như cái nền của nhà, cái gốc của cây. Nhưng đã có nền vững, gốc tốt, còn phải đoàn kết các tầng lớp nhân dân khác`, source: `` },
        { text: `Trước mặt quần chúng, không phải ta cứ viết lên trán chữ “cộng sản” mà ta được họ yêu mến...`, source: `Bế mạc Hội nghị cán bộ của Đảng lần thứ 6, 18-1-1949` },
        { text: `Không! Chúng ta thà hy sinh tất cả, chứ nhất định không chịu mất nước, nhất định không chịu làm nô lệ`, source: `Lời kêu gọi toàn quốc kháng chiến` },
        { text: `Một dân tộc dốt là một dân tộc yếu`, source: `` }
    ];

    function showRandomQuoteOfDay() {
        const quoteContainer = document.querySelector('.quote-of-the-day');
        if (!quoteContainer || quotesOfTheDay.length === 0) return;

        const randomIndex = Math.floor(Math.random() * quotesOfTheDay.length);
        const randomQuote = quotesOfTheDay[randomIndex];

        const paragraphEl = quoteContainer.querySelector('p');
        const sourceEl = quoteContainer.querySelector('span');

        if (paragraphEl) {
            paragraphEl.textContent = randomQuote.text;
        }
        if (sourceEl) {
            sourceEl.textContent = randomQuote.source ? `- ${randomQuote.source}` : '';
        }
    }

    // Show one immediately on load
    showRandomQuoteOfDay();


    // ==================== LOGIC CHAT MÔ PHỎNG ====================
    const sendBtn = document.getElementById('send-btn');
    const messageList = document.getElementById('message-list');

    const sendMessage = async () => {
        const userText = messageInput.value.trim();
        if (userText === '') return;

        // Disable input while processing
        messageInput.disabled = true;
        sendBtn.disabled = true;

        appendMessage(userText, 'user');
        messageInput.value = '';
        showTypingIndicator();

        try {
            const botResponse = await getBotResponse(userText);
            
            // Remove typing indicator
            const typingIndicator = document.querySelector('.typing-indicator');
            if (typingIndicator) typingIndicator.remove();
            
            appendMessage(botResponse.text, 'bot', botResponse.citation);
        } catch (error) {
            console.error('Send message error:', error);
            
            // Remove typing indicator
            const typingIndicator = document.querySelector('.typing-indicator');
            if (typingIndicator) typingIndicator.remove();
            
            appendMessage('Xin lỗi, có lỗi xảy ra khi kết nối với hệ thống. Vui lòng thử lại.', 'bot');
        } finally {
            // Re-enable input
            messageInput.disabled = false;
            sendBtn.disabled = false;
            messageInput.focus();
        }
    };

    // Simple markdown parser for bot responses
    const parseMarkdown = (text) => {
        if (!text) return text;
        
        return text
            // Headers (### -> h3, ## -> h2, # -> h1)
            .replace(/^### (.*$)/gm, '<h3>$1</h3>')
            .replace(/^## (.*$)/gm, '<h2>$1</h2>')
            .replace(/^# (.*$)/gm, '<h1>$1</h1>')
            
            // Bold text (**text** or __text__)
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/__(.*?)__/g, '<strong>$1</strong>')
            
            // Italic text (*text* or _text_)
            .replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>')
            .replace(/(?<!_)_([^_]+)_(?!_)/g, '<em>$1</em>')
            
            // Horizontal rules (---)
            .replace(/^---$/gm, '<hr>')
            
            // Line breaks (preserve double line breaks as paragraphs)
            .replace(/\n\n/g, '</p><p>')
            .replace(/\n/g, '<br>')
            
            // List items (starting with * or -)
            .replace(/^\* (.+)$/gm, '<li>$1</li>')
            .replace(/^- (.+)$/gm, '<li>$1</li>')
            
            // Wrap consecutive <li> elements in <ul>
            .replace(/(<li>.*<\/li>)(\s*<li>.*<\/li>)*/g, '<ul>$&</ul>')
            
            // Code blocks (backticks)
            .replace(/`([^`]+)`/g, '<code>$1</code>')
            
            // Links [text](url)
            .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');
    };

    const appendMessage = (text, sender, citation = null) => {
        const messageDiv = document.createElement('div');
        messageDiv.classList.add('message', `${sender}-message`);

        let avatarHtml = '';
        if (sender === 'bot') {
            avatarHtml = `
                <div class="bot-avatar">
                    <img src="https://img.icons8.com/plasticine/100/lotus.png" alt="Bot Avatar">
                </div>
            `;
        }
        
        const contentDiv = document.createElement('div');
        contentDiv.classList.add('message-content');
        
        const messageContent = document.createElement('div');
        
        // Parse markdown for bot messages, keep plain text for user messages
        if (sender === 'bot') {
            const parsedText = parseMarkdown(text);
            messageContent.innerHTML = `<p>${parsedText}</p>`;
        } else {
            messageContent.innerHTML = `<p>${text}</p>`;
        }
        
        contentDiv.appendChild(messageContent);

        if (citation) {
            const citationDiv = document.createElement('div');
            citationDiv.classList.add('citation');
            citationDiv.innerHTML = `<i data-feather="book-open" style="width:16px; height:16px;"></i> <strong>Nguồn:</strong> ${citation}`;
            contentDiv.appendChild(citationDiv);
        }
        
        messageDiv.innerHTML = avatarHtml;
        messageDiv.appendChild(contentDiv);
        messageList.appendChild(messageDiv);
        
        // KÍCH HOẠT LẠI ICON SAU KHI THÊM NỘI DUNG MỚI
        feather.replace(); 
        
        scrollToBottom();
    };
    
    const showTypingIndicator = () => {
        const typingDiv = document.createElement('div');
        typingDiv.classList.add('message', 'bot-message', 'typing-indicator');
        typingDiv.innerHTML = `
            <div class="bot-avatar">
                <img src="https://img.icons8.com/plasticine/100/lotus.png" alt="Bot Avatar">
            </div>
            <div class="message-content">
                <span></span><span></span><span></span>
            </div>
        `;
        messageList.appendChild(typingDiv);
        scrollToBottom();
    }

    const getBotResponse = async (userInput) => {
        try {
            const response = await api.sendMessage(userInput);
            
            if (response.success) {
                // Format sources/citations
                let citation = null;
                if (response.data.sources && response.data.sources.length > 0) {
                    citation = response.data.sources.map(source => 
                        `${source.document_title}${source.section_title ? ' - ' + source.section_title : ''}`
                    ).join('; ');
                }
                
                return {
                    text: response.data.message.content,
                    citation: citation
                };
            } else {
                throw new Error(response.message || 'API Error');
            }
        } catch (error) {
            console.error('AI Response Error:', error);
            
            // Fallback to original mock responses
            return getOriginalBotResponse(userInput);
        }
    };

    // Backup original function for fallback
    const getOriginalBotResponse = (userInput) => {
        const lowerInput = userInput.toLowerCase();

        if (lowerInput.includes('đạo đức')) {
            return {
                text: 'Theo Chủ tịch Hồ Chí Minh, đạo đức cách mạng là nền tảng của người cách mạng, cũng như gốc của cây, ngọn nguồn của sông. Bốn đức tính cốt lõi bao gồm: <strong>Cần, Kiệm, Liêm, Chính</strong>.',
                citation: 'Tác phẩm "Sửa đổi lối làm việc" (1947), Chương III.'
            };
        } else if (lowerInput.includes('đảng')) {
            return {
                text: 'Người khẳng định Đảng Cộng sản Việt Nam là nhân tố hàng đầu quyết định mọi thắng lợi của cách mạng Việt Nam. Đảng phải trong sạch, vững mạnh, là đạo đức, là văn minh.',
                citation: 'Di chúc của Chủ tịch Hồ Chí Minh (1969).'
            };
        } else if (lowerInput.includes('bối cảnh')) {
            return {
                 text: 'Cuối thế kỷ XIX - đầu thế kỷ XX, Việt Nam là một nước thuộc địa nửa phong kiến dưới ách thống trị của thực dân Pháp. <br><br>Các phong trào yêu nước như Cần Vương, khởi nghĩa nông dân Yên Thế đều lần lượt thất bại, đẩy đất nước vào một "cuộc khủng hoảng sâu sắc về đường lối cứu nước".',
                citation: 'Giáo trình Tư tưởng Hồ Chí Minh (2019), Chương II, Mục 1.1.'
            };
        } else {
            return {
                text: 'Xin lỗi, tôi đang có vấn đề kết nối với hệ thống AI. Vui lòng thử lại sau hoặc liên hệ hỗ trợ.',
                citation: null
            };
        }
    };

    const scrollToBottom = () => {
        messageList.scrollTop = messageList.scrollHeight;
    };

    sendBtn.addEventListener('click', sendMessage);
    messageInput.addEventListener('keydown', (event) => {
        // Gửi tin nhắn khi nhấn Enter (và không nhấn Shift)
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault(); // Ngăn hành vi mặc định (xuống dòng)
            sendMessage();
        }
        // Shift + Enter sẽ cho phép xuống dòng (hành vi mặc định của textarea)
    });

    // Tự động điều chỉnh chiều cao của textarea khi nhập liệu
    messageInput.addEventListener('input', () => {
        messageInput.style.height = 'auto'; // Reset chiều cao
        messageInput.style.height = `${messageInput.scrollHeight}px`; // Đặt chiều cao mới
    });

    // ==================== SMART SUGGESTIONS ====================
    async function loadSmartSuggestions() {
        try {
            const response = await api.getSuggestions();
            if (response.success && response.data.suggestions) {
                updateQuickSuggestions(response.data.suggestions);
            }
        } catch (error) {
            console.log('Could not load smart suggestions, using defaults');
        }
    }

    const updateQuickSuggestions = (suggestions) => {
        const suggestionsList = document.querySelector('.quick-suggestions ul');
        if (suggestionsList) {
            if (suggestions && suggestions.length > 0) {
                suggestionsList.innerHTML = suggestions.map(suggestion => 
                    `<li>${suggestion}</li>`
                ).join('');
                
                // Re-attach click handlers
                attachSuggestionHandlers();
            } else {
                // Show fallback message if no suggestions
                suggestionsList.innerHTML = '<li class="loading-suggestion">Không có gợi ý nào</li>';
            }
        }
    };

    const attachSuggestionHandlers = () => {
        const quickSuggestions = document.querySelectorAll('.quick-suggestions li');
        quickSuggestions.forEach(suggestion => {
            suggestion.addEventListener('click', () => {
                // Chuyển về trang chat nếu đang ở trang khác
                document.querySelector('.nav-item[data-page="chat-interface"]').click();
                
                messageInput.value = suggestion.textContent;
                messageInput.focus();
                // Gửi luôn câu hỏi được gợi ý
                sendMessage();
            });
        });
    };

    // ==================== SETTINGS PAGE FUNCTIONALITY ====================
    function initializeSettingsPage() {
        // Load current settings when page is accessed
        document.querySelector('[data-page="settings-page"]').addEventListener('click', loadCurrentSettings);

        // Range input live updates
        const temperatureSlider = document.getElementById('chat-temperature');
        const temperatureValue = document.getElementById('temperature-value');
        const thresholdSlider = document.getElementById('similarity-threshold');
        const thresholdValue = document.getElementById('threshold-value');

        if (temperatureSlider && temperatureValue) {
            temperatureSlider.addEventListener('input', (e) => {
                temperatureValue.textContent = e.target.value;
            });
        }

        if (thresholdSlider && thresholdValue) {
            thresholdSlider.addEventListener('input', (e) => {
                thresholdValue.textContent = e.target.value;
            });
        }

        // Button event listeners
        document.getElementById('test-api-key')?.addEventListener('click', testAPIKey);
        document.getElementById('test-openai-connection')?.addEventListener('click', testOpenAIConnection);
        document.getElementById('save-settings')?.addEventListener('click', saveSettings);
        document.getElementById('reset-settings')?.addEventListener('click', resetSettings);
    }

    async function loadCurrentSettings() {
        try {
            showSettingsStatus('Đang tải cấu hình...', 'loading');

            const response = await fetch(`${CONFIG.API.BASE_URL}/settings/public`);
            const data = await response.json();

            if (data.success) {
                populateSettingsForm(data.data.settings);
                hideSettingsStatus();
            } else {
                throw new Error(data.message);
            }
        } catch (error) {
            console.error('Error loading settings:', error);
            showSettingsStatus('Lỗi khi tải cấu hình', 'error');
        }
    }

    function populateSettingsForm(settings) {
        // OpenAI settings
        if (settings.openai) {
            setInputValue('openai-base-url', settings.openai.openai_base_url);
            setInputValue('chat-model', settings.openai.openai_chat_model);
            setInputValue('embedding-model', settings.openai.openai_embedding_model);
        }

        // Chat settings
        if (settings.chat) {
            setInputValue('chat-temperature', settings.chat.chat_temperature);
            setInputValue('max-tokens', settings.chat.chat_max_tokens);
            document.getElementById('temperature-value').textContent = settings.chat.chat_temperature || '0.7';
        }

        // RAG settings
        if (settings.rag) {
            setInputValue('top-k-results', settings.rag.rag_top_k_results);
            setInputValue('similarity-threshold', settings.rag.rag_similarity_threshold);
            document.getElementById('threshold-value').textContent = settings.rag.rag_similarity_threshold || '0.7';
        }
    }

    function setInputValue(id, value) {
        const element = document.getElementById(id);
        if (element && value !== undefined) {
            element.value = value;
        }
    }

    async function testAPIKey() {
        const apiKey = document.getElementById('openai-api-key').value;
        if (!apiKey) {
            showSettingsStatus('Vui lòng nhập API key', 'error');
            return;
        }

        try {
            showSettingsStatus('Đang test API key...', 'loading');

            const response = await fetch(`${CONFIG.API.BASE_URL}/settings/test-openai`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    api_key: apiKey
                })
            });

            const data = await response.json();

            if (data.success) {
                showSettingsStatus('API key hợp lệ!', 'success');
            } else {
                showSettingsStatus(`API key không hợp lệ: ${data.error}`, 'error');
            }
        } catch (error) {
            console.error('Error testing API key:', error);
            showSettingsStatus('Lỗi khi test API key', 'error');
        }
    }

    async function testOpenAIConnection() {
        try {
            showSettingsStatus('Đang test kết nối OpenAI...', 'loading');

            const response = await fetch(`${CONFIG.API.BASE_URL}/settings/test-openai`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({})
            });

            const data = await response.json();

            if (data.success) {
                const { chat_model, embedding_model } = data.data;
                showSettingsStatus(
                    `Kết nối thành công! Chat Model: ${chat_model.model}, Embedding Model: ${embedding_model.model}`, 
                    'success'
                );
            } else {
                showSettingsStatus(`Lỗi kết nối: ${data.error}`, 'error');
            }
        } catch (error) {
            console.error('Error testing OpenAI connection:', error);
            showSettingsStatus('Lỗi khi test kết nối', 'error');
        }
    }

    async function saveSettings() {
        try {
            showSettingsStatus('Đang lưu cấu hình...', 'loading');

            const settings = {
                openai_api_key: document.getElementById('openai-api-key').value,
                openai_base_url: document.getElementById('openai-base-url').value,
                openai_chat_model: document.getElementById('chat-model').value,
                openai_embedding_model: document.getElementById('embedding-model').value,
                chat_temperature: document.getElementById('chat-temperature').value,
                chat_max_tokens: document.getElementById('max-tokens').value,
                rag_top_k_results: document.getElementById('top-k-results').value,
                rag_similarity_threshold: document.getElementById('similarity-threshold').value
            };

            // Save each setting
            const promises = Object.entries(settings).map(async ([key, value]) => {
                if (value) { // Only save non-empty values
                    const response = await fetch(`${CONFIG.API.BASE_URL}/settings/${key}`, {
                        method: 'PUT',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            value: value,
                            test_first: ['openai_api_key', 'openai_base_url'].includes(key)
                        })
                    });

                    const data = await response.json();
                    if (!data.success) {
                        throw new Error(`${key}: ${data.message}`);
                    }
                }
            });

            await Promise.all(promises);
            showSettingsStatus('Đã lưu tất cả cấu hình thành công!', 'success');

        } catch (error) {
            console.error('Error saving settings:', error);
            showSettingsStatus(`Lỗi khi lưu: ${error.message}`, 'error');
        }
    }

    async function resetSettings() {
        if (!confirm('Bạn có chắc chắn muốn reset tất cả cấu hình về mặc định?')) {
            return;
        }

        try {
            showSettingsStatus('Đang reset cấu hình...', 'loading');

            const response = await fetch(`${CONFIG.API.BASE_URL}/settings/reset`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({})
            });

            const data = await response.json();

            if (data.success) {
                showSettingsStatus('Đã reset cấu hình về mặc định!', 'success');
                // Reload settings
                setTimeout(loadCurrentSettings, 1000);
            } else {
                showSettingsStatus(`Lỗi reset: ${data.message}`, 'error');
            }
        } catch (error) {
            console.error('Error resetting settings:', error);
            showSettingsStatus('Lỗi khi reset cấu hình', 'error');
        }
    }

    function showSettingsStatus(message, type) {
        const statusEl = document.getElementById('settings-status');
        if (statusEl) {
            statusEl.className = `status-message ${type}`;
            statusEl.textContent = message;
            statusEl.classList.remove('hidden');

            if (type === 'success') {
                setTimeout(() => {
                    statusEl.classList.add('hidden');
                }, 3000);
            }
        }
    }

    function hideSettingsStatus() {
        const statusEl = document.getElementById('settings-status');
        if (statusEl) {
            statusEl.classList.add('hidden');
        }
    }

    // Initialize session and load smart suggestions from API after all functions are defined
    api.initializeSession();
    loadSmartSuggestions();

    // ==================== MINDMAP ZOOM FUNCTIONALITY ====================
    initializeMindmapZoom();
});

function initializeMindmapZoom() {
    const container = document.getElementById('mindmap-container');
    const image = document.getElementById('mindmap-image');
    const zoomInBtn = document.getElementById('zoom-in');
    const zoomOutBtn = document.getElementById('zoom-out');
    const resetBtn = document.getElementById('reset-zoom');
    const zoomLevel = document.getElementById('zoom-level');

    if (!container || !image || !zoomInBtn || !zoomOutBtn || !resetBtn || !zoomLevel) {
        console.log('Mindmap zoom elements not found, skipping initialization');
        return;
    }

    let currentZoom = 1;
    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let translateX = 0;
    let translateY = 0;
    let lastTranslateX = 0;
    let lastTranslateY = 0;

    const minZoom = 0.5;
    const maxZoom = 3;
    const zoomStep = 0.2;

    // Update zoom level display
    function updateZoomLevel() {
        zoomLevel.textContent = Math.round(currentZoom * 100) + '%';
    }

    // Apply zoom and pan transformations
    function applyTransform() {
        image.style.transform = `scale(${currentZoom}) translate(${translateX}px, ${translateY}px)`;
        container.classList.toggle('zoomed', currentZoom > 1);
    }

    // Zoom in
    zoomInBtn.addEventListener('click', () => {
        if (currentZoom < maxZoom) {
            currentZoom = Math.min(currentZoom + zoomStep, maxZoom);
            updateZoomLevel();
            applyTransform();
        }
    });

    // Zoom out
    zoomOutBtn.addEventListener('click', () => {
        if (currentZoom > minZoom) {
            currentZoom = Math.max(currentZoom - zoomStep, minZoom);
            updateZoomLevel();
            applyTransform();
        }
    });

    // Reset zoom
    resetBtn.addEventListener('click', () => {
        currentZoom = 1;
        translateX = 0;
        translateY = 0;
        lastTranslateX = 0;
        lastTranslateY = 0;
        updateZoomLevel();
        applyTransform();
    });

    // Mouse wheel zoom
    container.addEventListener('wheel', (e) => {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -zoomStep : zoomStep;
        const newZoom = Math.max(minZoom, Math.min(maxZoom, currentZoom + delta));
        
        if (newZoom !== currentZoom) {
            currentZoom = newZoom;
            updateZoomLevel();
            applyTransform();
        }
    });

    // Mouse drag for panning
    container.addEventListener('mousedown', (e) => {
        if (currentZoom > 1) {
            isDragging = true;
            startX = e.clientX - translateX;
            startY = e.clientY - translateY;
            container.style.cursor = 'grabbing';
        }
    });

    document.addEventListener('mousemove', (e) => {
        if (isDragging && currentZoom > 1) {
            translateX = e.clientX - startX;
            translateY = e.clientY - startY;
            applyTransform();
        }
    });

    document.addEventListener('mouseup', () => {
        if (isDragging) {
            isDragging = false;
            lastTranslateX = translateX;
            lastTranslateY = translateY;
            container.style.cursor = 'grab';
        }
    });

    // Touch events for mobile
    let lastTouchDistance = 0;
    let initialTouchDistance = 0;
    let initialZoom = 1;

    container.addEventListener('touchstart', (e) => {
        if (e.touches.length === 2) {
            // Pinch zoom
            const touch1 = e.touches[0];
            const touch2 = e.touches[1];
            lastTouchDistance = Math.sqrt(
                Math.pow(touch2.clientX - touch1.clientX, 2) +
                Math.pow(touch2.clientY - touch1.clientY, 2)
            );
            initialTouchDistance = lastTouchDistance;
            initialZoom = currentZoom;
        } else if (e.touches.length === 1 && currentZoom > 1) {
            // Single touch pan
            isDragging = true;
            const touch = e.touches[0];
            startX = touch.clientX - translateX;
            startY = touch.clientY - translateY;
        }
    });

    container.addEventListener('touchmove', (e) => {
        e.preventDefault();
        
        if (e.touches.length === 2) {
            // Pinch zoom
            const touch1 = e.touches[0];
            const touch2 = e.touches[1];
            const currentDistance = Math.sqrt(
                Math.pow(touch2.clientX - touch1.clientX, 2) +
                Math.pow(touch2.clientY - touch1.clientY, 2)
            );
            
            if (lastTouchDistance > 0) {
                const scale = currentDistance / initialTouchDistance;
                const newZoom = Math.max(minZoom, Math.min(maxZoom, initialZoom * scale));
                currentZoom = newZoom;
                updateZoomLevel();
                applyTransform();
            }
        } else if (e.touches.length === 1 && isDragging && currentZoom > 1) {
            // Single touch pan
            const touch = e.touches[0];
            translateX = touch.clientX - startX;
            translateY = touch.clientY - startY;
            applyTransform();
        }
    });

    container.addEventListener('touchend', () => {
        isDragging = false;
        lastTouchDistance = 0;
    });

    // Initialize
    updateZoomLevel();
    applyTransform();
}