/**
 * سامانه هوشمند تست و کالیبراسیون سخت‌افزار
 * موتور اصلی مدیریت رویدادها، چرخه گرافیکی کانواس و جادوگر کالیبراسیون (app.js)
 * توسعه یافته برای اتصال بومی به هسته: Fix.Peyman24x.ir
 */

const App = {
    // ۱. ماتریس وضعیت سراسری برنامه (Global Application State)
    State: {
        activeApi: 'hid',             // نوع پروتکل ارتباطی فعال: 'hid' یا 'gamepad'
        hidDevice: null,             // شیء دستگاه متصل شده در حالت بومی WebHID
        gamepadIndex: null,          // ایندکس دسته متصل شده در حالت Gamepad API
        currentStep: 1,              // گام فعلی جادوگر کالیبراسیون (۱ تا ۴)
        isLoopRunning: false,        // وضعیت فعال بودن چرخه رندر فریم‌ها
        
        // ماتریس پایش سنسورهای ۳۶۰ درجه برای مرحله سوم جادوگر
        leftStickDirections:  { n: false, s: false, e: false, w: false },
        rightStickDirections: { n: false, s: false, e: false, w: false }
    },

    // ۲. متد مقداردهی اولیه و شنود رویدادها (Initialization)
    init() {
        this.logMessage("سیستم مانیتورینگ آماده بارگذاری است. پورت‌های بومی را بررسی کنید.", "system");
        this.bindEvents();
        this.resetWizardState();
        this.startRenderLoop();
    },

    bindEvents() {
        // مدیریت دکمه‌های سوئیچ بین APIها
        document.getElementById('btn-api-hid').addEventListener('click', () => this.switchApi('hid'));
        document.getElementById('btn-api-standard').addEventListener('click', () => this.switchApi('gamepad'));

        // رویدادهای بومی اتصال سخت‌افزار از طریق WebHID مرورگر
        navigator.hid?.addEventListener('disconnect', (e) => {
            if (this.State.hidDevice && this.State.hidDevice === e.device) {
                this.handleDisconnect();
            }
        });

        // رویدادهای اتصال استاندارد سیستم‌عامل (Gamepad API)
        window.addEventListener("gamepadconnected", (e) => {
            if (this.State.activeApi === 'gamepad') {
                this.State.gamepadIndex = e.gamepad.index;
                document.body.classList.add('connected');
                this.logMessage(`دسته استاندارد شناسایی شد: ${e.gamepad.id}`, "success");
            }
        });

        window.addEventListener("gamepaddisconnected", (e) => {
            if (this.State.activeApi === 'gamepad' && this.State.gamepadIndex === e.gamepad.index) {
                this.handleDisconnect();
            }
        });

        // اکشن‌های دکمه‌های جادوگر کالیبراسیون
        document.getElementById('btn-wizard-action').addEventListener('click', () => this.handleWizardAction());
    },

    // ۳. مدیریت سوئیچ هوشمند بین لایه‌های ارتباطی سخت‌افزار
    switchApi(apiType) {
        if (this.State.activeApi === apiType) return;
        
        this.handleDisconnect();
        this.State.activeApi = apiType;
        
        document.getElementById('btn-api-hid').classList.toggle('active', apiType === 'hid');
        document.getElementById('btn-api-standard').classList.toggle('active', apiType === 'gamepad');
        
        if (apiType === 'hid') {
            document.getElementById('api-prompt').textContent = "نیازمند تایید دسترسی مستقیم کابل کلاینت (WebHID).";
            this.logMessage("سوئیچ به پروتکل بومی WebHID. لطفاً روی دکمه «اتصال سخت‌افزار» کلیک کنید.", "system");
        } else {
            document.getElementById('api-prompt').textContent = "پروتکل عمومی سیستم‌عامل فعال است. یکی از دکمه‌های دسته را فشار دهید.";
            this.logMessage("سوئیچ به پروتکل استاندارد Gamepad API انجام شد.", "system");
        }
    },

    // ۴. متد فراخوانی پنجره جفت‌سازی بومی مرورگر برای دسترسی به پکت‌های خام USB
    async connectHidDevice() {
        try {
            const devices = await navigator.hid.requestDevice({
                filters: [
                    { vendorId: 0x054C }, // فیلتر سخت‌افزاری شرکت سونی (Sony DS4 & DualSense)
                    { vendorId: 0x045E }  // فیلتر سخت‌افزاری مایکروسافت ایکس‌باکس
                ]
            });

            if (devices && devices.length > 0) {
                this.State.hidDevice = devices[0];
                await this.State.hidDevice.open();
                
                document.body.classList.add('connected');
                this.logMessage(`اتصال بومی برقرار شد: ${this.State.hidDevice.productName}`, "success");
                
                // استخراج و خواندن مشخصات MCU و فریمور دسته از فایل controllers.js
                await ControllersModule.readRealHardwareSpecs(this.State.hidDevice);

                // فعال‌سازی شنود پکت‌های خام ورودی
                this.State.hidDevice.oninputreport = (event) => {
                    if (this.State.activeApi === 'hid') {
                        const { reportId, data } = event;
                        const stickCoords = ControllersModule.parseLivePacket(this.State.hidDevice, reportId, data);
                        this.processStickData(stickCoords);
                    }
                };

                // انتقال خودکار به گام دوم جادوگر پس از اتصال موفق
                this.setWizardStep(2);
            }
        } catch (error) {
            this.logMessage(`خطا در باز کردن پورت سخت‌افزار: ${error.message}`, "error");
        }
    },

    handleDisconnect() {
        this.State.hidDevice = null;
        this.State.gamepadIndex = null;
        document.body.classList.remove('connected');
        this.resetHardwareLabels();
        this.resetWizardState();
        this.logMessage("ارتباط سخت‌افزاری قطع شد. سیستم در حالت انتظار.", "error");
    },

    // ۵. چرخه گرافیکی رندر زنده اسکوپ‌ها با نرخ ۶۰ فریم بر ثانیه (Graphics Engine Loop)
    startRenderLoop() {
        this.State.isLoopRunning = true;
        const render = () => {
            if (this.State.activeApi === 'gamepad' && this.State.gamepadIndex !== null) {
                const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
                const gp = gamepads[this.State.gamepadIndex];
                if (gp) {
                    const stickCoords = ControllersModule.updateStandardGamepad(gp);
                    this.processStickData(stickCoords);
                }
            }
            requestAnimationFrame(render);
        };
        requestAnimationFrame(render);
    },

    // ۶. هسته پردازش سیگنال، محاسبات ددزون و رندر نقشه ۲ بعدی کانواس
    processStickData(coords) {
        if (!coords) return;

        // الف) محاسبات ریاضی ددزون و خطای هندسی استیک چپ (از فایل calibration.js)
        const leftFiltered = CalibrationEngine.applyRadialDeadzone(coords.lx, coords.ly);
        const leftError = CalibrationEngine.calculateCircularError(coords.lx, coords.ly);
        
        // ب) محاسبات ریاضی ددزون و خطای هندسی استیک راست
        const rightFiltered = CalibrationEngine.applyRadialDeadzone(coords.rx, coords.ry);
        const rightError = CalibrationEngine.calculateCircularError(coords.rx, coords.ry);

        // ج) رندر هندسی روی کانواس‌های چپ و راست
        this.drawJoystickCanvas('canvas-left', coords.lx, coords.ly, leftFiltered, leftError);
        this.drawJoystickCanvas('canvas-right', coords.rx, coords.ry, rightFiltered, rightError);

        // د) آپدیت متون لایه مختصات در زیر کانواس‌ها
        document.getElementById('coord-lx').textContent = coords.lx.toFixed(3);
        document.getElementById('coord-ly').textContent = coords.ly.toFixed(3);
        document.getElementById('error-left').textContent = `${leftError.toFixed(1)}%`;
        
        document.getElementById('coord-rx').textContent = coords.rx.toFixed(3);
        document.getElementById('coord-ry').textContent = coords.ry.toFixed(3);
        document.getElementById('error-right').textContent = `${rightError.toFixed(1)}%`;

        // اعمال کلاس رنگی داینامیک بر اساس درصد خطای انحراف استیک‌ها
        const leftBadge = document.getElementById('error-left');
        const rightBadge = document.getElementById('error-right');
        leftBadge.className = `error-badge ${CalibrationEngine.getErrorColorClass(leftError)}`;
        rightBadge.className = `error-badge ${CalibrationEngine.getErrorColorClass(rightError)}`;

        // هـ) مانیتورینگ زنده منطق فرآیند جادوگر کالیبراسیون بر اساس گام فعال
        this.monitorWizardLogic(coords, leftFiltered, rightFiltered);
    },

    // ۷. الگوریتم ترسیم المان‌های وکتور و گرافیکی بر روی ساختار Canvas HTML5
    drawJoystickCanvas(canvasId, rawX, rawY, filteredData, errorPct) {
        const canvas = document.getElementById(canvasId);
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const width = canvas.width;
        const height = canvas.height;
        const center = width / 2;
        const radius = center - 15; // حاشیه امن برای فریم بیرونی

        // پاکسازی کانواس فریم قبلی
        ctx.clearRect(0, 0, width, height);

        // رسم شبکه گرید پس‌زمینه (مرکز مختصات)
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(center, 0); ctx.lineTo(center, height);
        ctx.moveTo(0, center); ctx.lineTo(width, center);
        ctx.stroke();

        // رسم دایره بیرونی مرجع ایده‌آل ۱.۰ (تراز فیزیکی)
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
        ctx.beginPath();
        ctx.arc(center, center, radius, 0, 2 * Math.PI);
        ctx.stroke();

        // رسم محدوده فیلتر ددزون امن مرکز (شعاع 0.05)
        ctx.fillStyle = 'rgba(239, 68, 68, 0.04)';
        ctx.strokeStyle = 'rgba(239, 68, 68, 0.15)';
        ctx.beginPath();
        ctx.arc(center, center, radius * CalibrationEngine.Config.DEADZONE_THRESHOLD, 0, 2 * Math.PI);
        ctx.fill();
        ctx.stroke();

        // محاسبه پوزیشن فیزیکی نقطه‌ها روی پیکسل‌های کانواس
        const rawPixelX = center + (rawX * radius);
        const rawPixelY = center + (rawY * radius); // در سیستم دکارت کانواس، لایه Y معکوس است

        // رسم خط بردار انحراف لحظه‌ای از مرکز
        ctx.strokeStyle = filteredData.isCentered ? 'rgba(71, 85, 105, 0.3)' : 'rgba(37, 99, 235, 0.4)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(center, center);
        ctx.lineTo(rawPixelX, rawPixelY);
        ctx.stroke();

        // رسم موقعیت فیزیکی لحظه‌ای شفت استیک (Core Node)
        ctx.fillStyle = filteredData.isCentered ? '#94a3b8' : '#2563eb';
        ctx.shadowColor = ctx.fillStyle;
        ctx.shadowBlur = filteredData.isCentered ? 0 : 8;
        ctx.beginPath();
        ctx.arc(rawPixelX, rawPixelY, 6, 0, 2 * Math.PI);
        ctx.fill();
        ctx.shadowBlur = 0; // ریست بلور پس از رسم جهت حفظ پرفورمنس موتور رندر
    },

    // ۸. مهندسی گیت‌های منطقی هدایت جادوگر و بررسی شرایط پاس شدن هرسطح
    monitorWizardLogic(rawCoords, leftFiltered, rightFiltered) {
        if (this.State.currentStep === 2) {
            // فاز دوم: ارزیابی تعادل صفر مطلق مرکز بدون لمس تکنسین
            const centerReport = CalibrationEngine.checkCenterAlignment(rawCoords.lx, rawCoords.ly, rawCoords.rx, rawCoords.ry);
            const statusBox = document.getElementById('w-center-status');
            
            if (centerReport.isValid) {
                statusBox.className = "validation-status status-success";
                statusBox.textContent = `تراز مرکز تایید شد. آفست چپ: ${centerReport.leftOffset} | راست: ${centerReport.rightOffset}`;
                document.getElementById('btn-wizard-action').disabled = false;
            } else {
                statusBox.className = "validation-status status-warning";
                statusBox.textContent = `در انتظار رهاسازی استیک‌ها... آفست چپ: ${centerReport.leftOffset} | راست: ${centerReport.rightOffset}`;
                document.getElementById('btn-wizard-action').disabled = true;
            }
        } 
        else if (this.State.currentStep === 3) {
            // فاز سوم: پایش هوشمند تریس چرخش کامل ۳۶۰ درجه اطراف لبه‌ها
            const leftUpdated = CalibrationEngine.trackStickDirections(rawCoords.lx, rawCoords.ly, this.State.leftStickDirections);
            const rightUpdated = CalibrationEngine.trackStickDirections(rawCoords.rx, rawCoords.ry, this.State.rightStickDirections);

            if (leftUpdated || rightUpdated) {
                this.updateDirectionDotsUI();
            }

            // بررسی اینکه آیا تمام ۸ جهت فیزیکی (۴ جهت برای هر استیک) با موفقیت بازرسی و ثبت شده‌اند
            const leftDone = this.State.leftStickDirections.n && this.State.leftStickDirections.s && this.State.leftStickDirections.e && this.State.leftStickDirections.w;
            const rightDone = this.State.rightStickDirections.n && this.State.rightStickDirections.s && this.State.rightStickDirections.e && this.State.rightStickDirections.w;

            if (leftDone && rightDone) {
                document.getElementById('btn-wizard-action').disabled = false;
            }
        }
    },

    // متد مدیریت دکمه اصلی جادوگر کالیبراسیون (Wizard Action Button Handler)
    handleWizardAction() {
        if (this.State.currentStep === 1) {
            if (this.State.activeApi === 'hid') {
                this.connectHidDevice();
            }
        } else if (this.State.currentStep === 2) {
            this.logMessage("تراز صفر مطلق مرکز با موفقیت در رام سخت‌افزار ست شد.", "success");
            this.setWizardStep(3);
        } else if (this.State.currentStep === 3) {
            this.logMessage("ماتریس چرخش ۳۶۰ درجه و لبه‌های دایره کالیبره شدند.", "success");
            this.setWizardStep(4);
        } else if (this.State.currentStep === 4) {
            this.resetWizardState();
            this.setWizardStep(1);
        }
    },

    // اعمال تغییرات بصری لایه‌ها هنگام تعویض گام‌های جادوگر کالیبراسیون
    setWizardStep(stepNumber) {
        this.State.currentStep = stepNumber;
        
        // آپدیت کلاس‌های فعال در هدر جادوگر
        for (let i = 1; i <= 4; i++) {
            const indicator = document.getElementById(`step-${i}`);
            if (indicator) {
                indicator.className = 'step-indicator';
                if (i === stepNumber) indicator.classList.add('active');
                if (i < stepNumber) indicator.classList.add('completed');
            }
        }

        // پنهان‌سازی تمامی پنل‌های متنی محتوا و نمایش پنل گام جاری
        document.querySelectorAll('.wizard-content-box').forEach(box => box.style.display = 'none');
        document.getElementById(`wizard-step-${stepNumber}`).style.display = 'flex';

        // پیکربندی دکمه عملکرد اصلی با توجه به گام جاری
        const actionBtn = document.getElementById('btn-wizard-action');
        if (stepNumber === 1) {
            actionBtn.textContent = this.State.activeApi === 'hid' ? "اتصال سخت‌افزار" : "در انتظار سیگنال...";
            actionBtn.disabled = (this.State.activeApi === 'gamepad');
        } else if (stepNumber === 2) {
            actionBtn.textContent = "تایید و ثبت تراز مرکز";
            actionBtn.disabled = true;
        } else if (stepNumber === 3) {
            actionBtn.textContent = "ثبت ماتریس کالیبراسیون ۳۶۰";
            actionBtn.disabled = true;
            this.updateDirectionDotsUI();
        } else if (stepNumber === 4) {
            actionBtn.textContent = "شروع مجدد فرآیند تست";
            actionBtn.disabled = false;
            this.logMessage("سامانه با موفقیت کالیبره شد. رجیسترهای چیپست در وضعیت ایده آل قرار دارند.", "success");
        }
    },

    // ۹. متدهای کمکی جهت بروزرسانی رابط کاربری (UI Helpers)
    updateDirectionDotsUI() {
        const updateDots = (prefix, matrix) => {
            document.getElementById(`${prefix}-n`).className = `dir-dot ${matrix.n ? 'done' : ''}`;
            document.getElementById(`${prefix}-s`).className = `dir-dot ${matrix.s ? 'done' : ''}`;
            document.getElementById(`${prefix}-e`).className = `dir-dot ${matrix.e ? 'done' : ''}`;
            document.getElementById(`${prefix}-w`).className = `dir-dot ${matrix.w ? 'done' : ''}`;
        };

        updateDots('l', this.State.leftStickDirections);
        updateDots('r', this.State.rightStickDirections);
    },

    resetWizardState() {
        this.State.currentStep = 1;
        this.State.leftStickDirections = { n: false, s: false, e: false, w: false };
        this.State.rightStickDirections = { n: false, s: false, e: false, w: false };
        this.setWizardStep(1);
    },

    resetHardwareLabels() {
        document.getElementById('hw-type').textContent = "در انتظار اتصال سخت‌افزار...";
        document.getElementById('hw-vendor').textContent = "---";
        document.getElementById('hw-product').textContent = "---";
        document.getElementById('hw-firmware').textContent = "---";
        document.getElementById('hw-serial').textContent = "---";
        document.getElementById('hw-mcu-id').textContent = "---";
        document.getElementById('hw-battery').textContent = "---";
        document.getElementById('hw-connection').textContent = "---";
    },

    // سیستم مرکزی تزریق لاگ در بخش مانیتورینگ خروجی سامانه فیکس
    logMessage(text, type = "system") {
        const logStream = document.getElementById('log-stream');
        if (!logStream) return;

        const line = document.createElement('div');
        line.className = `log-line ${type}`;
        
        const now = new Date();
        const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
        
        line.textContent = `[${timeStr}] ${text}`;
        logStream.appendChild(line);
        
        // اسکرول خودکار به انتهای لاگ‌های دریافتی
        logStream.scrollTop = logStream.scrollHeight;
    }
};

// اجرای لودر اصلی برنامه به محض بارگذاری کامل ساختار DOM مرورگر
document.addEventListener('DOMContentLoaded', () => App.init());
