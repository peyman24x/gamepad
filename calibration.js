/**
 * سامانه هوشمند تست و کالیبراسیون سخت‌افزار
 * هسته محاسبات ریاضی، فیلتر ددزون و آنالیز هندسی ۳۶۰ درجه (calibration.js)
 * توسعه یافته برای اتصال بومی به هسته: Fix.Peyman24x.ir
 */

const CalibrationEngine = {
    // ۱. پارامترهای پیش‌فرض مهندسی سیگنال و کالیبراسیون سخت‌افزار
    Config: {
        DEADZONE_THRESHOLD: 0.05,     // حد آستانه صفر مطلق برای تراز مرکز (مرحله ۲ جادوگر)
        SATURATION_LIMIT: 1.0,        // سقف بردار نرمالایز شده خروجی سخت‌افزار
        IDEAL_RADIUS: 1.0             // شعاع دایره مرجع کالیبراسیون کامل و بی‌نقص
    },

    // ۲. الگوریتم محاسبه خطای هندسی دایره (Circular Error / Average Deviation)
    // این فرمول به طور دقیق میزان انحراف آنی استیک از دایره ایده‌آل ۱.0 را محاسبه می‌کند
    calculateCircularError(x, y) {
        if (x === 0 && y === 0) return 0;
        
        // محاسبه طول بردار فیزیکی استیک (قضیه فیثاغورس)
        const magnitude = Math.sqrt(x * x + y * y);
        
        // میزان انحراف خالص سخت‌افزاری از شعاع استاندارد ۱.۰ دایره مرجع
        const deviation = Math.abs(magnitude - this.Config.IDEAL_RADIUS);
        
        // تبدیل انحراف هندسی به درصد خطا جهت نمایش به تکنسین
        let errorPercentage = deviation * 100;
        
        // فیلتر نویزهای فرکانس بالای پتانسیومتر برای مانیتورینگ پایدار و بدون نوسان پرش لب‌ها
        if (errorPercentage < 0.01) errorPercentage = 0;
        if (errorPercentage > 100) errorPercentage = 100;
        
        return errorPercentage;
    },

    // ۳. الگوریتم اعمال حد آستانه حرکت مرده (Radial Deadzone Filter)
    // جهت حذف کامل نوسانات ریز (Drift) در زمانی که کاربر به آنالوگ استیک دست نمی‌زند
    applyRadialDeadzone(x, y) {
        const magnitude = Math.sqrt(x * x + y * y);
        
        // اگر طول بردار کمتر از آستانه ددزون باشد، استیک کاملاً در مرکز فرض می‌شود (دریفت صفر مطلق)
        if (magnitude < this.Config.DEADZONE_THRESHOLD) {
            return { x: 0, y: 0, isCentered: true, magnitude: 0 };
        }
        
        // نگاشت خطی مجدد (Rescaling) پوزیشن استیک برای حفظ پیوستگی شتاب و حرکت پس از عبور از محدوده ددزون
        const scale = ((magnitude - this.Config.DEADZONE_THRESHOLD) / (this.Config.SATURATION_LIMIT - this.Config.DEADZONE_THRESHOLD)) / magnitude;
        
        let finalX = x * scale;
        let finalY = y * scale;
        
        // اشباع و کلمپ کردن سقف خروجی دیتای آنالوگ در بازه استاندارد [-1.0 , 1.0]
        finalX = Math.max(-1, Math.min(1, finalX));
        finalY = Math.max(-1, Math.min(1, finalY));
        
        return { 
            x: finalX, 
            y: finalY, 
            isCentered: false,
            magnitude: Math.sqrt(finalX * finalX + finalY * finalY)
        };
    },

    // ۴. ماتریس هوشمند جهت‌شناسی جغرافیایی ۳۶۰ درجه (مرحله ۳ جادوگر کالیبراسیون)
    // این تابع موقعیت لبه سخت‌افزار را آنالیز کرده و فلگ‌های وضعیت را در کلاستر جهت‌ها فعال می‌کند
    trackStickDirections(x, y, stateMatrix) {
        const triggerThreshold = 0.85; // تعمیرکار باید استیک را حداقل ۸۵٪ به لبه‌ها نزدیک کند تا جهت جغرافیایی ثبت شود
        let updated = false;

        // توجه فنی: در ساختار کانواس و پروتکل استاندارد وب، جهت شمال (North) دارای مقدار Y منفی است
        // الف) آنالیز جهت شمال (North)
        if (y < -triggerThreshold && Math.abs(x) < 0.40) {
            if (!stateMatrix.n) { stateMatrix.n = true; updated = true; }
        }
        // ب) آنالیز جهت جنوب (South)
        else if (y > triggerThreshold && Math.abs(x) < 0.40) {
            if (!stateMatrix.s) { stateMatrix.s = true; updated = true; }
        }
        // ج) آنالیز جهت شرق (East)
        else if (x > triggerThreshold && Math.abs(y) < 0.40) {
            if (!stateMatrix.e) { stateMatrix.e = true; updated = true; }
        }
        // د) آنالیز جهت غرب (West)
        else if (x < -triggerThreshold && Math.abs(y) < 0.40) {
            if (!stateMatrix.w) { stateMatrix.w = true; updated = true; }
        }

        return updated; // بازگرداندن وضعیت کشف گام جدید در چرخه ۳۶۰ درجه برای مدیریت UI
    },

    // ۵. ارزیابی تراز صفر مطلق سخت‌افزاری (فاز دوم جادوگر: همگام‌سازی تراز مرکز)
    checkCenterAlignment(leftX, leftY, rightX, rightY) {
        const leftOffset = Math.sqrt(leftX * leftX + leftY * leftY);
        const rightOffset = Math.sqrt(rightX * rightX + rightY * rightY);
        
        // بررسی قرارگیری دقیق هر دو استیک در محدوده امن ددزون بدون نیاز به لمس پتانسیومتر توسط تعمیرکار
        const isLeftCentered = leftOffset < this.Config.DEADZONE_THRESHOLD;
        const isRightCentered = rightOffset < this.Config.DEADZONE_THRESHOLD;
        
        return {
            isValid: isLeftCentered && isRightCentered,
            leftOffset: leftOffset.toFixed(4),
            rightOffset: rightOffset.toFixed(4)
        };
    },

    // ۶. متریک تخصصی استخراج پالت رنگی داینامیک رابط کاربری براساس درصد خطای انحراف استیک
    getErrorColorClass(errorPercentage) {
        if (errorPercentage <= 5.0) {
            return 'error-green';     // خطای فوق‌العاده عالی زیر ۵ درصد (مخصوص سنسورهای اثرهال یا آنالوگ نو اورجینال)
        }
        if (errorPercentage <= 12.0) {
            return 'error-warning';   // خطای استاندارد و پذیرفته شده (پتانسیومترهای فابریک کارکرده و ذغال‌های سالم)
        }
        return 'error-danger';         // انحراف بحرانی و خارج از استاندارد (دریفت شدید، سایش شدید مغزی یا خرابی فیزیکی سخت‌افزار)
    }
};

// قرار دادن هسته محاسباتی در اسکوپ سراسری پنجره جهت پایش و دسترسی مستقیم توسط لوپ‌های فریم گرافیکی در app.js
window.CalibrationEngine = CalibrationEngine;
