import React, { useState, useEffect, useRef } from 'react';
import confetti from 'canvas-confetti';
import { FootballPlayer } from '../data/playersData';
import { getAllPlayers } from '../services/storage';
import { PlayerEyeViewer } from './PlayerEyeViewer';
import { CountdownTimer } from './CountdownTimer';
import { sound } from '../services/soundEffects';
import {
  Trophy,
  Flame,
  HelpCircle,
  Flag,
  Shield,
  Lightbulb,
  CheckCircle2,
  XCircle,
  ArrowRight,
  RotateCcw,
  Share2,
  Volume2,
  VolumeX,
} from 'lucide-react';

interface EyesChallengeProps {
  onBackToHome: () => void;
  onOpenShare: (score?: number, playerTitle?: string) => void;
  soundMuted: boolean;
  onToggleSound: () => void;
  initialPlayerId?: string;
}

export const EyesChallenge: React.FC<EyesChallengeProps> = ({
  onBackToHome,
  onOpenShare,
  soundMuted,
  onToggleSound,
  initialPlayerId,
}) => {
  const [playersList] = useState<FootballPlayer[]>(() => getAllPlayers());
  const initialIndex = initialPlayerId
    ? Math.max(0, playersList.findIndex((p) => p.id === initialPlayerId))
    : 0;

  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [revealLevel, setRevealLevel] = useState<'eyes' | 'face' | 'full'>('eyes');
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [isAnswered, setIsAnswered] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [timeLeft, setTimeLeft] = useState(25);
  const [isGameOver, setIsGameOver] = useState(false);

  const [hintsUsed, setHintsUsed] = useState<{
    flag: boolean;
    clubs: boolean;
    trivia: boolean;
  }>({
    flag: false,
    clubs: false,
    trivia: false,
  });

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const currentPlayer: FootballPlayer = playersList[currentIndex] || playersList[0];

  useEffect(() => {
    setTimeLeft(25);
    setRevealLevel('eyes');
    setSelectedOption(null);
    setIsAnswered(false);
    setIsCorrect(false);
    setHintsUsed({ flag: false, clubs: false, trivia: false });

    sound.playWhistle(true);

    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current!);
          handleTimeOut();
          return 0;
        }
        const nextTime = prev - 1;
        sound.playAcceleratingTick(nextTime, 25);
        return nextTime;
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [currentIndex]);

  const handleTimeOut = () => {
    setIsAnswered(true);
    setIsCorrect(false);
    setRevealLevel('full');
    setStreak(0);
    sound.playWrong();
  };

  const handleSelectOption = (option: string) => {
    if (isAnswered) return;
    if (timerRef.current) clearInterval(timerRef.current);

    setSelectedOption(option);
    setIsAnswered(true);

    const correct = option === currentPlayer.name;
    setIsCorrect(correct);

    if (correct) {
      let points = 100;
      if (revealLevel === 'face') points = 70;
      if (revealLevel === 'full') points = 40;

      if (hintsUsed.flag) points -= 10;
      if (hintsUsed.clubs) points -= 15;
      if (hintsUsed.trivia) points -= 15;

      const speedBonus = Math.floor(timeLeft * 1.5);
      const totalGained = Math.max(25, points + speedBonus);

      setScore((s) => s + totalGained);
      setStreak((s) => s + 1);

      sound.playCorrect();
      setTimeout(() => sound.playStadiumRoar(), 200);

      confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#cbfb63', '#38bdf8', '#f59e0b', '#ffffff'],
      });
    } else {
      setStreak(0);
      sound.playWrong();
    }

    setRevealLevel('full');
  };

  const handleRevealMore = () => {
    if (revealLevel === 'eyes') {
      setRevealLevel('face');
    } else if (revealLevel === 'face') {
      setRevealLevel('full');
    }
  };

  const handleNext = () => {
    sound.playClick();
    if (currentIndex + 1 < playersList.length) {
      setCurrentIndex((prev) => prev + 1);
    } else {
      setIsGameOver(true);
      sound.playFanfare();
      confetti({
        particleCount: 150,
        spread: 100,
        origin: { y: 0.5 },
      });
    }
  };

  const handleRestart = () => {
    sound.playWhistle();
    setCurrentIndex(0);
    setScore(0);
    setStreak(0);
    setIsGameOver(false);
  };

  const useClue = (type: 'flag' | 'clubs' | 'trivia') => {
    if (hintsUsed[type] || isAnswered) return;
    sound.playClick();
    setHintsUsed((prev) => ({ ...prev, [type]: true }));
  };

  const getRankTitle = (finalScore: number) => {
    if (finalScore >= 1200) return '🏆 أسطورة كرة القدم العالمية (عين الصقر)';
    if (finalScore >= 800) return '⭐ محلل كروي محترف لا تفوتك لمحة';
    if (finalScore >= 500) return '⚽ مشجع كروي مخضرم وذكي';
    return '🌱 هاوٍ كروي - حان وقت مراجعة المباريات!';
  };

  return (
    <div className="relative z-10 w-full max-w-4xl mx-auto px-4 py-3 flex flex-col items-center">
      <div className="w-full flex items-center justify-between mb-4 bg-black/60 backdrop-blur-md border border-lime-400/20 px-4 py-2.5 rounded-2xl shadow-lg">
        <button
          onClick={onBackToHome}
          className="text-xs sm:text-sm text-gray-300 hover:text-lime-400 font-bold transition flex items-center gap-1 cursor-pointer"
        >
          <ArrowRight className="w-4 h-4" />
          <span>القائمة</span>
        </button>

        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-lime-400 animate-ping" />
          <h2 className="text-sm sm:text-base font-black text-lime-400 tracking-wide">
            تحدي عيون اللاعبين الحقيقية
          </h2>
          <span className="text-xs bg-lime-950/80 text-lime-300 font-mono px-2 py-0.5 rounded border border-lime-500/30">
            {currentIndex + 1} / {playersList.length}
          </span>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={onToggleSound}
            className="p-1.5 rounded-lg bg-neutral-900 border border-white/10 text-gray-300 hover:text-lime-400 cursor-pointer transition"
            title="كتم / تشغيل الصوت"
          >
            {soundMuted ? <VolumeX className="w-4 h-4 text-red-400" /> : <Volume2 className="w-4 h-4 text-lime-400" />}
          </button>

          <div className="flex items-center gap-1 bg-neutral-900/90 border border-amber-400/30 px-3 py-1 rounded-xl">
            <Trophy className="w-4 h-4 text-amber-400" />
            <span className="text-xs sm:text-sm font-black text-amber-300 font-mono">
              {score} نقطة
            </span>
          </div>

          {streak > 1 && (
            <div className="hidden sm:flex items-center gap-1 bg-red-950/80 border border-red-500/40 text-red-300 text-xs px-2.5 py-1 rounded-xl font-bold animate-pulse">
              <Flame className="w-3.5 h-3.5 text-red-500" />
              <span>{streak}x ستريك!</span>
            </div>
          )}
        </div>
      </div>

      <div className="w-full max-w-lg mb-3 bg-neutral-900/80 border border-white/10 rounded-2xl p-3 flex flex-col gap-2 shadow-lg backdrop-blur-md">
        <div className="flex items-center justify-between">
          <CountdownTimer timeLeft={timeLeft} totalTime={25} size="md" showLabel={true} />
          
          <div className="text-right">
            <span className="text-[10px] text-gray-400 block">نقاط السؤال:</span>
            <span className="text-xs font-mono font-black text-amber-300">
              +{revealLevel === 'eyes' ? 100 : revealLevel === 'face' ? 70 : 40} + بونص سرعة
            </span>
          </div>
        </div>

        <div className="w-full h-1.5 bg-neutral-950 rounded-full overflow-hidden border border-white/5">
          <div
            className={`h-full transition-all duration-1000 ease-linear rounded-full ${
              timeLeft <= 5
                ? 'bg-gradient-to-r from-red-600 to-amber-500 animate-pulse'
                : timeLeft <= 10
                ? 'bg-gradient-to-r from-amber-500 to-yellow-400'
                : 'bg-gradient-to-r from-lime-500 via-emerald-400 to-cyan-400'
            }`}
            style={{ width: `${(timeLeft / 25) * 100}%` }}
          />
        </div>
      </div>

      {!isGameOver ? (
        <>
          <PlayerEyeViewer
            player={currentPlayer}
            revealLevel={revealLevel}
            onRevealMore={handleRevealMore}
            canRevealMore={revealLevel !== 'full' && !isAnswered}
          />

          <div className="w-full max-w-lg mt-3 bg-neutral-900/80 border border-white/10 rounded-2xl p-3 backdrop-blur-sm">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5 text-xs font-bold text-gray-300">
                <HelpCircle className="w-3.5 h-3.5 text-cyan-400" />
                <span>وسائل المساعدة الذكية:</span>
              </div>
              <span className="text-[10px] text-gray-400">تخصم نقاط بسيطة من الإجابة</span>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={() => useClue('flag')}
                disabled={hintsUsed.flag || isAnswered}
                className={`flex flex-col items-center justify-center py-2 px-1 rounded-xl border text-xs font-semibold transition cursor-pointer ${
                  hintsUsed.flag
                    ? 'bg-neutral-800 border-lime-500/40 text-lime-300'
                    : 'bg-black/40 border-white/10 hover:border-cyan-400/50 text-gray-300 active:scale-95'
                }`}
              >
                <div className="flex items-center gap-1 mb-0.5">
                  <Flag className="w-3.5 h-3.5 text-cyan-400" />
                  <span>المنتخب</span>
                </div>
                <span className="text-[11px] font-bold">
                  {hintsUsed.flag ? `${currentPlayer.flag} ${currentPlayer.nationality}` : 'كشف الدولة'}
                </span>
              </button>

              <button
                onClick={() => useClue('clubs')}
                disabled={hintsUsed.clubs || isAnswered}
                className={`flex flex-col items-center justify-center py-2 px-1 rounded-xl border text-xs font-semibold transition cursor-pointer ${
                  hintsUsed.clubs
                    ? 'bg-neutral-800 border-lime-500/40 text-lime-300'
                    : 'bg-black/40 border-white/10 hover:border-cyan-400/50 text-gray-300 active:scale-95'
                }`}
              >
                <div className="flex items-center gap-1 mb-0.5">
                  <Shield className="w-3.5 h-3.5 text-amber-400" />
                  <span>الأندية</span>
                </div>
                <span className="text-[10px] font-bold text-center line-clamp-1">
                  {hintsUsed.clubs ? currentPlayer.currentClub : 'نادي اللاعب'}
                </span>
              </button>

              <button
                onClick={() => useClue('trivia')}
                disabled={hintsUsed.trivia || isAnswered}
                className={`flex flex-col items-center justify-center py-2 px-1 rounded-xl border text-xs font-semibold transition cursor-pointer ${
                  hintsUsed.trivia
                    ? 'bg-neutral-800 border-lime-500/40 text-lime-300'
                    : 'bg-black/40 border-white/10 hover:border-cyan-400/50 text-gray-300 active:scale-95'
                }`}
              >
                <div className="flex items-center gap-1 mb-0.5">
                  <Lightbulb className="w-3.5 h-3.5 text-yellow-400" />
                  <span>إنجاز سري</span>
                </div>
                <span className="text-[10px] font-bold">
                  {hintsUsed.trivia ? 'تم الفتح!' : 'معلومة ذهبية'}
                </span>
              </button>
            </div>

            {(hintsUsed.clubs || hintsUsed.trivia) && (
              <div className="mt-2.5 pt-2 border-t border-white/10 text-xs text-gray-200 space-y-1">
                {hintsUsed.clubs && (
                  <p className="text-[11px] text-cyan-300">
                    <span className="font-bold">الأندية البارزة: </span>
                    {currentPlayer.historicClubs.slice(0, 3).join('، ')}
                  </p>
                )}
                {hintsUsed.trivia && (
                  <p className="text-[11px] text-amber-300">
                    <span className="font-bold">المعلومة: </span>
                    {currentPlayer.triviaHint}
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="w-full max-w-lg mt-3 grid grid-cols-2 gap-2.5">
            {currentPlayer.options.map((option, idx) => {
              const isSelected = selectedOption === option;
              const isOptionCorrect = option === currentPlayer.name;

              let btnStyle =
                'bg-neutral-900/90 border-neutral-700/80 text-white hover:border-lime-400 hover:bg-neutral-800';

              if (isAnswered) {
                if (isOptionCorrect) {
                  btnStyle =
                    'bg-emerald-950 border-emerald-400 text-emerald-200 shadow-[0_0_20px_rgba(52,211,153,0.4)]';
                } else if (isSelected && !isOptionCorrect) {
                  btnStyle =
                    'bg-red-950 border-red-500 text-red-200 shadow-[0_0_15px_rgba(239,68,68,0.4)]';
                } else {
                  btnStyle = 'opacity-40 bg-neutral-950 border-neutral-800 text-gray-400';
                }
              }

              return (
                <button
                  key={idx}
                  onClick={() => handleSelectOption(option)}
                  disabled={isAnswered}
                  className={`relative p-3.5 rounded-2xl border-2 font-bold text-sm sm:text-base transition-all duration-200 text-center flex items-center justify-center gap-2 cursor-pointer active:scale-95 shadow-md ${btnStyle}`}
                >
                  <span className="w-6 h-6 rounded-full bg-black/40 border border-white/10 flex items-center justify-center text-xs text-lime-400 font-mono">
                    {idx === 0 ? 'A' : idx === 1 ? 'B' : idx === 2 ? 'C' : 'D'}
                  </span>
                  <span className="truncate">{option}</span>

                  {isAnswered && isOptionCorrect && (
                    <CheckCircle2 className="w-5 h-5 text-emerald-400 animate-bounce" />
                  )}
                  {isAnswered && isSelected && !isOptionCorrect && (
                    <XCircle className="w-5 h-5 text-red-400" />
                  )}
                </button>
              );
            })}
          </div>

          {isAnswered && (
            <div
              className={`w-full max-w-lg mt-4 p-4 rounded-2xl border flex flex-col items-center text-center animate-slideUp ${
                isCorrect
                  ? 'bg-emerald-950/70 border-emerald-500/50 shadow-[0_0_25px_rgba(16,185,129,0.3)]'
                  : 'bg-red-950/70 border-red-500/50 shadow-[0_0_25px_rgba(239,68,68,0.3)]'
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                {isCorrect ? (
                  <>
                    <CheckCircle2 className="w-6 h-6 text-emerald-400" />
                    <span className="text-lg font-black text-emerald-300">
                      إجابة صحيحة خارقة! 🎯
                    </span>
                  </>
                ) : (
                  <>
                    <XCircle className="w-6 h-6 text-red-400" />
                    <span className="text-lg font-black text-red-300">
                      للأسف إجابة خاطئة! اللاعب هو {currentPlayer.name}
                    </span>
                  </>
                )}
              </div>

              <p className="text-xs text-gray-200 mb-3 max-w-md">
                {currentPlayer.distinctEyeFeature}
              </p>

              <div className="flex items-center gap-3 w-full justify-center">
                <button
                  onClick={handleNext}
                  className="flex-1 py-3 px-6 rounded-xl bg-lime-400 hover:bg-lime-300 text-black font-black text-sm sm:text-base flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(203,251,99,0.4)] transition cursor-pointer active:scale-95"
                >
                  <span>{currentIndex + 1 < playersList.length ? 'اللاعب التالي ⚡' : 'عرض النتيجة النهائية 🏆'}</span>
                  <ArrowRight className="w-4 h-4 rotate-180" />
                </button>

                <button
                  onClick={() => onOpenShare(score, currentPlayer.name)}
                  className="py-3 px-4 rounded-xl bg-neutral-900 hover:bg-neutral-800 border border-lime-400/40 text-lime-300 font-bold text-xs flex items-center gap-1.5 transition cursor-pointer active:scale-95"
                  title="مشاركة هذا التحدي بالرابط"
                >
                  <Share2 className="w-4 h-4" />
                  <span className="hidden sm:inline">شارك الرابط</span>
                </button>
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="w-full max-w-lg mt-6 p-6 rounded-3xl bg-neutral-900/90 border-2 border-yellow-400/60 shadow-[0_0_40px_rgba(250,204,21,0.3)] backdrop-blur-md flex flex-col items-center text-center animate-scaleUp">
          <div className="w-20 h-20 rounded-full bg-gradient-to-tr from-amber-500 to-yellow-300 flex items-center justify-center text-black mb-4 shadow-[0_0_30px_rgba(245,158,11,0.5)]">
            <Trophy className="w-10 h-10" />
          </div>

          <h3 className="text-2xl sm:text-3xl font-black text-yellow-300 mb-1">
            صافرة النهاية! مبروك يا بطل
          </h3>
          <p className="text-sm font-bold text-lime-400 mb-4">{getRankTitle(score)}</p>

          <div className="w-full bg-black/60 rounded-2xl p-4 border border-white/10 mb-5 flex items-center justify-around">
            <div className="flex flex-col items-center">
              <span className="text-xs text-gray-400">النقاط الكلية</span>
              <span className="text-2xl font-black text-amber-400 font-mono">{score}</span>
            </div>
            <div className="h-8 w-px bg-white/10" />
            <div className="flex flex-col items-center">
              <span className="text-xs text-gray-400">اللاعبين المجتازين</span>
              <span className="text-2xl font-black text-lime-400 font-mono">
                {playersList.length} / {playersList.length}
              </span>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 w-full">
            <button
              onClick={handleRestart}
              className="flex-1 py-3 px-5 rounded-xl bg-lime-400 hover:bg-lime-300 text-black font-black text-sm flex items-center justify-center gap-2 cursor-pointer shadow-lg active:scale-95 transition"
            >
              <RotateCcw className="w-4 h-4" />
              <span>إعادة التحدي من جديد</span>
            </button>

            <button
              onClick={() => onOpenShare(score, getRankTitle(score))}
              className="flex-1 py-3 px-5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black font-black text-sm flex items-center justify-center gap-2 cursor-pointer shadow-lg active:scale-95 transition"
            >
              <Share2 className="w-4 h-4" />
              <span>مشاركة الرابط مع الأصدقاء</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
