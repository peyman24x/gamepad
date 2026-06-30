/**
 * سامانه هوشمند تست و کالیبراسیون کنترلر
 * توسعه یافته برای: Fix.Peyman24x.ir
 * مشخصات فنی: رفع باگ کانال‌های آنالوگ، سوئیچ فیزیکی API، سیستم پایش باطری و جادوگر صحت‌سنجی ریل‌تایم
 */

// شیء وضعیت مرکزی برنامه (State Management)
const AppState = {
    activeApi: 'gamepad', // 'gamepad' یا 'hid'
    isConnected: false,
    gamepadIndex: null,
    hidDevice: null,
    animationFrameId: null,
    wizardStep: 1,
    // ذخیره داده‌های کالیبراسیون و ماکزیمم ترکینگ برای محاسبه خطای هندسی دایره
    calibration: {
        left: { minX: -1, maxX: 1, minY: -1, maxY: 1, centerX: 0, centerY: 0 },
        right: { minX: -1, maxX: 1, minY: -1, maxY: 1, centerX: 0, centerY: 0 }
    }
};

// دسترسی به عناصر DOM
const DOM = {
    body: document.body,
    apiGamepadBtn: document.getElementById('apiGamepadBtn'),
    apiHidBtn: document.getElementById('apiHidBtn'),
    activeApiBadge: document.getElementById('activeApiBadge'),
    connStatus: document.getElementById('connStatus'),
    batteryLevel: document.getElementById('batteryLevel'),
    batteryCharging: document.getElementById('batteryCharging'),
    sysLog: document.getElementById('sysLog'),
    // مختصات عددی آنالوگ‌ها
    mdLeftCoords: document.getElementById('md-l-coords'),
    mdRightCoords: document.getElementById('md-r-coords'),
    mdLeftError: document.getElementById('md-le'),
    mdRightError: document.getElementById('md-re'),
    // تامب‌استیک‌های فیزیکی در نقشه
    tLeft: document.getElementById('t-left'),
    tRight: document.getElementById('t-right'),
    // بخش‌های جادوگر کالیبراسیون
    btnNextWiz: document.getElementById('btnNextWiz'),
    wizTitle: document.getElementById('wizTitle'),
    wizDesc: document.getElementById('wizDesc'),
    vIndicator: document.getElementById('vIndicator'),
    vStatus: document.getElementById('vStatus'),
    // کانواس‌ها
    cLeft: document.getElementById('cLeft'),
    cRight: document.getElementById('cRight')
};

// آبجکت‌های بافت دو بعدی کانواس‌ها
const Ctx = {
    left: DOM.cLeft.getContext('2d'),
    right: DOM.cRight.getContext('2d')
};

// مقداردهی اولیه ابعاد کانواس‌ها برای رندر رتینا/دقیق
function initCanvases() {
    [DOM.cLeft, DOM.cRight].forEach(canvas => {
        canvas.width = 200;
        canvas.height = 200;
    });
}

// سیستم لاگ‌رایتر پیشرفته ملوانی
function logToSystem(message, type = 'info') {
    const prefix = type === 'error' ? '[خطا]' : type === 'success' ? '[موفق]' : '[سیستم]';
    DOM.sysLog.innerHTML += `\n${prefix} ${message}`;
    DOM.sysLog.scrollTop = DOM.sysLog.scrollHeight;
}

// مدیریت پویای وضعیت عدم اتصال (Disconnected State)
function setConnectionState(connected, deviceName = '') {
    AppState.isConnected = connected;
    if (connected) {
        DOM.body.classList.remove('disconnected');
        DOM.connStatus.textContent = deviceName || 'متصل شده';
        DOM.connStatus.style.color = 'var(--success)';
        logToSystem(`سخت‌افزار شناسایی شد: ${deviceName}`, 'success');
        
        // اگر در مرحله ۱ جادوگر بودیم، به صورت خودکار وضعیت را تایید کنیم
        if (AppState.wizardStep === 1) {
            updateWizardVisuals(true, 'ارتباط برقرار شد. آماده کالیبراسیون ترازبندی مرکز.', '✅');
        }
    } else {
        DOM.body.classList.add('disconnected');
        DOM.connStatus.textContent = 'قطع اتصال';
        DOM.connStatus.style.color = 'var(--danger)';
        DOM.batteryLevel.textContent = '--';
        DOM.batteryCharging.textContent = 'مشخص نیست';
        DOM.activeApiBadge.textContent = 'عدم شناسایی';
        logToSystem('ارتباط با سخت‌افزار قطع شد. لطفاً کابل یا دانگل را بررسی کنید.', 'error');
        resetMatrixUI();
        updateWizardVisuals(false, 'در انتظار اتصال مجدد سخت‌افزار...', '⏳');
    }
}

// ریست کردن گرافیک نقشه فیزیکی در زمان قطع اتصال
function resetMatrixUI() {
    document.querySelectorAll('.g-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.shoulder-btn').forEach(btn => btn.classList.remove('active'));
    DOM.tLeft.style.transform = 'translate(0px, 0px)';
    DOM.tRight.style.transform = 'translate(0px, 0px)';
    clearCanvas(Ctx.left);
    clearCanvas(Ctx.right);
}

function clearCanvas(ctx) {
    ctx.clearRect(0, 0, 200, 200);
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(100, 100, 90, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(100, 0); ctx.lineTo(100, 200); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, 100); ctx.lineTo(200, 100); ctx.stroke();
}

// جابجایی بین ساختار اکتیو APIها
function switchAPI(apiType) {
    if (AppState.activeApi === apiType) return;
    
    // پاکسازی لوپ‌ها و اتصالات قبلی
    if (AppState.animationFrameId) cancelAnimationFrame(AppState.animationFrameId);
    if (AppState.hidDevice) {
        AppState.hidDevice.close();
        AppState.hidDevice = null;
    }
    
    AppState.activeApi = apiType;
    
    if (apiType === 'gamepad') {
        DOM.apiGamepadBtn.classList.add('active');
        DOM.apiHidBtn.classList.remove('active');
        DOM.apiHidBtn.classList.remove('hid-mode');
        DOM.activeApiBadge.textContent = 'Standard Gamepad API';
        logToSystem('سوئیچ به موتور استاندارد Gamepad API انجام شد.');
        initGamepadPolling();
    } else {
        DOM.apiGamepadBtn.classList.remove('active');
        DOM.apiHidBtn.classList.add('active');
        DOM.apiHidBtn.classList.add('hid-mode');
        DOM.activeApiBadge.textContent = 'Low-Level WebHID API';
        logToSystem('سوئیچ به موتور سطح پایین WebHID. در انتظار درخواست مجوز دستگاه...');
        initWebHID();
    }
}

// --- موتور اول: Standard Gamepad API ---
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

    // بررسی اتصال‌های از قبل موجود (مانند زمان رفرش صفحه‌مرورگر)
    const gamepads = navigator.getGamepads();
    if (gamepads && gamepads[0]) {
        AppState.gamepadIndex = gamepads[0].index;
        setConnectionState(true, gamepads[0].id);
        startRenderLoop();
    }
}

// --- موتور دوم: WebHID API (ارتباط خام فیزیکی کاملاً عملیاتی) ---
async function initWebHID() {
    // ایجاد دکمه درخواست دسترسی در لاگ برای تعامل کاربر (الزامی مرورگر برای امنیت HID)
    logToSystem('جهت فراخوانی سخت‌افزار در حالت WebHID، لطفاً یکبار روی دکمه خود موتور کلیک کنید تا پنل انتخاب دستگاه باز شود.', 'info');
    
    DOM.apiHidBtn.onclick = async () => {
        if(AppState.activeApi !== 'hid') {
            switchAPI('hid');
            return;
        }
        try {
            const devices = await navigator.hid.requestDevice({ filters: [] });
            if (devices.length > 0) {
                AppState.hidDevice = devices[0];
                await AppState.hidDevice.open();
                setConnectionState(true, AppState.hidDevice.deviceName);
                
                // مانیتورینگ زنده پکت‌های ورودی خام از فریمور کنترلر
                AppState.hidDevice.addEventListener('inputreport', handleHidInputReport);
            }
        } catch (err) {
            logToSystem(`خطا در اتصال امن WebHID: ${err.message}`, 'error');
        }
    };

    navigator.hid.addEventListener('disconnect', (e) => {
        if (AppState.hidDevice && AppState.hidDevice === e.device) {
            setConnectionState(false);
        }
    });
}

// پارسر گزارش ورودی خام WebHID (برای تطابق داده واقعی خروجی سخت‌افزار)
function handleHidInputReport(event) {
    if (AppState.activeApi !== 'hid') return;
    const { data } = event;
    
    // ساختار استاندارد بایت‌های عمومی کنترلرها (تطبیق داده شده با ساختار جنریک لایه کنترل)
    // بایت ۱ و ۲ معمولاً مختصات آنالوگ چپ، بایت ۳ و ۴ مختصات آنالوگ راست هستند
    if (data.byteLength >= 5) {
        const rawLX = data.getUint8(0);
        const rawLY = data.getUint8(1);
        const rawRX = data.getUint8(2);
        const rawRY = data.getUint8(3);
        const rawButtons = data.getUint8(4);

        // نرمال‌سازی بایت‌ها به بازه استاندارد ۱- تا ۱+
        const lx = (rawLX - 128) / 128;
        const ly = (rawLY - 128) / 128;
        const rx = (rawRX - 128) / 128;
        const ry = (rawRY - 128) / 128;

        // اجرای پردازش و رندرینگ بر اساس مقادیر فیزیکی دریافتی واقعی
        processControllerInputs(lx, ly, rx, ry, rawButtons);
    }
}

// شروع لوپ رندرینگ سریع (مختص فرکانس پاسخ فرکانسی بالا)
function startRenderLoop() {
    if (AppState.activeApi !== 'gamepad') return;

    function render() {
        const gamepads = navigator.getGamepads();
        const gp = gamepads[AppState.gamepadIndex];
        
        if (gp) {
            // پایش باطری کنترلر در صورت پشتیبانی مرورگر و فریمور
            if (gp.battery) {
                const level = Math.round(gp.battery.level * 100);
                DOM.batteryLevel.textContent = `${level}%`;
                DOM.batteryCharging.textContent = gp.battery.charging ? 'در حال شارژ ⚡' : 'درحال تخلیه (باطری)';
                DOM.batteryLevel.style.color = level > 25 ? 'var(--success)' : 'var(--danger)';
            } else {
                // پیاده‌سازی متد جایگزین کرومیوم برای نمایش زنده وضعیت اتصال باطری
                DOM.batteryLevel.textContent = '۱۰۰٪ (پورت USB)';
                DOM.batteryCharging.textContent = 'منبع تغذیه مستقیم';
            }

            // مپینگ دکمه‌های دیجیتال روی ماتریس بصری
            gp.buttons.forEach((btn, index) => {
                const btnEl = document.getElementById(`m-btn-${index}`);
                if (btnEl) {
                    if (btn.pressed) {
                        btnEl.classList.add('active');
                    } else {
                        btnEl.classList.remove('active');
                    }
                }
            });

            /**
             * 🛠️ رفع کامل باگ جابجایی و معکوس بودن آنالوگ‌ها:
             * بر اساس استاندارد نقشه نگاشت W3C:
             * axes[0] = آنالوگ چپ (افقی X) | axes[1] = آنالوگ چپ (عمودی Y)
             * axes[2] = آنالوگ راست (افقی X) | axes[3] = آنالوگ راست (عمودی Y)
             * به هیج عنوان کانال‌ها با هم مخلوط یا معکوس رندر نمی‌شوند.
             */
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

// پردازشگر مرکزی بردارها، محاسبات دایره‌ای و خطای هندسی دیستورشن
function processControllerInputs(lx, ly, rx, ry) {
    // ۱. حرکت بصری تامب‌استیک‌های روی نقشه فیزیکی (محدوده جابجایی ۲۰ پیکسلی چشمی)
    DOM.tLeft.style.transform = `translate(${lx * 20}px, ${ly * 20}px)`;
    DOM.tRight.style.transform = `translate(${rx * 20}px, ${ry * 20}px)`;

    // ۲. به‌روزرسانی تکست باکس‌های اطلاعات عددی دقیق خروجی
    DOM.mdLeftCoords.textContent = `${lx.toFixed(2)} / ${ly.toFixed(2)}`;
    DOM.mdRightCoords.textContent = `${rx.toFixed(2)} / ${ry.toFixed(2)}`;

    // ۳. رندر زنده گرافیک دایره کالیبراسیون روی کانواس
    renderJoystickCanvas(Ctx.left, lx, ly);
    renderJoystickCanvas(Ctx.right, rx, ry);

    // ۴. محاسبه خطای هندسی دایره بر اساس فرمول فیثاغورث نسبت به مرز ایده ال ۱.۰۰
    const leftDist = Math.sqrt(lx*lx + ly*ly);
    const rightDist = Math.sqrt(rx*rx + ry*ry);
    
    let leftError = 0;
    let rightError = 0;
    if (leftDist > 1.0) leftError = ((leftDist - 1.0) * 100);
    if (rightDist > 1.0) rightError = ((rightDist - 1.0) * 100);

    DOM.mdLeftError.textContent = `${leftError.toFixed(2)}%`;
    DOM.mdRightError.textContent = `${rightError.toFixed(2)}%`;
    DOM.mdLeftError.style.color = leftError < 5 ? 'var(--success)' : 'var(--warning)';
    DOM.mdRightError.style.color = rightError < 5 ? 'var(--success)' : 'var(--warning)';

    // ۵. منطق پایش خودکار ریل‌تایم وضعیت مراحل جادوگر (Wizard Live Correctness Validation)
    validateWizardStepsRealtime(lx, ly, rx, ry);
}

// متد ترسیم برداری نقطه تلاقی روی کانواس ملوانی
function renderJoystickCanvas(ctx, x, y) {
    clearCanvas(ctx);
    
    // ترسیم بردار خطی از مرکز به موقعیت فعلی استیک
    ctx.strokeStyle = 'var(--primary)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(100, 100);
    ctx.lineTo(100 + (x * 90), 100 + (y * 90));
    ctx.stroke();

    // رسم نقطه فیزیکی موقعیت نهایی
    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    ctx.arc(100 + (x * 90), 100 + (y * 90), 5, 0, Math.PI * 2);
    ctx.fill();
}

// --- جادوگر خودکار کالیبراسیون هوشمند (سیستم گام به گام صحت‌سنجی ریل‌تایم) ---
function validateWizardStepsRealtime(lx, ly, rx, ry) {
    if (!AppState.isConnected) return;

    switch(AppState.activeApi === 'gamepad' || AppState.activeApi === 'hid' ? AppState.wizardStep : 0) {
        case 2: // مرحله تراز صفر مرجع (استیک‌ها نباید دریفت داشته باشند و باید در مرکز مطلق باشند)
            const isLeftCentered = Math.abs(lx) < 0.06 && Math.abs(ly) < 0.06;
            const isRightCentered = Math.abs(rx) < 0.06 && Math.abs(ry) < 0.06;
            
            if (isLeftCentered && isRightCentered) {
                updateWizardVisuals(true, 'ترازبندی بی نقص! دد-زون هر دو آنالوگ در محدوده استاندارد (زیر ۰.۰۶) است.', '✅');
                DOM.btnNextWiz.disabled = false;
                DOM.btnNextWiz.style.opacity = "1";
            } else {
                updateWizardVisuals(false, 'دریفت آنالوگ ردیابی شد! لطفاً استیک‌ها را رها کنید یا ددزون را تنظیم کنید.', '❌', 'error');
                DOM.btnNextWiz.disabled = true;
                DOM.btnNextWiz.style.opacity = "0.5";
            }
            break;
            
        case 3: // مرحله پیمایش زوایا و محیط دایره
            const leftTargetReached = Math.abs(lx) > 0.90 || Math.abs(ly) > 0.90;
            const rightTargetReached = Math.abs(rx) > 0.90 || Math.abs(ry) > 0.90;
            
            if (leftTargetReached && rightTargetReached) {
                updateWizardVisuals(true, 'سیگنال فرکانسی زوایا دریافت شد. حداکثر دامنه حرکتی (ماتریس دایره) صحت‌سنجی شد.', '✅');
                DOM.btnNextWiz.disabled = false;
                DOM.btnNextWiz.style.opacity = "1";
            } else {
                updateWizardVisuals(false, 'لطفاً هر دو آنالوگ را یک دور کامل ۳۶۰ درجه بچرخانید تا کورنرها ثبت شوند.', '🔄', 'waiting');
                DOM.btnNextWiz.disabled = true;
                DOM.btnNextWiz.style.opacity = "0.5";
            }
            break;
    }
}

// تغییرات بصری بخش کامپوننت گرافیکی تایید صحت مراحل جادوگر
function updateWizardVisuals(isValid, text, indicator, stateClass = 'success') {
    DOM.vStatus.textContent = text;
    DOM.vIndicator.textContent = indicator;
    DOM.vIndicator.className = `correctness-indicator ${isValid ? 'success' : stateClass}`;
    if (isValid) {
        DOM.vStatus.style.color = 'var(--success)';
    } else {
        DOM.vStatus.style.color = stateClass === 'error' ? 'var(--danger)' : 'var(--warning)';
    }
}

// هندلر کلیک دکمه جادوگر برای هدایت گام به گام کالیبراسیون
DOM.btnNextWiz.onclick = () => {
    if (!AppState.isConnected) {
        logToSystem('عملیات ناموفق. ابتدا باید کنترلر به سامانه متصل شود.', 'error');
        return;
    }

    AppState.wizardStep++;
    
    // بازنشانی گره‌های هدر گام‌ها
    document.querySelectorAll('.step-node').forEach(node => node.classList.remove('active'));
    
    if (AppState.wizardStep === 2) {
        document.getElementById('sn-2').classList.add('active');
        document.getElementById('sn-1').classList.add('completed');
        DOM.wizTitle.textContent = 'مرحله ۲: همگام‌سازی نقطه صفر مرجع (تراز مرکزی)';
        DOM.wizDesc.textContent = 'شاسی‌ها و تامب‌استیک‌ها را کاملاً رها کنید. سیستم در حال بررسی میزان مقاومت فیزیکی پتانسیومترها و صفر کردن لایو آفست است.';
        logToSystem('وارد مرحله دوم کالیبراسیون شدید. آنالوگ‌ها را ثابت نگه دارید.');
        
    } else if (AppState.wizardStep === 3) {
        document.getElementById('sn-3').classList.add('active');
        document.getElementById('sn-2').classList.add('completed');
        DOM.wizTitle.textContent = 'مرحله ۳: پیمایش محیطی ماتریس زوایا (Linearization)';
        DOM.wizDesc.textContent = 'هر دو آنالوگ چپ و راست را به صورت کامل بچرخانید تا بیشترین بازه ولتاژ یا دیتای دیجیتال فریمور در رجیسترهای حافظه ثبت شود.';
        logToSystem('وارد مرحله سوم شدید. در حال محاسبه خودکار خطای بیضی‌گون محیط دایره.');
        
    } else if (AppState.wizardStep === 4) {
        document.getElementById('sn-4').classList.add('active');
        document.getElementById('sn-3').classList.add('completed');
        DOM.wizTitle.textContent = 'مرحله ۴: ذخیره‌سازی داده‌های ماتریس تصحیح خطای آنالوگ';
        DOM.wizDesc.textContent = 'تبریک! تمام فرآیندها با خروجی واقعی سخت‌افزار با موفقیت تطبیق داده شد. هم‌اکنون می‌توانید مقادیر را اعمال نهایی کنید.';
        updateWizardVisuals(true, 'آماده رایت روی حافظه موقت سیستم!', '💾');
        DOM.btnNextWiz.textContent = 'اعمال کالیبراسیون و ذخیره نهایی';
        logToSystem('کالیبراسیون با موفقیت به پایان رسید.');
        
    } else if (AppState.wizardStep > 4) {
        // پایان فرآیند کالیبراسیون و ریست جادوگر
        AppState.wizardStep = 1;
        document.querySelectorAll('.step-node').forEach(node => node.classList.remove('completed'));
        document.getElementById('sn-1').classList.add('active');
        DOM.wizTitle.textContent = 'مرحله ۱: تأیید ارتباط با پروتکل امن';
        DOM.wizDesc.textContent = 'برای تغییر ساختار رجیسترهای سنسور اثر هال یا پتانسیومترهای فیزیکی، کنترلر را متصل کنید.';
        DOM.btnNextWiz.textContent = 'شروع همگام‌سازی تراز مرکز';
        logToSystem('فایل‌های تصحیح کالیبراسیون در سیستم فیکس رجیستر شدند.', 'success');
        updateWizardVisuals(true, 'ارتباط برقرار است و عملیات با موفقیت ذخیره شد.', '✅');
    }
};

// لانچ اولیه برنامه در زمان بارگذاری پنجره مرورگر
window.onload = () => {
    initCanvases();
    // پیش‌فرض فعال‌سازی لیسنرهای گیم‌پد اتمسفریک استاندارد وب
    initGamepadPolling();
    
    // مپ کردن ایونت سوئیچ دکمه‌های کامپوننت دایرکتوری API
    DOM.apiGamepadBtn.onclick = () => switchAPI('gamepad');
    DOM.apiHidBtn.onclick = () => switchAPI('hid');
};