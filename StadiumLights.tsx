import React from 'react';

interface StadiumLightsProps {
  intensity?: 'normal' | 'dramatic' | 'celebration' | 'alert';
  activeLightBeam?: boolean;
}

export const StadiumLights: React.FC<StadiumLightsProps> = ({
  intensity = 'normal',
  activeLightBeam = true,
}) => {
  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden z-0">
      <div className="absolute -bottom-40 left-1/2 -translate-x-1/2 w-[140%] h-[350px] bg-gradient-to-t from-emerald-950/40 via-green-900/10 to-transparent blur-3xl opacity-70" />

      <div className="absolute -top-16 -left-16 w-80 h-80 rounded-full bg-cyan-400/10 blur-3xl" />
      <div className="absolute top-0 left-0 w-32 h-32 bg-gradient-to-br from-cyan-400/20 via-emerald-400/10 to-transparent blur-xl" />

      <div className="absolute -top-16 -right-16 w-80 h-80 rounded-full bg-emerald-400/10 blur-3xl" />
      <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-emerald-400/20 via-cyan-400/10 to-transparent blur-xl" />

      <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[600px] h-64 bg-radial from-amber-300/15 via-emerald-400/5 to-transparent blur-3xl" />

      {activeLightBeam && (
        <>
          <div
            className="absolute top-0 left-1/4 w-[140px] h-[130vh] origin-top -translate-x-1/2 opacity-25"
            style={{
              background:
                'linear-gradient(180deg, rgba(203, 251, 99, 0.4) 0%, rgba(56, 189, 248, 0.15) 45%, transparent 95%)',
              clipPath: 'polygon(45% 0%, 55% 0%, 100% 100%, 0% 100%)',
              animation: 'sweepLeft 8s ease-in-out infinite alternate',
              transformOrigin: 'top center',
            }}
          />

          <div
            className="absolute top-0 right-1/4 w-[140px] h-[130vh] origin-top translate-x-1/2 opacity-25"
            style={{
              background:
                'linear-gradient(180deg, rgba(56, 189, 248, 0.35) 0%, rgba(203, 251, 99, 0.12) 45%, transparent 95%)',
              clipPath: 'polygon(45% 0%, 55% 0%, 100% 100%, 0% 100%)',
              animation: 'sweepRight 9s ease-in-out infinite alternate',
              transformOrigin: 'top center',
            }}
          />
        </>
      )}

      {intensity === 'celebration' && (
        <div className="absolute inset-0 bg-emerald-500/15 animate-pulse duration-700" />
      )}
      {intensity === 'alert' && (
        <div className="absolute inset-0 bg-red-600/15 animate-pulse duration-500" />
      )}
      {intensity === 'dramatic' && (
        <div className="absolute inset-0 bg-amber-500/10 animate-pulse duration-1000" />
      )}

      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `radial-gradient(circle at 50% 50%, #ffffff 1px, transparent 1px)`,
          backgroundSize: '32px 32px',
        }}
      />

      <style>{`
        @keyframes sweepLeft {
          0% { transform: rotate(-25deg); }
          50% { transform: rotate(10deg); }
          100% { transform: rotate(28deg); }
        }
        @keyframes sweepRight {
          0% { transform: rotate(25deg); }
          50% { transform: rotate(-8deg); }
          100% { transform: rotate(-28deg); }
        }
      `}</style>
    </div>
  );
};
