import React, { useState } from 'react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { sound } from '../services/soundEffects';
import {
  Download,
  Smartphone,
  CheckCircle2,
  X,
  Apple,
  Monitor,
} from 'lucide-react';

interface PWAInstallButtonProps {
  variant?: 'nav' | 'banner';
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({ variant = 'nav' }) => {
  const { isInstallable, isInstalled, install } = usePWAInstall();
  const [showModal, setShowModal] = useState(false);

  if (isInstalled) {
    if (variant === 'nav') return null;
    return (
      <div className="flex items-center gap-1.5 px-3 py-1 bg-lime-950/70 border border-lime-500/40 rounded-full text-xs text-lime-300 font-bold">
        <CheckCircle2 className="w-3.5 h-3.5 text-lime-400" />
        <span>التطبيق مثبت على جهازك كبرنامج رسمي ✅</span>
      </div>
    );
  }

  const handleInstallClick = async () => {
    sound.playClick();
    if (isInstallable) {
      const outcome = await install();
      if (!outcome) {
        setShowModal(true);
      }
    } else {
      setShowModal(true);
    }
  };

  return (
    <>
      {variant === 'nav' && (
        <button
          onClick={handleInstallClick}
          className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-emerald-500 via-lime-400 to-emerald-500 hover:from-emerald-400 hover:to-lime-300 text-black font-black text-xs sm:text-sm flex items-center gap-1.5 shadow-[0_0_20px_rgba(203,251,99,0.35)] transition cursor-pointer active:scale-95 animate-pulse"
          title="تحميل وتثبيت التطبيق على جهازك مجاناً"
        >
          <Download className="w-3.5 h-3.5" />
          <span>تحميل التطبيق 📲</span>
        </button>
      )}

      {variant === 'banner' && (
        <div className="w-full bg-gradient-to-r from-lime-950/70 via-neutral-900 to-emerald-950/70 border border-lime-400/40 rounded-3xl p-4 sm:p-5 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-xl backdrop-blur-md">
          <div className="flex items-center gap-3.5 text-center sm:text-right">
            <div className="w-12 h-12 rounded-2xl bg-lime-400/20 border border-lime-400/40 flex items-center justify-center text-lime-400 shrink-0 shadow-[0_0_20px_rgba(203,251,99,0.3)]">
              <Download className="w-6 h-6 animate-bounce" />
            </div>
            <div>
              <div className="flex items-center justify-center sm:justify-start gap-1.5">
                <span className="text-sm sm:text-base font-black text-white">
                  حمّل تطبيق فوازير كورة B11 الآن على هاتفك
                </span>
                <span className="text-[10px] bg-lime-400 text-black font-black px-2 py-0.5 rounded-md">
                  تطبيق أصلي PWA
                </span>
              </div>
              <p className="text-xs text-gray-300 mt-1">
                تثبيت فوري ومجاني لجميع الأجهزة (آيفون، أندرويد، كمبيوتر) ليعمل مباشرة بدون شريط المتصفح!
              </p>
            </div>
          </div>

          <button
            onClick={handleInstallClick}
            className="w-full sm:w-auto px-6 py-3 rounded-2xl bg-lime-400 hover:bg-lime-300 text-black font-black text-xs sm:text-sm flex items-center justify-center gap-2 shadow-[0_0_25px_rgba(203,251,99,0.4)] transition cursor-pointer active:scale-95 shrink-0"
          >
            <Download className="w-4 h-4" />
            <span>تنزيل وتثبيت التطبيق مجاناً ⚡</span>
          </button>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
          <div className="relative w-full max-w-lg bg-neutral-900 border-2 border-lime-400/50 rounded-3xl p-6 text-white shadow-[0_0_50px_rgba(203,251,99,0.25)]">
            <button
              onClick={() => {
                sound.playClick();
                setShowModal(false);
              }}
              className="absolute top-4 left-4 p-2 rounded-full bg-neutral-800 text-gray-300 hover:text-white hover:bg-neutral-700 transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex flex-col items-center text-center mb-5">
              <div className="w-16 h-16 rounded-3xl bg-lime-400/10 border border-lime-400/40 flex items-center justify-center text-lime-400 mb-3 shadow-[0_0_25px_rgba(203,251,99,0.3)]">
                <Smartphone className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-black text-lime-400">
                تنزيل وتثبيت التطبيق على جهازك
              </h3>
              <p className="text-xs text-gray-300 mt-1">
                يعمل التطبيق على جميع الأجهزة دون الحاجة لمتجر، وبمساحة خفيفة جداً!
              </p>
            </div>

            {isInstallable && (
              <div className="mb-4 p-3.5 rounded-2xl bg-lime-950/80 border border-lime-500/50 text-center">
                <p className="text-xs font-bold text-lime-300 mb-2">
                  جهازك يدعم التثبيت المباشر الآن:
                </p>
                <button
                  onClick={async () => {
                    await install();
                    setShowModal(false);
                  }}
                  className="w-full py-2.5 rounded-xl bg-lime-400 hover:bg-lime-300 text-black font-black text-xs flex items-center justify-center gap-2 cursor-pointer shadow-md active:scale-95 transition"
                >
                  <Download className="w-4 h-4" />
                  <span>تأكيد التثبيت الفوري 📲</span>
                </button>
              </div>
            )}

            <div className="space-y-3 mb-5">
              <div className="p-3.5 rounded-2xl bg-black/60 border border-white/10">
                <div className="flex items-center gap-2 mb-1.5 text-xs font-black text-amber-300">
                  <Apple className="w-4 h-4" />
                  <span>لهواتف آيفون وآيباد (Safari):</span>
                </div>
                <ol className="text-xs text-gray-300 space-y-1 pr-4 list-decimal leading-relaxed">
                  <li>
                    اضغط زر <strong>المشاركة (Share ⎋)</strong> في أسفل متصفح Safari.
                  </li>
                  <li>
                    اختر <strong className="text-lime-300">&quot;إضافة إلى الشاشة الرئيسية&quot; (Add to Home Screen ⊞)</strong>.
                  </li>
                  <li>
                    اضغط <strong>إضافة (Add)</strong>، وسيظهر التطبيق كأيقونة رسمية على شاشتك!
                  </li>
                </ol>
              </div>

              <div className="p-3.5 rounded-2xl bg-black/60 border border-white/10">
                <div className="flex items-center gap-2 mb-1.5 text-xs font-black text-emerald-300">
                  <Smartphone className="w-4 h-4" />
                  <span>لهواتف أندرويد (Chrome):</span>
                </div>
                <p className="text-xs text-gray-300 leading-relaxed pr-2">
                  اضغط على خيارات المتصفح (⋮) في الزاوية العلوية ثم اختر <strong className="text-lime-300">&quot;تثبيت التطبيق&quot; أو &quot;إضافة إلى الشاشة الرئيسية&quot;</strong>.
                </p>
              </div>

              <div className="p-3.5 rounded-2xl bg-black/60 border border-white/10">
                <div className="flex items-center gap-2 mb-1.5 text-xs font-black text-cyan-300">
                  <Monitor className="w-4 h-4" />
                  <span>لأجهزة الكمبيوتر (Windows / Mac):</span>
                </div>
                <p className="text-xs text-gray-300 leading-relaxed pr-2">
                  اضغط على أيقونة التثبيت <strong>(🖥️ Install)</strong> في شريط عنوان المتصفح لتشغيله كبرنامج مستقل.
                </p>
              </div>
            </div>

            <button
              onClick={() => {
                sound.playClick();
                setShowModal(false);
              }}
              className="w-full py-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-gray-300 text-xs font-bold transition cursor-pointer"
            >
              إغلاق
            </button>
          </div>
        </div>
      )}
    </>
  );
};
