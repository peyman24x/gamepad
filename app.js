/**
 * سامانه هوشمند تست و کالیبراسیون سخت‌افزار
 * هسته بازنویسی شده پردازش سیگنال، رندر گرافیکی و مدیریت جادوگر (app.js)
 * توسعه یافته برای پلتفرم: Fix.Peyman24x.ir
 */

const App = {
    // ۱. ماتریس وضعیت سراسری برنامه (Global Application State)
    State: {
        activeApi: 'gamepad',          // نوع پروتکل ارتباطی فعال: 'gamepad' یا 'hid'
        hidDevice: null,              // شیء دستگاه متصل شده در حالت بومی WebHID
        gamepadIndex: null,           // ایندکس دسته متصل شده در حالت Gamepad API
        currentStep: 1,               // گام فعلی جادوگر کالیبراسیون (۱ تا ۴)
        
        // ماتریس پایش سنسورهای ۳۶۰ درجه برای مرحله سوم جادوگر
        leftStickDirections:  { n: false, s: false, e: false, w: false },
        rightStickDirections: { n: false, s: false, e: false, w: false }
    },

    // ۲. متد مقداردهی اولیه و شنود رویدادها (Initialization)
    init() {
        this.logMessage("هسته مرکزی Fix آماده دریافت کابل سخت‌افزار است.", "system");
        this.bindEvents();
        this.resetWizardState();
        this.startRenderLoop();
    },

    bindEvents() {
        // مدیریت دکمه‌های سوئیچ بین APIها بر اساس IDهای بومی index.html
        document.getElementById('apiHidBtn').addEventListener('click', () => this.switchApi('hid'));
        document.getElementById('apiGamepadBtn').addEventListener('click', () => this.switchApi('gamepad'));

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
                document.body.className = "connected";
                this.updateConnectionBrief(true, "اتصال کلاینت سیستم‌عامل");
                this.logMessage(`دسته استاندارد شناسایی شد: ${e.gamepad.id}`, "success");
                this.setWizardStep(2);
            }
        });

        window.addEventListener("gamepaddisconnected", (e) => {
            if (this.State.activeApi === 'gamepad' && this.State.gamepadIndex === e.gamepad.index) {
                this.handleDisconnect();
            }
        });

        // اکشن دکمه اصلی جادوگر کالیبراسیون بر اساس ID بومی index.html
        document.getElementById('btnNextWiz').addEventListener('click', () => this.handleWizardAction());
    },

    // ۳. مدیریت سوئیچ هوشمند بین لایه‌های ارتباطی سخت‌افزار
    switchApi(apiType) {
        if (this.State.activeApi === apiType) return;
        
        this.handleDisconnect();
        this.State.activeApi = apiType;
        
        document.getElementById('apiHidBtn').classList.toggle('active', apiType === 'hid');
        document.getElementById('apiGamepadBtn').classList.toggle('active', apiType === 'gamepad');
        
        const promptBox = document.getElementById('batteryApiPrompt');
        const badge = document.getElementById('activeApiBadge');

        if (apiType === 'hid') {
            badge.textContent = "Low-Level HID";
            promptBox.style.display = 'none';
            this.logMessage("سوئیچ به پروتکل بومی WebHID. لطفاً روی دکمه «اتصال سخت‌افزار» کلیک کنید.", "system");
            
            // در حالت HID دکمه جادوگر فعال می‌شود تا فرآیند اتصال را استارت بزند
            const actionBtn = document.getElementById('btnNextWiz');
            actionBtn.textContent = "اتصال سخت‌افزار (WebHID)";
            actionBtn.disabled = false;
        } else {
            badge.textContent = "Standard Gamepad";
            promptBox.style.display = 'block';
            this.logMessage("سوئیچ به پروتکل استاندارد Gamepad API انجام شد. یکی از دکمه‌ها را فشار دهید.", "system");
            this.setWizardStep(1);
        }
    },

    // ۴. متد فراخوانی پنجره جفت‌سازی بومی مرورگر برای دسترسی به پکت‌های خام USB
    async connectHidDevice() {
        try {
            const devices = await navigator.hid.requestDevice({
                filters: [
                    { vendorId: 0x054C }, // فیلتر سخت‌افزاری شرکت سونی (Sony)
                    { vendorId: 0x045E }  // فیلتر سخت‌افزاری مایکروسافت (Xbox)
                ]
            });

            if (devices && devices.length > 0) {
                this.State.hidDevice = devices[0];
                await this.State.hidDevice.open();
                
                document.body.className = "connected";
                this.updateConnectionBrief(true, "Low-Level WebHID مستقیم");
                this.logMessage(`اتصال بومی برقرار شد: ${this.State.hidDevice.productName}`, "success");
                
                // استخراج و خواندن مشخصات MCU و فریمور دسته از ماژول controllers.js
                if (window.ControllersModule) {
                    await ControllersModule.readRealHardwareSpecs(this.State.hidDevice);
                }

                // فعال‌سازی شنود پکت‌های خام ورودی
                this.State.hidDevice.oninputreport = (event) => {
                    if (this.State.activeApi === 'hid') {
                        const { reportId, data } = event;
                        if (window.ControllersModule && ControllersModule.parseLivePacket) {
                            const stickCoords = ControllersModule.parseLivePacket(this.State.hidDevice, reportId, data);
                            this.processStickData(stickCoords);
                        }
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
        document.body.className = "disconnected";
        this.updateConnectionBrief(false, "قطع اتصال");
        this.resetHardwareLabels();
        this.resetWizardState();
        this.logMessage("ارتباط سخت‌افزاری قطع شد. سیستم در حالت انتظار کابل.", "error");
    },

    updateConnectionBrief(isConnected, sourceText) {
        const statusEl = document.getElementById('connStatus');
        statusEl.textContent = isConnected ? "متصل شده" : "قطع اتصال";
        statusEl.className = `status-text ${isConnected ? 'connected' : 'disconnected'}`;
        document.getElementById('batteryCharging').textContent = isConnected ? sourceText : "مشخص نیست";
        document.getElementById('batteryLevel').textContent = isConnected ? "100% [DC]" : "--";
    },

    // ۵. چرخه گرافیکی رندر زنده اسکوپ‌ها با نرخ ۶۰ فریم بر ثانیه (Graphics Engine Loop)
    startRenderLoop() {
        const render = () => {
            if (this.State.activeApi === 'gamepad' && this.State.gamepadIndex !== null) {
                const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
                const gp = gamepads[this.State.gamepadIndex];
                if (gp) {
                    let stickCoords = { lx: 0, ly: 0, rx: 0, ry: 0 };
                    if (window.ControllersModule && ControllersModule.updateStandardGamepad) {
                        stickCoords = ControllersModule.updateStandardGamepad(gp);
                    } else {
                        // در صورت عدم دسترسی موقت به ماژول، مپینگ استاندارد فال‌بک
                        stickCoords = { lx: gp.axes[0] || 0, ly: gp.axes[1] || 0, rx: gp.axes[2] || 0, ry: gp.axes[3] || 0 };
                        this.syncFallbackButtons(gp);
                    }
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

        // الف) محاسبات ریاضی ددزون و خطای هندسی استیک‌ها (از فایل calibration.js)
        const leftFiltered = window.CalibrationEngine ? CalibrationEngine.applyRadialDeadzone(coords.lx, coords.ly) : { isCentered: true };
        const leftError = window.CalibrationEngine ? CalibrationEngine.calculateCircularError(coords.lx, coords.ly) : 0;
        
        const rightFiltered = window.CalibrationEngine ? CalibrationEngine.applyRadialDeadzone(coords.rx, coords.ry) : { isCentered: true };
        const rightError = window.CalibrationEngine ? CalibrationEngine.calculateCircularError(coords.rx, coords.ry) : 0;

        // ب) رندر هندسی روی کانواس‌های بومی cLeft و cRight
        this.drawJoystickCanvas('cLeft', coords.lx, coords.ly, leftFiltered);
        this.drawJoystickCanvas('cRight', coords.rx, coords.ry, rightFiltered);

        // ج) انیمیت کردن فیزیکی شست‌های آنالوگ روی ماکت دسته (index.html)
        this.animateHardwareThumbsticks(coords.lx, coords.ly, coords.rx, coords.ry);

        // د) آپدیت متون لایه مختصات در زیر کانواس‌ها براساس شناسه‌های اصلی شما
        document.getElementById('md-l-coords').textContent = `${coords.lx.toFixed(2)} / ${coords.ly.toFixed(2)}`;
        document.getElementById('md-r-coords').textContent = `${coords.rx.toFixed(2)} / ${coords.ry.toFixed(2)}`;
        
        const leftBadge = document.getElementById('md-le');
        const rightBadge = document.getElementById('md-re');
        
        leftBadge.textContent = `${leftError.toFixed(2)}%`;
        rightBadge.textContent = `${rightError.toFixed(2)}%`;

        // اعمال کلاس رنگی داینامیک بر اساس درصد خطای انحراف استیک‌ها
        if (window.CalibrationEngine) {
            leftBadge.className = `metric-num ${CalibrationEngine.getErrorColorClass(leftError)}`;
            rightBadge.className = `metric-num ${CalibrationEngine.getErrorColorClass(rightError)}`;
        }

        // هـ) مانیتورینگ زنده منطق فرآیند جادوگر کالیبراسیون بر اساس گام فعال
        this.monitorWizardLogic(coords, leftFiltered, rightFiltered);
    },

    // انیمیشن فیزیکی انتقال موقعیت استیک‌ها روی المان‌های t-left و t-right ماکت دسته
    animateHardwareThumbsticks(lx, ly, rx, ry) {
        const tLeft = document.getElementById('t-left');
        const tRight = document.getElementById('t-right');
        const maxMovePixels = 15; // محدوده مجاز جابجایی بصری دایره داخلی

        if (tLeft) tLeft.style.transform = `translate(${lx * maxMovePixels}px, ${ly * maxMovePixels}px)`;
        if (tRight) tRight.style.transform = `translate(${rx * maxMovePixels}px, ${ry * maxMovePixels}px)`;
    },

    // فال‌بک روشن کردن کلیدهای ماکت دسته در حالت عمومی Gamepad API
    syncFallbackButtons(gamepad) {
        gamepad.buttons.forEach((btn, index) => {
            const btnEl = document.getElementById(`m-btn-${index}`);
            if (btnEl) {
                if (btn.pressed) btnEl.classList.add('pressed');
                else btnEl.classList.remove('pressed');
            }
        });
    },

    // ۷. الگوریتم ترسیم المان‌های گرافیکی بر روی ساختار Canvas بومی سیستم
    drawJoystickCanvas(canvasId, rawX, rawY, filteredData) {
        const canvas = document.getElementById(canvasId);
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const width = canvas.width;
        const height = canvas.height;
        const center = width / 2;
        const radius = center - 10;

        ctx.clearRect(0, 0, width, height);

        // رسم گرید پس‌زمینه مرکز مختصات
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(center, 0); ctx.lineTo(center, height);
        ctx.moveTo(0, center); ctx.lineTo(width, center);
        ctx.stroke();

        // رسم دایره مرجع کالیبراسیون کامل
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.beginPath();
        ctx.arc(center, center, radius, 0, 2 * Math.PI);
        ctx.stroke();

        // رسم ددزون امن مرکز قرمز رنگ (زیر 0.05)
        const deadzoneRadius = window.CalibrationEngine ? radius * CalibrationEngine.Config.DEADZONE_THRESHOLD : radius * 0.05;
        ctx.fillStyle = 'rgba(239, 68, 68, 0.05)';
        ctx.strokeStyle = 'rgba(239, 68, 68, 0.2)';
        ctx.beginPath();
        ctx.arc(center, center, deadzoneRadius, 0, 2 * Math.PI);
        ctx.fill();
        ctx.stroke();

        // محاسبه مکان گره بر اساس پیکسل کانواس
        const pixelX = center + (rawX * radius);
        const pixelY = center + (rawY * radius);

        // رسم خط سیگنال خروجی شفت آنالوگ
        ctx.strokeStyle = filteredData.isCentered ? 'rgba(148, 163, 184, 0.3)' : 'rgba(59, 130, 246, 0.5)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(center, center);
        ctx.lineTo(pixelX, pixelY);
        ctx.stroke();

        // رسم هسته فیزیکی (Node)
        ctx.fillStyle = filteredData.isCentered ? '#64748b' : '#3b82f6';
        ctx.beginPath();
        ctx.arc(pixelX, pixelY, 6, 0, 2 * Math.PI);
        ctx.fill();
    },

    // ۸. مهندسی گیت‌های منطقی هدایت جادوگر کالیبراسیون و بررسی شرایط پاس شدن
    monitorWizardLogic(rawCoords, leftFiltered, rightFiltered) {
        const statusBox = document.getElementById('vStatus');
        const indicator = document.getElementById('vIndicator');
        const actionBtn = document.getElementById('btnNextWiz');

        if (this.State.currentStep === 2) {
            // فاز دوم: ارزیابی تعادل صفر مطلق مرکز بدون لمس تکنسین
            if (window.CalibrationEngine) {
                const centerReport = CalibrationEngine.checkCenterAlignment(rawCoords.lx, rawCoords.ly, rawCoords.rx, rawCoords.ry);
                
                if (centerReport.isValid) {
                    statusBox.className = "validation-status status-success";
                    statusBox.textContent = `تراز مرکز تایید شد. آفست چپ: ${centerReport.leftOffset} | راست: ${centerReport.rightOffset}`;
                    indicator.textContent = "✅";
                    indicator.className = "correctness-indicator success";
                    actionBtn.disabled = false;
                } else {
                    statusBox.className = "validation-status status-warning";
                    statusBox.textContent = `در انتظار رهاسازی استیک‌ها... آفست چپ: ${centerReport.leftOffset} | راست: ${centerReport.rightOffset}`;
                    indicator.textContent = "⏳";
                    indicator.className = "correctness-indicator waiting";
                    actionBtn.disabled = true;
                }
            }
        } 
        else if (this.State.currentStep === 3) {
            // فاز سوم: پایش هوشمند تریس چرخش کامل ۳۶۰ درجه اطراف لبه‌ها
            if (window.CalibrationEngine) {
                const leftUpdated = CalibrationEngine.trackStickDirections(rawCoords.lx, rawCoords.ly, this.State.leftStickDirections);
                const rightUpdated = CalibrationEngine.trackStickDirections(rawCoords.rx, rawCoords.ry, this.State.rightStickDirections);

                if (leftUpdated || rightUpdated) {
                    this.updateDirectionDotsUI();
                }

                const leftDone = this.State.leftStickDirections.n && this.State.leftStickDirections.s && this.State.leftStickDirections.e && this.State.leftStickDirections.w;
                const rightDone = this.State.rightStickDirections.n && this.State.rightStickDirections.s && this.State.rightStickDirections.e && this.State.rightStickDirections.w;

                if (leftDone && rightDone) {
                    statusBox.className = "validation-status status-success";
                    statusBox.textContent = "ماتریس چرخش ۳۶۰ درجه کاملاً بازرسی و تایید شد.";
                    indicator.textContent = "🎯";
                    actionBtn.disabled = false;
                } else {
                    statusBox.className = "validation-status status-warning";
                    statusBox.textContent = "هر دو آنالوگ را یک دور کامل به لبه‌ها بچسبانید تا جهات جغرافیایی سبز شوند.";
                    indicator.textContent = "🔄";
                }
            }
        }
    },

    handleWizardAction() {
        if (this.State.currentStep === 1) {
            if (this.State.activeApi === 'hid') {
                this.connectHidDevice();
            }
        } else if (this.State.currentStep === 2) {
            this.logMessage("تراز صفر مطلق مرکز با موفقیت در رام سخت‌افزار ثبت شد.", "success");
            this.setWizardStep(3);
        } else if (this.State.currentStep === 3) {
            this.logMessage("ماتریس لبه‌های فیزیکی دایره با موفقیت کالیبره شد.", "success");
            this.setWizardStep(4);
        } else if (this.State.currentStep === 4) {
            this.resetWizardState();
            this.setWizardStep(1);
        }
    },

    // اعمال تغییرات بصری لایه‌ها هنگام تعویض گام‌های جادوگر کالیبراسیون (با آی‌دی‌های sn-X بومی شما)
    setWizardStep(stepNumber) {
        this.State.currentStep = stepNumber;
        
        // آپدیت کلاس‌های فعال در هدر جادوگر
        for (let i = 1; i <= 4; i++) {
            const indicator = document.getElementById(`sn-${i}`);
            if (indicator) {
                indicator.className = 'step-node';
                if (i === stepNumber) indicator.classList.add('active');
                if (i < stepNumber) indicator.classList.add('completed'); // در صورت وجود متناظر در استایل
            }
        }

        const titleEl = document.getElementById('wizTitle');
        const descEl = document.getElementById('wizDesc');
        const actionBtn = document.getElementById('btnNextWiz');
        const trackerUi = document.getElementById('angleTrackerUi');
        const indicator = document.getElementById('vIndicator');
        const statusBox = document.getElementById('vStatus');

        if (stepNumber === 1) {
            titleEl.textContent = "مرحله ۱: تأیید ارتباط با پروتکل امن";
            descEl.textContent = "برای تغییر ساختار رجیسترهای سنسور اثر هال یا پتانسیومترهای فیزیکی، کنترلر را متصل کنید. در این فاز سیستم در حال راستی‌آزمایی نرخ داده‌های ورودی است.";
            actionBtn.textContent = this.State.activeApi === 'hid' ? "اتصال سخت‌افزار (WebHID)" : "در انتظار سیگنال کابل...";
            actionBtn.disabled = (this.State.activeApi === 'gamepad');
            trackerUi.style.display = 'none';
            indicator.style.display = 'block';
            indicator.textContent = "⏳";
            statusBox.textContent = "در انتظار شروع عملیات...";
        } 
        else if (stepNumber === 2) {
            titleEl.textContent = "مرحله ۲: همگام‌سازی تراز مرکز (Zero Drift)";
            descEl.textContent = "آنالوگ‌ها را کاملاً رها کنید تا در موقعیت استراحت طبیعی خود قرار گیرند. سیستم در حال سنجش میزان انحراف پتانسیومترها جهت صفر کردن خطای دریفت فابریک است.";
            actionBtn.textContent = "ثبت و تایید تراز مرکز";
            actionBtn.disabled = true;
            trackerUi.style.display = 'none';
            indicator.style.display = 'block';
        } 
        else if (stepNumber === 3) {
            titleEl.textContent = "مرحله ۳: پیمایش زوایای محیطی و ماتریس ۳۶۰";
            descEl.textContent = "هر دو آنالوگ استیک را به طور کامل چسبانده و یک دور ۳۶۰ درجه بچرخانید تا لبه‌های فیزیکی سنسورها (شمال، شرق، جنوب، غرب) در حافظه پلتفرم فیکس نقشه‌برداری شوند.";
            actionBtn.textContent = "ثبت ماتریس کالیبراسیون ۳۶۰";
            actionBtn.disabled = true;
            trackerUi.style.display = 'flex';
            indicator.style.display = 'none';
            this.updateDirectionDotsUI();
        } 
        else if (stepNumber === 4) {
            titleEl.textContent = "مرحله ۴: عملیات موفقیت‌آمیز و ذخیره‌سازی نهایی";
            descEl.textContent = "تمامی آزمون‌های خطای هندسی و تراز صفر مطلق با موفقیت پاس شدند. پارامترهای جدید تصحیح خطا بر روی بخش کاربری کلاینت رایت شدند.";
            actionBtn.textContent = "پایان و شروع مجدد تست";
            actionBtn.disabled = false;
            trackerUi.style.display = 'none';
            indicator.style.display = 'block';
            indicator.textContent = "🚀";
            indicator.className = "correctness-indicator success";
            statusBox.className = "validation-status status-success";
            statusBox.textContent = "عملیات کالیبراسیون با موفقیت به پایان رسید.";
            this.logMessage("سامانه با موفقیت کالیبره شد. رجیسترها در وضعیت ایده آل قرار دارند.", "success");
        }
    },

    // ۹. متدهای کمکی جهت بروزرسانی رابط کاربری (UI Helpers)
    updateDirectionDotsUI() {
        const updateDots = (prefix, matrix) => {
            document.getElementById(`${prefix}-dir-n`).className = `dir-dot ${matrix.n ? 'done' : ''}`;
            document.getElementById(`${prefix}-dir-s`).className = `dir-dot ${matrix.s ? 'done' : ''}`;
            document.getElementById(`${prefix}-dir-e`).className = `dir-dot ${matrix.e ? 'done' : ''}`;
            document.getElementById(`${prefix}-dir-w`).className = `dir-dot ${matrix.w ? 'done' : ''}`;
        };

        updateDots('l', this.State.leftStickDirections);
        updateDots('r', this.State.rightStickDirections);
    },

    resetWizardState() {
        this.State.leftStickDirections = { n: false, s: false, e: false, w: false };
        this.State.rightStickDirections = { n: false, s: false, e: false, w: false };
    },

    resetHardwareLabels() {
        const fields = [
            'fw-build-date', 'fw-type', 'fw-series', 'fw-version', 'fw-update', 'fw-update-info', 
            'sbl-fw-version', 'venom-fw-version', 'spider-fw-version', 'touchpad-fw-version',
            'hw-serial', 'hw-mcu-id', 'hw-pcba-id', 'hw-battery-barcode', 'hw-vcm-left', 
            'hw-vcm-right', 'hw-color', 'hw-board-model', 'hw-model', 'hw-touchpad-id', 'hw-bt-address'
        ];
        fields.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.textContent = "--";
        });
    },

    // سیستم مرکزی تزریق لاگ در بخش مانیتورینگ خروجی سامانه فیکس
    logMessage(text, type = "system") {
        const logStream = document.getElementById('sysLog');
        if (!logStream) return;

        const now = new Date();
        const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
        
        // حفظ ساختار لاگ‌های متنی قبلی و اضافه کردن خط جدید
        logStream.innerText += `\n[${timeStr}] [${type === 'success' ? 'موفق' : type === 'error' ? 'خطا' : 'سیستم'}] ${text}`;
        
        // اسکرول خودکار به انتهای لاگ‌ها
        logStream.scrollTop = logStream.scrollHeight;
    }
};

// اجرای لودر اصلی برنامه به محض بارگذاری کامل ساختار DOM مرورگر
document.addEventListener('DOMContentLoaded', () => App.init());
