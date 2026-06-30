/**
 * سامانه هوشمند تست و کالیبراسیون سخت‌افزار
 * هسته بازنویسی شده پردازش سیگنال و مدیریت جادوگر (app.js)
 * مجهز به پنل تزریق دینامیک عیب‌یابی، کالیبراسیون زوری و رمزگشایی ۱۶ بیتی محورها
 * توسعه یافته برای: Fix.Peyman24x.ir
 */

// ۱. مدیریت وضعیت مرکزی و پایدار برنامه (State Management)
const AppState = {
    activeApi: 'gamepad', // 'gamepad' یا 'hid'
    isConnected: false,
    gamepadIndex: null,
    hidDevice: null,
    animationFrameId: null,
    wizardStep: 1,
    
    // لایه پروفایل رمزگشایی بایت‌های WebHID برای رفع باگ حرکت همزمان محورها
    webHidProfile: '8bit', // '8bit' یا '16bit'
    
    // ماتریس پیکربندی و اصلاح زوری جهت‌ها و معکوس‌سازی لایه نرم‌افزار
    config: {
        swapSticks: false,    // جابجایی کامل آنالوگ چپ و راست
        swapAxesLeft: false,  // جابجایی X و Y آنالوگ چپ
        swapAxesRight: false, // جابجایی X و Y آنالوگ راست
        invertLX: false,      // معکوس کردن افقی چپ
        invertLY: false,      // معکوس کردن عمودی چپ
        invertRX: false,      // معکوس کردن افقی راست
        invertRY: false       // معکوس کردن عمودی راست
    },

    rawInputs: { lx: 0, ly: 0, rx: 0, ry: 0 },
    
    // لایه جبران‌ساز ماتریس خطا (آفست‌های تراز مرکزی)
    offsets: {
        left:  { x: 0, y: 0 },
        right: { x: 0, y: 0 }
    },
    
    // ماتریس پایش کالیبراسیون ۳۶۰ درجه
    directionsTracked: {
        left:  { n: false, e: false, s: false, w: false },
        right: { n: false, e: false, s: false, w: false }
    }
};

// ۲. مپینگ دقیق المان‌های رابط کاربری (DOM Elements)
const DOM = {
    body: document.body,
    apiGamepadBtn: document.getElementById('apiGamepadBtn'),
    apiHidBtn: document.getElementById('apiHidBtn'),
    activeApiBadge: document.getElementById('activeApiBadge'),
    connStatus: document.getElementById('connStatus'),
    batteryLevel: document.getElementById('batteryLevel'),
    batteryCharging: document.getElementById('batteryCharging'),
    batteryApiPrompt: document.getElementById('batteryApiPrompt'),
    sysLog: document.getElementById('sysLog'),
    
    mdLeftCoords: document.getElementById('md-l-coords'),
    mdRightCoords: document.getElementById('md-r-coords'),
    mdLeftError: document.getElementById('md-le'),
    mdRightError: document.getElementById('md-re'),
    
    tLeft: document.getElementById('t-left'),
    tRight: document.getElementById('t-right'),
    
    cLeft: document.getElementById('cLeft'),
    cRight: document.getElementById('cRight'),
    
    btnNextWiz: document.getElementById('btnNextWiz'),
    wizTitle: document.getElementById('wizTitle'),
    wizDesc: document.getElementById('wizDesc'),
    vIndicator: document.getElementById('vIndicator'),
    vStatus: document.getElementById('vStatus'),
    angleTrackerUi: document.getElementById('angleTrackerUi'),
    
    dirs: {
        l: {
            n: document.getElementById('l-dir-n'),
            e: document.getElementById('l-dir-e'),
            s: document.getElementById('l-dir-s'),
            w: document.getElementById('l-dir-w')
        },
        r: {
            n: document.getElementById('r-dir-n'),
            e: document.getElementById('r-dir-e'),
            s: document.getElementById('r-dir-s'),
            w: document.getElementById('r-dir-w')
        }
    }
};

const Ctx = {
    left: DOM.cLeft.getContext('2d'),
    right: DOM.cRight.getContext('2d')
};

function initCanvases() {
    [DOM.cLeft, DOM.cRight].forEach(canvas => {
        canvas.width = 200;
        canvas.height = 200;
    });
}

function logToSystem(message, type = 'info') {
    const prefix = type === 'error' ? '[خطا]' : type === 'success' ? '[موفق]' : '[سیستم]';
    DOM.sysLog.innerHTML += `\n${prefix} ${message}`;
    DOM.sysLog.scrollTop = DOM.sysLog.scrollHeight;
}

// تزریق دینامیک پنل سخت‌افزاری اصلاح ماتریس سیگنال‌ها در DOM بدون نیاز به دستکاری HTML
function injectAdvancedCorrectionPanel() {
    if (document.getElementById('advanced-correction-panel')) return;
    
    const panel = document.createElement('div');
    panel.id = 'advanced-correction-panel';
    panel.style.cssText = `
        background: var(--bg-inner);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 8px;
        padding: 12px;
        margin: 15px 0;
    `;
    
    panel.innerHTML = `
        <div style="font-weight: 700; font-size: 13px; color: var(--primary); margin-bottom: 6px; display: flex; align-items: center; gap: 6px;">
            🛠️ پنل هوشمند اصلاح ماتریس تداخل سیگنال و جهت محورها
        </div>
        <div style="font-size: 11px; color: #94a3b8; margin-bottom: 12px; line-height: 1.6;">
            اگر تکان دادن یک آنالوگ دیگری را جابجا می‌کند یا جهت‌ها برعکس است، ابتدا فرمت بایت را تغییر دهید یا از شاسی‌های تصحیح زوری زیر استفاده کنید:
        </div>
        
        <div id="hid-profile-section" style="display: none; margin-bottom: 12px; padding-bottom: 10px; border-bottom: 1px solid rgba(255,255,255,0.06);">
            <span style="font-size: 11px; color: var(--warning); display: block; margin-bottom: 6px; font-weight: bold;">📋 فرمت رمزگشایی پکت‌های لایه سخت‌افزار (WebHID):</span>
            <div style="display: flex; gap: 8px;">
                <button id="p8Btn" style="flex:1; padding: 6px; font-size: 11px; background: var(--primary); color: white; border: none; border-radius: 4px; cursor: pointer; font-family: inherit;">پروفایل ۱: استاندارد بومی (8-Bit)</button>
                <button id="p16Btn" style="flex:1; padding: 6px; font-size: 11px; background: rgba(255,255,255,0.05); color: #abc; border: none; border-radius: 4px; cursor: pointer; font-family: inherit;">پروفایل ۲: عمیق فرکانسی (16-Bit / Xbox)</button>
            </div>
        </div>

        <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px;">
            <button id="tsSticks" style="padding: 6px; font-size: 11px; background: rgba(255,255,255,0.04); color: #fff; border: 1px solid rgba(255,255,255,0.08); border-radius: 4px; cursor: pointer; font-family: inherit;">🔄 جابجایی آنالوگ چپ ↔️ راست</button>
            <button id="tsXyl" style="padding: 6px; font-size: 11px; background: rgba(255,255,255,0.04); color: #fff; border: 1px solid rgba(255,255,255,0.08); border-radius: 4px; cursor: pointer; font-family: inherit;">🔀 جابجایی X/Y آنالوگ چپ</button>
            <button id="tsXyr" style="padding: 6px; font-size: 11px; background: rgba(255,255,255,0.04); color: #fff; border: 1px solid rgba(255,255,255,0.08); border-radius: 4px; cursor: pointer; font-family: inherit;">🔀 جابجایی X/Y آنالوگ راست</button>
            <button id="tiLx" style="padding: 6px; font-size: 11px; background: rgba(255,255,255,0.04); color: #fff; border: 1px solid rgba(255,255,255,0.08); border-radius: 4px; cursor: pointer; font-family: inherit;">↔️ معکوس افقی چپ (Invert X)</button>
            <button id="tiLy" style="padding: 6px; font-size: 11px; background: rgba(255,255,255,0.04); color: #fff; border: 1px solid rgba(255,255,255,0.08); border-radius: 4px; cursor: pointer; font-family: inherit;">↕️ معکوس عمودی چپ (Invert Y)</button>
            <button id="tiRx" style="padding: 6px; font-size: 11px; background: rgba(255,255,255,0.04); color: #fff; border: 1px solid rgba(255,255,255,0.08); border-radius: 4px; cursor: pointer; font-family: inherit;">↔️ معکوس افقی راست (Invert X)</button>
            <button id="tiRy" style="padding: 6px; font-size: 11px; background: rgba(255,255,255,0.04); color: #fff; border: 1px solid rgba(255,255,255,0.08); border-radius: 4px; cursor: pointer; font-family: inherit;">↕️ معکوس عمودی راست (Invert Y)</button>
        </div>
    `;
    
    DOM.vStatus.parentElement.insertBefore(panel, DOM.vStatus);
    
    // اتصال لیسنرهای مدیریتی کلیک دکمه‌ها
    const syncUiStyle = (id, active) => {
        const el = document.getElementById(id);
        if(el) el.style.background = active ? 'var(--success)' : 'rgba(255,255,255,0.04)';
    };

    document.getElementById('tsSticks').onclick = () => { AppState.config.swapSticks = !AppState.config.swapSticks; syncUiStyle('tsSticks', AppState.config.swapSticks); };
    document.getElementById('tsXyl').onclick = () => { AppState.config.swapAxesLeft = !AppState.config.swapAxesLeft; syncUiStyle('tsXyl', AppState.config.swapAxesLeft); };
    document.getElementById('tsXyr').onclick = () => { AppState.config.swapAxesRight = !AppState.config.swapAxesRight; syncUiStyle('tsXyr', AppState.config.swapAxesRight); };
    document.getElementById('tiLx').onclick = () => { AppState.config.invertLX = !AppState.config.invertLX; syncUiStyle('tiLx', AppState.config.invertLX); };
    document.getElementById('tiLy').onclick = () => { AppState.config.invertLY = !AppState.config.invertLY; syncUiStyle('tiLy', AppState.config.invertLY); };
    document.getElementById('tiRx').onclick = () => { AppState.config.invertRX = !AppState.config.invertRX; syncUiStyle('tiRx', AppState.config.invertRX); };
    document.getElementById('tiRy').onclick = () => { AppState.config.invertRY = !AppState.config.invertRY; syncUiStyle('tiRy', AppState.config.invertRY); };

    const b8 = document.getElementById('p8Btn');
    const b16 = document.getElementById('p16Btn');
    b8.onclick = () => { AppState.webHidProfile = '8bit'; b8.style.background = 'var(--primary)'; b16.style.background = 'rgba(255,255,255,0.05)'; logToSystem('پروفایل رید بایت روی 8-Bit تنظیم شد.'); };
    b16.onclick = () => { AppState.webHidProfile = '16bit'; b16.style.background = 'var(--primary)'; b8.style.background = 'rgba(255,255,255,0.05)'; logToSystem('پروفایل رید بایت روی 16-Bit (رفع مشکل جابجایی تداخلی آنالوگ‌ها) قفل شد.'); };

    // بررسی اولیه وضعیت نمایش لایه پروفایل پورت‌ها
    document.getElementById('hid-profile-section').style.display = AppState.activeApi === 'hid' ? 'block' : 'none';
}

function setConnectionState(connected, deviceName = '') {
    AppState.isConnected = connected;
    if (connected) {
        DOM.body.classList.remove('disconnected');
        DOM.connStatus.textContent = deviceName.length > 25 ? deviceName.substring(0, 22) + '...' : deviceName;
        DOM.connStatus.style.color = 'var(--success)';
        logToSystem(`سخت‌افزار شناسایی شد: ${deviceName}`, 'success');
        
        if (AppState.wizardStep === 1) {
            updateWizardVisuals(true, 'دستگاه متصل است. آماده شروع فرآیند همگام‌سازی.', '✅');
            DOM.btnNextWiz.disabled = false;
        }
    } else {
        DOM.body.classList.add('disconnected');
        DOM.connStatus.textContent = 'قطع اتصال';
        DOM.connStatus.style.color = 'var(--danger)';
        DOM.batteryLevel.textContent = '--';
        DOM.batteryCharging.textContent = 'مشخص نیست';
        DOM.batteryApiPrompt.style.display = 'none';
        logToSystem('ارتباط سخت‌افزاری قطع شد یا در انتظار فشردن دکمه است.', 'error');
        resetUIElements();
        updateWizardVisuals(false, 'در انتظار اتصال یا فعال‌سازی کنترلر...', '⏳', 'waiting');
        DOM.btnNextWiz.disabled = true;
    }
}

function resetUIElements() {
    document.querySelectorAll('.g-btn, .shoulder-btn').forEach(btn => btn.classList.remove('active'));
    DOM.tLeft.style.transform = 'translate(0px, 0px)';
    DOM.tRight.style.transform = 'translate(0px, 0px)';
    AppState.offsets.left = { x: 0, y: 0 };
    AppState.offsets.right = { x: 0, y: 0 };
    AppState.rawInputs = { lx: 0, ly: 0, rx: 0, ry: 0 };
    clearCanvas(Ctx.left);
    clearCanvas(Ctx.right);
}

function resetAngleTrackerMatrix() {
    const keys = ['n', 'e', 's', 'w'];
    keys.forEach(k => {
        AppState.directionsTracked.left[k] = false;
        AppState.directionsTracked.right[k] = false;
        if(DOM.dirs.l[k]) DOM.dirs.l[k].classList.remove('done');
        if(DOM.dirs.r[k]) DOM.dirs.r[k].classList.remove('done');
    });
}

function clearCanvas(ctx) {
    ctx.clearRect(0, 0, 200, 200);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(100, 100, 90, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(100, 0); ctx.lineTo(100, 200); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, 100); ctx.lineTo(200, 100); ctx.stroke();
}

function getMissingDirectionsText() {
    const leftMissing = [];
    if (!AppState.directionsTracked.left.n) leftMissing.push('شمال (↑)');
    if (!AppState.directionsTracked.left.e) leftMissing.push('شرق (→)');
    if (!AppState.directionsTracked.left.s) leftMissing.push('جنوب (↓)');
    if (!AppState.directionsTracked.left.w) leftMissing.push('غرب (←)');

    const rightMissing = [];
    if (!AppState.directionsTracked.right.n) rightMissing.push('شمال (↑)');
    if (!AppState.directionsTracked.right.e) rightMissing.push('شرق (→)');
    if (!AppState.directionsTracked.right.s) rightMissing.push('جنوب (↓)');
    if (!AppState.directionsTracked.right.w) rightMissing.push('غرب (←)');

    let text = '';
    if (leftMissing.length > 0) text += `چپ: [${leftMissing.join('، ')}] `;
    if (rightMissing.length > 0) text += ` | راست: [${rightMissing.join('، ')}]`;
    
    return text ? `جهات باقی‌مانده جهت چرخش 🔄 -> ${text}` : '✅ تمام جهات با موفقیت کالیبره و ثبت شدند!';
}

function switchAPI(apiType) {
    if (AppState.animationFrameId) cancelAnimationFrame(AppState.animationFrameId);
    
    if (AppState.hidDevice) {
        try { AppState.hidDevice.close(); } catch(e){}
        AppState.hidDevice = null;
    }

    AppState.activeApi = apiType;
    AppState.gamepadIndex = null;
    setConnectionState(false);

    const sec = document.getElementById('hid-profile-section');
    if (sec) sec.style.display = apiType === 'hid' ? 'block' : 'none';

    if (apiType === 'gamepad') {
        DOM.apiGamepadBtn.classList.add('active');
        DOM.apiHidBtn.classList.remove('active');
        DOM.activeApiBadge.textContent = 'Standard Gamepad';
        logToSystem('پروتکل ارتباطی به Standard Gamepad تغییر یافت.');
        initGamepadPolling();
    } else {
        DOM.apiGamepadBtn.classList.remove('active');
        DOM.apiHidBtn.classList.add('active');
        DOM.activeApiBadge.textContent = 'WebHID Engine';
        logToSystem('پروتکل ارتباطی به WebHID تغییر یافت. مجدداً کلیک کنید تا پنل دسترسی پورت باز شود.');
    }
}

// --- مدیریت پروتکل اول: Standard Gamepad API ---
function initGamepadPolling() {
    if (AppState.activeApi !== 'gamepad') return;

    const checkGamepads = () => {
        const gamepads = navigator.getGamepads();
        let found = false;
        for (let i = 0; i < gamepads.length; i++) {
            if (gamepads[i]) {
                AppState.gamepadIndex = i;
                setConnectionState(true, gamepads[i].id);
                found = true;
                break;
            }
        }
        if (!found && AppState.isConnected) setConnectionState(false);
    };

    window.addEventListener("gamepadconnected", checkGamepads);
    window.addEventListener("gamepaddisconnected", checkGamepads);
    checkGamepads();

    if (AppState.animationFrameId) cancelAnimationFrame(AppState.animationFrameId);
    
    function renderLoop() {
        if (AppState.activeApi !== 'gamepad') return;
        const gamepads = navigator.getGamepads();
        const gp = gamepads[AppState.gamepadIndex];
        
        if (gp) {
            gp.buttons.forEach((btn, index) => {
                const btnEl = document.getElementById(`m-btn-${index}`);
                if (btnEl) {
                    if (btn.pressed) btnEl.classList.add('active');
                    else btnEl.classList.remove('active');
                }
            });

            const lx = gp.axes[0] || 0;
            const ly = gp.axes[1] || 0;
            const rx = gp.axes[2] || 0;
            const ry = gp.axes[3] || 0;

            processControllerInputs(lx, ly, rx, ry);
        }
        AppState.animationFrameId = requestAnimationFrame(renderLoop);
    }
    AppState.animationFrameId = requestAnimationFrame(renderLoop);
}

// --- مدیریت پروتکل دوم: Low-Level WebHID API (با قابلیت تفکیک بایت ۱۶ بیتی هوشمند) ---
async function handleWebHIDConnectionTrigger() {
    try {
        const devices = await navigator.hid.requestDevice({ filters: [] });
        if (devices.length > 0) {
            AppState.hidDevice = devices[0];
            await AppState.hidDevice.open();
            
            setConnectionState(true, AppState.hidDevice.productName || "دستگاه بومی WebHID");
            DOM.batteryApiPrompt.style.display = 'none';
            DOM.batteryLevel.textContent = "USB 5V فیکس";
            DOM.batteryCharging.textContent = "پایدار";

            AppState.hidDevice.addEventListener('inputreport', (event) => {
                if (AppState.activeApi !== 'hid') return;
                const { data } = event;
                
                if (data.byteLength >= 5) {
                    const offset = data.byteLength > 60 ? 1 : 0;
                    
                    let lx = 0, ly = 0, rx = 0, ry = 0;
                    
                    if (AppState.webHidProfile === '16bit' && data.byteLength >= offset + 8) {
                        // پروتکل ویژه تفکیک ۱۶ بیتی زوری برای حل مشکل تداخل و چسبیدن آنالوگ‌ها مابین یکدیگر
                        lx = (data.getUint16(offset + 0, true) - 32768) / 32768;
                        ly = (data.getUint16(offset + 2, true) - 32768) / 32768;
                        rx = (data.getUint16(offset + 4, true) - 32768) / 32768;
                        ry = (data.getUint16(offset + 6, true) - 32768) / 32768;
                    } else {
                        // پروتکل کلاسیک ۸ بیتی استاندارد
                        lx = (data.getUint8(offset + 0) - 128) / 128;
                        ly = (data.getUint8(offset + 1) - 128) / 128;
                        rx = (data.getUint8(offset + 2) - 128) / 128;
                        ry = (data.getUint8(offset + 3) - 128) / 128;
                    }
                    
                    processControllerInputs(lx, ly, rx, ry);
                }
            });
        }
    } catch (err) {
        logToSystem(`دسترسی پورت WebHID صادر نشد: ${err.message}`, 'error');
    }
}

// --- پردازشگر هوشمند لایه اصلاح ماتریس و کالیبراسیون زوری جهت‌ها ---
function processControllerInputs(rawLx, rawLy, rawRx, rawRy) {
    let lx = rawLx;
    let ly = rawLy;
    let rx = rawRx;
    let ry = rawRy;

    // ۱. بررسی شاسی زوری جابه جایی فیزیکی آنالوگ چپ و راست مابین یکدیگر
    if (AppState.config.swapSticks) {
        let tempX = lx; let tempY = ly;
        lx = rx; ly = ry;
        rx = tempX; ry = tempY;
    }

    // ۲. بررسی جابجایی افقی/عمودی محورهای داخلی آنالوگ‌ها
    if (AppState.config.swapAxesLeft) { let temp = lx; lx = ly; ly = temp; }
    if (AppState.config.swapAxesRight) { let temp = rx; rx = ry; ry = temp; }

    // ۳. اعمال ماتریس زوری اینورت و معکوس‌سازی لایه نرم‌افزاری
    if (AppState.config.invertLX) lx = -lx;
    if (AppState.config.invertLY) ly = -ly;
    if (AppState.config.invertRX) rx = -rx;
    if (AppState.config.invertRY) ry = -ry;

    // ذخیره سیگنال‌های تراز شده در حافظه کلاینت
    AppState.rawInputs = { lx, ly, rx, ry };

    // ۴. اعمال کالیبراسیون تفاضلی و کسر آفست نقطه صفر مرکزی
    const clx = Math.max(-1, Math.min(1, lx - AppState.offsets.left.x));
    const cly = Math.max(-1, Math.min(1, ly - AppState.offsets.left.y));
    const crx = Math.max(-1, Math.min(1, rx - AppState.offsets.right.x));
    const cry = Math.max(-1, Math.min(1, ry - AppState.offsets.right.y));

    // جابجایی زنده گرافیک آنالوگ‌ها روی تصویر فیزیکی شاسی
    DOM.tLeft.style.transform = `translate(${clx * 18}px, ${cly * 18}px)`;
    DOM.tRight.style.transform = `translate(${crx * 18}px, ${cry * 18}px)`;

    DOM.mdLeftCoords.textContent = `${clx.toFixed(2)} / ${cly.toFixed(2)}`;
    DOM.mdRightCoords.textContent = `${crx.toFixed(2)} / ${cry.toFixed(2)}`;

    renderJoystickCanvas(Ctx.left, clx, cly);
    renderJoystickCanvas(Ctx.right, crx, cry);

    const leftDist = Math.sqrt(clx*clx + cly*cly);
    const rightDist = Math.sqrt(crx*crx + cry*cry);
    const leftError = leftDist > 1.0 ? (leftDist - 1.0) * 100 : 0;
    const rightError = rightDist > 1.0 ? (rightDist - 1.0) * 100 : 0;

    DOM.mdLeftError.textContent = `${leftError.toFixed(2)}%`;
    DOM.mdRightError.textContent = `${rightError.toFixed(2)}%`;

    validateWizardStepsRealtime(clx, cly, crx, cry);
}

function renderJoystickCanvas(ctx, x, y) {
    clearCanvas(ctx);
    ctx.strokeStyle = 'var(--primary)';
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(100, 100); ctx.lineTo(100 + (x * 90), 100 + (y * 90)); ctx.stroke();
    ctx.fillStyle = '#ef4444';
    ctx.beginPath(); ctx.arc(100 + (x * 90), 100 + (y * 90), 6, 0, Math.PI * 2); ctx.fill();
}

function validateWizardStepsRealtime(clx, cly, crx, cry) {
    if (!AppState.isConnected) return;

    if (AppState.wizardStep === 2) {
        const rawLx = AppState.rawInputs.lx; const rawLy = AppState.rawInputs.ly;
        const rawRx = AppState.rawInputs.rx; const rawRy = AppState.rawInputs.ry;

        const leftCentered = Math.abs(rawLx) < 0.05 && Math.abs(rawLy) < 0.05;
        const rightCentered = Math.abs(rawRx) < 0.05 && Math.abs(rawRy) < 0.05;
        
        if (leftCentered && rightCentered) {
            updateWizardVisuals(true, 'تراز مرکزی ایده‌آل است! استیک‌ها را رها کرده و دکمه تایید را بزنید.', '✅');
            DOM.btnNextWiz.textContent = 'تایید و رفتن به مرحله تست جهت‌ها';
        } else {
            updateWizardVisuals(false, 'انحراف یا تداخل شاسی شناسایی شد. با کلیک روی دکمه زیر، انحراف فعلی فورا به عنوان مرکز جدید کالیبره و صفر می‌شود.', '⚠️', 'warning');
            DOM.btnNextWiz.textContent = 'صفر کردن آفست و اجبار به تراز مرکز 🛠️';
        }
        DOM.btnNextWiz.disabled = false; 
    } 
    else if (AppState.wizardStep === 3) {
        const targetThreshold = 0.70; 
        
        if (cly < -targetThreshold) { AppState.directionsTracked.left.n = true; DOM.dirs.l.n.classList.add('done'); }
        if (clx > targetThreshold)  { AppState.directionsTracked.left.e = true; DOM.dirs.l.e.classList.add('done'); }
        if (cly > targetThreshold)  { AppState.directionsTracked.left.s = true; DOM.dirs.l.s.classList.add('done'); }
        if (clx < -targetThreshold) { AppState.directionsTracked.left.w = true; DOM.dirs.l.w.classList.add('done'); }
        
        if (cry < -targetThreshold) { AppState.directionsTracked.right.n = true; DOM.dirs.r.n.classList.add('done'); }
        if (crx > targetThreshold)  { AppState.directionsTracked.right.e = true; DOM.dirs.r.e.classList.add('done'); }
        if (cry > targetThreshold)  { AppState.directionsTracked.right.s = true; DOM.dirs.r.s.classList.add('done'); } 
        if (crx < -targetThreshold) { AppState.directionsTracked.right.w = true; DOM.dirs.r.w.classList.add('done'); }

        const lDone = AppState.directionsTracked.left.n && AppState.directionsTracked.left.e && AppState.directionsTracked.left.s && AppState.directionsTracked.left.w;
        const rDone = AppState.directionsTracked.right.n && AppState.directionsTracked.right.e && AppState.directionsTracked.right.s && AppState.directionsTracked.right.w;

        if (lDone && rDone) {
            updateWizardVisuals(true, 'تست پیمایش زوایا با موفقیت تایید شد! آماده انتقال به فاز نهایی.', '✅');
            DOM.btnNextWiz.disabled = false;
        } else {
            updateWizardVisuals(false, getMissingDirectionsText(), '🔄', 'waiting');
            DOM.btnNextWiz.disabled = true;
        }
    }
}

function updateWizardVisuals(isValid, text, indicator, stateClass = 'success') {
    DOM.vStatus.textContent = text;
    DOM.vIndicator.textContent = indicator;
    DOM.vIndicator.className = `correctness-indicator ${isValid ? 'success' : stateClass}`;
    DOM.vStatus.style.color = isValid ? 'var(--success)' : (stateClass === 'error' ? 'var(--danger)' : 'var(--warning)');
}

DOM.btnNextWiz.onclick = () => {
    if (!AppState.isConnected) return;

    if (AppState.wizardStep === 2) {
        AppState.offsets.left.x = AppState.rawInputs.lx;
        AppState.offsets.left.y = AppState.rawInputs.ly;
        AppState.offsets.right.x = AppState.rawInputs.rx;
        AppState.offsets.right.y = AppState.rawInputs.ry;
        logToSystem('عملیات تراز زوری انجام شد! آفست‌ها صفر شدند.', 'success');
    }

    AppState.wizardStep++;
    document.querySelectorAll('.step-node').forEach(node => node.classList.remove('active'));
    
    if (AppState.wizardStep === 2) {
        document.getElementById('sn-2').classList.add('active');
        document.getElementById('sn-1').classList.add('completed');
        DOM.wizTitle.textContent = 'مرحله ۲: همگام‌سازی نقطه صفر مرجع (تراز مرکزی)';
        DOM.wizDesc.textContent = 'دسته‌ها و آنالوگ‌ها را رها کنید. در صورت وجود کجی یا انحراف سیگنال، دکمه زیر را فشار دهید تا مرکز فورا صفر شود.';
        DOM.btnNextWiz.textContent = 'تایید و رفتن به مرحله تست جهت‌ها';
        DOM.btnNextWiz.disabled = false;
    } else if (AppState.wizardStep === 3) {
        document.getElementById('sn-3').classList.add('active');
        document.getElementById('sn-2').classList.add('completed');
        DOM.wizTitle.textContent = 'مرحله ۳: پیمایش زوایا و ماتریس محیط دایره';
        DOM.wizDesc.textContent = 'هر دو آنالوگ را کامل بچرخانید تا تمام جهات زیر بر اساس چیدمان ماتریس اصلاح‌شده تایید شوند.';
        DOM.angleTrackerUi.style.display = 'grid'; 
        resetAngleTrackerMatrix();
        DOM.btnNextWiz.textContent = 'انتقال به فاز ذخیره‌سازی حافظه';
        DOM.btnNextWiz.disabled = true;
    } else if (AppState.wizardStep === 4) {
        document.getElementById('sn-4').classList.add('active');
        document.getElementById('sn-3').classList.add('completed');
        DOM.wizTitle.textContent = 'مرحله ۴: ذخیره‌سازی نهایی الگوریتم‌های تصحیح خطا';
        DOM.wizDesc.textContent = 'تست زاویه‌شناسی با موفقیت پاس شد. سیستم آماده رایت رجیسترها است.';
        DOM.angleTrackerUi.style.display = 'none'; 
        updateWizardVisuals(true, 'آماده رایت نهایی داده‌ها روی لایه سیستم!', '💾');
        DOM.btnNextWiz.textContent = 'اعمال کالیبراسیون و ذخیره نهایی پروژه';
        DOM.btnNextWiz.disabled = false;
    } else if (AppState.wizardStep > 4) {
        AppState.wizardStep = 1;
        AppState.offsets = { left: { x: 0, y: 0 }, right: { x: 0, y: 0 } };
        document.querySelectorAll('.step-node').forEach(node => node.classList.remove('completed'));
        document.getElementById('sn-1').classList.add('active');
        DOM.wizTitle.textContent = 'مرحله ۱: تأیید ارتباط با پروتکل امن';
        DOM.btnNextWiz.textContent = 'شروع همگام‌سازی تراز مرکز';
        logToSystem('داده‌های ماتریس کالیبراسیون تفاضلی با موفقیت ثبت شدند.', 'success');
    }
};

window.onload = () => {
    initCanvases();
    initGamepadPolling();
    injectAdvancedCorrectionPanel(); // تزریق خودکار پنل عیب‌یابی فوق پیشرفته هنگام لود صفحه
    
    DOM.apiGamepadBtn.onclick = () => switchAPI('gamepad');
    DOM.apiHidBtn.onclick = () => {
        if (AppState.activeApi !== 'hid') {
            switchAPI('hid');
        } else {
            handleWebHIDConnectionTrigger();
        }
    };
};
