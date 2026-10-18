import React, { useState } from 'react';
import { sound } from '../services/soundEffects';
import {
  Volume2,
  VolumeX,
  Sun,
} from 'lucide-react';

interface EffectsControlBarProps {
  soundMuted: boolean;
  onToggleSound: () => void;
  lightingMode: 'normal' | 'dramatic' | 'celebration';
  onChangeLighting: (mode: 'normal' | 'dramatic' | 'celebration') => void;
}

export const EffectsControlBar: React.FC<EffectsControlBarProps> = ({
  soundMuted,
  onToggleSound,
  lightingMode,
  onChangeLighting,
}) => {
  const [showSoundTest, setShowSoundTest] = useState(false);

  return (
    <div className="relative z-20 w-full max-w-4xl mx-auto px-4 pt-2 pb-1 flex flex-wrap items-center justify-between gap-2 text-xs">
      <div className="flex items-center gap-2">
        <button
          onClick={onToggleSound}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border transition cursor-pointer font-bold ${
            soundMuted
              ? 'bg-red-950/70 border-red-500/40 text-red-300'
              : 'bg-lime-950/70 border-lime-500/40 text-lime-300 shadow-[0_0_10px_rgba(203,251,99,0.2)]'
          }`}
          title="كتم أو تشغيل المؤثرات الصوتية"
        >
          {soundMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5 animate-pulse" />}
          <span>{soundMuted ? 'الصوت: مكتوم' : 'المؤثرات الصوتية: نشطة 🔊'}</span>
        </button>

        <button
          onClick={() => setShowSoundTest(!showSoundTest)}
          className="px-2.5 py-1.5 rounded-full bg-neutral-900 border border-white/10 text-gray-300 hover:text-white transition cursor-pointer font-semibold"
        >
          <span>تجربة الأصوات 🎵</span>
        </button>
      </div>

      <div className="flex items-center gap-1.5 bg-neutral-900/80 border border-white/10 px-2 py-1 rounded-full">
        <span className="text-[11px] text-gray-400 flex items-center gap-1 pl-1">
          <Sun className="w-3 h-3 text-amber-400" />
          <span>إضاءة الملعب:</span>
        </span>

        <button
          onClick={() => onChangeLighting('normal')}
          className={`px-2 py-0.5 rounded-full text-[11px] font-bold transition cursor-pointer ${
            lightingMode === 'normal'
              ? 'bg-lime-400 text-black shadow-sm'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          كشافات عادية
        </button>

        <button
          onClick={() => onChangeLighting('dramatic')}
          className={`px-2 py-0.5 rounded-full text-[11px] font-bold transition cursor-pointer ${
            lightingMode === 'dramatic'
              ? 'bg-amber-400 text-black shadow-sm'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          سينمائي حماسي ⚡
        </button>
      </div>

      {showSoundTest && (
        <div className="w-full mt-1 p-2 bg-neutral-950/95 border border-lime-400/30 rounded-2xl flex flex-wrap items-center gap-2 animate-fadeIn shadow-xl">
          <span className="text-[11px] text-lime-400 font-bold px-1">اختبر صوت:</span>
          <button
            onClick={() => sound.playWhistle(false)}
            className="px-2.5 py-1 rounded-lg bg-neutral-900 hover:bg-neutral-800 border border-white/10 text-gray-200 cursor-pointer text-[11px] active:scale-95"
          >
            🏁 صافرة الحكم
          </button>
          <button
            onClick={() => sound.playStadiumRoar()}
            className="px-2.5 py-1 rounded-lg bg-neutral-900 hover:bg-neutral-800 border border-white/10 text-gray-200 cursor-pointer text-[11px] active:scale-95"
          >
            🏟️ هتاف وصيحة الجماهير
          </button>
          <button
            onClick={() => sound.playCorrect()}
            className="px-2.5 py-1 rounded-lg bg-neutral-900 hover:bg-neutral-800 border border-white/10 text-gray-200 cursor-pointer text-[11px] active:scale-95"
          >
            ✨ نغمة إجابة صحيحة
          </button>
          <button
            onClick={() => sound.playWrong()}
            className="px-2.5 py-1 rounded-lg bg-neutral-900 hover:bg-neutral-800 border border-white/10 text-gray-200 cursor-pointer text-[11px] active:scale-95"
          >
            🚨 بازر الخطأ
          </button>
          <button
            onClick={() => sound.playFanfare()}
            className="px-2.5 py-1 rounded-lg bg-neutral-900 hover:bg-neutral-800 border border-white/10 text-gray-200 cursor-pointer text-[11px] active:scale-95"
          >
            🏆 موسيقى التتويج
          </button>
        </div>
      )}
    </div>
  );
};
