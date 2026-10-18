import React, { useState, useRef } from 'react';
import { FootballPlayer } from '../data/playersData';
import { Eye, Sparkles, ZoomIn, Search } from 'lucide-react';
import { sound } from '../services/soundEffects';

interface PlayerEyeViewerProps {
  player: FootballPlayer;
  revealLevel: 'eyes' | 'face' | 'full';
  showInspectionFlashlight?: boolean;
  onRevealMore?: () => void;
  canRevealMore?: boolean;
}

export const PlayerEyeViewer: React.FC<PlayerEyeViewerProps> = ({
  player,
  revealLevel,
  onRevealMore,
  canRevealMore = true,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [lensPos, setLensPos] = useState({ x: 50, y: 50 });
  const [isHovering, setIsHovering] = useState(false);
  const [flashlightActive, setFlashlightActive] = useState(false);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
    const y = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));
    setLensPos({ x, y });
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!containerRef.current || e.touches.length === 0) return;
    const rect = containerRef.current.getBoundingClientRect();
    const touch = e.touches[0];
    const x = Math.max(0, Math.min(100, ((touch.clientX - rect.left) / rect.width) * 100));
    const y = Math.max(0, Math.min(100, ((touch.clientY - rect.top) / rect.height) * 100));
    setLensPos({ x, y });
  };

  const toggleFlashlight = () => {
    sound.playSpotlight();
    setFlashlightActive(!flashlightActive);
  };

  let zoomScale = 1;
  let offsetY = '0%';
  let heightClass = 'h-72 sm:h-84';

  if (revealLevel === 'eyes') {
    zoomScale = player.eyeFocus.zoom;
    heightClass = 'h-52 sm:h-64';
    offsetY = `${(50 - player.eyeFocus.yPercent) * 2}%`;
  } else if (revealLevel === 'face') {
    zoomScale = 1.9;
    heightClass = 'h-64 sm:h-72';
    offsetY = `${(40 - player.eyeFocus.yPercent) * 1.2}%`;
  } else {
    zoomScale = 1.05;
    heightClass = 'h-80 sm:h-96';
    offsetY = '0%';
  }

  return (
    <div className="w-full flex flex-col items-center">
      <div className="flex items-center justify-between w-full max-w-lg mb-2 px-3 text-xs sm:text-sm font-bold text-gray-300">
        <div className="flex items-center gap-1.5 text-lime-400 bg-lime-950/60 border border-lime-500/30 px-3 py-1 rounded-full">
          <Eye className="w-4 h-4 animate-pulse" />
          <span>
            {revealLevel === 'eyes'
              ? 'مرحلة 1: نظرة العينين الحقيقية (أعلى نقاط 100+)'
              : revealLevel === 'face'
              ? 'مرحلة 2: ملامح الوجه والشعر (70 نقطة)'
              : 'مرحلة 3: كشف الهوية الكاملة (40 نقطة)'}
          </span>
        </div>

        {revealLevel !== 'full' && (
          <button
            onClick={toggleFlashlight}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full border transition-all text-xs font-semibold cursor-pointer ${
              flashlightActive
                ? 'bg-amber-400 text-black border-amber-300 shadow-[0_0_15px_rgba(251,191,36,0.5)]'
                : 'bg-black/60 text-amber-300 border-amber-400/40 hover:bg-amber-950/40'
            }`}
            title="شغّل كشاف الإضاءة لتحريك الضوء فوق العينين"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>{flashlightActive ? 'الكشاف شغال 🔦' : 'تشغيل الكشاف 💡'}</span>
          </button>
        )}
      </div>

      <div
        ref={containerRef}
        onMouseMove={handleMouseMove}
        onTouchMove={handleTouchMove}
        onMouseEnter={() => setIsHovering(true)}
        onMouseLeave={() => setIsHovering(false)}
        className={`relative w-full max-w-lg ${heightClass} rounded-2xl overflow-hidden border-2 transition-all duration-500 cursor-crosshair shadow-[0_0_35px_rgba(0,0,0,0.9)] ${
          revealLevel === 'full'
            ? 'border-yellow-400 shadow-[0_0_30px_rgba(250,204,21,0.4)]'
            : revealLevel === 'face'
            ? 'border-cyan-400/80 shadow-[0_0_25px_rgba(34,211,238,0.25)]'
            : 'border-lime-400/80 shadow-[0_0_25px_rgba(163,230,53,0.3)]'
        }`}
      >
        <div className="absolute inset-0 w-full h-full bg-neutral-950 flex items-center justify-center overflow-hidden">
          <img
            src={player.photoUrl}
            alt="لاعب كرة القدم الحقيقي"
            className="w-full h-full object-cover transition-all duration-700 select-none pointer-events-none"
            style={{
              transform: `scale(${zoomScale}) translateY(${offsetY})`,
              transformOrigin: `${player.eyeFocus.xPercent}% ${player.eyeFocus.yPercent}%`,
              filter:
                revealLevel === 'full'
                  ? 'contrast(1.05) saturate(1.1)'
                  : 'contrast(1.15) brightness(0.95)',
            }}
            loading="eager"
          />

          {revealLevel === 'eyes' && (
            <>
              <div className="absolute top-0 inset-x-0 h-[22%] bg-gradient-to-b from-black via-black/90 to-transparent pointer-events-none" />
              <div className="absolute bottom-0 inset-x-0 h-[22%] bg-gradient-to-t from-black via-black/90 to-transparent pointer-events-none" />

              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-[85%] h-[60%] border border-lime-400/40 rounded-xl relative">
                  <div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-lime-400" />
                  <div className="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-lime-400" />
                  <div className="absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 border-lime-400" />
                  <div className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-lime-400" />

                  <div className="absolute top-1/2 left-0 right-0 h-[1px] bg-lime-400/25 border-dashed" />
                  
                  <div className="absolute top-1/2 left-[28%] -translate-x-1/2 -translate-y-1/2 w-10 h-10 rounded-full border border-lime-400/50 animate-ping opacity-25" />
                  <div className="absolute top-1/2 right-[28%] translate-x-1/2 -translate-y-1/2 w-10 h-10 rounded-full border border-lime-400/50 animate-ping opacity-25" />

                  <span className="absolute -top-3 left-4 bg-black/80 px-2 py-0.5 text-[10px] text-lime-300 font-mono tracking-wider border border-lime-500/30 rounded">
                    REAL EYE SCAN // 100% ZOOM
                  </span>
                </div>
              </div>
            </>
          )}

          {(flashlightActive || isHovering) && revealLevel !== 'full' && (
            <div
              className="absolute pointer-events-none w-48 h-48 sm:w-56 sm:h-56 -translate-x-1/2 -translate-y-1/2 rounded-full transition-transform duration-75"
              style={{
                left: `${lensPos.x}%`,
                top: `${lensPos.y}%`,
                background:
                  'radial-gradient(circle, rgba(255,255,255,0.45) 0%, rgba(251,191,36,0.25) 40%, rgba(0,0,0,0) 70%)',
                boxShadow: '0 0 45px rgba(255,255,200,0.6)',
                mixBlendMode: 'overlay',
              }}
            />
          )}

          <div className="absolute bottom-2 right-3 pointer-events-none flex items-center gap-1.5 bg-black/70 px-2.5 py-1 rounded-md border border-white/10 text-[10px] text-gray-300">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            <span className="font-bold tracking-wider">B11 LIVE • بث حصري</span>
          </div>
        </div>

        {revealLevel === 'full' && (
          <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black via-black/95 to-transparent p-4 flex flex-col items-center justify-center animate-fadeIn">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-2xl">{player.flag}</span>
              <h3 className="text-xl sm:text-2xl font-black text-amber-300 tracking-wide drop-shadow-md">
                {player.name}
              </h3>
            </div>
            <p className="text-xs text-emerald-400 font-semibold mb-1">
              {player.nickname} • {player.currentClub}
            </p>
            <p className="text-[11px] text-gray-300 max-w-sm text-center line-clamp-2">
              &quot;{player.distinctEyeFeature}&quot;
            </p>
          </div>
        )}
      </div>

      {revealLevel !== 'full' && (
        <div className="flex items-center justify-center gap-2 mt-3 w-full max-w-lg">
          {canRevealMore && onRevealMore && (
            <button
              onClick={() => {
                sound.playSpotlight();
                onRevealMore();
              }}
              className="flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-gradient-to-r from-emerald-950/80 via-emerald-900/60 to-emerald-950/80 border border-emerald-500/40 text-emerald-300 hover:text-white hover:border-emerald-400 text-xs sm:text-sm font-bold shadow-lg transition-all cursor-pointer active:scale-95"
            >
              <ZoomIn className="w-4 h-4 text-emerald-400" />
              <span>
                {revealLevel === 'eyes'
                  ? 'كشف جزء أكبر من الوجه (ينقص 30 نقطة)'
                  : 'كشف صورة الوجه كاملة (ينقص 30 نقطة)'}
              </span>
            </button>
          )}
        </div>
      )}

      {revealLevel === 'eyes' && (
        <p className="text-[11px] text-gray-400 mt-2 flex items-center gap-1">
          <Search className="w-3.5 h-3.5 text-lime-400" />
          <span>مرر إصبعك أو الماوس فوق العينين لاستكشاف لون البؤبؤ والحواجب وملامح اللاعب</span>
        </p>
      )}
    </div>
  );
};
