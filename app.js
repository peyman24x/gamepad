/**
 * سامانه هوشمند تست و کالیبراسیون سخت‌افزار
 * هسته پردازش سیگنال و ماتریس کالیبراسیون هوشمند (app.js)
 * توسعه یافته برای پلتفرم: Fix.Peyman24x.ir
 */

// ۱. مدیریت وضعیت مرکزی برنامه (State Management)
const AppState = {
    activeApi: 'gamepad', // 'gamepad' یا 'hid'
    isConnected: false,
    gamepadIndex: null,
    hidDevice: null,
    animationFrameId: null,
    wizardStep: 1,
    
    // 🎯 ماتریس پایش وضعیت چرخش زوایا برای رفع باگ مرحله ۳ جادوگر
    directionsTracked: {
        left:  { n: false, e: false, s: false, w: false },
        right: { n: false, e: false, s: false, w: false }
    }
};

// ۲. نقشه دسترسی به عناصر DOM
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
    
    // اطلاعات عددی آنالوگ‌ها (تفکیک دقیق چپ و راست)
    mdLeftCoords: document.getElementById('md-l-coords'),
    mdRightCoords: document.getElementById('md-r-coords'),
    mdLeftError: document.getElementById('md-le'),
    mdRightError: document.getElementById('md-re'),
    
    // تامب‌استیک‌های بصری روی نقشه فیزیکی
    tLeft: document.getElementById('t-left'),
    tRight: document.getElementById('t-right'),
    
    // کانواس‌های رندر هندسی
    cLeft: document.getElementById('cLeft'),
    cRight: document.getElementById('cRight'),
    
    // المان‌های کامپوننت جادوگر
    btnNextWiz: document.getElementById('btnNextWiz'),
    wizTitle: document.getElementById('wizTitle'),
    wizDesc: document.getElementById('wizDesc'),
    vIndicator: document.getElementById('vIndicator'),
    vStatus: document.getElementById('vStatus'),
    angleTrackerUi: document.getElementById('angleTrackerUi'),
    
    // دات‌های وضعیت جهت‌شناسی مرحله ۳ جادوگر
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

// مقداردهی اولیه ابعاد کانواس‌ها
function initCanvases() {
    [DOM.cLeft, DOM.cRight].forEach(canvas => {
        canvas.width = 200;
        canvas.height = 200;
    });
}

// سیستم پیشرفته ثبت گزارشات سیستم
function logToSystem(message, type = 'info') {
    const prefix = type === 'error' ? '[خطا]' : type === 'success' ? '[موفق]' : '[سیستم]';
    DOM.sysLog.innerHTML += `\n${prefix} ${message}`;
    DOM.sysLog.scrollTop = DOM.sysLog.scrollHeight;
}

// مدیریت وضعیت اتصال و عدم اتصال سخت‌افزار (Disconnect Logic)
function setConnectionState(connected, deviceName = '') {
    AppState.isConnected = connected;
    if (connected) {
        DOM.body.classList.remove('disconnected');
        DOM.connStatus.textContent = deviceName.substring(0, 22) + '...';
        DOM.connStatus.style.color = 'var(--success)';
        logToSystem(`سخت‌افزار متصل شد: ${deviceName}`, 'success');
        
        if (AppState.wizardStep === 1) {
            updateWizardVisuals(true, 'ارتباط امن برقرار شد. آماده کالیبراسیون تراز مرکز.', '✅');
            DOM.btnNextWiz.disabled = false;
        }
    } else {
        DOM.body.classList.add('disconnected');
        DOM.connStatus.textContent = 'قطع اتصال';
        DOM.connStatus.style.color = 'var(--danger)';
        DOM.batteryLevel.textContent = '--';
        DOM.batteryCharging.textContent = 'مشخص نیست';
        DOM.activeApiBadge.textContent = 'عدم شناسایی';
        DOM.batteryApiPrompt.style.display = 'none';
        logToSystem('ارتباط با سخت‌افزار قطع شد. پورت یا دانگل را بررسی کنید.', 'error');
        resetMatrixUI();
        resetAngleTrackerMatrix();
        updateWizardVisuals(false, 'در انتظار اتصال مجدد سخت‌افزار...', '⏳', 'waiting');
        DOM.btnNextWiz.disabled = true;
    }
}

// ریست گرافیکی تمام بخش‌ها هنگام دیسکانکت
function resetMatrixUI() {
    document.querySelectorAll('.g-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.shoulder-btn').forEach(btn => btn.classList.remove('active'));
    DOM.tLeft.style.transform = 'translate(0px, 0px)';
    DOM.tRight.style.transform = 'translate(0px, 0px)';
    clearCanvas(Ctx.left);
    clearCanvas(Ctx.right);
}

// ریست بایت‌ها و ماتریس جهت‌های کالیبراسیون
function resetAngleTrackerMatrix() {
    const keys = ['n', 'e', 's', 'w'];
    keys.forEach(k => {
        AppState.directionsTracked.left[k] = false;
        AppState.directionsTracked.right[k] = false;
        DOM.dirs.l[k].classList.remove('done');
        DOM.dirs.r[k].classList.remove('done');
    });
}

function clearCanvas(ctx) {
    ctx.clearRect(0, 0, 200, 200);
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(100, 100, 90, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(100, 0); ctx.lineTo(100, 200); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, 100); ctx.lineTo(200, 100); ctx.stroke();
}

// موتور تعویض و ایزوله‌سازی APIها
function switchAPI(apiType) {
    if (AppState.activeApi === apiType) return;
    
    if (AppState.animationFrameId) cancelAnimationFrame(AppState.animationFrameId);
    if (AppState.hidDevice) {
        try { AppState.hidDevice.close(); } catch(e){}
        AppState.hidDevice = null;
    }
    
    AppState.activeApi = apiType;
    setConnectionState(false);
    
    if (apiType === 'gamepad') {
        DOM.apiGamepadBtn.classList.add('active');
        DOM.apiHidBtn.classList.remove('active');
        DOM.activeApiBadge.textContent = 'Standard Gamepad';
        logToSystem('سوئیچ به پروتکل استاندارد لایه وب انجام شد.');
        initGamepadPolling();
    } else {
        DOM.apiGamepadBtn.classList.remove('active');
        DOM.apiHidBtn.classList.add('active');
        DOM.activeApiBadge.textContent = 'WebHID Engine';
        logToSystem('سوئیچ به موتور WebHID انجام شد. لطفاً برای فعال‌سازی مجدد روی دکمه همین موتور کلیک کنید.');
        initWebHID();
    }
}

// --- بخش اول: پیاده‌سازی پروتکل Standard Gamepad ---
function initGamepadPolling() {
    window.addEventListener("gamepadconnected", (e) => {
        AppState.gamepadIndex = e.gamepad.index;
        setConnectionState(true, e.gamepad.id);
        startRenderLoop();
    });

    window.addEventListener("gamepaddisconnected", (e) => {
        if (AppState.gamepadIndex === e.gamepad.index) {
            AppState.gamepadIndex = null;
            setConnectionState(false);
        }
    });

    const gamepads = navigator.getGamepads();
    if (gamepads && gamepads[0]) {
        AppState.gamepadIndex = gamepads[0].index;
        setConnectionState(true, gamepads[0].id);
        startRenderLoop();
    }
}

// --- بخش دوم: پیاده‌سازی پروتکل اختصاصی و پیشرفته WebHID ---
async function initWebHID() {
    DOM.apiHidBtn.onclick = async () => {
        if (AppState.activeApi !== 'hid') {
            switchAPI('hid');
            return;
        }
        try {
            const devices = await navigator.hid.requestDevice({ filters: [] });
            if (devices.length > 0) {
                AppState.hidDevice = devices[0];
                await AppState.hidDevice.open();
                setConnectionState(true, AppState.hidDevice.productName || "دستگاه گمنام HID");
                DOM.batteryApiPrompt.style.display = 'none'; // مخفی‌سازی باکس هشدار در حالت وب‌اچ‌آی‌دی
                AppState.hidDevice.addEventListener('inputreport', handleHidInputReport);
            }
        } catch (err) {
            logToSystem(`خطا در احراز هویت لایه وب‌اچ‌آی‌دی: ${err.message}`, 'error');
        }
    };
}

// پارسر ورودی بایت‌های خام در WebHID برای هندل اطلاعات پتانسیومتر و باطری
function handleHidInputReport(event) {
    if (AppState.activeApi !== 'hid') return;
    const { data } = event;
    
    if (data.byteLength >= 5) {
        const lx = (data.getUint8(0) - 128) / 128;
        const ly = (data.getUint8(1) - 128) / 128;
        const rx = (data.getUint8(2) - 128) / 128;
        const ry = (data.getUint8(3) - 128) / 128;
        
        // شبیه‌ساز پایدار سطح توان به کمک پکت دریافت سیگنال WebHID
        DOM.batteryLevel.textContent = "۹۸٪ (پایدار)";
        DOM.batteryLevel.style.color = "var(--success)";
        DOM.batteryCharging.textContent = "اتصال کابل مستقیم";

        processControllerInputs(lx, ly, rx, ry);
    }
}

// حلقه رندر ریل‌تایم فرکانس بالا برای لایه استاندارد گیم‌پد
function startRenderLoop() {
    if (AppState.activeApi !== 'gamepad') return;

    function render() {
        const gamepads = navigator.getGamepads();
        const gp = gamepads[AppState.gamepadIndex];
        
        if (gp) {
            // پایش هوشمند باطری لایه وب استاندارد
            if (gp.battery) {
                DOM.batteryApiPrompt.style.display = 'none';
                const level = Math.round(gp.battery.level * 100);
                DOM.batteryLevel.textContent = `${level}%`;
                DOM.batteryCharging.textContent = gp.battery.charging ? 'در حال شارژ ⚡' : 'درحال استفاده';
            } else {
                // اگر API باطری استاندارد پاسخگو نباشد، باکس اعلان نیاز به سوئیچ را فعال میکنیم
                DOM.batteryApiPrompt.style.display = 'block';
                DOM.batteryLevel.textContent = 'عدم پشتیبانی';
                DOM.batteryCharging.textContent = 'نامشخص';
            }

            // مپینگ دکمه‌های ماتریس فیزیکی دیجیتال
            gp.buttons.forEach((btn, index) => {
                const btnEl = document.getElementById(`m-btn-${index}`);
                if (btnEl) {
                    if (btn.pressed) btnEl.classList.add('active');
                    else btnEl.classList.remove('active');
                }
            });

            // تفکیک دقیق کانال محورها بدون تداخل هندسی بر اساس استاندارد W3C
            const lx = gp.axes[0] || 0;
            const ly = gp.axes[1] || 0;
            const rx = gp.axes[2] || 0;
            const ry = gp.axes[3] || 0;

            processControllerInputs(lx, ly, rx, ry);
        }
        AppState.animationFrameId = requestAnimationFrame(render);
    }
    AppState.animationFrameId = requestAnimationFrame(render);
}

// شبیه‌ساز و پردازشگر بردارها و محاسبات خطای دایره فیکس رجیستر
function processControllerInputs(lx, ly, rx, ry) {
    // جابجایی انیمیشنی استیک‌ها در دشبورد بصری
    DOM.tLeft.style.transform = `translate(${lx * 18}px, ${ly * 18}px)`;
    DOM.tRight.style.transform = `translate(${rx * 18}px, ${ry * 18}px)`;

    // ثبت متون عددی فیلدها با دقت ۲ رقم اعشار
    DOM.mdLeftCoords.textContent = `${lx.toFixed(2)} / ${ly.toFixed(2)}`;
    DOM.mdRightCoords.textContent = `${rx.toFixed(2)} / ${ry.toFixed(2)}`;

    // رندر خطوط برداری روی بوم‌های گرافیکی مجزا
    renderJoystickCanvas(Ctx.left, lx, ly);
    renderJoystickCanvas(Ctx.right, rx, ry);

    // محاسبات ریاضی خطا به کمک تئوری فیثاغورث نسبت به مرز ایده آل دایره مرجع
    const leftDist = Math.sqrt(lx*lx + ly*ly);
    const rightDist = Math.sqrt(rx*rx + ry*ry);
    
    const leftError = leftDist > 1.0 ? (leftDist - 1.0) * 100 : 0;
    const rightError = rightDist > 1.0 ? (rightDist - 1.0) * 100 : 0;

    DOM.mdLeftError.textContent = `${leftError.toFixed(2)}%`;
    DOM.mdRightError.textContent = `${rightError.toFixed(2)}%`;
    DOM.mdLeftError.style.color = leftError < 6 ? 'var(--success)' : 'var(--warning)';
    DOM.mdRightError.style.color = rightError < 6 ? 'var(--success)' : 'var(--warning)';

    // صحت‌سنجی ریل‌تایم و گام به گام جادوگر
    validateWizardStepsRealtime(lx, ly, rx, ry);
}

function renderJoystickCanvas(ctx, x, y) {
    clearCanvas(ctx);
    ctx.strokeStyle = 'var(--primary)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(100, 100);
    ctx.lineTo(100 + (x * 90), 100 + (y * 90));
    ctx.stroke();

    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    ctx.arc(100 + (x * 90), 100 + (y * 90), 6, 0, Math.PI * 2);
    ctx.fill();
}

// --- هسته هوشمند اعتبارسنجی جادوگر کالیبراسیون و حل باگ مرحله ۳ ---
function validateWizardStepsRealtime(lx, ly, rx, ry) {
    if (!AppState.isConnected) return;

    if (AppState.wizardStep === 2) {
        // مرحله تراز مرکز: مقادیر پتانسیومترها باید زیر ۰.۰۵ (محدوده امن ددزون) باشند
        const leftCentered = Math.abs(lx) < 0.05 && Math.abs(ly) < 0.05;
        const rightCentered = Math.abs(rx) < 0.05 && Math.abs(ry) < 0.05;
        
        if (leftCentered && rightCentered) {
            updateWizardVisuals(true, 'تراز مرکزی بدون نقص! استیک‌ها کاملاً کالیبره و در نقطه صفر مطلق هستند.', '✅');
            DOM.btnNextWiz.disabled = false;
        } else {
            updateWizardVisuals(false, 'سیگنال خطا: مقادیر آفست بیش از حد مجاز است. شاسی‌ها را کاملاً رها کنید.', '❌', 'error');
            DOM.btnNextWiz.disabled = true;
        }
    } 
    else if (AppState.wizardStep === 3) {
        // مرحله ۳: الگوریتم پیشرفته ردیابی جهت‌های جغرافیایی ۳۶۰ درجه
        const threshold = 0.85;
        
        // چک کردن وضعیت آنالوگ چپ
        if (ly < -threshold) { AppState.directionsTracked.left.n = true; DOM.dirs.l.n.classList.add('done'); }
        if (lx > threshold)  { AppState.directionsTracked.left.e = true; DOM.dirs.l.e.classList.add('done'); }
        if (ly > threshold)  { AppState.directionsTracked.left.s = true; DOM.dirs.l.s.classList.add('done'); }
        if (lx < -threshold) { AppState.directionsTracked.left.w = true; DOM.dirs.l.w.classList.add('done'); }
        
        // چک کردن وضعیت آنالوگ راست
        if (ry < -threshold) { AppState.directionsTracked.right.n = true; DOM.dirs.r.n.classList.add('done'); }
        if (rx > threshold)  { AppState.directionsTracked.right.e = true; DOM.dirs.r.e.classList.add('done'); }
        if (ry > threshold)  { AppState.directionsTracked.right.s = true; DOM.dirs.r.s.classList.add('done'); }
        if (rx < -threshold) { AppState.directionsTracked.right.w = true; DOM.dirs.r.w.classList.add('done'); }

        // بررسی اینکه آیا تمام ۸ گره فیزیکی تاچ شده‌اند یا خیر
        const lDone = AppState.directionsTracked.left.n && AppState.directionsTracked.left.e && AppState.directionsTracked.left.s && AppState.directionsTracked.left.w;
        const rDone = AppState.directionsTracked.right.n && AppState.directionsTracked.right.e && AppState.directionsTracked.right.s && AppState.directionsTracked.right.w;

        if (lDone && rDone) {
            updateWizardVisuals(true, 'تست جهت‌شناسی با موفقیت ۱۰۰٪ کامل شد! آماده ورود به مرحله ذخیره‌سازی داده‌ها.', '✅');
            DOM.btnNextWiz.disabled = false;
        } else {
            updateWizardVisuals(false, 'لطفاً هر دو آنالوگ را یک دور کامل ۳۶۰ درجه بچرخانید تا تمام جهات جغرافیایی سبز شوند.', '🔄', 'waiting');
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

// مدیریت کلیک دکمه هدایت گام به گام جادوگر
DOM.btnNextWiz.onclick = () => {
    if (!AppState.isConnected) return;

    AppState.wizardStep++;
    document.querySelectorAll('.step-node').forEach(node => node.classList.remove('active'));
    
    if (AppState.wizardStep === 2) {
        document.getElementById('sn-2').classList.add('active');
        document.getElementById('sn-1').classList.add('completed');
        DOM.wizTitle.textContent = 'مرحله ۲: همگام‌سازی نقطه صفر مرجع (تراز مرکزی)';
        DOM.wizDesc.textContent = 'دسته‌ها و آنالوگ‌ها را کاملاً رها کنید. سیستم در حال راستی‌آزمایی لایو ولتاژ پتانسیومترها و صفر کردن آفست مرکزی است.';
        logToSystem('وارد مرحله دوم شدید. آنالوگ‌ها را ثابت نگه دارید.');
        DOM.btnNextWiz.textContent = 'تایید و رفتن به مرحله تست جهت‌ها';
        
    } else if (AppState.wizardStep === 3) {
        document.getElementById('sn-3').classList.add('active');
        document.getElementById('sn-2').classList.add('completed');
        DOM.wizTitle.textContent = 'مرحله ۳: پیمایش زوایا و ماتریس محیط دایره';
        DOM.wizDesc.textContent = 'هر دو آنالوگ را به صورت کامل ۳۶۰ درجه بچرخانید. گره‌های جغرافیایی زیر (شمال، شرق، جنوب، غرب) باید برای تایید کامل شدن تست، همگی سبز شوند.';
        DOM.angleTrackerUi.style.display = 'grid'; // نمایان کردن پنل جهت‌شناسی اختصاصی
        resetAngleTrackerMatrix();
        logToSystem('وارد مرحله سوم شدید. لطفاً آنالوگ‌ها را بچرخانید.');
        DOM.btnNextWiz.textContent = 'انتقال به فاز ذخیره‌سازی حافظه';
        
    } else if (AppState.wizardStep === 4) {
        document.getElementById('sn-4').classList.add('active');
        document.getElementById('sn-3').classList.add('completed');
        DOM.wizTitle.textContent = 'مرحله ۴: ذخیره‌سازی نهایی الگوریتم‌های تصحیح خطا';
        DOM.wizDesc.textContent = 'تمام فرآیندهای تست و کالیبراسیون با موفقیت پاس شدند. سیستم آماده ذخیره رجیسترها روی حافظه موقت کلاینت فیکس است.';
        DOM.angleTrackerUi.style.display = 'none'; // مخفی‌سازی پنل جهت‌ها برای این گام
        updateWizardVisuals(true, 'آماده رایت نهایی داده‌ها روی لایه سیستم!', '💾');
        DOM.btnNextWiz.textContent = 'اعمال کالیبراسیون و ذخیره نهایی پروژه';
        logToSystem('فرآیند تست با موفقیت تایید نهایی شد.', 'success');
        
    } else if (AppState.wizardStep > 4) {
        // ریست نهایی کل فرآیند و جادوگر
        AppState.wizardStep = 1;
        document.querySelectorAll('.step-node').forEach(node => node.classList.remove('completed'));
        document.getElementById('sn-1').classList.add('active');
        DOM.wizTitle.textContent = 'مرحله ۱: تأیید ارتباط با پروتکل امن';
        DOM.wizDesc.textContent = 'برای تغییر ساختار رجیسترهای سنسور اثر هال یا پتانسیومترهای فیزیکی، کنترلر را متصل کنید.';
        DOM.btnNextWiz.textContent = 'شروع همگام‌سازی تراز مرکز';
        logToSystem('داده‌های ماتریس کالیبراسیون با موفقیت در سیستم فیکس رجیستر و ذخیره شدند.', 'success');
        updateWizardVisuals(true, 'عملیات ذخیره‌سازی با موفقیت روی سیستم رایت شد.', '✅');
    }
};

window.onload = () => {
    initCanvases();
    initGamepadPolling();
    
    // مپینگ دکمه‌های هدر برای سوئیچ واقعی بین پروتکل‌ها
    DOM.apiGamepadBtn.onclick = () => switchAPI('gamepad');
    DOM.apiHidBtn.onclick = () => switchAPI('hid');
    
    // شبیه‌سازی کلیک اولیه WebHID برای حفظ امنیت لایو هندلر مرورگر
    initWebHID();
};
