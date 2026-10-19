import React from 'react';
import { Clock, Flame, AlertTriangle } from 'lucide-react';

interface CountdownTimerProps {
  timeLeft: number;
  totalTime: number;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
}

export const CountdownTimer: React.FC<CountdownTimerProps> = ({
  timeLeft,
  totalTime,
  size = 'md',
  showLabel = true,
}) => {
  const percentage = Math.max(0, Math.min(100, (timeLeft / totalTime) * 100));
  const isUrgent = timeLeft <= 5;
  const isWarning = timeLeft <= 10 && timeLeft > 5;

  const radius = size === 'lg' ? 42 : size === 'md' ? 32 : 24;
  const strokeWidth = size === 'lg' ? 6 : size === 'md' ? 5 : 4;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;
  const dimension = (radius + strokeWidth) * 2 + 8;

  let strokeColor = '#cbfb63';
  let glowColor = 'rgba(203, 251, 99, 0.4)';
  let textColor = 'text-lime-400';

  if (isUrgent) {
    strokeColor = '#ef4444';
    glowColor = 'rgba(239, 68, 68, 0.6)';
    textColor = 'text-red-400';
  } else if (isWarning) {
    strokeColor = '#f59e0b';
    glowColor = 'rgba(245, 158, 11, 0.5)';
    textColor = 'text-amber-400';
  }

  return (
    <div className="flex items-center gap-3">
      <div
        className="relative flex items-center justify-center select-none"
        style={{ width: dimension, height: dimension }}
      >
        {isUrgent && (
          <div
            className="absolute inset-0 rounded-full animate-ping opacity-30"
            style={{ backgroundColor: strokeColor }}
          />
        )}

        <svg width={dimension} height={dimension} className="transform -rotate-90">
          <circle
            cx={dimension / 2}
            cy={dimension / 2}
            r={radius}
            stroke="rgba(255, 255, 255, 0.1)"
            strokeWidth={strokeWidth}
            fill="transparent"
          />
          <circle
            cx={dimension / 2}
            cy={dimension / 2}
            r={radius}
            stroke={strokeColor}
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            fill="transparent"
            className="transition-all duration-1000 ease-linear"
            style={{
              filter: `drop-shadow(0 0 8px ${glowColor})`,
            }}
          />
        </svg>

        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span
            className={`font-mono font-black tracking-tighter ${textColor} ${
              size === 'lg' ? 'text-2xl' : size === 'md' ? 'text-lg' : 'text-sm'
            } ${isUrgent ? 'animate-pulse scale-110' : ''}`}
          >
            {timeLeft}
          </span>
          <span className="text-[8px] text-gray-400 uppercase font-bold tracking-widest leading-none">
            ثانية
          </span>
        </div>
      </div>

      {showLabel && (
        <div className="flex flex-col">
          <div className="flex items-center gap-1.5">
            {isUrgent ? (
              <Flame className="w-4 h-4 text-red-500 animate-bounce" />
            ) : isWarning ? (
              <AlertTriangle className="w-4 h-4 text-amber-400 animate-pulse" />
            ) : (
              <Clock className="w-4 h-4 text-lime-400" />
            )}
            <span
              className={`text-xs font-black tracking-wide ${
                isUrgent ? 'text-red-400 animate-pulse' : isWarning ? 'text-amber-300' : 'text-gray-300'
              }`}
            >
              {isUrgent ? 'الوقت ينفد بسرعة! ⚡' : isWarning ? 'انتبه للوقت!' : 'العداد التنازلي:'}
            </span>
          </div>

          <span className="text-[10px] text-gray-400 font-semibold mt-0.5">
            {isUrgent ? 'سرعة الإجابة تمنحك نقاطاً إضافية' : 'إجابة أسرع = نقاط أعلى'}
          </span>
        </div>
      )}
    </div>
  );
};
