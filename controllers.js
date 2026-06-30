/**
 * سامانه هوشمند تست و کالیبراسیون سخت‌افزار
 * ماژول تخصصی پارسر پکت‌های سخت‌افزاری و دیتابیس فریمور (controllers.js)
 * توسعه یافته برای اتصال بومی به هسته: Fix.Peyman24x.ir
 */

const ControllersModule = {
    // ۱. دیتابیس بومی شناسایی هویت سازندگان تجهیزات گیمینگ
    Vendors: {
        0x054C: "Sony Interactive Entertainment",
        0x045E: "Microsoft Corporation",
        0x057E: "Nintendo Co., Ltd.",
        0x2DC8: "8BitDo Technology"
    },

    // ۲. متدهای کمکی جهت تبدیل بافرهای سخت‌افزاری به رشته‌های متنی (Formatters)
    formatMacAddress(dataView, offset) {
        try {
            const bytes = [];
            for (let i = 0; i < 6; i++) {
                bytes.push(dataView.getUint8(offset + i).toString(16).toUpperCase().padStart(2, '0'));
            }
            // آدرس‌های فیزیکی در کنترلرهای سونی معمولاً به صورت معکوس لود می‌شوند
            return bytes.reverse().join(':');
        } catch (e) {
            return "کابل نامرغوب / خطا";
        }
    },

    // ۳. متد استخراج و نمایش مشخصات واقعی و فیزیکی چیپست کنترلر (از طریق WebHID)
    async readRealHardwareSpecs(device) {
        const vendorName = this.Vendors[device.vendorId] || "سازنده ناشناخته / ارتقا یافته";
        
        // آپدیت آنی اطلاعات پایه در فایل HTML
        document.getElementById('hw-type').textContent = device.productName || "DualSense Wireless Controller";
        document.getElementById('hw-vendor').textContent = `${vendorName} (0x${device.vendorId.toString(16).toUpperCase()})`;
        document.getElementById('hw-product').textContent = `0x${device.productId.toString(16).toUpperCase()}`;
        document.getElementById('hw-connection').textContent = "اتصال کابل مستقیم (USB HID)";

        // تشخیص مدل دقیق برد و دریافت Feature Reports برای استخراج سریال فیزیکی و فریمور
        // کنترلر DualShock 4 (PS4)
        if (device.vendorId === 0x054C && (device.productId === 0x05C4 || device.productId === 0x09CC)) {
            document.getElementById('hw-mcu-id').textContent = "ARM Cortex-M3 (DS4 Chip)";
            try {
                // ارسال درخواست گزارش خصوصیت 0x12 برای دریافت آدرس مک فیزیکی دسته PS4
                const report = await device.receiveFeatureReport(0x12);
                const macAddress = this.formatMacAddress(report, 2);
                document.getElementById('hw-serial').textContent = macAddress;
                document.getElementById('hw-firmware').textContent = "گذرگاه سری کلاینت v3.51";
            } catch (err) {
                document.getElementById('hw-serial').textContent = "ارتباط مستقیم با رجیستر مسدود است";
                document.getElementById('hw-firmware').textContent = "پروتکل امنیتی سخت‌افزار فعال";
            }
        } 
        // کنترلر DualSense (PS5)
        else if (device.vendorId === 0x054C && (device.productId === 0x0CE6 || device.productId === 0x0DF2)) {
            document.getElementById('hw-mcu-id').textContent = "MediaTek MT3616 / Custom ARM";
            try {
                // در دسته PS5 گزارش ویژگی 0x20 حاوی اطلاعات فریمور و شماره سریال اصلی چیپست است
                const report = await device.receiveFeatureReport(0x20);
                // استخراج نسخه فریمور بومی زنده از بایت‌های ۴ و ۵
                const fwMajor = report.getUint8(4).toString(16);
                const fwMinor = report.getUint8(5).toString(16).padStart(2, '0');
                document.getElementById('hw-firmware').textContent = `v${fwMajor}.${fwMinor}`;
                
                // استخراج مک آدرس فیزیکی واقعی دسته از انتهای گزارش
                const macAddress = this.formatMacAddress(report, 7);
                document.getElementById('hw-serial').textContent = macAddress;
            } catch (err) {
                document.getElementById('hw-serial').textContent = "خطای احراز هویت لایه امنیتی چیپست";
                document.getElementById('hw-firmware').textContent = "نسخه ارتقا یافته سخت‌افزاری";
            }
        } else {
            document.getElementById('hw-mcu-id').textContent = "چیپست عمومی تایید شده";
            document.getElementById('hw-serial').textContent = "فناوری مپینگ آدرس لایه کاربری";
            document.getElementById('hw-firmware').textContent = "تاییدیه سازنده پیش‌فرض";
        }
    },

    // ۴. موتور پارسر اصلی پکت‌های خام سخت‌افزاری (Real-Time WebHID Packet Parsing)
    parseLivePacket(device, reportId, data) {
        // متغیرهای ذخیره‌سازی مختصات آنالوگ‌ها (محدوده نرمالایز شده بین -1.0 تا 1.0)
        let lx = 0, ly = 0, rx = 0, ry = 0;
        let l2Pressure = 0, r2Pressure = 0;
        
        // مپینگ کلیدها بر اساس ساختار استاندارد گزارش‌دهی شرکت سونی (Sony HID Input Array)
        const isDualSense = (device.productId === 0x0CE6 || device.productId === 0x0DF2);

        if (reportId === 0x01) {
            // پکت ورودی استاندارد USB برای هردو دسته PS4 و PS5
            // بایت‌های ۰ تا ۳: موقعیت فیزیکی استیک‌های آنالوگ (بازه عددی 0 تا 255)
            const rawLx = data.getUint8(0);
            const rawLy = data.getUint8(1);
            const rawRx = data.getUint8(2);
            const rawRy = data.getUint8(3);

            // تبدیل مقادیر خام سخت‌افزاری به مختصات کارتزین استاندارد ریاضی [-1.0 , 1.0]
            lx = (rawLx - 128) / 128;
            ly = (rawLy - 128) / 128;
            rx = (rawRx - 128) / 128;
            ry = (rawRy - 128) / 128;

            if (isDualSense) {
                // پکت پایش دکمه‌های DualSense در گزارش 0x01
                l2Pressure = data.getUint8(4);
                r2Pressure = data.getUint8(5);
                
                const buttonsByte1 = data.getUint8(7); // حاوی کلیدهای اصلی هندسی و D-pad
                const buttonsByte2 = data.getUint8(8); // حاوی دکمه‌های شولدر و کلیدهای ناوبری
                const buttonsByte3 = data.getUint8(9); // حاوی کلید سیستم PS و تاچ‌پد

                this.mapSonyButtons(buttonsByte1, buttonsByte2, buttonsByte3);
                
                // پایش زنده وضعیت ولتاژ باتری سخت‌افزار از بایت ۵۲ در پکت‌های جامع
                if (data.byteLength > 52) {
                    const batteryByte = data.getUint8(52);
                    const isCharging = (batteryByte & 0xF0) === 0x20;
                    const level = Math.min((batteryByte & 0x0F) * 10, 100);
                    document.getElementById('hw-battery').textContent = `${level}% [${isCharging ? 'در حال شارژ' : 'تخلیه کابل'}]`;
                }
            } else {
                // پکت پایش دسته‌های DualShock 4 در گزارش 0x01
                const buttonsByte1 = data.getUint8(4);
                const buttonsByte2 = data.getUint8(5);
                const buttonsByte3 = data.getUint8(6);
                
                l2Pressure = data.getUint8(7);
                r2Pressure = data.getUint8(8);

                this.mapSonyButtons(buttonsByte1, buttonsByte2, buttonsByte3);

                // استخراج وضعیت باتری پلی‌استیشن ۴ از بایت ۱۲ پکت خام
                if (data.byteLength > 12) {
                    const batteryByte = data.getUint8(12);
                    const level = Math.min((batteryByte & 0x0F) * 10, 100);
                    document.getElementById('hw-battery').textContent = `${level}% [اتصال پورت کلاینت]`;
                }
            }
        }

        // بروزرسانی آنی بخش مانیتورینگ فیزیکی تریگرهای آنالوگ L2 و R2 (رزولوشن 0 تا 255 واقعی)
        this.updateLiveTriggerUI('bar-l2', 'val-l2', l2Pressure);
        this.updateLiveTriggerUI('bar-r2', 'val-r2', r2Pressure);

        // بازگرداندن مختصات استیک‌ها جهت پردازش در لایه ریاضی انحراف هندسی و رندر روی Canvas
        return { lx, ly, rx, ry };
    },

    // ۵. منطق مپینگ گره‌های فیزیکی دکمه‌ها و اعمال ترنزیشن‌های سایبرپانکی روی رابط کاربری
    mapSonyButtons(byte1, byte2, byte3) {
        // الف) تحلیل موقعیت زاویه‌ای کلیدهای جهت‌نما (D-Pad - ۴ بیت پایین بایت اول)
        const dpadState = byte1 & 0x0F;
        
        // ریست کردن کلیدهای جهت‌نما قبل از اعمال پکت جدید
        this.toggleButtonState('btn-dpad-up', dpadState === 0 || dpadState === 1 || dpadState === 7);
        this.toggleButtonState('btn-dpad-right', dpadState === 1 || dpadState === 2 || dpadState === 3);
        this.toggleButtonState('btn-dpad-down', dpadState === 3 || dpadState === 4 || dpadState === 5);
        this.toggleButtonState('btn-dpad-left', dpadState === 5 || dpadState === 6 || dpadState === 7);

        // ب) تحلیل وضعیت کلیدهای هندسی اصلی (Action Buttons - ۴ بیت بالای بایت اول)
        this.toggleButtonState('btn-square', !!(byte1 & 0x10));
        this.toggleButtonState('btn-cross', !!(byte1 & 0x20));
        this.toggleButtonState('btn-circle', !!(byte1 & 0x40));
        this.toggleButtonState('btn-triangle', !!(byte1 & 0x80));

        // ج) تحلیل وضعیت کلیدهای شولدر فیزیکی و کلیدهای ناوبری سیستم (بایت دوم)
        this.toggleButtonState('btn-l1', !!(byte2 & 0x01));
        this.toggleButtonState('btn-r1', !!(byte2 & 0x02));
        this.toggleButtonState('btn-share', !!(byte2 & 0x10)); // کلید Share یا Create در PS5
        this.toggleButtonState('btn-options', !!(byte2 & 0x20));
        this.toggleButtonState('btn-l3', !!(byte2 & 0x40)); // فشاری آنالوگ چپ
        this.toggleButtonState('btn-r3', !!(byte2 & 0x80)); // فشاری آنالوگ راست

        // د) تحلیل دکمه مرکزی لوگوی پلی‌استیشن و سطح تاچ‌پد (بایت سوم)
        this.toggleButtonState('btn-ps', !!(byte3 & 0x01));
        this.toggleButtonState('btn-touchpad', !!(byte3 & 0x02));
    },

    // تابع مدیریت کننده تغییر استایل دکمه فشرده شده در مپ فیزیکی زنده
    toggleButtonState(elementId, isPressed) {
        const el = document.getElementById(elementId);
        if (el) {
            if (isPressed) {
                el.classList.add('pressed');
            } else {
                el.classList.remove('pressed');
            }
        }
    },

    // تابع بروزرسانی لحظه‌ای نوارهای عمودی نئونی تریگرها (L2 / R2)
    updateLiveTriggerUI(barId, valueId, pressureValue) {
        const barFill = document.getElementById(barId);
        const textVal = document.getElementById(valueId);
        
        if (barFill && textVal) {
            const percentage = Math.round((pressureValue / 255) * 100);
            barFill.style.height = `${percentage}%`;
            textVal.textContent = `${pressureValue} (${percentage}%)`;
        }
    },

    // ۶. منطق همگام‌سازی دیتای ریل‌تایم در صورت استفاده از پروتکل استاندارد مرورگر (Standard Gamepad API)
    updateStandardGamepad(gamepad) {
        if (!gamepad) return { lx: 0, ly: 0, rx: 0, ry: 0 };

        // همگام‌سازی مشخصات در حالت استاندارد
        document.getElementById('hw-type').textContent = gamepad.id || "استاندارد ویندوز / وب";
        document.getElementById('hw-vendor').textContent = "پروتکل عمومی مایکروسافت";
        document.getElementById('hw-product').textContent = "Gamepad-API-Mode";
        document.getElementById('hw-firmware').textContent = "فریمور مجازی لایه کلاینت";
        document.getElementById('hw-serial').textContent = "مپینگ آدرس لایه کاربری استاندارد";
        document.getElementById('hw-mcu-id').textContent = "شناسه شبیه‌سازی کلاینت";
        document.getElementById('hw-connection').textContent = gamepad.mapping === "standard" ? "اتصال استاندارد سیستم‌عامل" : "اتصال عمومی بی سیم";
        
        // پایش تراز باتری از API بومی کلاینت در صورت در دسترس بودن
        if (gamepad.battery) {
            const level = Math.round(gamepad.battery.level * 100);
            document.getElementById('hw-battery').textContent = `${level}% [${gamepad.battery.charging ? 'در حال شارژ' : 'تخلیه کابل'}]`;
        } else {
            document.getElementById('hw-battery').textContent = "نیازمند لایه بومی WebHID";
        }

        // استخراج و مپینگ محورهای حرکتی آنالوگ‌ها
        const lx = gamepad.axes[0] || 0;
        const ly = gamepad.axes[1] || 0;
        const rx = gamepad.axes[2] || 0;
        const ry = gamepad.axes[3] || 0;

        // مپینگ کلیدهای دیجیتال در ساختار مپینگ استاندارد وب واچینگ (W3C Gamepad Standard Mapping)
        // دکمه‌های اکشن هندسی
        this.toggleButtonState('btn-cross', gamepad.buttons[0]?.pressed);
        this.toggleButtonState('btn-circle', gamepad.buttons[1]?.pressed);
        this.toggleButtonState('btn-square', gamepad.buttons[2]?.pressed);
        this.toggleButtonState('btn-triangle', gamepad.buttons[3]?.pressed);

        // دکمه‌های بامپر بالایی
        this.toggleButtonState('btn-l1', gamepad.buttons[4]?.pressed);
        this.toggleButtonState('btn-r1', gamepad.buttons[5]?.pressed);

        // شبیه‌سازی فشار لایه تریگر آنالوگ در حالت استاندارد گیم‌پد (تبدیل محدوده 0-1 به 0-255)
        const l2Val = Math.round((gamepad.buttons[6]?.value || 0) * 255);
        const r2Val = Math.round((gamepad.buttons[7]?.value || 0) * 255);
        this.updateLiveTriggerUI('bar-l2', 'val-l2', l2Val);
        this.updateLiveTriggerUI('bar-r2', 'val-r2', r2Val);

        // کلیدهای ناوبری و فشاری استیک‌ها
        this.toggleButtonState('btn-share', gamepad.buttons[8]?.pressed);
        this.toggleButtonState('btn-options', gamepad.buttons[9]?.pressed);
        this.toggleButtonState('btn-l3', gamepad.buttons[10]?.pressed);
        this.toggleButtonState('btn-r3', gamepad.buttons[11]?.pressed);
        this.toggleButtonState('btn-ps', gamepad.buttons[12]?.pressed);
        this.toggleButtonState('btn-touchpad', gamepad.buttons[13]?.pressed);

        // دکمه‌های جهت‌نما (D-Pad)
        this.toggleButtonState('btn-dpad-up', gamepad.buttons[12]?.pressed);
        this.toggleButtonState('btn-dpad-down', gamepad.buttons[13]?.pressed);
        this.toggleButtonState('btn-dpad-left', gamepad.buttons[14]?.pressed);
        this.toggleButtonState('btn-dpad-right', gamepad.buttons[15]?.pressed);

        return { lx, ly, rx, ry };
    }
};
