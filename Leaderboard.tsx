import React, { useState, useEffect } from 'react';
import { getLeaderboard, LeaderboardEntry, resetLeaderboard, saveLeaderboardEntry } from '../services/storage';
import { sound } from '../services/soundEffects';
import confetti from 'canvas-confetti';
import {
  Trophy,
  Crown,
  Eye,
  HelpCircle,
  ArrowRight,
  Plus,
  RotateCcw,
} from 'lucide-react';
import { getCurrentUser } from '../services/authService';

interface LeaderboardProps {
  onBackToHome: () => void;
  pendingScore?: { score: number; mode: 'eyes' | 'trivia' };
  onScoreSaved?: () => void;
}

export const Leaderboard: React.FC<LeaderboardProps> = ({
  onBackToHome,
  pendingScore,
  onScoreSaved,
}) => {
  const [filterMode, setFilterMode] = useState<'total' | 'eyes' | 'trivia'>('eyes');
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const currentUser = getCurrentUser();
  const [playerNameInput, setPlayerNameInput] = useState(currentUser?.name || '');
  const [selectedAvatar, setSelectedAvatar] = useState(currentUser?.avatar || '⚽');
  const [showAddModal, setShowAddModal] = useState(Boolean(pendingScore && pendingScore.score > 0));

  useEffect(() => {
    loadData();
  }, [filterMode]);

  const loadData = () => {
    setEntries(getLeaderboard(filterMode));
  };

  const handleSaveScore = (e: React.FormEvent) => {
    e.preventDefault();
    if (!playerNameInput.trim()) return;

    sound.playCorrect();
    confetti({ particleCount: 80, spread: 70, origin: { y: 0.6 } });

    const scoreToSave = pendingScore ? pendingScore.score : 850;
    const modeToSave = pendingScore ? pendingScore.mode : 'eyes';

    let rankBadge = '⭐ بطل كروي';
    if (scoreToSave >= 1200) rankBadge = '👑 أسطورة تاريخية';
    else if (scoreToSave >= 800) rankBadge = '🥇 صقر الملاعب';

    saveLeaderboardEntry({
      name: playerNameInput.trim(),
      score: scoreToSave,
      mode: modeToSave,
      rankBadge,
      avatar: selectedAvatar,
    });

    setShowAddModal(false);
    setPlayerNameInput('');
    loadData();
    if (onScoreSaved) onScoreSaved();
  };

  const handleReset = () => {
    resetLeaderboard();
    loadData();
    sound.playClick();
  };

  const topThree = entries.slice(0, 3);
  const remaining = entries.slice(3);

  const avatarsList = ['⚽', '🦅', '👑', '⚡', '🏆', '🔥', '🎯', '🦁'];

  return (
    <div className="relative z-10 w-full max-w-4xl mx-auto px-4 py-4 flex flex-col items-center animate-fadeIn">
      <div className="w-full flex items-center justify-between mb-4 bg-black/60 border border-white/10 px-4 py-2.5 rounded-2xl">
        <button
          onClick={onBackToHome}
          className="text-xs sm:text-sm text-gray-300 hover:text-lime-400 font-bold transition flex items-center gap-1 cursor-pointer"
        >
          <ArrowRight className="w-4 h-4" />
          <span>القائمة الرئيسية</span>
        </button>

        <div className="flex items-center gap-2">
          <Crown className="w-5 h-5 text-yellow-400 animate-bounce" />
          <h2 className="text-sm sm:text-base font-black text-transparent bg-clip-text bg-gradient-to-r from-yellow-300 via-lime-300 to-amber-400">
            لوحة صدارة أبطال B11
          </h2>
        </div>

        <button
          onClick={() => setShowAddModal(true)}
          className="px-3 py-1 rounded-xl bg-lime-400 hover:bg-lime-300 text-black font-black text-xs flex items-center gap-1 transition cursor-pointer shadow-md"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>سجل نتيجتك</span>
        </button>
      </div>

      <div className="flex items-center gap-2 mb-6 p-1 bg-neutral-900/90 rounded-2xl border border-white/10">
        <button
          onClick={() => {
            sound.playClick();
            setFilterMode('eyes');
          }}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black transition cursor-pointer ${
            filterMode === 'eyes'
              ? 'bg-lime-400 text-black shadow-lg shadow-lime-400/20'
              : 'text-gray-300 hover:text-white'
          }`}
        >
          <Eye className="w-3.5 h-3.5" />
          <span>تحدي العيون الحقيقية</span>
        </button>

        <button
          onClick={() => {
            sound.playClick();
            setFilterMode('trivia');
          }}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black transition cursor-pointer ${
            filterMode === 'trivia'
              ? 'bg-cyan-400 text-black shadow-lg shadow-cyan-400/20'
              : 'text-gray-300 hover:text-white'
          }`}
        >
          <HelpCircle className="w-3.5 h-3.5" />
          <span>الفوازير الكروية</span>
        </button>

        <button
          onClick={() => {
            sound.playClick();
            setFilterMode('total');
          }}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black transition cursor-pointer ${
            filterMode === 'total'
              ? 'bg-amber-400 text-black shadow-lg shadow-amber-400/20'
              : 'text-gray-300 hover:text-white'
          }`}
        >
          <Trophy className="w-3.5 h-3.5" />
          <span>الترتيب العام</span>
        </button>
      </div>

      {topThree.length > 0 && (
        <div className="w-full max-w-2xl grid grid-cols-3 gap-2 sm:gap-4 items-end mb-8 pt-6">
          {topThree[1] && (
            <div className="flex flex-col items-center order-1">
              <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-gradient-to-tr from-slate-400 to-slate-200 p-0.5 shadow-[0_0_20px_rgba(203,213,225,0.4)] mb-2 flex items-center justify-center text-2xl sm:text-3xl relative">
                <span>{topThree[1].avatar}</span>
                <span className="absolute -top-2.5 -right-2 bg-slate-600 text-white text-[10px] font-black w-5 h-5 rounded-full flex items-center justify-center border border-white">
                  2
                </span>
              </div>
              <div className="w-full bg-gradient-to-b from-slate-900 to-neutral-950 border border-slate-400/40 rounded-2xl p-3 flex flex-col items-center text-center shadow-lg">
                <span className="text-[10px] text-slate-300 font-bold mb-0.5">🥈 المركز الثاني</span>
                <span className="text-xs sm:text-sm font-black text-white truncate max-w-full">
                  {topThree[1].name}
                </span>
                <span className="text-sm sm:text-base font-black text-slate-300 font-mono mt-1">
                  {topThree[1].score} نقطة
                </span>
              </div>
            </div>
          )}

          {topThree[0] && (
            <div className="flex flex-col items-center order-2 -mt-4">
              <Crown className="w-7 h-7 text-yellow-400 mb-1 animate-bounce" />
              <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-gradient-to-tr from-yellow-500 via-amber-300 to-yellow-100 p-0.5 shadow-[0_0_35px_rgba(250,204,21,0.6)] mb-2 flex items-center justify-center text-3xl sm:text-4xl relative">
                <span>{topThree[0].avatar}</span>
                <span className="absolute -top-2.5 -right-2 bg-yellow-500 text-black text-xs font-black w-6 h-6 rounded-full flex items-center justify-center border-2 border-white shadow-md">
                  1
                </span>
              </div>
              <div className="w-full bg-gradient-to-b from-amber-950/80 via-neutral-900 to-neutral-950 border-2 border-yellow-400/80 rounded-2xl p-4 flex flex-col items-center text-center shadow-[0_0_25px_rgba(250,204,21,0.25)]">
                <span className="text-xs text-yellow-300 font-black mb-0.5">🥇 بطل الصدارة</span>
                <span className="text-sm sm:text-base font-black text-white truncate max-w-full">
                  {topThree[0].name}
                </span>
                <span className="text-base sm:text-xl font-black text-yellow-300 font-mono mt-1">
                  {topThree[0].score} نقطة
                </span>
                <span className="text-[10px] text-yellow-400/80 mt-1">{topThree[0].rankBadge}</span>
              </div>
            </div>
          )}

          {topThree[2] && (
            <div className="flex flex-col items-center order-3">
              <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-gradient-to-tr from-amber-700 to-amber-500 p-0.5 shadow-[0_0_20px_rgba(217,119,6,0.4)] mb-2 flex items-center justify-center text-2xl sm:text-3xl relative">
                <span>{topThree[2].avatar}</span>
                <span className="absolute -top-2.5 -right-2 bg-amber-700 text-white text-[10px] font-black w-5 h-5 rounded-full flex items-center justify-center border border-white">
                  3
                </span>
              </div>
              <div className="w-full bg-gradient-to-b from-amber-950 to-neutral-950 border border-amber-600/40 rounded-2xl p-3 flex flex-col items-center text-center shadow-lg">
                <span className="text-[10px] text-amber-400 font-bold mb-0.5">🥉 المركز الثالث</span>
                <span className="text-xs sm:text-sm font-black text-white truncate max-w-full">
                  {topThree[2].name}
                </span>
                <span className="text-sm sm:text-base font-black text-amber-400 font-mono mt-1">
                  {topThree[2].score} نقطة
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="w-full max-w-2xl bg-neutral-900/80 border border-white/10 rounded-3xl p-4 shadow-xl backdrop-blur-md mb-6">
        <h4 className="text-xs font-black text-gray-400 uppercase tracking-wider mb-3 px-2">
          باقي قائمة المتحدين
        </h4>

        {remaining.length === 0 && topThree.length === 0 ? (
          <div className="text-center py-8 text-gray-400 text-sm">
            لا توجد نتائج مسجلة حتى الآن. العب التحدي وسجل نتيجتك أولاً!
          </div>
        ) : (
          <div className="divide-y divide-white/5 space-y-1">
            {remaining.map((entry, index) => (
              <div
                key={entry.id}
                className="flex items-center justify-between p-2.5 rounded-xl hover:bg-neutral-800/60 transition"
              >
                <div className="flex items-center gap-3">
                  <span className="w-6 text-center text-xs font-mono font-bold text-gray-400">
                    #{index + 4}
                  </span>
                  <span className="text-xl">{entry.avatar}</span>
                  <div>
                    <span className="text-sm font-bold text-white block">{entry.name}</span>
                    <span className="text-[10px] text-gray-400">
                      {entry.rankBadge} • {entry.date}
                    </span>
                  </div>
                </div>

                <div className="text-right">
                  <span className="text-sm font-black text-lime-400 font-mono">
                    {entry.score}
                  </span>
                  <span className="text-[10px] text-gray-400 block">نقطة</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between w-full max-w-2xl px-2 text-xs text-gray-400">
        <span>النتائج محفوظة محلياً على متصفحك</span>
        <button
          onClick={handleReset}
          className="flex items-center gap-1 text-gray-400 hover:text-red-400 transition cursor-pointer"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>إعادة ضبط القائمة</span>
        </button>
      </div>

      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
          <div className="w-full max-w-md bg-neutral-900 border-2 border-lime-400/50 rounded-3xl p-6 text-white shadow-2xl relative">
            <h3 className="text-lg font-black text-lime-400 text-center mb-1">
              تسجيل نتيجتك في قائمة الشرف
            </h3>
            <p className="text-xs text-gray-300 text-center mb-4">
              أدخل اسمك واختر شارتك لتظهر بين أساطير اللعبة!
            </p>

            <form onSubmit={handleSaveScore} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-300 mb-1">
                  اسمك المستعار في اللعبة:
                </label>
                <input
                  type="text"
                  required
                  placeholder="مثال: الكابتن كريم"
                  value={playerNameInput}
                  onChange={(e) => setPlayerNameInput(e.target.value)}
                  className="w-full bg-black/60 border border-white/20 rounded-xl px-3 py-2 text-sm text-white focus:border-lime-400 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-300 mb-1">
                  النقاط المحققة:
                </label>
                <div className="w-full bg-black/40 border border-lime-400/30 rounded-xl px-3 py-2 text-sm font-black text-amber-300 font-mono">
                  {pendingScore ? pendingScore.score : 850} نقطة (
                  {pendingScore?.mode === 'trivia' ? 'الفوازير' : 'تحدي العيون'})
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-300 mb-1.5">
                  اختر شارة التحدي (الأفاتار):
                </label>
                <div className="flex gap-2 justify-center">
                  {avatarsList.map((av) => (
                    <button
                      type="button"
                      key={av}
                      onClick={() => setSelectedAvatar(av)}
                      className={`w-9 h-9 rounded-xl text-lg flex items-center justify-center border cursor-pointer transition ${
                        selectedAvatar === av
                          ? 'bg-lime-400 border-lime-300 scale-110 shadow-md'
                          : 'bg-neutral-800 border-white/10 hover:bg-neutral-700'
                      }`}
                    >
                      {av}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-lime-400 hover:bg-lime-300 text-black font-black text-xs transition cursor-pointer"
                >
                  حفظ في لوحة الصدارة 🏆
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-gray-300 text-xs font-bold cursor-pointer"
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
