// ===== Toast Notification System =====
// SVG 图标定义（使用 cloneNode 避免 XSS）
const TOAST_ICONS = {
    success: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>',
    error: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>',
    warning: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>',
    info: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>'
};

export function showToast(message, type = 'info') {
    let container = document.querySelector('.toast-container');
    if (!container) {
        container = document.createElement('div');
        container.className = 'toast-container';
        document.body.appendChild(container);
    }
    
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    // 使用 DOM API 避免 XSS
    const iconWrapper = document.createElement('span');
    iconWrapper.innerHTML = TOAST_ICONS[type] || TOAST_ICONS.info;
    toast.appendChild(iconWrapper);
    
    const messageSpan = document.createElement('span');
    messageSpan.textContent = message; // 使用 textContent 防止 XSS
    toast.appendChild(messageSpan);
    
    container.appendChild(toast);
    setTimeout(() => {
        toast.classList.add('removing');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// ===== Tool Running Simulation (single instance) =====
let activeToolOverlay = null;

// HTML 转义函数，防止 XSS
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

export function runToolSimulation(toolName) {
    // Remove any existing overlay first
    if (activeToolOverlay) {
        activeToolOverlay.remove();
        activeToolOverlay = null;
    }

    // 对 toolName 进行 HTML 转义，防止 XSS
    const safeToolName = escapeHtml(toolName);

    const overlay = document.createElement('div');
    overlay.className = 'tool-running-overlay';
    overlay.innerHTML = `
        <div class="tool-running-card">
            <div class="tool-running-content">
                <div class="spinner"></div>
                <h3>正在运行：${safeToolName}</h3>
                <p>正在处理中，请稍候...</p>
                <div class="progress-bar-container"><div class="progress-bar-fill" id="toolProgress"></div></div>
                <p id="toolProgressText" style="font-size:0.8rem;color:rgba(248,250,252,0.4)">0%</p>
            </div>
            <div class="tool-result-card" id="toolResult">
                <div class="result-icon">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>
                </div>
                <h3>${safeToolName} 运行完成</h3>
                <p style="color:rgba(248,250,252,0.5);font-size:0.9rem;margin-bottom:1.5rem">处理成功，请查看日志了解详情</p>
                <button class="btn btn-primary" id="toolCloseBtn">确定</button>
            </div>
        </div>`;
    document.body.appendChild(overlay);
    activeToolOverlay = overlay;

    const closeBtn = overlay.querySelector('#toolCloseBtn');
    closeBtn.addEventListener('click', () => {
        overlay.remove();
        activeToolOverlay = null;
    });

    let progress = 0;
    const interval = setInterval(() => {
        progress += Math.random() * 15;
        if (progress >= 100) {
            progress = 100;
            clearInterval(interval);
            setTimeout(() => {
                const content = overlay.querySelector('.tool-running-content');
                const result = overlay.querySelector('.tool-result-card');
                if (content) content.style.display = 'none';
                if (result) result.classList.add('show');
            }, 500);
        }
        const bar = document.getElementById('toolProgress');
        const text = document.getElementById('toolProgressText');
        if (bar) bar.style.width = progress + '%';
        if (text) text.textContent = Math.round(progress) + '%';
    }, 300);
}

// ===== Auth Management =====
export const Auth = {
    set(code) {
        // 写入 JSON 格式，兼容 authService.getAuth() 的 JSON.parse 解析
        localStorage.setItem('toolbox_auth', JSON.stringify({ auth_code: code }));
        localStorage.setItem('toolbox_login_time', Date.now());
    },
    get() {
        return localStorage.getItem('toolbox_auth');
    },
    clear() {
        localStorage.removeItem('toolbox_auth');
        localStorage.removeItem('toolbox_login_time');
        localStorage.removeItem('toolbox_token');
    },
    check() {
        return !!this.get();
    }
};

// ===== Countdown Timer =====
// 注意：此函数只计算一次倒计时，不会自动更新
// 如需持续更新，请使用 setInterval 配合此函数
export function calculateCountdown(targetDate) {
    const now = new Date().getTime();
    const distance = targetDate - now;
    if (distance <= 0) return { text: '已到期', expired: true };
    const days = Math.floor(distance / (1000 * 60 * 60 * 24));
    const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const mins = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
    return { text: `${days}天${hours}时${mins}分`, expired: false };
}

// ===== Time Formatting =====
// 格式化时间为 "月/日 时:分" 格式
export function formatTime(timeStr) {
    if (!timeStr) return '-';
    const d = new Date(timeStr);
    return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// 格式化日期为 "YYYY-MM-DD" 格式
export function formatDate(dateStr) {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('zh-CN');
}

// ===== Device ID (fixed) =====
export function getDeviceId() {
    let deviceId = localStorage.getItem('toolbox_device_id');
    if (!deviceId) {
        deviceId = 'DEV-' + Math.random().toString(36).substring(2, 10).toUpperCase();
        localStorage.setItem('toolbox_device_id', deviceId);
    }
    return deviceId;
}

export function getDeviceName() {
    let deviceName = localStorage.getItem('toolbox_device_name');
    if (!deviceName) {
        deviceName = 'DESKTOP-' + Math.random().toString(36).substring(2, 8).toUpperCase();
        localStorage.setItem('toolbox_device_name', deviceName);
    }
    return deviceName;
}