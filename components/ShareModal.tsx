import React, { useState } from 'react';
import {
  Share2,
  Copy,
  Check,
  X,
  MessageCircle,
  ExternalLink,
  QrCode,
  Sparkles,
  Trophy,
  Globe,
} from 'lucide-react';
import { sound } from '../services/soundEffects';
import { getPublicShareUrl } from '../services/shareHelper';

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  score?: number;
  playerTitle?: string;
  defaultMode?: string;
}

export const ShareModal: React.FC<ShareModalProps> = ({
  isOpen,
  onClose,
  score,
  playerTitle,
  defaultMode = 'eyes',
}) => {
  const [copied, setCopied] = useState(false);
  const [domainCopied, setDomainCopied] = useState(false);
  const [showQr, setShowQr] = useState(false);

  if (!isOpen) return null;

  const officialDomain = 'http://EllooolB11.com';
  // Use public share URL so friends opening on WhatsApp/browser NEVER get 403
  const shareUrl = getPublicShareUrl({ mode: defaultMode, score });

  const shareText = score
    ? `⚽ حققت ${score} نقطة في فوازير كورة B11! هل تقدر تتحداني وتخمن اللاعبين من عيونهم وملامحهم الحقيقية؟ ادخل العب الآن عبر الرابط المباشر:`
    : `⚽ تعال العب معنا فوازير كورة B11 وتحدي كشف نجوم العالم من عيونهم الحقيقية! افتح الرابط المباشر والعب:`;

  const handleCopy = async () => {
    sound.playClick();
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(shareUrl);
      } else {
        const input = document.createElement('input');
        input.value = shareUrl;
        document.body.appendChild(input);
        input.select();
        document.execCommand('copy');
        document.body.removeChild(input);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  const handleCopyDomain = async () => {
    sound.playClick();
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(officialDomain);
      } else {
        const input = document.createElement('input');
        input.value = officialDomain;
        document.body.appendChild(input);
        input.select();
        document.execCommand('copy');
        document.body.removeChild(input);
      }
      setDomainCopied(true);
      setTimeout(() => setDomainCopied(false), 2500);
    } catch {
      setDomainCopied(true);
      setTimeout(() => setDomainCopied(false), 2500);
    }
  };

  const handleNativeShare = async () => {
    sound.playClick();
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'برنامج فوازير كورة B11 - تحدي عيون اللاعبين',
          text: shareText,
          url: shareUrl,
        });
      } catch {
        // User cancelled
      }
    } else {
      handleCopy();
    }
  };

  const whatsappUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(
    shareText + ' ' + officialDomain + ' ' + shareUrl
  )}`;
  const telegramUrl = `https://t.me/share/url?url=${encodeURIComponent(
    officialDomain
  )}&text=${encodeURIComponent(shareText)}`;
  const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(
    shareText
  )}&url=${encodeURIComponent(officialDomain)}`;

  const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(
    officialDomain
  )}&bgcolor=0c1710&color=cbfb63`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
      <div className="relative w-full max-w-md bg-neutral-900 border-2 border-lime-400/40 rounded-3xl p-6 shadow-[0_0_50px_rgba(203,251,99,0.2)] text-white">
        <button
          onClick={() => {
            sound.playClick();
            onClose();
          }}
          className="absolute top-4 left-4 p-2 rounded-full bg-neutral-800 text-gray-300 hover:text-white hover:bg-neutral-700 transition cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex flex-col items-center text-center mb-4">
          <div className="w-14 h-14 rounded-2xl bg-lime-400/10 border border-lime-400/40 flex items-center justify-center text-lime-400 mb-3 shadow-[0_0_20px_rgba(203,251,99,0.2)]">
            <Share2 className="w-7 h-7" />
          </div>
          <h3 className="text-xl font-black text-lime-400">
            مشاركة رابط اللعبة الرسمي
          </h3>
          <p className="text-xs text-gray-300 mt-1">
            أي شخص يفتح الرابط سيدخل اللعبة فوراً بدون تحميل أو تسجيل!
          </p>
        </div>

        <div className="mb-4 p-3 bg-gradient-to-r from-emerald-950/80 via-neutral-900 to-lime-950/80 border-2 border-lime-400/60 rounded-2xl flex items-center justify-between shadow-lg">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-lime-400/20 text-lime-400 flex items-center justify-center">
              <Globe className="w-4 h-4" />
            </div>
            <div>
              <span className="text-[10px] text-gray-400 block font-bold">النطاق الرسمي للعبة:</span>
              <span className="text-xs sm:text-sm font-black text-lime-300 font-mono tracking-wide">
                EllooolB11.com
              </span>
            </div>
          </div>

          <button
            onClick={handleCopyDomain}
            className={`px-3 py-1.5 rounded-xl text-xs font-black flex items-center gap-1 transition cursor-pointer active:scale-95 ${
              domainCopied
                ? 'bg-emerald-500 text-black'
                : 'bg-lime-400 hover:bg-lime-300 text-black'
            }`}
          >
            {domainCopied ? (
              <>
                <Check className="w-3.5 h-3.5" />
                <span>تم النسخ!</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>نسخ الدومين</span>
              </>
            )}
          </button>
        </div>

        {score !== undefined && (
          <div className="mb-4 p-3 rounded-xl bg-lime-950/60 border border-lime-500/30 flex items-center justify-between text-xs font-bold text-lime-300">
            <span className="flex items-center gap-1.5">
              <Trophy className="w-4 h-4 text-amber-400" />
              <span>نتيجتك في التحدي:</span>
            </span>
            <span className="text-sm font-black text-amber-300 font-mono">
              {score} نقطة {playerTitle ? `• ${playerTitle}` : ''}
            </span>
          </div>
        )}

        <div className="mb-4">
          <label className="block text-xs font-semibold text-gray-400 mb-1.5">
            رابط الجلسة المباشر (Direct Session):
          </label>
          <div className="flex items-center gap-2 p-2 bg-black/60 rounded-xl border border-white/10">
            <input
              type="text"
              readOnly
              value={shareUrl}
              className="flex-1 bg-transparent text-xs text-lime-300 font-mono outline-none select-all px-2 overflow-hidden text-ellipsis"
            />
            <button
              onClick={handleCopy}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 transition cursor-pointer ${
                copied
                  ? 'bg-emerald-500 text-black'
                  : 'bg-neutral-800 hover:bg-neutral-700 text-gray-200 active:scale-95'
              }`}
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>تم!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>نسخ</span>
                </>
              )}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 mb-4">
          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => sound.playClick()}
            className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition cursor-pointer shadow-md"
          >
            <MessageCircle className="w-4 h-4" />
            <span>واتساب</span>
          </a>

          <a
            href={telegramUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => sound.playClick()}
            className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-sky-500 hover:bg-sky-400 text-white font-bold text-xs transition cursor-pointer shadow-md"
          >
            <ExternalLink className="w-4 h-4" />
            <span>تليجرام</span>
          </a>

          <a
            href={twitterUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => sound.playClick()}
            className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-white font-bold text-xs transition cursor-pointer border border-white/10 shadow-md"
          >
            <span className="font-mono text-sm">𝕏</span>
            <span>تويتر</span>
          </a>
        </div>

        {typeof navigator !== 'undefined' && 'share' in navigator && (
          <button
            onClick={handleNativeShare}
            className="w-full mb-3 py-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 border border-white/10 text-white font-bold text-xs flex items-center justify-center gap-2 cursor-pointer transition"
          >
            <Sparkles className="w-4 h-4 text-amber-400" />
            <span>مشاركة عبر تطبيقات الهاتف (تطبيقات أخرى)</span>
          </button>
        )}

        <div className="pt-3 border-t border-white/10 flex flex-col items-center">
          <button
            onClick={() => {
              sound.playClick();
              setShowQr(!showQr);
            }}
            className="flex items-center gap-1.5 text-xs text-lime-400 hover:underline cursor-pointer font-semibold"
          >
            <QrCode className="w-3.5 h-3.5" />
            <span>{showQr ? 'إخفاء رمز الـ QR' : 'مسح الباركود للفتح على الهاتف (QR Code)'}</span>
          </button>

          {showQr && (
            <div className="mt-3 p-3 bg-neutral-950 rounded-2xl border border-lime-400/30 flex flex-col items-center animate-fadeIn">
              <img
                src={qrApiUrl}
                alt="QR Code للمشاركة"
                className="w-44 h-44 rounded-xl border border-lime-400/20"
              />
              <span className="text-[10px] text-gray-400 mt-2">
                امسح الكود لفتح EllooolB11.com على هاتفك مباشرة
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
