import React, { useState, useEffect } from 'react';
import { FootballPlayer } from '../data/playersData';
import { getAllPlayers } from '../services/storage';
import { PlayerEyeViewer } from './PlayerEyeViewer';
import { sound } from '../services/soundEffects';
import confetti from 'canvas-confetti';
import {
  ArrowRight,
  RotateCcw,
  Zap,
  Volume2,
  VolumeX,
} from 'lucide-react';

interface TwoPlayerBattleProps {
  onBackToHome: () => void;
  soundMuted: boolean;
  onToggleSound: () => void;
}

export const TwoPlayerBattle: React.FC<TwoPlayerBattleProps> = ({
  onBackToHome,
  soundMuted,
  onToggleSound,
}) => {
  const [playersList] = useState<FootballPlayer[]>(() => getAllPlayers());
  const [round, setRound] = useState(0);
  const [player1Score, setPlayer1Score] = useState(0);
  const [player2Score, setPlayer2Score] = useState(0);
  const [buzzedPlayer, setBuzzedPlayer] = useState<1 | 2 | null>(null);
  const [revealLevel, setRevealLevel] = useState<'eyes' | 'face' | 'full'>('eyes');
  const [isRoundFinished, setIsRoundFinished] = useState(false);
  const [winnerMessage, setWinnerMessage] = useState<string | null>(null);

  const currentPlayer = playersList[round % playersList.length];

  useEffect(() => {
    setBuzzedPlayer(null);
    setRevealLevel('eyes');
    setIsRoundFinished(false);
    setWinnerMessage(null);
    sound.playWhistle(true);
  }, [round]);

  const handleBuzzer = (playerNum: 1 | 2) => {
    if (buzzedPlayer !== null || isRoundFinished) return;
    sound.playTick(true);
    setBuzzedPlayer(playerNum);
  };

  const handleAnswer = (option: string) => {
    if (!buzzedPlayer || isRoundFinished) return;

    const isCorrect = option === currentPlayer.name;
    setRevealLevel('full');
    setIsRoundFinished(true);

    if (isCorrect) {
      sound.playCorrect();
      setTimeout(() => sound.playStadiumRoar(), 200);

      if (buzzedPlayer === 1) {
        setPlayer1Score((s) => s + 1);
        setWinnerMessage('أحسنت! نقطة لصالح اللاعب 1 (الأزرق) 🔵');
      } else {
        setPlayer2Score((s) => s + 1);
        setWinnerMessage('أحسنت! نقطة لصالح اللاعب 2 (الأحمر) 🔴');
      }

      confetti({
        particleCount: 60,
        spread: 60,
        origin: { y: 0.6 },
      });
    } else {
      sound.playWrong();
      if (buzzedPlayer === 1) {
        setPlayer2Score((s) => s + 1);
        setWinnerMessage('إجابة خاطئة! نقطة مجانية للاعب 2 (الأحمر) 🔴');
      } else {
        setPlayer1Score((s) => s + 1);
        setWinnerMessage('إجابة خاطئة! نقطة مجانية للاعب 1 (الأزرق) 🔵');
      }
    }
  };

  const nextRound = () => {
    sound.playClick();
    setRound((r) => r + 1);
  };

  const resetMatch = () => {
    sound.playWhistle();
    setRound(0);
    setPlayer1Score(0);
    setPlayer2Score(0);
    setBuzzedPlayer(null);
    setRevealLevel('eyes');
    setIsRoundFinished(false);
  };

  return (
    <div className="relative z-10 w-full max-w-4xl mx-auto px-4 py-3 flex flex-col items-center">
      <div className="w-full flex items-center justify-between mb-3 bg-black/60 border border-white/10 px-4 py-2.5 rounded-2xl">
        <button
          onClick={onBackToHome}
          className="text-xs sm:text-sm text-gray-300 hover:text-lime-400 font-bold transition flex items-center gap-1 cursor-pointer"
        >
          <ArrowRight className="w-4 h-4" />
          <span>القائمة</span>
        </button>

        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-amber-400 animate-pulse" />
          <h2 className="text-sm sm:text-base font-black text-amber-300">
            تحدي السرعة والبازر (لاعبين 1 ضد 1)
          </h2>
        </div>

        <button
          onClick={onToggleSound}
          className="p-1.5 rounded-lg bg-neutral-900 border border-white/10 text-gray-300 hover:text-lime-400 cursor-pointer"
        >
          {soundMuted ? <VolumeX className="w-4 h-4 text-red-400" /> : <Volume2 className="w-4 h-4 text-lime-400" />}
        </button>
      </div>

      <div className="w-full max-w-lg grid grid-cols-2 gap-3 mb-4">
        <div
          className={`p-3 rounded-2xl border-2 transition-all flex items-center justify-between ${
            buzzedPlayer === 1
              ? 'bg-blue-950 border-blue-400 shadow-[0_0_25px_rgba(59,130,246,0.6)]'
              : 'bg-neutral-900/90 border-blue-600/30'
          }`}
        >
          <div className="flex items-center gap-2">
            <span className="w-3.5 h-3.5 rounded-full bg-blue-500" />
            <span className="text-xs font-bold text-blue-300">اللاعب 1</span>
          </div>
          <span className="text-xl font-black text-blue-400 font-mono">{player1Score}</span>
        </div>

        <div
          className={`p-3 rounded-2xl border-2 transition-all flex items-center justify-between ${
            buzzedPlayer === 2
              ? 'bg-red-950 border-red-400 shadow-[0_0_25px_rgba(239,68,68,0.6)]'
              : 'bg-neutral-900/90 border-red-600/30'
          }`}
        >
          <div className="flex items-center gap-2">
            <span className="w-3.5 h-3.5 rounded-full bg-red-500" />
            <span className="text-xs font-bold text-red-300">اللاعب 2</span>
          </div>
          <span className="text-xl font-black text-red-400 font-mono">{player2Score}</span>
        </div>
      </div>

      <PlayerEyeViewer
        player={currentPlayer}
        revealLevel={revealLevel}
        onRevealMore={() => setRevealLevel(revealLevel === 'eyes' ? 'face' : 'full')}
        canRevealMore={revealLevel !== 'full' && !isRoundFinished}
      />

      {!buzzedPlayer && !isRoundFinished && (
        <div className="w-full max-w-lg mt-4 grid grid-cols-2 gap-4">
          <button
            onClick={() => handleBuzzer(1)}
            className="py-6 px-4 rounded-3xl bg-gradient-to-b from-blue-500 to-blue-700 hover:from-blue-400 hover:to-blue-600 border-4 border-blue-300 text-white font-black text-lg sm:text-xl shadow-[0_0_30px_rgba(37,99,235,0.5)] active:scale-95 transition cursor-pointer flex flex-col items-center justify-center gap-1"
          >
            <Zap className="w-8 h-8" />
            <span>بازر اللاعب 1</span>
            <span className="text-[10px] text-blue-100 font-normal">اضغط أولاً للإجابة!</span>
          </button>

          <button
            onClick={() => handleBuzzer(2)}
            className="py-6 px-4 rounded-3xl bg-gradient-to-b from-red-500 to-red-700 hover:from-red-400 hover:to-red-600 border-4 border-red-300 text-white font-black text-lg sm:text-xl shadow-[0_0_30px_rgba(220,38,38,0.5)] active:scale-95 transition cursor-pointer flex flex-col items-center justify-center gap-1"
          >
            <Zap className="w-8 h-8" />
            <span>بازر اللاعب 2</span>
            <span className="text-[10px] text-red-100 font-normal">اضغط أولاً للإجابة!</span>
          </button>
        </div>
      )}

      {buzzedPlayer && !isRoundFinished && (
        <div className="w-full max-w-lg mt-3 flex flex-col items-center">
          <div
            className={`px-4 py-1.5 rounded-full text-xs font-bold mb-3 animate-pulse ${
              buzzedPlayer === 1
                ? 'bg-blue-500 text-white shadow-lg'
                : 'bg-red-500 text-white shadow-lg'
            }`}
          >
            الدور الآن على اللاعب {buzzedPlayer} لاختيار الإجابة الصحيحة!
          </div>

          <div className="w-full grid grid-cols-2 gap-2.5">
            {currentPlayer.options.map((option, idx) => (
              <button
                key={idx}
                onClick={() => handleAnswer(option)}
                className="p-3.5 rounded-2xl bg-neutral-900 border-2 border-white/20 hover:border-lime-400 text-white font-bold text-sm text-center transition cursor-pointer active:scale-95"
              >
                {option}
              </button>
            ))}
          </div>
        </div>
      )}

      {isRoundFinished && (
        <div className="w-full max-w-lg mt-4 p-4 rounded-2xl bg-neutral-900/90 border border-white/20 flex flex-col items-center text-center animate-fadeIn">
          <p className="text-base font-black text-lime-400 mb-2">{winnerMessage}</p>
          <p className="text-xs text-gray-300 mb-3">اللاعب هو: {currentPlayer.name}</p>

          <div className="flex gap-2 w-full">
            <button
              onClick={nextRound}
              className="flex-1 py-3 px-4 rounded-xl bg-lime-400 hover:bg-lime-300 text-black font-black text-sm flex items-center justify-center gap-1.5 cursor-pointer shadow-lg active:scale-95 transition"
            >
              <span>الجولة التالية ⚡</span>
              <ArrowRight className="w-4 h-4 rotate-180" />
            </button>
            <button
              onClick={resetMatch}
              className="py-3 px-4 rounded-xl bg-neutral-800 text-gray-300 hover:text-white font-bold text-xs flex items-center gap-1 cursor-pointer transition"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>إعادة المباراة</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
