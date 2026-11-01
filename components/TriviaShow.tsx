import React, { useState, useEffect, useRef } from 'react';
import { TriviaQuestion } from '../data/playersData';
import { getAllTrivia, deleteTrivia, saveCustomTrivia, subscribeToDataChanges } from '../services/storage';
import { sound } from '../services/soundEffects';
import { CountdownTimer } from './CountdownTimer';
import confetti from 'canvas-confetti';
import {
  HelpCircle,
  Trophy,
  CheckCircle2,
  XCircle,
  ArrowRight,
  RotateCcw,
  Sparkles,
  Trash2,
  Plus,
  X,
} from 'lucide-react';

interface TriviaShowProps {
  onBackToHome: () => void;
  onOpenShare: (score?: number) => void;
}

export const TriviaShow: React.FC<TriviaShowProps> = ({ onBackToHome, onOpenShare }) => {
  const [triviaList, setTriviaList] = useState<TriviaQuestion[]>(() => getAllTrivia());
  const [currentIdx, setCurrentIdx] = useState(0);
  const [score, setScore] = useState(0);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [isAnswered, setIsAnswered] = useState(false);
  const [timeLeft, setTimeLeft] = useState(20);
  const [isCompleted, setIsCompleted] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [notification, setNotification] = useState<string | null>(null);

  const [newQText, setNewQText] = useState('');
  const [newQCat, setNewQCat] = useState<'كأس العالم' | 'دوري الأبطال' | 'أرقام قياسية' | 'أساطير' | 'انتقالات وتاريخ'>('كأس العالم');
  const [newQOpt1, setNewQOpt1] = useState('');
  const [newQOpt2, setNewQOpt2] = useState('');
  const [newQOpt3, setNewQOpt3] = useState('');
  const [newQOpt4, setNewQOpt4] = useState('');
  const [newQExpl, setNewQExpl] = useState('');

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const currentQ: TriviaQuestion | undefined = triviaList[currentIdx];

  const flashNote = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 4000);
  };

  // Instant Owner Question Sync - Updates immediately when owner adds a question
  useEffect(() => {
    const unsubscribe = subscribeToDataChanges(() => {
      const updated = getAllTrivia();
      setTriviaList(updated);
    });

    const handleQuestionAdded = (e: any) => {
      const q = e.detail;
      const title = q?.question ? (q.question.length > 30 ? q.question.substring(0, 30) + '...' : q.question) : '';
      flashNote(`⚽ تمت إضافة سؤال جديد للتو من المالك: "${title}"! نُشر فوراً.`);
    };

    window.addEventListener('b11_question_added', handleQuestionAdded);

    return () => {
      unsubscribe();
      window.removeEventListener('b11_question_added', handleQuestionAdded);
    };
  }, []);

  useEffect(() => {
    setTimeLeft(20);
    setSelectedOption(null);
    setIsAnswered(false);
    sound.playWhistle(true);

    if (timerRef.current) clearInterval(timerRef.current);
    if (!currentQ) return;

    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current!);
          setIsAnswered(true);
          sound.playWrong();
          return 0;
        }
        const nextTime = prev - 1;
        sound.playAcceleratingTick(nextTime, 20);
        return nextTime;
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [currentIdx, triviaList.length]);

  const handleSelect = (opt: string) => {
    if (isAnswered || !currentQ) return;
    if (timerRef.current) clearInterval(timerRef.current);

    setSelectedOption(opt);
    setIsAnswered(true);

    const isCorrect = opt === currentQ.correctAnswer;
    if (isCorrect) {
      const points = 100 + timeLeft * 2;
      setScore((s) => s + points);
      sound.playCorrect();
      setTimeout(() => sound.playStadiumRoar(), 200);

      confetti({
        particleCount: 70,
        spread: 60,
        origin: { y: 0.6 },
      });
    } else {
      sound.playWrong();
    }
  };

  const handleNext = () => {
    sound.playClick();
    if (currentIdx + 1 < triviaList.length) {
      setCurrentIdx((prev) => prev + 1);
    } else {
      setIsCompleted(true);
      sound.playFanfare();
      confetti({ particleCount: 120, spread: 90 });
    }
  };

  const handleDeleteCurrentQuestion = () => {
    if (!currentQ) return;
    const removedId = currentQ.id;
    const updated = deleteTrivia(removedId);
    setTriviaList(updated);
    sound.playWrong();
    flashNote('تم مسح هذا السؤال بنجاح من اللعبة 🗑️');

    if (currentIdx >= updated.length) {
      if (updated.length > 0) {
        setCurrentIdx(0);
      } else {
        setIsCompleted(true);
      }
    }
  };

  const handleQuickAddQuestion = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newQText.trim() || !newQOpt1.trim()) return;

    const newQuestion: TriviaQuestion = {
      id: 'quick-q-' + Date.now(),
      question: newQText.trim(),
      category: newQCat,
      options: [newQOpt1.trim(), newQOpt2.trim(), newQOpt3.trim(), newQOpt4.trim()].filter(Boolean),
      correctAnswer: newQOpt1.trim(),
      explanation: newQExpl.trim() || 'معلومة كروية موثقة.',
      difficulty: 'متوسط',
    };

    const updated = saveCustomTrivia(newQuestion);
    setTriviaList(updated);
    sound.playCorrect();
    flashNote('تمت إضافة السؤال بنجاح إلى الفوازير! ⚡');
    setShowAddModal(false);

    setNewQText('');
    setNewQOpt1('');
    setNewQOpt2('');
    setNewQOpt3('');
    setNewQOpt4('');
    setNewQExpl('');
  };

  if (!currentQ && !isCompleted) {
    return (
      <div className="relative z-10 w-full max-w-md mx-auto px-4 py-8 text-center bg-neutral-900 border border-white/10 rounded-3xl p-6">
        <h3 className="text-lg font-black text-white mb-2">لا توجد أسئلة حالياً</h3>
        <p className="text-xs text-gray-400 mb-4">تم مسح جميع الأسئلة أو لم تتم إضافة أسئلة بعد.</p>
        <button
          onClick={() => setShowAddModal(true)}
          className="px-4 py-2 rounded-xl bg-cyan-400 text-black font-bold text-xs"
        >
          إضافة أول سؤال الآن ⚡
        </button>
      </div>
    );
  }

  return (
    <div className="relative z-10 w-full max-w-3xl mx-auto px-4 py-4 flex flex-col items-center">
      <div className="w-full flex items-center justify-between mb-4 bg-black/60 border border-white/10 px-4 py-2.5 rounded-2xl shadow-lg">
        <button
          onClick={onBackToHome}
          className="text-xs sm:text-sm text-gray-300 hover:text-lime-400 font-bold transition flex items-center gap-1 cursor-pointer"
        >
          <ArrowRight className="w-4 h-4" />
          <span>القائمة</span>
        </button>

        <div className="flex items-center gap-2">
          <HelpCircle className="w-4 h-4 text-cyan-400" />
          <h2 className="text-sm sm:text-base font-black text-cyan-300">
            فوازير وأسئلة كرة القدم الكبرى
          </h2>
          <span className="text-xs bg-cyan-950 text-cyan-300 px-2 py-0.5 rounded border border-cyan-500/30 font-mono">
            {currentIdx + 1} / {triviaList.length}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              sound.playClick();
              setShowAddModal(true);
            }}
            className="px-2.5 py-1 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-cyan-300 border border-cyan-400/30 text-xs font-bold flex items-center gap-1 cursor-pointer transition active:scale-95"
            title="إضافة سؤال جديد للفوازير"
          >
            <Plus className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">إضافة سؤال</span>
          </button>

          <div className="flex items-center gap-1 bg-neutral-900 border border-amber-400/30 px-3 py-1 rounded-xl">
            <Trophy className="w-4 h-4 text-amber-400" />
            <span className="text-xs sm:text-sm font-black text-amber-300 font-mono">
              {score}
            </span>
          </div>
        </div>
      </div>

      {notification && (
        <div className="w-full max-w-xl mb-3 p-2.5 bg-neutral-900 border border-lime-400 rounded-xl text-center text-xs font-bold text-lime-300 animate-slideUp">
          {notification}
        </div>
      )}

      {!isCompleted && currentQ ? (
        <div className="w-full max-w-xl flex flex-col items-center">
          <div className="flex items-center justify-between w-full mb-3 px-1">
            <div className="flex items-center gap-2">
              <span className="px-3 py-1 rounded-full text-xs font-bold bg-neutral-800 text-lime-300 border border-lime-500/30">
                {currentQ.category}
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-red-950/80 text-red-300 border border-red-500/30">
                مستوى: {currentQ.difficulty}
              </span>
            </div>

            <button
              onClick={handleDeleteCurrentQuestion}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-red-950/50 hover:bg-red-900/80 border border-red-500/30 text-red-300 text-[11px] font-bold cursor-pointer transition active:scale-95"
              title="مسح هذا السؤال من اللعبة فوراً"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>مسح السؤال</span>
            </button>
          </div>

          <div className="w-full bg-gradient-to-br from-neutral-900 to-neutral-950 border-2 border-cyan-500/30 rounded-3xl p-6 mb-4 shadow-[0_0_35px_rgba(6,182,212,0.15)] text-center relative overflow-hidden">
            <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-cyan-500 via-lime-400 to-amber-400" />
            <h3 className="text-lg sm:text-xl font-black text-white leading-relaxed mb-4">
              {currentQ.question}
            </h3>

            <div className="flex justify-center mt-3 pt-3 border-t border-white/10">
              <CountdownTimer timeLeft={timeLeft} totalTime={20} size="md" showLabel={true} />
            </div>
          </div>

          <div className="w-full grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
            {currentQ.options.map((opt, i) => {
              const isSelected = selectedOption === opt;
              const isCorrect = opt === currentQ.correctAnswer;

              let btnClass =
                'bg-neutral-900/90 border-neutral-700/80 text-white hover:border-cyan-400 hover:bg-neutral-800';

              if (isAnswered) {
                if (isCorrect) {
                  btnClass = 'bg-emerald-950 border-emerald-400 text-emerald-200';
                } else if (isSelected && !isCorrect) {
                  btnClass = 'bg-red-950 border-red-500 text-red-200';
                } else {
                  btnClass = 'opacity-40 bg-neutral-950 border-neutral-800 text-gray-400';
                }
              }

              return (
                <button
                  key={i}
                  onClick={() => handleSelect(opt)}
                  disabled={isAnswered}
                  className={`p-4 rounded-2xl border-2 font-bold text-sm text-center flex items-center justify-between transition cursor-pointer active:scale-95 shadow-md ${btnClass}`}
                >
                  <span className="flex-1 text-right">{opt}</span>
                  {isAnswered && isCorrect && <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />}
                  {isAnswered && isSelected && !isCorrect && <XCircle className="w-5 h-5 text-red-400 shrink-0" />}
                </button>
              );
            })}
          </div>

          {isAnswered && (
            <div className="w-full p-4 rounded-2xl bg-black/70 border border-white/10 flex flex-col items-center text-center animate-slideUp">
              <p className="text-xs text-lime-300 mb-3 font-semibold">
                💡 {currentQ.explanation}
              </p>
              <button
                onClick={handleNext}
                className="py-3 px-6 rounded-xl bg-cyan-400 hover:bg-cyan-300 text-black font-black text-sm flex items-center gap-2 transition cursor-pointer active:scale-95 shadow-lg"
              >
                <span>{currentIdx + 1 < triviaList.length ? 'السؤال التالي ⚡' : 'عرض النتيجة 🏆'}</span>
                <ArrowRight className="w-4 h-4 rotate-180" />
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="w-full max-w-md p-6 rounded-3xl bg-neutral-900 border-2 border-cyan-400/50 shadow-2xl flex flex-col items-center text-center">
          <Trophy className="w-16 h-16 text-yellow-400 mb-3" />
          <h3 className="text-2xl font-black text-white mb-2">انتهت الفوازير!</h3>
          <p className="text-sm text-cyan-300 mb-4">لقد حققت: {score} نقطة في التحدي الكروي</p>
          <div className="flex gap-2 w-full">
            <button
              onClick={() => {
                setCurrentIdx(0);
                setScore(0);
                setIsCompleted(false);
              }}
              className="flex-1 py-3 rounded-xl bg-lime-400 text-black font-black text-xs flex items-center justify-center gap-1 cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
              <span>إعادة الفوازير</span>
            </button>
            <button
              onClick={() => onOpenShare(score)}
              className="flex-1 py-3 rounded-xl bg-neutral-800 text-white font-bold text-xs flex items-center justify-center gap-1 cursor-pointer"
            >
              <Sparkles className="w-4 h-4 text-amber-400" />
              <span>مشاركة النتيجة</span>
            </button>
          </div>
        </div>
      )}

      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
          <div className="relative w-full max-w-md bg-neutral-900 border-2 border-cyan-400/40 rounded-3xl p-5 text-white shadow-2xl">
            <button
              type="button"
              onClick={() => setShowAddModal(false)}
              className="absolute top-4 left-4 p-1.5 rounded-full bg-neutral-800 text-gray-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>

            <h3 className="text-base font-black text-cyan-400 text-center mb-1">
              إضافة سؤال كروي جديد للفوازير
            </h3>
            <p className="text-xs text-gray-400 text-center mb-4">
              سيظهر السؤال فوراً في قائمة الأسئلة الحالية.
            </p>

            <form onSubmit={handleQuickAddQuestion} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-gray-300 mb-1">نص السؤال *</label>
                <textarea
                  required
                  rows={2}
                  placeholder="اكتب السؤال هنا..."
                  value={newQText}
                  onChange={(e) => setNewQText(e.target.value)}
                  className="w-full bg-black/60 border border-white/20 rounded-xl px-3 py-2 text-xs text-white focus:border-cyan-400 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-300 mb-1">القسم</label>
                <select
                  value={newQCat}
                  onChange={(e) => setNewQCat(e.target.value as any)}
                  className="w-full bg-black/60 border border-white/20 rounded-xl px-3 py-2 text-xs text-white focus:border-cyan-400 outline-none"
                >
                  <option value="كأس العالم">كأس العالم</option>
                  <option value="دوري الأبطال">دوري الأبطال</option>
                  <option value="أرقام قياسية">أرقام قياسية</option>
                  <option value="أساطير">أساطير</option>
                  <option value="انتقالات وتاريخ">انتقالات وتاريخ</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-gray-300">
                  خيارات الإجابة (الخيار 1 هو الإجابة الصحيحة):
                </label>
                <input
                  type="text"
                  required
                  placeholder="الخيار 1 (الإجابة الصحيحة)"
                  value={newQOpt1}
                  onChange={(e) => setNewQOpt1(e.target.value)}
                  className="w-full bg-black/60 border border-emerald-400/50 rounded-xl px-3 py-1.5 text-xs text-emerald-300 focus:border-emerald-400 outline-none"
                />
                <input
                  type="text"
                  required
                  placeholder="الخيار 2 (خاطئ)"
                  value={newQOpt2}
                  onChange={(e) => setNewQOpt2(e.target.value)}
                  className="w-full bg-black/60 border border-white/20 rounded-xl px-3 py-1.5 text-xs text-white outline-none"
                />
                <input
                  type="text"
                  placeholder="الخيار 3 (خاطئ)"
                  value={newQOpt3}
                  onChange={(e) => setNewQOpt3(e.target.value)}
                  className="w-full bg-black/60 border border-white/20 rounded-xl px-3 py-1.5 text-xs text-white outline-none"
                />
                <input
                  type="text"
                  placeholder="الخيار 4 (خاطئ)"
                  value={newQOpt4}
                  onChange={(e) => setNewQOpt4(e.target.value)}
                  className="w-full bg-black/60 border border-white/20 rounded-xl px-3 py-1.5 text-xs text-white outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-300 mb-1">
                  معلومة توضيحية بعد الإجابة (اختياري)
                </label>
                <input
                  type="text"
                  placeholder="شرح الإجابة..."
                  value={newQExpl}
                  onChange={(e) => setNewQExpl(e.target.value)}
                  className="w-full bg-black/60 border border-white/20 rounded-xl px-3 py-1.5 text-xs text-white outline-none"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-cyan-400 hover:bg-cyan-300 text-black font-black text-xs transition cursor-pointer"
                >
                  حفظ السؤال ونشره ⚡
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2.5 rounded-xl bg-neutral-800 text-gray-300 text-xs font-bold"
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
