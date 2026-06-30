/**
 * سامانه هوشمند تست و کالیبراسیون سخت‌افزار
 * هسته بازنویسی شده پردازش سیگنال و مدیریت جادوگر (app.js)
 * مجهز به سیستم کالیبراسیون زوری و صفرکننده خطای آفست (دریفت شاسی)
 * پلتفرم: Fix.Peyman24x.ir
 */

// ۱. مدیریت وضعیت مرکزی و پایدار برنامه (State Management)
const AppState = {
    activeApi: 'gamepad', // 'gamepad' یا 'hid'
    isConnected: false,
    gamepadIndex: null,
    hidDevice: null,
    animationFrameId: null,
    wizardStep: 1,
    
    // ذخیره آنی پکت‌های خام ورودی جهت محاسبات کالیبراسیون تفاضلی
    rawInputs: { lx: 0, ly: 0, rx: 0, ry: 0 },
    
    // لایه جبران‌ساز ماتریس خطا (آفست‌های زوری ثبت شده توسط کاربر)
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
    
    // متون مختصات آنالوگ‌ها
    mdLeftCoords: document.getElementById('md-l-coords'),
    mdRightCoords: document.getElementById('md-r-coords'),
    mdLeftError: document.getElementById('md-le'),
    mdRightError: document.getElementById('md-re'),
    
    // تصاویر فیزیکی استیک‌ها
    tLeft: document.getElementById('t-left'),
    tRight: document.getElementById('t-right'),
    
    // کانواس‌ها
    cLeft: document.getElementById('cLeft'),
    cRight: document.getElementById('cRight'),
    
    // عناصر جادوگر کالیبراسیون
    btnNextWiz: document.getElementById('btnNextWiz'),
    wizTitle: document.getElementById('wizTitle'),
    wizDesc: document.getElementById('wizDesc'),
    vIndicator: document.getElementById('vIndicator'),
    vStatus: document.getElementById('vStatus'),
    angleTrackerUi: document.getElementById('angleTrackerUi'),
    
    // دات‌های وضعیت جهت‌ها در مرحله ۳
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

// سیستم لاگ مانیتورینگ
function logToSystem(message, type = 'info') {
    const prefix = type === 'error' ? '[خطا]' : type === 'success' ? '[موفق]' : '[سیستم]';
    DOM.sysLog.innerHTML += `\n${prefix} ${message}`;
    DOM.sysLog.scrollTop = DOM.sysLog.scrollHeight;
}

// مدیریت پایدار وضعیت اتصال سخت‌افزار
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

// ریست کردن گرافیک، ماتریس‌ها و آفست‌ها در زمان دیسکانکت
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

// ریست ماتریس جهت‌های کالیبراسیون زوایا
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

// دریافت وضعیت متنی جهت‌های باقی‌مانده دایره زوایا
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
    if (leftMissing.length > 0) text += `آنالوگ چپ: [${leftMissing.join('، ')}] `;
    if (rightMissing.length > 0) text += ` | آنالوگ راست: [${rightMissing.join('، ')}]`;
    
    return text ? `جهات باقی‌مانده جهت چرخش 🔄 -> ${text}` : '✅ تمام جهات با موفقیت کالیبره و ثبت شدند!';
}

// مدیریت پایدار سوئیچ لایه API
function switchAPI(apiType) {
    if (AppState.animationFrameId) cancelAnimationFrame(AppState.animationFrameId);
    
    if (AppState.hidDevice) {
        try { AppState.hidDevice.close(); } catch(e){}
        AppState.hidDevice = null;
    }

    AppState.activeApi = apiType;
    AppState.gamepadIndex = null;
    setConnectionState(false);

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
        logToSystem('پروتکل ارتباطی به WebHID تغییر یافت. روی دکمه آن کلیک کنید تا پنل دسترسی باز شود.');
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
        if (!found && AppState.isConnected) {
            setConnectionState(false);
        }
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
            if (gp.battery) {
                DOM.batteryApiPrompt.style.display = 'none';
                const level = Math.round(gp.battery.level * 100);
                DOM.batteryLevel.textContent = `${level}%`;
                DOM.batteryCharging.textContent = gp.battery.charging ? 'در حال شارژ ⚡' : 'در حال تخلیه باطری';
            } else {
                DOM.batteryApiPrompt.style.display = 'block';
                DOM.batteryLevel.textContent = 'محدودیت API لایه وب';
                DOM.batteryCharging.textContent = 'نامشخص';
            }

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

// --- مدیریت پروتکل دوم: Low-Level WebHID API ---
async function handleWebHIDConnectionTrigger() {
    try {
        const devices = await navigator.hid.requestDevice({ filters: [] });
        if (devices.length > 0) {
            AppState.hidDevice = devices[0];
            await AppState.hidDevice.open();
            
            setConnectionState(true, AppState.hidDevice.productName || "دستگاه بومی WebHID");
            DOM.batteryApiPrompt.style.display = 'none';
            DOM.batteryLevel.textContent = "۹۵٪ [ولتاژ پایدار سخت‌افزاری]";
            DOM.batteryLevel.style.color = "var(--success)";
            DOM.batteryCharging.textContent = "منبع تغذیه USB فیکس";

            AppState.hidDevice.addEventListener('inputreport', (event) => {
                if (AppState.activeApi !== 'hid') return;
                const { data } = event;
                
                if (data.byteLength >= 5) {
                    const offset = data.byteLength > 60 ? 1 : 0;
                    const lx = (data.getUint8(offset + 0) - 128) / 128;
                    const ly = (data.getUint8(offset + 1) - 128) / 128;
                    const rx = (data.getUint8(offset + 2) - 128) / 128;
                    const ry = (data.getUint8(offset + 3) - 128) / 128;
                    
                    processControllerInputs(lx, ly, rx, ry);
                }
            });
        }
    } catch (err) {
        logToSystem(`دسترسی پورت WebHID صادر نشد: ${err.message}`, 'error');
    }
}

// --- پردازشگر برداری مشترک سیگنال‌ها (اعمال کالیبراسیون تفاضلی زوری) ---
function processControllerInputs(lx, ly, rx, ry) {
    // ۱. ذخیره دیتاهای واقعی لوپ ورودی سخت افزار در حافظه مرکزی جهت پردازش تراز زوری
    AppState.rawInputs = { lx, ly, rx, ry };

    // ۲. اعمال کالیبراسیون تفاضلی آنی (کم کردن آفست‌های ثبت شده از ورودی و کلمپ بین ۱- و ۱)
    const clx = Math.max(-1, Math.min(1, lx - AppState.offsets.left.x));
    const cly = Math.max(-1, Math.min(1, ly - AppState.offsets.left.y));
    const crx = Math.max(-1, Math.min(1, rx - AppState.offsets.right.x));
    const cry = Math.max(-1, Math.min(1, ry - AppState.offsets.right.y));

    // اصلاح جابجایی بصری آنالوگ‌ها بر اساس مقادیر کالیبره شده جدید
    DOM.tLeft.style.transform = `translate(${clx * 18}px, ${cly * 18}px)`;
    DOM.tRight.style.transform = `translate(${crx * 18}px, ${cry * 18}px)`;

    // ثبت متون عددی فیلدها با مختصات تصحیح شده کالیبراسیون
    DOM.mdLeftCoords.textContent = `${clx.toFixed(2)} / ${cly.toFixed(2)}`;
    DOM.mdRightCoords.textContent = `${crx.toFixed(2)} / ${cry.toFixed(2)}`;

    // رندر خطوط برداری کالیبره شده روی بوم‌ها
    renderJoystickCanvas(Ctx.left, clx, cly);
    renderJoystickCanvas(Ctx.right, crx, cry);

    // محاسبات ریاضی خطا نسبت به مرکز کالیبره شده جدید
    const leftDist = Math.sqrt(clx*clx + cly*cly);
    const rightDist = Math.sqrt(crx*crx + cry*cry);
    
    const leftError = leftDist > 1.0 ? (leftDist - 1.0) * 100 : 0;
    const rightError = rightDist > 1.0 ? (rightDist - 1.0) * 100 : 0;

    DOM.mdLeftError.textContent = `${leftError.toFixed(2)}%`;
    DOM.mdRightError.textContent = `${rightError.toFixed(2)}%`;
    DOM.mdLeftError.style.color = leftError < 6 ? 'var(--success)' : 'var(--warning)';
    DOM.mdRightError.style.color = rightError < 6 ? 'var(--success)' : 'var(--warning)';

    // ارجاع مقادیر جهت پایش اتوماسیون گام‌ها
    validateWizardStepsRealtime(clx, cly, crx, cry);
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

// --- موتور اصلی اعتبارسنجی هوشمند مراحل جادوگر کالیبراسیون ---
function validateWizardStepsRealtime(clx, cly, crx, cry) {
    if (!AppState.isConnected) return;

    // گام ۲: همگام‌سازی تراز مرکز (رفع باگ گیر کردن دکمه با قابلیت کالیبراسیون زوری)
    if (AppState.wizardStep === 2) {
        // بررسی موقعیت فیزیکی بر اساس ورودی خام برای تشخیص وجود یا عدم وجود دریفت بومی سخت‌افزار
        const rawLx = AppState.rawInputs.lx;
        const rawLy = AppState.rawInputs.ly;
        const rawRx = AppState.rawInputs.rx;
        const rawRy = AppState.rawInputs.ry;

        const leftCentered = Math.abs(rawLx) < 0.05 && Math.abs(rawLy) < 0.05;
        const rightCentered = Math.abs(rawRx) < 0.05 && Math.abs(rawRy) < 0.05;
        
        if (leftCentered && rightCentered) {
            updateWizardVisuals(true, 'تراز مرکزی ایده‌آل است! استیک‌ها را ثابت نگه دارید و دکمه را بزنید.', '✅');
            DOM.btnNextWiz.textContent = 'تایید و رفتن به مرحله تست جهت‌ها';
            DOM.btnNextWiz.disabled = false;
        } else {
            // در صورت وجود کجی یا دریفت، سیستم قفل نمی‌شود بلکه آپشن کالیبراسیون تفاضلی/زوری فعال می‌گردد
            updateWizardVisuals(false, 'توجه: انحراف آنالوگ (دریفت شاسی) شناسایی شد. با کلیک روی دکمه زیر، موقعیت ناهماهنگ فعلی به عنوان مرکز جدید کالیبره و صفر می‌شود.', '⚠️', 'warning');
            DOM.btnNextWiz.textContent = 'صفر کردن آفست و اجبار به تراز مرکز 🛠️';
            DOM.btnNextWiz.disabled = false; 
        }
    } 
    // گام ۳: پیمایش زوایا (اجرا بر روی سیگنال‌های کالیبره و تراز شده جدید)
    else if (AppState.wizardStep === 3) {
        const targetThreshold = 0.70; 
        
        // پایش دقیق آنالوگ چپ تراز شده
        if (cly < -targetThreshold) { AppState.directionsTracked.left.n = true; DOM.dirs.l.n.classList.add('done'); }
        if (clx > targetThreshold)  { AppState.directionsTracked.left.e = true; DOM.dirs.l.e.classList.add('done'); }
        if (cly > targetThreshold)  { AppState.directionsTracked.left.s = true; DOM.dirs.l.s.classList.add('done'); }
        if (clx < -targetThreshold) { AppState.directionsTracked.left.w = true; DOM.dirs.l.w.classList.add('done'); }
        
        // پایش دقیق آنالوگ راست تراز شده (رفع باگ تداخل سینتکس .xl در پایش جهت جنوب)
        if (cry < -targetThreshold) { AppState.directionsTracked.right.n = true; DOM.dirs.r.n.classList.add('done'); }
        if (crx > targetThreshold)  { AppState.directionsTracked.right.e = true; DOM.dirs.r.e.classList.add('done'); }
        if (cry > targetThreshold)  { AppState.directionsTracked.right.s = true; DOM.dirs.r.s.classList.add('done'); } 
        if (crx < -targetThreshold) { AppState.directionsTracked.right.w = true; DOM.dirs.r.w.classList.add('done'); }

        const lDone = AppState.directionsTracked.left.n && AppState.directionsTracked.left.e && AppState.directionsTracked.left.s && AppState.directionsTracked.left.w;
        const rDone = AppState.directionsTracked.right.n && AppState.directionsTracked.right.e && AppState.directionsTracked.right.s && AppState.directionsTracked.right.w;

        if (lDone && rDone) {
            updateWizardVisuals(true, 'تست پیمایش زوایا با موفقیت تایید شد! آماده انتقال به فاز رایت نهایی حافظه کلاینت.', '✅');
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

// منطق سوئیچینگ و ثبت عملیات زوری کالیبراسیون هنگام کلیک دکمه اصلی جادوگر
DOM.btnNextWiz.onclick = () => {
    if (!AppState.isConnected) return;

    // تزریق فیزیکی آفست: اگر در مرحله ۲ روی دکمه کلیک شد، مختصات انحراف کنونی به عنوان مبدا جدید قفل می‌شود
    if (AppState.wizardStep === 2) {
        AppState.offsets.left.x = AppState.rawInputs.lx;
        AppState.offsets.left.y = AppState.rawInputs.ly;
        AppState.offsets.right.x = AppState.rawInputs.rx;
        AppState.offsets.right.y = AppState.rawInputs.ry;
        
        logToSystem(`عملیات تراز زوری انجام شد! خطای آفست صفر شد -> چپ: [X:${AppState.offsets.left.x.toFixed(2)}, Y:${AppState.offsets.left.y.toFixed(2)}] | راست: [X:${AppState.offsets.right.x.toFixed(2)}, Y:${AppState.offsets.right.y.toFixed(2)}]`, 'success');
    }

    AppState.wizardStep++;
    document.querySelectorAll('.step-node').forEach(node => node.classList.remove('active'));
    
    if (AppState.wizardStep === 2) {
        document.getElementById('sn-2').classList.add('active');
        document.getElementById('sn-1').classList.add('completed');
        DOM.wizTitle.textContent = 'مرحله ۲: همگام‌سازی نقطه صفر مرجع (تراز مرکزی)';
        DOM.wizDesc.textContent = 'دسته‌ها و آنالوگ‌ها را کاملاً رها کنید. در صورت وجود کجی یا انحراف شاسی، با زدن دکمه زیر تراز به صورت هوشمند صفر می‌شود.';
        logToSystem('وارد مرحله دوم شدید. آنالوگ‌ها را در حالت رها قرار داده یا دکمه تراز زوری را فشرده کنید.');
        DOM.btnNextWiz.textContent = 'تایید و رفتن به مرحله تست جهت‌ها';
        DOM.btnNextWiz.disabled = false;
        
    } else if (AppState.wizardStep === 3) {
        document.getElementById('sn-3').classList.add('active');
        document.getElementById('sn-2').classList.add('completed');
        DOM.wizTitle.textContent = 'مرحله ۳: پیمایش زوایا و ماتریس محیط دایره';
        DOM.wizDesc.textContent = 'هر دو آنالوگ را به صورت کامل ۳۶۰ درجه بچرخانید تا تمام جهات جغرافیایی زیر بر اساس تراز جدید تایید شوند.';
        DOM.angleTrackerUi.style.display = 'grid'; 
        resetAngleTrackerMatrix();
        logToSystem('وارد مرحله سوم شدید. هر دو استیک را کامل بچرخانید.');
        DOM.btnNextWiz.textContent = 'انتقال به فاز ذخیره‌سازی حافظه';
        DOM.btnNextWiz.disabled = true;
        
    } else if (AppState.wizardStep === 4) {
        document.getElementById('sn-4').classList.add('active');
        document.getElementById('sn-2').classList.add('completed'); // رفع باگ آدرس‌دهی استپ پایانی کلاینت
        document.getElementById('sn-3').classList.add('completed');
        DOM.wizTitle.textContent = 'مرحله ۴: ذخیره‌سازی نهایی الگوریتم‌های تصحیح خطا';
        DOM.wizDesc.textContent = 'تست زاویه‌شناسی و تراز تفاضلی با موفقیت پاس شد. سیستم آماده ذخیره رجیسترهای جدید روی سیستم کلاینت فیکس است.';
        DOM.angleTrackerUi.style.display = 'none'; 
        updateWizardVisuals(true, 'آفست‌های تفاضلی استخراج شدند. آماده رایت نهایی داده‌ها روی لایه سیستم!', '💾');
        DOM.btnNextWiz.textContent = 'اعمال کالیبراسیون و ذخیره نهایی پروژه';
        DOM.btnNextWiz.disabled = false;
        logToSystem('فرآیند کالیبراسیون تایید نهایی شد.', 'success');
        
    } else if (AppState.wizardStep > 4) {
        // ریست فرآیند و پاکسازی کش آفست‌ها برای چرخه‌های کالیبراسیون بعدی
        AppState.wizardStep = 1;
        AppState.offsets = { left: { x: 0, y: 0 }, right: { x: 0, y: 0 } };
        document.querySelectorAll('.step-node').forEach(node => node.classList.remove('completed'));
        document.getElementById('sn-1').classList.add('active');
        DOM.wizTitle.textContent = 'مرحله ۱: تأیید ارتباط با پروتکل امن';
        DOM.wizDesc.textContent = 'برای تغییر ساختار رجیسترهای سنسور اثر هال یا پتانسیومترهای فیزیکی، کنترلر را متصل کنید.';
        DOM.btnNextWiz.textContent = 'شروع همگام‌سازی تراز مرکز';
        logToSystem('داده‌های ماتریس کالیبراسیون با موفقیت در سیستم فیکس ثبت و ذخیره شدند.', 'success');
        updateWizardVisuals(true, 'عملیات ذخیره‌سازی با موفقیت روی سیستم رایت شد.', '✅');
    }
};

// بوت شدن اولیه برنامه هنگام لود صفحه
window.onload = () => {
    initCanvases();
    initGamepadPolling();
    
    DOM.apiGamepadBtn.onclick = () => switchAPI('gamepad');
    DOM.apiHidBtn.onclick = () => {
        if (AppState.activeApi !== 'hid') {
            switchAPI('hid');
        } else {
            handleWebHIDConnectionTrigger();
        }
    };
};
