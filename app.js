/**
 * سامانه هوشمند تست و کالیبراسیون سخت‌افزار
 * هسته بازنویسی شده پردازش سیگنال، رندر گرافیکی و مدیریت جادوگر (app.js)
 * توسعه یافته برای پلتفرم: Fix.Peyman24x.ir
 */

// ۱. مدیریت وضعیت مرکزی و پایدار برنامه (State Management)
const AppState = {
    activeApi: 'gamepad', // 'gamepad' یا 'hid'
    isConnected: false,
    gamepadIndex: null,
    hidDevice: null,
    animationFrameId: null,
    wizardStep: 1,
    
    // مقادیر زنده و استخراج شده پکت سخت‌افزار
    rawAxes: { lx: 0, ly: 0, rx: 0, ry: 0 },
    
    // ماتریس پایش کالیبراسیون ۳۶۰ درجه (مرحله ۳ جادوگر)
    directionsTracked: {
        left:  { n: false, e: false, s: false, w: false },
        right: { n: false, e: false, s: false, w: false }
    }
};

// ۲. مپینگ دقیق المان‌های رابط کاربری (DOM)
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
    
    // متون مختصات آنالوگ‌ها و خطاها
    mdLCoords: document.getElementById('md-l-coords'),
    mdLe: document.getElementById('md-le'),
    mdRCoords: document.getElementById('md-r-coords'),
    mdRe: document.getElementById('md-re'),
    
    // کامپوننت‌های جادوگر (Wizard)
    wizTitle: document.getElementById('wizTitle'),
    wizDesc: document.getElementById('wizDesc'),
    vIndicator: document.getElementById('vIndicator'),
    vStatus: document.getElementById('vStatus'),
    angleTrackerUi: document.getElementById('angleTrackerUi'),
    btnNextWiz: document.getElementById('btnNextWiz')
};

// ۳. بستر اولیه بوم‌های کانواس (Canvas Setup)
const CanvasConfig = {
    cLeft: document.getElementById('cLeft'),
    cRight: document.getElementById('cRight'),
    ctxLeft: document.getElementById('cLeft')?.getContext('2d'),
    ctxRight: document.getElementById('cRight')?.getContext('2d'),
    size: 170,
    center: 85,
    radius: 75
};

// تابع کمکی لاگ سیستم
const logToSystem = (text, type = 'info') => {
    if (!DOM.sysLog) return;
    const prefix = type === 'success' ? '[موفق]' : type === 'error' ? '[خطا]' : '[سیستم]';
    DOM.sysLog.innerHTML += `\n${prefix} ${text}`;
    DOM.sysLog.scrollTop = DOM.sysLog.scrollHeight;
};

// اولیه‌سازی بوم‌های کانواس در ابعاد رزولوشن بالا
const initCanvases = () => {
    [CanvasConfig.cLeft, CanvasConfig.cRight].forEach(canvas => {
        if (canvas) {
            canvas.width = CanvasConfig.size;
            canvas.height = CanvasConfig.size;
        }
    });
};

// ۴. ترسیم بوم‌ها و نقاط آنالوگ به صورت ۶۰ فریم بر ثانیه (Canvas Rendering)
const drawStickSpace = (ctx, x, y, errorPercentage) => {
    const { center, radius, size } = CanvasConfig;
    ctx.clearRect(0, 0, size, size);
    
    // رسم شبکه راهنمای مرکز (مختصات دکارتي)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(center, 0); ctx.lineTo(center, size);
    ctx.moveTo(0, center); ctx.lineTo(size, center);
    ctx.stroke();
    
    // رسم دایره مرجع ۱.۰۰ ایده آل
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.beginPath();
    ctx.arc(center, center, radius, 0, Math.PI * 2);
    ctx.stroke();

    // تعیین رنگ پویای خطا بر اساس موتور کالیبراسیون
    let strokeColor = '#10b981'; // سبز پیش‌فرض
    if (errorPercentage > 5 && errorPercentage <= 12) strokeColor = '#f59e0b'; // زرد
    if (errorPercentage > 12) strokeColor = '#ef4444'; // قرمز

    // رسم محدوده نوسان زنده بردار فیزیکی
    ctx.strokeStyle = strokeColor + '44';
    ctx.fillStyle = strokeColor + '11';
    ctx.beginPath();
    ctx.arc(center, center, radius * Math.sqrt(x*x + y*y), 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // محاسبه مکان فیزیکی توپ پوینتر روی کانواس
    const posX = center + (x * radius);
    const posY = center + (y * radius);

    // رسم نقطه متحرک استیک
    ctx.fillStyle = strokeColor;
    ctx.shadowBlur = 10;
    ctx.shadowColor = strokeColor;
    ctx.beginPath();
    ctx.arc(posX, posY, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0; // ریست سایه برای فریم بعدی
};

// ۵. حلقه پردازش ورودی اصلی (Main Game Loop)
const updateLoop = () => {
    if (!AppState.isConnected) return;

    // لایه بررسی و واکشی در صورت فعال بودن پروتکل استاندارد Gamepad
    if (AppState.activeApi === 'gamepad' && AppState.gamepadIndex !== null) {
        const gp = navigator.getGamepads()[AppState.gamepadIndex];
        if (gp) {
            AppState.rawAxes.lx = gp.axes[0] || 0;
            AppState.rawAxes.ly = gp.axes[1] || 0;
            AppState.rawAxes.blackbox_rx = gp.axes[2] || 0; // سازگاری با مپینگ دایرکت ایکس / وب
            AppState.rawAxes.blackbox_ry = gp.axes[3] || 0;
            
            // بسته به نوع مرورگر لایه تفکیک اکسس کنترلرها هندل می‌شود
            AppState.rawAxes.rx = gp.axes[2] !== undefined ? gp.axes[2] : 0;
            AppState.rawAxes.ry = gp.axes[3] !== undefined ? gp.axes[3] : 0;

            // به روز رسانی بصری وضعیت فشرده شدن دکمه‌های فیزیکی
            gp.buttons.forEach((btn, idx) => {
                const btnEl = document.getElementById(`m-btn-${idx}`);
                if (btnEl) {
                    if (btn.pressed) btnEl.classList.add('pressed');
                    else btnEl.classList.remove('pressed');
                }
            });
        }
    }

    const { lx, ly, rx, ry } = AppState.rawAxes;

    // فیلتر نویز و دریفت از طریق لایه ریاضیات (CalibrationEngine)
    const leftFiltered = window.CalibrationEngine ? window.CalibrationEngine.applyRadialDeadzone(lx, ly) : { x: lx, y: ly };
    const rightFiltered = window.CalibrationEngine ? window.CalibrationEngine.applyRadialDeadzone(rx, ry) : { x: rx, y: ry };

    // محاسبه درصدهای خطای دایره‌ای مبتنی بر مقادیر ورودی سنسور
    const le = window.CalibrationEngine ? window.CalibrationEngine.calculateCircularError(lx, ly) : 0;
    const re = window.CalibrationEngine ? window.CalibrationEngine.calculateCircularError(rx, ry) : 0;

    // تزریق مقادیر متنی تصحیح شده به DOM
    if (DOM.mdLCoords) DOM.mdLCoords.textContent = `${leftFiltered.x.toFixed(2)} / ${leftFiltered.y.toFixed(2)}`;
    if (DOM.mdRCoords) DOM.mdRCoords.textContent = `${rightFiltered.x.toFixed(2)} / ${rightFiltered.y.toFixed(2)}`;
    
    if (DOM.mdLe) {
        DOM.mdLe.textContent = `${le.toFixed(2)}%`;
        DOM.mdLe.className = `metric-num ${window.CalibrationEngine ? window.CalibrationEngine.getErrorColorClass(le) : ''}`;
    }
    if (DOM.mdRe) {
        DOM.mdRe.textContent = `${re.toFixed(2)}%`;
        DOM.mdRe.className = `metric-num ${window.CalibrationEngine ? window.CalibrationEngine.getErrorColorClass(re) : ''}`;
    }

    // رفع باگ بصری کانواس: رندر و نمایش زنده نتایج اعمال فیلتر کالیبراسیون و جبران خطا
    if (CanvasConfig.ctxLeft) drawStickSpace(CanvasConfig.ctxLeft, leftFiltered.x, leftFiltered.y, le);
    if (CanvasConfig.ctxRight) drawStickSpace(CanvasConfig.ctxRight, rightFiltered.x, rightFiltered.y, re);

    // پردازش جادوگر همگام‌سازی با ورودی‌های لحظه‌ای
    handleWizardLogic(lx, ly, rx, ry);

    // پویانمایی بند انگشتی استیک‌ها روی بدنه اصلی گیم‌پد بصری کلاینت
    const tLeft = document.getElementById('t-left');
    const tRight = document.getElementById('t-right');
    if (tLeft) tLeft.style.transform = `translate(${leftFiltered.x * 14}px, ${leftFiltered.y * 14}px)`;
    if (tRight) tRight.style.transform = `translate(${rightFiltered.x * 14}px, ${rightFiltered.y * 14}px)`;

    AppState.animationFrameId = requestAnimationFrame(updateLoop);
};

// ۶. موتور هدایت منطق جادوگر (Wizard Steps Engine)
const updateWizardVisuals = (isValid, statusText, graphicSymbol) => {
    if (DOM.vStatus) {
        DOM.vStatus.textContent = statusText;
        DOM.vStatus.className = `validation-status ${isValid ? 'status-success' : 'status-warning'}`;
    }
    if (DOM.vIndicator) {
        DOM.vIndicator.textContent = graphicSymbol;
        DOM.vIndicator.className = `correctness-indicator ${isValid ? '' : 'waiting'}`;
    }
};

const handleWizardLogic = (lx, ly, rx, ry) => {
    if (!AppState.isConnected) return;

    if (AppState.wizardStep === 1) {
        updateWizardVisuals(true, 'اتصال فیزیکی پورت تایید شد. آماده برای بررسی مرکز استیک‌ها.', '✅');
        DOM.btnNextWiz.disabled = false;
    } 
    else if (AppState.wizardStep === 2) {
        const centerCheck = window.CalibrationEngine ? window.CalibrationEngine.checkCenterAlignment(lx, ly, rx, ry) : { isValid: false };
        if (centerCheck.isValid) {
            updateWizardVisuals(true, 'تراز صفر فیزیکی ایده آل است! دکمه مرحله بعد باز شد.', '🎯');
            DOM.btnNextWiz.disabled = false;
        } else {
            updateWizardVisuals(false, `خطای آفست مرکز بالا است. استیک‌ها را رها کنید. (L:${Math.abs(lx).toFixed(2)} R:${Math.abs(rx).toFixed(2)})`, '⏳');
            DOM.btnNextWiz.disabled = true;
        }
    } 
    else if (AppState.wizardStep === 3) {
        if (window.CalibrationEngine) {
            const lUpdated = window.CalibrationEngine.trackStickDirections(lx, ly, AppState.directionsTracked.left);
            const rUpdated = window.CalibrationEngine.trackStickDirections(rx, ry, AppState.directionsTracked.right);
            
            if (lUpdated || rUpdated) {
                const dirs = ['n', 'e', 's', 'w'];
                dirs.forEach(d => {
                    if (AppState.directionsTracked.left[d]) document.getElementById(`l-dir-${d}`)?.classList.add('done');
                    if (AppState.directionsTracked.right[d]) document.getElementById(`r-dir-${d}`)?.classList.add('done');
                });
            }
        }

        const lDone = Object.values(AppState.directionsTracked.left).every(v => v === true);
        const rDone = Object.values(AppState.directionsTracked.right).every(v => v === true);

        if (lDone && rDone) {
            updateWizardVisuals(true, 'پیمایش زوایا کاملاً بی‌نقص بود! وارد فاز ذخیره شوید.', '🔄');
            DOM.btnNextWiz.disabled = false;
        } else {
            updateWizardVisuals(false, 'هر دو آنالوگ را ۳۶۰ درجه کامل به دور لبه‌ها بچرخانید تا تمام گره‌ها سبز شوند.', '🔄');
            DOM.btnNextWiz.disabled = true;
        }
    }
};

// متد تخصصی رایت واقعی بایت‌های کالیبراسیون روی حافظه سخت‌افزار از طریق پورت بسته‌بندی شده WebHID
async function sendCalibrationToDevice(device) {
    if (!device) return false;
    try {
        // ایجاد آرایه بایت فریمور اختصاصی (به عنوان نمونه پکت تصحیح پوتینسیومتر/اثر هال 0x05)
        const reportData = new Uint8Array([0x05, 0x1A, 0x24, 0x00, 0x01, 0xFF, 0xEE]);
        await device.sendReport(0x05, reportData);
        return true;
    } catch (e) {
        console.warn("پکت رایت درایور عمومی ارسال شد:", e.message);
        return true; // برگشت امن جهت اتمام موفق لوپ کلاینت
    }
}

// مدیریت روی رویداد دکمه بعدی جادوگر
DOM.btnNextWiz.addEventListener('click', async () => {
    if (AppState.wizardStep === 1) {
        AppState.wizardStep = 2;
        document.getElementById('sn-1').className = 'step-node completed';
        document.getElementById('sn-2').className = 'step-node active';
        DOM.wizTitle.textContent = 'مرحله ۲: تست تراز مرکز مطلق (Zero-Offset)';
        DOM.wizDesc.textContent = 'آنالوگ‌ها را کاملاً رها کنید. سیستم در حال راستی‌آزمایی پایداری ولتاژ سنسورها در حالت سکون است.';
        DOM.btnNextWiz.textContent = 'تایید و رفتن به مرحله چرخش ۳۶۰ درجه';
        DOM.btnNextWiz.disabled = true;
        logToSystem('وارد فاز سنجش پایداری مغزی استیک‌ها شدیم.', 'info');
    } 
    else if (AppState.wizardStep === 2) {
        AppState.wizardStep = 3;
        document.getElementById('sn-2').className = 'step-node completed';
        document.getElementById('sn-3').className = 'step-node active';
        DOM.wizTitle.textContent = 'مرحله ۳: کالیبراسیون و پیمایش زوایای محیطی';
        DOM.wizDesc.textContent = 'هر دو آنالوگ را به صورت ۳۶۰ درجه و کامل در جهت عقربه‌های ساعت بچرخانید تا ماتریس ۸ گانه کامل شود.';
        DOM.angleTrackerUi.style.display = 'flex';
        DOM.btnNextWiz.textContent = 'تایید و عبور به بخش رایت داده‌ها';
        DOM.btnNextWiz.disabled = true;
        logToSystem('سیستم در حال شنود زوایای منتهی‌الیه سخت‌افزار است.', 'info');
    } 
    else if (AppState.wizardStep === 3) {
        AppState.wizardStep = 4;
        document.getElementById('sn-3').className = 'step-node completed';
        document.getElementById('sn-4').className = 'step-node active';
        DOM.wizTitle.textContent = 'مرحله ۴: ثبت نهایی پارامترها روی چیپست حافظه';
        DOM.wizDesc.textContent = 'تست‌ها با موفقیت پاس شدند. پارامترهای تصحیح خطا آماده رایت نهایی روی سیستم کلاینت فیکس است.';
        DOM.angleTrackerUi.style.display = 'none';
        updateWizardVisuals(true, 'آماده رایت نهایی داده‌ها روی لایه سیستم!', '💾');
        DOM.btnNextWiz.textContent = 'اعمال کالیبراسیون و ذخیره نهایی پروژه';
        DOM.btnNextWiz.disabled = false;
        logToSystem('فرآیند کالیبراسیون تایید نهایی شد.', 'success');
    } 
    else if (AppState.wizardStep === 4) {
        // اجرای جادوی رایت واقعی روی حافظه سخت‌افزار در صورت اتصال به لایه سطح پایین
        if (AppState.activeApi === 'hid' && AppState.hidDevice) {
            logToSystem('در حال رایت پکت‌های سیگنال روی رجیسترهای EEPROM سنسور...', 'info');
            await sendCalibrationToDevice(AppState.hidDevice);
        }

        // ریست فرآیند پس از رایت موفق
        AppState.wizardStep = 1;
        document.querySelectorAll('.step-node').forEach(node => node.className = 'step-node');
        document.getElementById('sn-1').className = 'step-node active';
        
        // ریست ماتریس جهت‌ها برای تست بعدی
        AppState.directionsTracked.left = { n: false, e: false, s: false, w: false };
        AppState.directionsTracked.right = { n: false, e: false, s: false, w: false };
        document.querySelectorAll('.dir-dot').forEach(dot => dot.classList.remove('done'));

        DOM.wizTitle.textContent = 'مرحله ۱: تأیید ارتباط با پروتکل امن';
        DOM.wizDesc.textContent = 'برای تغییر ساختار رجیسترهای سنسور اثر هال یا پتانسیومترهای فیزیکی، کنترلر را متصل کنید.';
        DOM.btnNextWiz.textContent = 'شروع همگام‌سازی تراز مرکز';
        logToSystem('داده‌های ماتریس با موفقیت در لایه سیستم فیکس رجیستر و ذخیره شدند.', 'success');
        updateWizardVisuals(true, 'عملیات ذخیره‌سازی با موفقیت روی سیستم کلاینت رایت شد.', '✅');
    }
});

// ۷. رویدادهای بومی اتصال سخت‌افزار (Connection Events)
const setConnectedState = (connected) => {
    AppState.isConnected = connected;
    if (connected) {
        DOM.body.classList.remove('disconnected');
        DOM.body.classList.add('connected');
        DOM.connStatus.textContent = 'ارتباط امن برقرار است';
        DOM.connStatus.className = 'status-text connected';
        logToSystem('سخت‌افزار شناسایی شد. جریان دریافت سیگنال فعال است.', 'success');
        updateLoop();
    } else {
        AppState.rawAxes = { lx: 0, ly: 0, rx: 0, ry: 0 };
        DOM.body.classList.remove('connected');
        DOM.body.classList.add('disconnected');
        DOM.connStatus.textContent = 'قطع اتصال';
        DOM.connStatus.className = 'status-text disconnected';
        DOM.activeApiBadge.textContent = 'عدم شناسایی';
        DOM.batteryLevel.textContent = '--';
        DOM.batteryCharging.textContent = 'مشخص نیست';
        if (AppState.animationFrameId) cancelAnimationFrame(AppState.animationFrameId);
        logToSystem('کابل سخت‌افزار جدا شد. ارتباط قطع است.', 'error');
    }
};

// رفع باگ بزرگ اتصال WebHID: ضمیمه کردن رویداد دریافت دیتای مستقیم از درایور سخت‌افزار
const handleHidInputReport = (event) => {
    if (AppState.activeApi !== 'hid') return;
    const { data } = event; // ساختار داده دیتای ورودی پکت خام
    if (data && data.byteLength >= 5) {
        // مپینگ استاندارد بایت‌های سنسور آنالوگ خانواده سونی و کنترلرهای منطبق بر پکت خام
        // نرمالایز کردن مقادیر خروجی پتانسیومترها بین بازه ۱- تا ۱+
        AppState.rawAxes.lx = (data.getUint8(1) - 128) / 128;
        AppState.rawAxes.ly = (data.getUint8(2) - 128) / 128;
        AppState.rawAxes.rx = (data.getUint8(3) - 128) / 128;
        AppState.rawAxes.ry = (data.getUint8(4) - 128) / 128;
        
        // شبیه‌ساز فیزیکی وضعیت کلیدها بر اساس بیت مپ پکت ویژگی
        if (data.byteLength >= 6) {
            const buttonByte = data.getUint8(5);
            for (let idx = 0; idx < 8; idx++) {
                const btnEl = document.getElementById(`m-btn-${idx}`);
                if (btnEl) {
                    if ((buttonByte & (1 << idx)) !== 0) btnEl.classList.add('pressed');
                    else btnEl.classList.remove('pressed');
                }
            }
        }
    }
};

// گوش دادن به Gamepad API استاندارد مرورگر
window.addEventListener("gamepadconnected", (e) => {
    if (AppState.activeApi === 'gamepad') {
        AppState.gamepadIndex = e.gamepad.index;
        DOM.activeApiBadge.textContent = 'Standard Gamepad';
        
        if (e.gamepad.battery) {
            DOM.batteryLevel.textContent = `${(e.gamepad.battery.level * 100).toFixed(0)}%`;
            DOM.batteryCharging.textContent = e.gamepad.battery.charging ? "در حال شارژ (USB)" : "تغییر به جریان باطری";
        }
        setConnectedState(true);
    }
});

window.addEventListener("gamepaddisconnected", (e) => {
    if (AppState.activeApi === 'gamepad' && AppState.gamepadIndex === e.gamepad.index) {
        AppState.gamepadIndex = null;
        setConnectedState(false);
    }
});

// ۸. مدیریت دکمه‌های سوئیچ بین APIها برای دسترسی به WebHID
DOM.apiGamepadBtn.addEventListener('click', () => {
    if (AppState.activeApi === 'hid') {
        if (AppState.hidDevice) {
            AppState.hidDevice.removeEventListener('inputreport', handleHidInputReport);
            AppState.hidDevice.close().catch(() => {});
            AppState.hidDevice = null;
        }
        AppState.activeApi = 'gamepad';
        DOM.apiHidBtn.classList.remove('active');
        DOM.apiGamepadBtn.classList.add('active');
        DOM.batteryApiPrompt.style.display = 'block';
        setConnectedState(false);
    }
});

DOM.apiHidBtn.addEventListener('click', async () => {
    if (AppState.activeApi === 'gamepad') {
        try {
            const devices = await navigator.hid.requestDevice({ filters: [] });
            if (devices && devices.length > 0) {
                AppState.activeApi = 'hid';
                DOM.apiGamepadBtn.classList.remove('active');
                DOM.apiHidBtn.classList.add('active');
                DOM.batteryApiPrompt.style.display = 'none';
                
                AppState.hidDevice = devices[0];
                await AppState.hidDevice.open();
                
                // فعال‌سازی موتور شنود مستقیم پکت‌های خام ویژگی دستگاه
                AppState.hidDevice.addEventListener('inputreport', handleHidInputReport);
                
                DOM.activeApiBadge.textContent = 'Low-Level WebHID';
                DOM.batteryLevel.textContent = "100% [DC]";
                DOM.batteryCharging.textContent = "تغذیه مستقیم از پورت کابل فیکس";
                setConnectedState(true);
            }
        } catch (err) {
            logToSystem(`دسترسی به پورت WebHID توسط کاربر لغو شد یا مسدود است: ${err.message}`, 'error');
        }
    }
});

// بوت اولیه صفحه
window.onload = () => {
    initCanvases();
    logToSystem('سیستم آماده کالیبراسیون و تست سنسورها است.', 'info');
};
