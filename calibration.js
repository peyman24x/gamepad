/**
 * سامانه هوشمند تست و کالیبراسیون سخت‌افزار
 * موتور محاسبات ریاضی، ددزون و آنالیز هندسی ۳۶۰ درجه (calibration.js)
 * توسعه یافته برای اتصال بومی به هسته: Fix.Peyman24x.ir
 */

const CalibrationEngine = {
    // ۱. پارامترهای پیش‌فرض مهندسی سیگنال
    Config: {
        DEADZONE_THRESHOLD: 0.05,     // حد آستانه صفر مطلق برای تراز مرکز (مرحله ۲ جادوگر)
        SATURATION_LIMIT: 1.0,        // سقف بردار نرمالایز شده خروجی
        IDEAL_RADIUS: 1.0             // شعاع دایره مرجع کالیبراسیون کامل
    },

    // ۲. الگوریتم محاسبه خطای هندسی دایره (Circular Error / Average Deviation)
    // این فرمول به طور دقیق میزان انحراف استیک از دایره ایده آل را محاسبه می‌کند
    calculateCircularError(x, y) {
        if (x === 0 && y === 0) return 0;
        
        // محاسبه طول بردار فیزیکی (قضیه فیثاغورس)
        const magnitude = Math.sqrt(x * x + y * y);
        
        // میزان انحراف خالص از شعاع استاندارد ۱.۰
        const deviation = Math.abs(magnitude - this.Config.IDEAL_RADIUS);
        
        // تبدیل انحراف به درصد خطا
        let errorPercentage = deviation * 100;
        
        // فیلتر کردن نویزهای بسیار ریز پتانسیومتر برای نمایش دقیق‌تر
        if (errorPercentage < 0.1) errorPercentage = 0;
        if (errorPercentage > 100) errorPercentage = 100;
        
        return errorPercentage;
    },

    // ۳. الگوریتم اعمال حد آستانه حرکت مرده (Radial Deadzone Filter)
    // برای جلوگیری از دریفت (Drift) در زمانی که کاربر به استیک دست نمی‌زند
    applyRadialDeadzone(x, y) {
        const magnitude = Math.sqrt(x * x + y * y);
        
        if (magnitude < this.Config.DEADZONE_THRESHOLD) {
            return { x: 0, y: 0, isCentered: true };
        }
        
        // نرمالایز کردن مجدد وکتور بیرونی برای حفظ دقت خطی حرکت
        const scale = ((magnitude - this.Config.DEADZONE_THRESHOLD) / (this.Config.SATURATION_LIMIT - this.Config.DEADZONE_THRESHOLD)) / magnitude;
        
        let finalX = x * scale;
        let finalY = y * scale;
        
        // محدود کردن سقف خروجی به ۱.۰- تا ۱.۰+
        finalX = Math.max(-1, Math.min(1, finalX));
        finalY = Math.max(-1, Math.min(1, finalY));
        
        return { x: finalX, y: finalY, isCentered: false };
    },

    // ۴. ماتریس هوشمند جهت‌شناسی جغرافیایی ۳۶۰ درجه (مرحله ۳ جادوگر)
    // این تابع پوزیشن آنالوگ را آنالیز کرده و به طور خودکار فلگ‌های جهت را در AppState شما فعال می‌کند
    trackStickDirections(x, y, stateMatrix) {
        const triggerThreshold = 0.85; // کاربر باید استیک را حداقل ۸۵٪ به لبه‌ها نزدیک کند تا جهت ثبت شود
        let updated = false;

        // آنالیز جهت شمال (North: Y منفی در ساختار کانواس / Gamepad API)
        if (y < -triggerThreshold && Math.abs(x) < 0.40) {
            if (!stateMatrix.n) { stateMatrix.n = true; updated = true; }
        }
        // آنالیز جهت جنوب (South: Y مثبت)
        else if (y > triggerThreshold && Math.abs(x) < 0.40) {
            if (!stateMatrix.s) { stateMatrix.s = true; updated = true; }
        }
        // آنالیز جهت شرق (East: X مثبت)
        else if (x > triggerThreshold && Math.abs(y) < 0.40) {
            if (!stateMatrix.e) { stateMatrix.e = true; updated = true; }
        }
        // آنالیز جهت غرب (West: X منفی)
        else if (x < -triggerThreshold && Math.abs(y) < 0.40) {
            if (!stateMatrix.w) { stateMatrix.w = true; updated = true; }
        }

        return updated; // اگر جهت جدیدی کشف و ثبت شد، مقدار true برمی‌گردد
    },

    // ۵. ارزیابی تراز صفر مطلق سخت‌افزاری (برای فاز دوم جادوگر)
    checkCenterAlignment(leftX, leftY, rightX, rightY) {
        const leftOffset = Math.sqrt(leftX * leftX + leftY * leftY);
        const rightOffset = Math.sqrt(rightX * rightX + rightY * rightY);
        
        // هر دو آنالوگ باید کاملاً در محدوده ددزون مجاز (زیر ۰.۰۵) بی حرکت باشند
        const isLeftCentered = leftOffset < this.Config.DEADZONE_THRESHOLD;
        const isRightCentered = rightOffset < this.Config.DEADZONE_THRESHOLD;
        
        return {
            isValid: isLeftCentered && isRightCentered,
            leftOffset: leftOffset.toFixed(4),
            rightOffset: rightOffset.toFixed(4)
        };
    },

    // ۶. فرمول تبدیل خطا به پالت رنگی داینامیک رابط کاربری (UI Feedback Color)
    getErrorColorClass(errorPercentage) {
        if (errorPercentage <= 5) return 'error-green';    // خطای عالی و زیر ۵ درصد (مخصوص هال افکت و سنسور نو)
        if (errorPercentage <= 12) return 'error-warning'; // خطای متوسط و پذیرفته شده (پتانسیومترهای کارکرده استاندارد)
        return 'error-danger';                             // دریفت شدید یا خرابی فیزیکی زغال مغزی استیک
    }
};

// قرار دادن موتور محاسباتی در اسکوپ سراسری پنجره برای دسترسی مستقیم توسط فریم‌های گرافیکی app.js
window.CalibrationEngine = CalibrationEngine;
