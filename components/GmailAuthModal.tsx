import React, { useState } from 'react';
import {
  getCurrentUser,
  loginWithGmail,
  logout,
  UserAccount,
} from '../services/authService';
import { sound } from '../services/soundEffects';
import confetti from 'canvas-confetti';
import {
  Mail,
  Crown,
  LogOut,
  X,
  ShieldCheck,
  Sparkles,
  Lock,
} from 'lucide-react';

interface GmailAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUserChanged: (user: UserAccount | null) => void;
  requiredOwnerNotice?: boolean;
}

export const GmailAuthModal: React.FC<GmailAuthModalProps> = ({
  isOpen,
  onClose,
  onUserChanged,
  requiredOwnerNotice = false,
}) => {
  const [currentUser, setCurrentUser] = useState<UserAccount | null>(() => getCurrentUser());
  const [emailInput, setEmailInput] = useState('');
  const [nameInput, setNameInput] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    try {
      const email = emailInput.trim();
      if (!email) return;

      if (!email.includes('@') || !email.includes('.')) {
        setErrorMsg('يرجى إدخال بريد إلكتروني أو جيميل صالح (Gmail)');
        return;
      }

      const user = loginWithGmail(email, nameInput);
      setCurrentUser(user);
      onUserChanged(user);

      try {
        sound.playCorrect();
        if (user.isOwner) {
          sound.playFanfare();
          confetti({
            particleCount: 120,
            spread: 90,
            colors: ['#f59e0b', '#cbfb63', '#ffffff'],
          });
        }
      } catch {
        // Ignore audio or confetti error
      }

      onClose();
    } catch (err) {
      console.error('Registration error', err);
      setErrorMsg('حدث خطأ أثناء حفظ البيانات، يرجى إعادة المحاولة.');
    }
  };

  const handleLogout = () => {
    try {
      sound.playClick();
      logout();
      setCurrentUser(null);
      onUserChanged(null);
    } catch (e) {
      console.error('Logout error', e);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fadeIn">
      <div className="relative w-full max-w-md bg-neutral-900 border-2 border-lime-400/50 rounded-3xl p-6 text-white shadow-[0_0_50px_rgba(203,251,99,0.25)]">
        <button
          onClick={() => {
            sound.playClick();
            onClose();
          }}
          className="absolute top-4 left-4 p-2 rounded-full bg-neutral-800 text-gray-300 hover:text-white hover:bg-neutral-700 transition cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex flex-col items-center text-center mb-5">
          <div className="w-14 h-14 rounded-2xl bg-red-500/10 border border-red-500/40 flex items-center justify-center text-red-400 mb-3 shadow-[0_0_20px_rgba(239,68,68,0.3)]">
            <Mail className="w-7 h-7" />
          </div>

          <h3 className="text-xl font-black text-white">
            {currentUser ? 'حسابك في فوازير كورة B11' : 'إضافة بريد Gmail لحفظ النتائج'}
          </h3>
          <p className="text-xs text-gray-300 mt-1">
            {currentUser
              ? 'يتم حفظ جميع نتائجك ومشاركاتك تلقائياً وربطها بحسابك'
              : 'اربط بريدك الإلكتروني لحفظ نقاطك في لوحة الصدارة ومزامنة إنجازاتك'}
          </p>
        </div>

        {requiredOwnerNotice && !currentUser?.isOwner && (
          <div className="mb-4 p-3 rounded-2xl bg-amber-950/80 border border-amber-500/60 flex items-center gap-2.5 text-xs text-amber-200">
            <Lock className="w-5 h-5 text-amber-400 shrink-0" />
            <div className="leading-relaxed">
              <span className="font-bold text-amber-300 block">وضع المالك محمي ومقفل 🔒</span>
              مخصص حصرياً لمالك اللعبة المعتمد. يرجى إدخال بريد الجيميل الخاص بك لتسجيل الدخول وتفعيل الصلاحيات.
            </div>
          </div>
        )}

        {currentUser ? (
          <div className="space-y-4">
            <div className="p-4 rounded-2xl bg-black/60 border border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-neutral-800 flex items-center justify-center text-2xl border border-white/10">
                  {currentUser.avatar}
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-black text-white">{currentUser.name}</span>
                    {currentUser.isOwner && (
                      <span className="text-[10px] bg-amber-400 text-black font-black px-2 py-0.5 rounded-full flex items-center gap-0.5">
                        <Crown className="w-3 h-3" />
                        <span>المالك الرسمي</span>
                      </span>
                    )}
                  </div>
                  <span className="text-xs font-mono text-gray-400 block mt-0.5">
                    {currentUser.email}
                  </span>
                </div>
              </div>
            </div>

            {currentUser.isOwner ? (
              <div className="p-3 bg-amber-950/50 border border-amber-400/40 rounded-2xl text-xs text-amber-300 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
                <span>
                  أهلاً بك يا مالك التطبيق! تم فتح صلاحيات إضافة وتعديل صور اللاعبين والأسئلة لك بالكامل.
                </span>
              </div>
            ) : (
              <div className="p-3 bg-emerald-950/50 border border-emerald-400/40 rounded-2xl text-xs text-emerald-300 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>حسابك مفعل ويتم حفظ نتائجك في لوحة الصدارة باسمك.</span>
              </div>
            )}

            <button
              onClick={handleLogout}
              className="w-full py-2.5 rounded-xl bg-neutral-800 hover:bg-red-950/60 hover:text-red-300 border border-white/10 text-gray-300 text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              <span>تسجيل الخروج والتبديل لحساب آخر</span>
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="p-3 bg-amber-950/40 border border-amber-400/40 rounded-2xl flex flex-col gap-1.5">
              <span className="text-[11px] font-bold text-amber-300">
                👑 إذا كنت مالك اللعبة، يمكنك الدخول السريع بنقرة واحدة:
              </span>
              <button
                type="button"
                onClick={() => {
                  setEmailInput('fcmopile75@gmail.com');
                  setNameInput('مالك التطبيق 👑');
                }}
                className="py-1.5 px-3 rounded-xl bg-amber-400/20 hover:bg-amber-400/30 text-amber-300 border border-amber-400/30 text-xs font-bold transition flex items-center justify-between cursor-pointer"
              >
                <span>fcmopile75@gmail.com</span>
                <span className="text-[10px] bg-amber-400 text-black px-1.5 py-0.5 rounded font-black">تعبئة سريعة ⚡</span>
              </button>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-300 mb-1">
                بريد الجيميل (Gmail) *
              </label>
              <div className="relative flex items-center">
                <input
                  type="email"
                  required
                  placeholder="name@gmail.com"
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  className="w-full bg-black/60 border border-white/20 rounded-xl px-3 py-2.5 text-xs text-white focus:border-lime-400 outline-none font-mono"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-300 mb-1">
                الاسم المستعار (اختياري)
              </label>
              <input
                type="text"
                placeholder="مثال: الكابتن علي"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                className="w-full bg-black/60 border border-white/20 rounded-xl px-3 py-2.5 text-xs text-white focus:border-lime-400 outline-none"
              />
            </div>

            {errorMsg && (
              <p className="text-xs text-red-400 font-semibold text-center">{errorMsg}</p>
            )}

            <button
              type="submit"
              className="w-full py-3 rounded-2xl bg-gradient-to-r from-red-600 via-amber-500 to-lime-400 hover:opacity-95 text-black font-black text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg cursor-pointer active:scale-95 transition"
            >
              <Mail className="w-4 h-4" />
              <span>تأكيد وربط حساب Gmail ⚡</span>
            </button>

            <div className="p-2.5 bg-black/40 rounded-xl border border-white/10 text-[11px] text-gray-400 text-center leading-relaxed">
              🔐 وضع المالك محمي برمز الأمان، ويفتح تلقائياً فور التحقق من بريد المالك المعتمد.
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
