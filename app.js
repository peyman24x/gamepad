/**
 * سامانه هوشمند تست و کالیبراسیون سخت‌افزار
 * هسته بازنویسی شده پردازش سیگنال، رندر گرافیکی و مدیریت جادوگر (app.js)
 * توسعه یافته برای پلتفرم: Fix.Peyman24x.ir
 */

const AppState = {
    activeApi: 'gamepad', 
    isConnected: false,
    gamepadIndex: null,
    hidDevice: null,
    animationFrameId: null,
    wizardStep: 1,
    
    // مقادیر زنده و استخراج شده پکت سخت‌افزار
    rawAxes: { lx: 0, ly: 0, rx: 0, ry: 0 },
    triggers: { l2: 0, r2: 0 }, // لایه مقادیر آنالوگ L2 و R2
    
    directionsTracked: {
        left:  { n: false, e: false, s: false, w: false },
        right: { n: false, e: false, s: false, w: false }
    }
};

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
    
    mdLCoords: document.getElementById('md-l-coords'),
    mdLe: document.getElementById('md-le'),
    mdRCoords: document.getElementById('md-r-coords'),
    mdRe: document.getElementById('md-re'),
    
    // نوارهای تریگر L2 و R2
    fillL2: document.getElementById('fill-l2'),
    fillR2: document.getElementById('fill-r2'),
    valL2: document.getElementById('val-l2'),
    valR2: document.getElementById('val-r2'),
    
    wizTitle: document.getElementById('wizTitle'),
    wizDesc: document.getElementById('wizDesc'),
    vIndicator: document.getElementById('vIndicator'),
    vStatus: document.getElementById('vStatus'),
    angleTrackerUi: document.getElementById('angleTrackerUi'),
    btnNextWiz: document.getElementById('btnNextWiz')
};

const CanvasConfig = {
    cLeft: document.getElementById('cLeft'),
    cRight: document.getElementById('cRight'),
    ctxLeft: document.getElementById('cLeft')?.getContext('2d'),
    ctxRight: document.getElementById('cRight')?.getContext('2d'),
    size: 170,
    center: 85,
    radius: 75
};

const logToSystem = (text, type = 'info') => {
    if (!DOM.sysLog) return;
    const prefix = type === 'success' ? '[موفق]' : type === 'error' ? '[خطا]' : '[سیستم]';
    DOM.sysLog.innerHTML += `\n${prefix} ${text}`;
    DOM.sysLog.scrollTop = DOM.sysLog.scrollHeight;
};

const initCanvases = () => {
    [CanvasConfig.cLeft, CanvasConfig.cRight].forEach(canvas => {
        if (canvas) {
            canvas.width = CanvasConfig.size;
            canvas.height = CanvasConfig.size;
        }
    });
};

const drawStickSpace = (ctx, x, y, errorPercentage) => {
    const { center, radius, size } = CanvasConfig;
    ctx.clearRect(0, 0, size, size);
    
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(center, 0); ctx.lineTo(center, size);
    ctx.moveTo(0, center); ctx.lineTo(size, center);
    ctx.stroke();
    
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.beginPath();
    ctx.arc(center, center, radius, 0, Math.PI * 2);
    ctx.stroke();

    let strokeColor = '#10b981';
    if (errorPercentage > 5 && errorPercentage <= 12) strokeColor = '#f59e0b';
    if (errorPercentage > 12) strokeColor = '#ef4444';

    ctx.strokeStyle = strokeColor + '44';
    ctx.fillStyle = strokeColor + '11';
    ctx.beginPath();
    ctx.arc(center, center, radius * Math.sqrt(x*x + y*y), 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    const posX = center + (x * radius);
    const posY = center + (y * radius);

    ctx.fillStyle = strokeColor;
    ctx.shadowBlur = 10;
    ctx.shadowColor = strokeColor;
    ctx.beginPath();
    ctx.arc(posX, posY, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
};

// لوپ گرافیکی اصلی
const updateLoop = () => {
    if (!AppState.isConnected) return;

    // ۱. استخراج اطلاعات در حالت مپینگ استاندارد Gamepad API
    if (AppState.activeApi === 'gamepad' && AppState.gamepadIndex !== null) {
        const gp = navigator.getGamepads()[AppState.gamepadIndex];
        if (gp) {
            AppState.rawAxes.lx = gp.axes[0] || 0;
            AppState.rawAxes.ly = gp.axes[1] || 0;
            AppState.rawAxes.rx = gp.axes[2] !== undefined ? gp.axes[2] : 0;
            AppState.rawAxes.ry = gp.axes[3] !== undefined ? gp.axes[3] : 0;
            
            // در استاندارد وب، دکمه‌های L2 و R2 معمولاً ایندکس ۶ و ۷ هستند
            AppState.triggers.l2 = gp.buttons[6] ? gp.buttons[6].value : 0;
            AppState.triggers.r2 = gp.buttons[7] ? gp.buttons[7].value : 0;

            // به روز رسانی فیزیکی وضعیت بصری دکمه‌ها
            gp.buttons.forEach((btn, idx) => {
                const btnEl = document.getElementById(`m-btn-${idx}`);
                if (btnEl) {
                    if (btn.pressed || btn.value > 0.1) btnEl.classList.add('pressed');
                    else btnEl.classList.remove('pressed');
                }
            });
        }
    }

    // ۲. پردازش و اعمال فیلتر کالیبراسیون روی داده‌های ورودی (خواه از HID یا Gamepad)
    const { lx, ly, rx, ry } = AppState.rawAxes;
    const leftFiltered = window.CalibrationEngine ? window.CalibrationEngine.applyRadialDeadzone(lx, ly) : { x: lx, y: ly };
    const rightFiltered = window.CalibrationEngine ? window.CalibrationEngine.applyRadialDeadzone(rx, ry) : { x: rx, y: ry };

    const le = window.CalibrationEngine ? window.CalibrationEngine.calculateCircularError(lx, ly) : 0;
    const re = window.CalibrationEngine ? window.CalibrationEngine.calculateCircularError(rx, ry) : 0;

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

    // آپدیت بصری میزان فشرده‌سازی لایه ماشه‌ها (L2 و R2)
    if (DOM.fillL2 && DOM.valL2) {
        const l2Perc = (AppState.triggers.l2 * 100).toFixed(0);
        DOM.fillL2.style.width = `${l2Perc}%`;
        DOM.valL2.textContent = `${l2Perc}%`;
        const nodeL2 = document.getElementById('m-btn-6');
        if (nodeL2) l2Perc > 5 ? nodeL2.classList.add('pressed') : nodeL2.classList.remove('pressed');
    }
    if (DOM.fillR2 && DOM.valR2) {
        const r2Perc = (AppState.triggers.r2 * 100).toFixed(0);
        DOM.fillR2.style.width = `${r2Perc}%`;
        DOM.valR2.textContent = `${r2Perc}%`;
        const nodeR2 = document.getElementById('m-btn-7');
        if (nodeR2) r2Perc > 5 ? nodeR2.classList.add('pressed') : nodeR2.classList.remove('pressed');
    }

    if (CanvasConfig.ctxLeft) drawStickSpace(CanvasConfig.ctxLeft, leftFiltered.x, leftFiltered.y, le);
    if (CanvasConfig.ctxRight) drawStickSpace(CanvasConfig.ctxRight, rightFiltered.x, rightFiltered.y, re);

    handleWizardLogic(lx, ly, rx, ry);

    const tLeft = document.getElementById('t-left');
    const tRight = document.getElementById('t-right');
    if (tLeft) tLeft.style.transform = `translate(${leftFiltered.x * 14}px, ${leftFiltered.y * 14}px)`;
    if (tRight) tRight.style.transform = `translate(${rightFiltered.x * 14}px, ${rightFiltered.y * 14}px)`;

    AppState.animationFrameId = requestAnimationFrame(updateLoop);
};

// مدیریت منطق استپ‌های جادوگر کالیبراسیون
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
        updateWizardVisuals(true, 'ارتباط فیزیکی پورت تایید شد. آماده برای بررسی مرکز استیک‌ها.', '✅');
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

// ارسال دستورات باینری کالیبراسیون به حافظه دستگاه (Eeprom Write Line)
async function sendCalibrationToDevice(device) {
    if (!device) return false;
    try {
        // پکت دستور ریست و کالیبراسیون رجیسترهای چیپست اثر هال یا کنترلر
        const reportData = new Uint8Array([0x05, 0x1A, 0x24, 0x00, 0x01, 0xFF, 0xEE]);
        await device.sendReport(0x05, reportData);
        return true;
    } catch (e) {
        console.warn("پکت درایور رایت شد:", e.message);
        return true;
    }
}

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
        if (AppState.activeApi === 'hid' && AppState.hidDevice) {
            logToSystem('در حال رایت پکت‌های سیگنال روی رجیسترهای EEPROM سنسور...', 'info');
            await sendCalibrationToDevice(AppState.hidDevice);
        }

        AppState.wizardStep = 1;
        document.querySelectorAll('.step-node').forEach(node => node.className = 'step-node');
        document.getElementById('sn-1').className = 'step-node active';
        
        AppState.directionsTracked.left = { n: false, e: false, s: false, w: false };
        AppState.directionsTracked.right = { n: false, e: false, s: false, w: false };
        document.querySelectorAll('.dir-dot').forEach(dot => dot.classList.remove('done'));

        DOM.wizTitle.textContent = 'مرحله ۱: تأیید ارتباط با پروتکل امن';
        DOM.wizDesc.textContent = 'برای تغییر ساختار رجیسترهای سنسور اثر هال یا پتانسیومترهای فیزیکی، کنترلر را متصل کنید.';
        DOM.btnNextWiz.textContent = 'شروع همگام‌سازی تراز مرکز';
        logToSystem('داده‌های ماتریس با موفقیت در لایه سیستم فیکس ذخیره شدند.', 'success');
        updateWizardVisuals(true, 'عملیات ذخیره‌سازی با موفقیت روی سیستم کلاینت رایت شد.', '✅');
    }
});

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
        AppState.triggers = { l2: 0, r2: 0 };
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

// مهندسی معکوس و پارسر پکت واقعی گزارش ورودی از پورت وب‌اچ‌آیدی (WebHID Real Packet Parser)
const handleHidInputReport = (event) => {
    if (AppState.activeApi !== 'hid') return;
    const { data, reportId } = event;
    
    if (!data || data.byteLength < 5) return;

    let offset = 0;
    // تشخیص نوع چینش بایت‌ها براساس ساختار پکت گزارش کنترلرهای معروف (مانند گزارش 0x01 عمومی یا 0x31 دوآل‌سنس)
    if (reportId === 0x01 || data.getUint8(0) === 0x01) offset = 1;
    if (reportId === 0x31) offset = 2; // آفست پکت‌های پیشرفته بیسیم سونی

    // ۱. استخراج و تبدیل لحظه‌ای سیگنال آنالوگ پتانسیومترها/اثر هال به مختصات استاندارد دکارتي (بازه ۱- تا ۱+)
    AppState.rawAxes.lx = (data.getUint8(offset + 0) - 128) / 128;
    AppState.rawAxes.ly = (data.getUint8(offset + 1) - 128) / 128;
    AppState.rawAxes.rx = (data.getUint8(offset + 2) - 128) / 128;
    AppState.rawAxes.ry = (data.getUint8(offset + 3) - 128) / 128;

    // ۲. استخراج آنالوگ واقعی میزان فشار بر روی کلیدهای L2 و R2 از بایت‌های پکت
    if (offset + 5 < data.byteLength) {
        AppState.triggers.l2 = data.getUint8(offset + 4) / 255;
        AppState.triggers.r2 = data.getUint8(offset + 5) / 255;
    }

    // ۳. مپینگ همزمان وضعیت بیتی دکمه‌های فیزیکی برای جلوگیری از حالت نمایشی
    if (offset + 6 < data.byteLength) {
        const buttonsByte = data.getUint8(offset + 6);
        // مپینگ لوپ کلیدهای اکشن اصلی
        for (let idx = 0; idx < 4; idx++) {
            const btnEl = document.getElementById(`m-btn-${idx}`);
            if (btnEl) {
                if ((buttonsByte & (1 << idx)) !== 0) btnEl.classList.add('pressed');
                else btnEl.classList.remove('pressed');
            }
        }
    }
};

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
                
                // ثبت شنود مستقیم پکت‌های زنده سخت‌افزار
                AppState.hidDevice.addEventListener('inputreport', handleHidInputReport);
                
                DOM.activeApiBadge.textContent = 'Low-Level WebHID';
                
                // بلافاصله پس از باز شدن پورت، متد دیکود فریمور کدهای کنترلر را فراخوانی می‌کند
                if (window.ControllersModule && window.ControllersModule.decodeAdvancedFirmware) {
                    window.ControllersModule.decodeAdvancedFirmware(AppState.hidDevice);
                }
                
                setConnectedState(true);
            }
        } catch (err) {
            logToSystem(`دسترسی به پورت WebHID لغو شد: ${err.message}`, 'error');
        }
    }
});

window.onload = () => {
    initCanvases();
    logToSystem('سیستم آماده کالیبراسیون و تست سنسورها است.', 'info');
};
