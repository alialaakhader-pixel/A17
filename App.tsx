import React, { useState, useEffect } from 'react';
import { StadiumLights } from './components/StadiumLights';
import { EyesChallenge } from './components/EyesChallenge';
import { TwoPlayerBattle } from './components/TwoPlayerBattle';
import { TriviaShow } from './components/TriviaShow';
import { Leaderboard } from './components/Leaderboard';
import { DeveloperStudio } from './components/DeveloperStudio';
import { OnlineArena } from './components/OnlineArena';
import { PWAInstallButton } from './components/PWAInstallButton';
import { ShareModal } from './components/ShareModal';
import { GmailAuthModal } from './components/GmailAuthModal';
import { getCurrentUser, UserAccount } from './services/authService';
import { EffectsControlBar } from './components/EffectsControlBar';
import { getAllPlayers, subscribeToDataChanges } from './services/storage';
import { sound } from './services/soundEffects';
import { getPublicShareUrl } from './services/shareHelper';
import {
  Eye,
  Trophy,
  Zap,
  Share2,
  Sparkles,
  Flame,
  Users,
  Play,
  Globe,
  Code,
  Crown,
  Mail,
  Search,
  X,
  Copy,
  Check,
  MessageCircle,
  Link2,
} from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState<
    'home' | 'eyes' | 'battle' | 'trivia' | 'leaderboard' | 'developer' | 'online'
  >('home');
  const [soundMuted, setSoundMuted] = useState(sound.getMuted());
  const [lightingMode, setLightingMode] = useState<'normal' | 'dramatic' | 'celebration'>('normal');
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [shareScore, setShareScore] = useState<number | undefined>(undefined);
  const [shareTitle, setShareTitle] = useState<string | undefined>(undefined);
  const [initialPlayerId, setInitialPlayerId] = useState<string | undefined>(undefined);
  const [initialRoomCode, setInitialRoomCode] = useState<string | undefined>(undefined);
  const [pendingLeaderboardScore, setPendingLeaderboardScore] = useState<{
    score: number;
    mode: 'eyes' | 'trivia';
  } | undefined>(undefined);
  const [rosterKey, setRosterKey] = useState(0);

  const [playerSearchQuery, setPlayerSearchQuery] = useState('');
  const [quickCopied, setQuickCopied] = useState(false);
  const [showAllFeatured, setShowAllFeatured] = useState(false);
  const [copiedPlayerId, setCopiedPlayerId] = useState<string | null>(null);

  const [currentUser, setCurrentUser] = useState<UserAccount | null>(() => getCurrentUser());
  const [gmailModalOpen, setGmailModalOpen] = useState(false);
  const [requiredOwnerNotice, setRequiredOwnerNotice] = useState(false);

  const [homeLeague, setHomeLeague] = useState<string>('all');

  useEffect(() => {
    const unsubscribe = subscribeToDataChanges(() => {
      setRosterKey((k) => k + 1);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const modeParam = params.get('mode');
      const playerParam = params.get('player');
      const roomParam = params.get('room');

      if (roomParam) {
        setInitialRoomCode(roomParam);
        setActiveTab('online');
      } else if (playerParam) {
        setInitialPlayerId(playerParam);
        setActiveTab('eyes');
      } else if (modeParam === 'eyes') {
        setActiveTab('eyes');
      } else if (modeParam === 'battle') {
        setActiveTab('battle');
      } else if (modeParam === 'trivia') {
        setActiveTab('trivia');
      } else if (modeParam === 'leaderboard') {
        setActiveTab('leaderboard');
      } else if (modeParam === 'online') {
        setActiveTab('online');
      }
    } catch {
      // URL params fallback
    }
  }, []);

  const handleToggleSound = () => {
    const isMuted = sound.toggleMute();
    setSoundMuted(isMuted);
    if (!isMuted) {
      sound.playClick();
    }
  };

  const handleOpenShare = (score?: number, title?: string) => {
    sound.playClick();
    setShareScore(score);
    setShareTitle(title);
    setShareModalOpen(true);
  };

  const handleQuickInvite = async () => {
    sound.playClick();
    const directUrl = getPublicShareUrl();

    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(directUrl);
      } else {
        const input = document.createElement('input');
        input.value = directUrl;
        document.body.appendChild(input);
        input.select();
        document.execCommand('copy');
        document.body.removeChild(input);
      }
      setQuickCopied(true);
      setTimeout(() => setQuickCopied(false), 3000);
    } catch {
      setQuickCopied(true);
      setTimeout(() => setQuickCopied(false), 3000);
    }
  };

  const handleCopyPlayerLink = async (e: React.MouseEvent, playerId: string) => {
    e.stopPropagation();
    sound.playClick();
    const directUrl = getPublicShareUrl({ player: playerId, mode: 'eyes' });

    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(directUrl);
      } else {
        const input = document.createElement('input');
        input.value = directUrl;
        document.body.appendChild(input);
        input.select();
        document.execCommand('copy');
        document.body.removeChild(input);
      }
      setCopiedPlayerId(playerId);
      setTimeout(() => setCopiedPlayerId(null), 2500);
    } catch {
      setCopiedPlayerId(playerId);
      setTimeout(() => setCopiedPlayerId(null), 2500);
    }
  };

  const startMode = (
    mode: 'eyes' | 'battle' | 'trivia' | 'leaderboard' | 'developer' | 'online',
    playerId?: string
  ) => {
    sound.playWhistle(true);
    if (playerId) setInitialPlayerId(playerId);
    setActiveTab(mode);
  };

  const activePlayers = getAllPlayers();

  const filteredFeaturedPlayers = activePlayers.filter((p) => {
    if (homeLeague !== 'all' && p.league !== homeLeague) {
      return false;
    }
    if (!playerSearchQuery.trim()) return true;
    const q = playerSearchQuery.toLowerCase().trim();
    return (
      p.name.toLowerCase().includes(q) ||
      p.englishName.toLowerCase().includes(q) ||
      p.nickname.toLowerCase().includes(q) ||
      p.currentClub.toLowerCase().includes(q) ||
      p.nationality.toLowerCase().includes(q) ||
      p.historicClubs.some((c) => c.toLowerCase().includes(q))
    );
  });

  return (
    <div className="relative min-h-screen bg-[#050907] text-white flex flex-col justify-between selection:bg-lime-400 selection:text-black overflow-x-hidden font-['Cairo',sans-serif]">
      <StadiumLights intensity={lightingMode} activeLightBeam={true} />

      <header className="relative z-20 w-full border-b border-white/10 bg-black/50 backdrop-blur-md">
        <div className="max-w-5xl mx-auto px-4 py-2.5 flex items-center justify-between">
          <div
            onClick={() => {
              sound.playClick();
              setActiveTab('home');
            }}
            className="flex items-center gap-2 cursor-pointer group"
          >
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-lime-500 to-emerald-400 p-0.5 shadow-[0_0_15px_rgba(203,251,99,0.4)] group-hover:scale-105 transition">
              <div className="w-full h-full bg-[#07130c] rounded-[10px] flex items-center justify-center text-lime-400 font-black text-sm">
                B11
              </div>
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-base font-black tracking-tight text-white group-hover:text-lime-400 transition">
                  فوازير كورة B11
                </span>
                <span className="text-[10px] bg-red-600/90 text-white font-bold px-1.5 py-0.2 rounded-full animate-pulse">
                  مباشر
                </span>
              </div>
              <p className="text-[10px] text-gray-400 font-medium">
                تحدي ملامح وعيون الأساطير الحقيقية
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2">
            <button
              onClick={() => startMode('online')}
              className={`px-3 py-1.5 rounded-xl border text-xs sm:text-sm font-black flex items-center gap-1.5 transition cursor-pointer active:scale-95 ${
                activeTab === 'online'
                  ? 'bg-cyan-500 text-black border-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.5)]'
                  : 'bg-neutral-900 border-cyan-500/40 text-cyan-300 hover:bg-neutral-800'
              }`}
            >
              <Globe className="w-3.5 h-3.5" />
              <span>أونلاين 1 ضد 1</span>
            </button>

            <button
              onClick={() => startMode('leaderboard')}
              className={`px-3 py-1.5 rounded-xl border text-xs sm:text-sm font-black flex items-center gap-1.5 transition cursor-pointer active:scale-95 ${
                activeTab === 'leaderboard'
                  ? 'bg-amber-400 text-black border-amber-300 shadow-[0_0_15px_rgba(245,158,11,0.5)]'
                  : 'bg-neutral-900 border-amber-400/40 text-amber-300 hover:bg-neutral-800'
              }`}
            >
              <Crown className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">لوحة الصدارة</span>
              <span className="sm:hidden">الصدارة</span>
            </button>

            <button
              onClick={() => {
                if (!currentUser?.isOwner) {
                  sound.playWrong();
                  setRequiredOwnerNotice(true);
                  setGmailModalOpen(true);
                } else {
                  startMode('developer');
                }
              }}
              className={`px-2.5 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-1 transition cursor-pointer active:scale-95 ${
                currentUser?.isOwner
                  ? 'bg-amber-400 text-black border-amber-300 font-black shadow-[0_0_15px_rgba(250,204,21,0.4)]'
                  : 'bg-neutral-900 border-white/10 text-gray-400 hover:text-white'
              }`}
              title={
                currentUser?.isOwner
                  ? 'وضع المالك مفتوح لك كمالك معتمد 👑'
                  : 'وضع المالك خاص وحصري لمالك اللعبة المعتمد 🔒'
              }
            >
              <Code className={`w-3.5 h-3.5 ${currentUser?.isOwner ? 'text-black' : 'text-amber-400'}`} />
              <span className="hidden md:inline">
                وضع المالك {currentUser?.isOwner ? '👑' : '🔒'}
              </span>
            </button>

            <button
              onClick={() => {
                sound.playClick();
                setRequiredOwnerNotice(false);
                setGmailModalOpen(true);
              }}
              className={`px-2.5 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition cursor-pointer active:scale-95 ${
                currentUser?.isOwner
                  ? 'bg-neutral-900 border-amber-400 text-amber-300 shadow-md'
                  : currentUser
                  ? 'bg-neutral-900 border-lime-400/50 text-lime-300'
                  : 'bg-neutral-900 border-red-500/40 text-red-300 hover:border-red-400'
              }`}
              title={currentUser ? `حساب الجيميل: ${currentUser.email}` : 'إضافة بريد Gmail لحفظ النتائج'}
            >
              <Mail className="w-3.5 h-3.5" />
              {currentUser?.isOwner ? (
                <span className="hidden sm:inline font-black text-amber-300">المالك: علي 👑</span>
              ) : currentUser ? (
                <span className="hidden sm:inline truncate max-w-[100px]">{currentUser.name}</span>
              ) : (
                <span className="hidden sm:inline">إضافة Gmail 📧</span>
              )}
            </button>

            <PWAInstallButton variant="nav" />

            <button
              onClick={() => handleOpenShare()}
              className="px-3.5 py-1.5 rounded-xl bg-lime-400 hover:bg-lime-300 text-black font-black text-xs sm:text-sm flex items-center gap-1.5 shadow-[0_0_20px_rgba(203,251,99,0.35)] transition cursor-pointer active:scale-95"
            >
              <Share2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">مشاركة الرابط ⚡</span>
            </button>
          </div>
        </div>

        <EffectsControlBar
          soundMuted={soundMuted}
          onToggleSound={handleToggleSound}
          lightingMode={lightingMode}
          onChangeLighting={setLightingMode}
        />
      </header>

      <main className="relative z-10 flex-1 flex flex-col justify-center py-4">
        {activeTab === 'home' && (
          <div className="w-full max-w-4xl mx-auto px-4 flex flex-col items-center animate-fadeIn">
            <div className="text-center mt-2 mb-6 max-w-2xl">
              <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-lime-950/80 border border-lime-400/40 text-lime-300 text-xs font-bold mb-3 shadow-[0_0_15px_rgba(203,251,99,0.25)]">
                <Sparkles className="w-3.5 h-3.5 text-yellow-300" />
                <span>برنامج كروي متكامل مع اللعب الأونلاين ولوحة الصدارة ووضع المالك</span>
              </div>

              <h1 className="text-3xl sm:text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-lime-300 via-white to-cyan-300 tracking-tight leading-tight mb-3">
                برنامج فوازير كورة B11
              </h1>
              <p className="text-sm sm:text-base text-gray-300 leading-relaxed">
                هل تمتلك نظرة كروية ثاقبة؟ خمن أسماء أساطير كرة القدم من خلال{' '}
                <span className="text-lime-400 font-bold underline decoration-lime-400 underline-offset-4">
                  ملامح وعيون وجوههم الحقيقية
                </span>
                ، وتحدَّ أصدقاءك في مواجهات أونلاين حية وتصدر قائمة الشرف!
              </p>
            </div>

            <div className="w-full grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
              <div
                onClick={() => startMode('eyes')}
                className="relative group p-5 rounded-3xl bg-gradient-to-b from-neutral-900/90 via-emerald-950/40 to-neutral-900/90 border-2 border-lime-400/60 hover:border-lime-300 shadow-[0_0_35px_rgba(203,251,99,0.2)] hover:shadow-[0_0_50px_rgba(203,251,99,0.35)] transition-all duration-300 cursor-pointer flex flex-col justify-between overflow-hidden"
              >
                <div className="absolute top-0 right-0 bg-gradient-to-l from-lime-400 to-emerald-400 text-black text-[9px] font-black px-2.5 py-0.5 rounded-bl-xl shadow-md">
                  الأساسية 👁️
                </div>

                <div>
                  <div className="w-12 h-12 rounded-2xl bg-lime-400/20 border border-lime-400/40 flex items-center justify-center text-lime-400 mb-3 shadow-[0_0_20px_rgba(203,251,99,0.3)] group-hover:scale-110 transition">
                    <Eye className="w-6 h-6" />
                  </div>
                  <h3 className="text-lg font-black text-white group-hover:text-lime-300 transition mb-1.5">
                    تحدي عيون اللاعبين
                  </h3>
                  <p className="text-xs text-gray-300 leading-relaxed mb-4">
                    تكبير دقيق لعيون النجوم مع كشاف فحص ضوئي تفاعلي و3 مستويات كشف متدرجة!
                  </p>
                </div>

                <div className="flex items-center justify-between pt-2.5 border-t border-white/10 text-xs font-black text-lime-400">
                  <span>ابدأ التحدي</span>
                  <Play className="w-3.5 h-3.5 fill-current group-hover:translate-x-[-3px] transition" />
                </div>
              </div>

              <div
                onClick={() => startMode('online')}
                className="relative group p-5 rounded-3xl bg-gradient-to-b from-neutral-900/90 via-cyan-950/40 to-neutral-900/90 border-2 border-cyan-400/60 hover:border-cyan-300 shadow-[0_0_35px_rgba(6,182,212,0.2)] hover:shadow-[0_0_50px_rgba(6,182,212,0.35)] transition-all duration-300 cursor-pointer flex flex-col justify-between overflow-hidden"
              >
                <div className="absolute top-0 right-0 bg-gradient-to-l from-cyan-400 to-sky-400 text-black text-[9px] font-black px-2.5 py-0.5 rounded-bl-xl shadow-md">
                  سيرفر حي ⚡
                </div>

                <div>
                  <div className="w-12 h-12 rounded-2xl bg-cyan-400/20 border border-cyan-400/40 flex items-center justify-center text-cyan-400 mb-3 shadow-[0_0_20px_rgba(6,182,212,0.3)] group-hover:scale-110 transition">
                    <Globe className="w-6 h-6 animate-pulse" />
                  </div>
                  <h3 className="text-lg font-black text-white group-hover:text-cyan-300 transition mb-1.5">
                    أونلاين: ضد شخص حقيقي
                  </h3>
                  <p className="text-xs text-gray-300 leading-relaxed mb-4">
                    العب مباشرة ضد أشخاص حقيقيين عبر السيرفر أو أنشئ غرفة خاصة برابط لصديقك!
                  </p>
                </div>

                <div className="flex items-center justify-between pt-2.5 border-t border-white/10 text-xs font-black text-cyan-400">
                  <span>دخول السيرفر</span>
                  <Play className="w-3.5 h-3.5 fill-current group-hover:translate-x-[-3px] transition" />
                </div>
              </div>

              <div
                onClick={() => startMode('battle')}
                className="relative group p-5 rounded-3xl bg-gradient-to-b from-neutral-900/90 via-amber-950/30 to-neutral-900/90 border border-amber-400/40 hover:border-amber-400 shadow-md hover:shadow-xl transition-all duration-300 cursor-pointer flex flex-col justify-between overflow-hidden"
              >
                <div>
                  <div className="w-12 h-12 rounded-2xl bg-amber-400/20 border border-amber-400/40 flex items-center justify-center text-amber-400 mb-3 group-hover:scale-110 transition">
                    <Zap className="w-6 h-6" />
                  </div>
                  <h3 className="text-lg font-black text-white group-hover:text-amber-300 transition mb-1.5">
                    بازر لاعبين (جهاز واحد)
                  </h3>
                  <p className="text-xs text-gray-300 leading-relaxed mb-4">
                    تنافس وجه لوجه مع صديقك على نفس الشاشة ببازر أحمر وأزرق سريع!
                  </p>
                </div>

                <div className="flex items-center justify-between pt-2.5 border-t border-white/10 text-xs font-black text-amber-400">
                  <span>بدء المواجهة</span>
                  <Play className="w-3.5 h-3.5 fill-current group-hover:translate-x-[-3px] transition" />
                </div>
              </div>

              <div
                onClick={() => startMode('trivia')}
                className="relative group p-5 rounded-3xl bg-gradient-to-b from-neutral-900/90 via-purple-950/30 to-neutral-900/90 border border-purple-400/40 hover:border-purple-400 shadow-md hover:shadow-xl transition-all duration-300 cursor-pointer flex flex-col justify-between overflow-hidden"
              >
                <div>
                  <div className="w-12 h-12 rounded-2xl bg-purple-400/20 border border-purple-400/40 flex items-center justify-center text-purple-400 mb-3 group-hover:scale-110 transition">
                    <Trophy className="w-6 h-6" />
                  </div>
                  <h3 className="text-lg font-black text-white group-hover:text-purple-300 transition mb-1.5">
                    فوازير كروية كبرى
                  </h3>
                  <p className="text-xs text-gray-300 leading-relaxed mb-4">
                    أسئلة منوعة من كأس العالم ودوري الأبطال والأرقام القياسية لحصد أعلى النقاط.
                  </p>
                </div>

                <div className="flex items-center justify-between pt-2.5 border-t border-white/10 text-xs font-black text-purple-400">
                  <span>خوض الاختبار</span>
                  <Play className="w-3.5 h-3.5 fill-current group-hover:translate-x-[-3px] transition" />
                </div>
              </div>
            </div>

            <div className="w-full grid grid-cols-1 sm:grid-cols-2 gap-3 mb-8">
              <div
                onClick={() => startMode('leaderboard')}
                className="p-4 bg-gradient-to-r from-amber-950/50 via-neutral-900 to-amber-950/50 border border-amber-400/40 rounded-2xl flex items-center justify-between cursor-pointer hover:border-amber-400 transition"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-400/20 text-amber-300 flex items-center justify-center">
                    <Crown className="w-5 h-5" />
                  </div>
                  <div>
                    <h5 className="text-xs sm:text-sm font-black text-amber-300">
                      لوحة الصدارة وأعلى النقاط
                    </h5>
                    <p className="text-[10px] text-gray-400">
                      شاهد قائمة أبطال اللعبة وسجل نتيجتك محلياً
                    </p>
                  </div>
                </div>
                <span className="text-xs font-bold text-amber-400">عرض 🏆</span>
              </div>

              <div
                onClick={() => {
                  if (!currentUser?.isOwner) {
                    sound.playWrong();
                    setRequiredOwnerNotice(true);
                    setGmailModalOpen(true);
                  } else {
                    startMode('developer');
                  }
                }}
                className={`p-4 bg-gradient-to-r from-lime-950/50 via-neutral-900 to-lime-950/50 border rounded-2xl flex items-center justify-between cursor-pointer transition ${
                  currentUser?.isOwner
                    ? 'border-amber-400 hover:border-amber-300 shadow-[0_0_20px_rgba(250,204,21,0.2)]'
                    : 'border-white/10 hover:border-amber-400/40'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                      currentUser?.isOwner
                        ? 'bg-amber-400/20 text-amber-300'
                        : 'bg-neutral-800 text-gray-400'
                    }`}
                  >
                    {currentUser?.isOwner ? <Crown className="w-5 h-5 text-amber-400" /> : <Code className="w-5 h-5" />}
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <h5 className="text-xs sm:text-sm font-black text-lime-300">
                        وضع التطوير والاستوديو (المالك)
                      </h5>
                      {currentUser?.isOwner ? (
                        <span className="text-[10px] bg-amber-400 text-black font-black px-1.5 py-0.2 rounded-full">
                          مفعل 👑
                        </span>
                      ) : (
                        <span className="text-[10px] bg-neutral-800 text-amber-300 border border-amber-400/30 px-1.5 py-0.2 rounded-full">
                          مقفل 🔒
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-gray-400">
                      {currentUser?.isOwner
                        ? 'أهلاً بك يا علي! يمكنك إضافة وتعديل صور اللاعبين والأسئلة'
                        : 'مخصص حصرياً لمالك اللعبة المعتمد 👑'}
                    </p>
                  </div>
                </div>
                <span className="text-xs font-bold text-lime-400">
                  {currentUser?.isOwner ? 'دخول ⚙️' : 'طلب إذن 🔒'}
                </span>
              </div>
            </div>

            <div className="w-full mb-8">
              <PWAInstallButton variant="banner" />
            </div>

            <div className="w-full bg-gradient-to-r from-emerald-950/80 via-neutral-900 to-lime-950/80 border-2 border-lime-400/50 rounded-3xl p-4 sm:p-5 mb-6 shadow-xl backdrop-blur-md">
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
                <div className="flex items-center gap-3 text-center sm:text-right">
                  <div className="w-12 h-12 rounded-2xl bg-lime-400/20 border border-lime-400/40 flex items-center justify-center text-lime-400 shrink-0 shadow-[0_0_15px_rgba(203,251,99,0.3)]">
                    <Users className="w-6 h-6 animate-pulse" />
                  </div>
                  <div>
                    <div className="flex items-center justify-center sm:justify-start gap-1.5 flex-wrap">
                      <h4 className="text-sm sm:text-base font-black text-white">
                        ابعث الرابط لأصحابك ليدخلوا اللعبة فوراً ⚡
                      </h4>
                      <span className="text-[10px] bg-lime-400 text-black font-black px-2 py-0.5 rounded-full">
                        دخول مباشر
                      </span>
                    </div>
                    <p className="text-xs text-gray-300 mt-0.5">
                      أي صاحب ترسل له الرابط سيفتح اللعبة مباشرة في المتصفح بدون تحميل أو تسجيل!
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <button
                    onClick={handleQuickInvite}
                    className={`flex-1 sm:flex-none px-4 py-2.5 rounded-xl font-black text-xs sm:text-sm flex items-center justify-center gap-1.5 shadow-md transition cursor-pointer active:scale-95 ${
                      quickCopied
                        ? 'bg-emerald-500 text-black shadow-[0_0_15px_rgba(16,185,129,0.5)]'
                        : 'bg-lime-400 hover:bg-lime-300 text-black shadow-[0_0_15px_rgba(203,251,99,0.3)]'
                    }`}
                  >
                    {quickCopied ? (
                      <>
                        <Check className="w-4 h-4" />
                        <span>تم نسخ الرابط! ✅</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4" />
                        <span>نسخ رابط اللعبة لصاحبي</span>
                      </>
                    )}
                  </button>

                  <a
                    href={`https://api.whatsapp.com/send?text=${encodeURIComponent(
                      `⚽ تعال العب معي الآن في فوازير وتحدي كورة B11! خمن اللاعبين من عيونهم وملامحهم الحقيقية عبر الرابط المباشر:\n${getPublicShareUrl()}`
                    )}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => sound.playClick()}
                    className="p-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white transition cursor-pointer shadow-md active:scale-95 flex items-center justify-center"
                    title="مشاركة مباشرة عبر واتساب"
                  >
                    <MessageCircle className="w-4 h-4" />
                  </a>
                </div>
              </div>

              {quickCopied && (
                <div className="mt-3 p-2 bg-emerald-950/90 border border-emerald-400/60 rounded-xl text-center text-xs font-bold text-emerald-300 animate-slideUp">
                  تم نسخ الرابط! الصقه الآن في محادثة صاحبك على واتساب أو ماسنجر ليدخل اللعبة فوراً ⚡
                </div>
              )}
            </div>

            <div className="w-full bg-neutral-900/70 border border-white/10 rounded-3xl p-5 mb-8 backdrop-blur-md">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-2">
                  <Flame className="w-4 h-4 text-red-500 animate-pulse" />
                  <h4 className="text-sm font-black text-white">
                    نجوم التحدي بوجوههم وعيونهم الحقيقية:
                  </h4>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-lime-400 font-bold">
                    {activePlayers.length} لاعب جاهزون للتحدي
                  </span>
                  {!playerSearchQuery && activePlayers.length > 8 && (
                    <button
                      onClick={() => {
                        sound.playClick();
                        setShowAllFeatured(!showAllFeatured);
                      }}
                      className="text-[11px] text-cyan-300 hover:text-white underline cursor-pointer"
                    >
                      {showAllFeatured ? 'عرض أقل' : 'عرض الجميع'}
                    </button>
                  )}
                </div>
              </div>

              {/* Top 5 Leagues Quick Selector */}
              <div className="w-full flex items-center justify-start gap-1.5 overflow-x-auto pb-2 mb-3 scrollbar-none text-xs">
                {[
                  { key: 'all', label: 'الكل (جميع النجوم)', flag: '🌍' },
                  { key: 'premier', label: 'البريميرليج', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿' },
                  { key: 'laliga', label: 'الليغا', flag: '🇪🇸' },
                  { key: 'bundesliga', label: 'البوندسليغا', flag: '🇩🇪' },
                  { key: 'seriea', label: 'السيريا آ', flag: '🇮🇹' },
                  { key: 'ligue1', label: 'الدوري الفرنسي', flag: '🇫🇷' },
                  { key: 'legend', label: 'أساطير', flag: '👑' },
                ].map((item) => (
                  <button
                    key={item.key}
                    onClick={() => {
                      sound.playClick();
                      setHomeLeague(item.key);
                    }}
                    className={`px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition cursor-pointer flex items-center gap-1 shrink-0 text-xs ${
                      homeLeague === item.key
                        ? 'bg-lime-400 text-black shadow-[0_0_15px_rgba(203,251,99,0.4)]'
                        : 'bg-black/50 text-gray-300 hover:text-white hover:bg-neutral-800 border border-white/10'
                    }`}
                  >
                    <span>{item.flag}</span>
                    <span>{item.label}</span>
                  </button>
                ))}
              </div>

              <div className="relative mb-4 flex items-center">
                <Search className="w-4 h-4 text-gray-400 absolute right-3.5 pointer-events-none" />
                <input
                  type="text"
                  value={playerSearchQuery}
                  onChange={(e) => setPlayerSearchQuery(e.target.value)}
                  placeholder="ابحث عن لاعب (ميسي، بنزيما، رونالدو، صلاح...) أو ناديه أو منتخبه..."
                  className="w-full bg-black/60 border border-white/10 rounded-2xl pr-10 pl-10 py-2.5 text-xs sm:text-sm text-white placeholder-gray-500 focus:border-lime-400 focus:ring-1 focus:ring-lime-400 outline-none transition"
                />
                {playerSearchQuery && (
                  <button
                    onClick={() => {
                      sound.playClick();
                      setPlayerSearchQuery('');
                    }}
                    className="absolute left-3 p-1 rounded-full text-gray-400 hover:text-white hover:bg-neutral-800 transition cursor-pointer"
                    title="مسح البحث"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {playerSearchQuery.trim() && (
                <div className="flex items-center justify-between text-xs text-lime-400 font-bold mb-3 px-1">
                  <span>
                    نتائج البحث: تم العثور على {filteredFeaturedPlayers.length} لاعب
                  </span>
                  <button
                    onClick={() => setPlayerSearchQuery('')}
                    className="text-gray-400 hover:text-white underline text-[11px] cursor-pointer"
                  >
                    عرض كل اللاعبين
                  </button>
                </div>
              )}

              {filteredFeaturedPlayers.length === 0 ? (
                <div className="text-center py-8 text-gray-400 text-xs">
                  <p className="mb-2">لم يتم العثور على أي لاعب يطابق &quot;{playerSearchQuery}&quot;.</p>
                  <button
                    onClick={() => setPlayerSearchQuery('')}
                    className="px-3 py-1.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-white text-xs font-bold transition cursor-pointer"
                  >
                    مسح البحث وعرض الجميع
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
                  {(playerSearchQuery || showAllFeatured
                    ? filteredFeaturedPlayers
                    : filteredFeaturedPlayers.slice(0, 8)
                  ).map((p) => (
                    <div
                      key={p.id}
                      onClick={() => startMode('eyes', p.id)}
                      className="group/player relative flex flex-col items-center cursor-pointer p-2 rounded-2xl bg-black/30 hover:bg-neutral-800/80 border border-white/5 hover:border-lime-400/50 transition-all duration-200"
                      title={`العب تحدي ${p.name}`}
                    >
                      <div className="w-14 h-14 rounded-full overflow-hidden border-2 border-lime-400/50 group-hover/player:border-lime-400 group-hover/player:scale-105 transition shadow-md relative">
                        <img
                          src={p.photoUrl}
                          alt={p.name}
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                        <span className="absolute bottom-0 right-0 text-[10px] bg-black/80 px-1 rounded-full">
                          {p.flag}
                        </span>
                      </div>

                      <span className="text-xs font-bold text-gray-200 mt-1.5 text-center truncate w-full group-hover/player:text-lime-300">
                        {p.name}
                      </span>
                      <span className="text-[10px] text-gray-400 truncate w-full text-center">
                        {p.currentClub}
                      </span>

                      <button
                        type="button"
                        onClick={(e) => handleCopyPlayerLink(e, p.id)}
                        className={`mt-1.5 w-full py-1 px-1.5 rounded-lg border text-[10px] font-bold flex items-center justify-center gap-1 transition cursor-pointer ${
                          copiedPlayerId === p.id
                            ? 'bg-emerald-500 text-black border-emerald-400'
                            : 'bg-neutral-900/90 hover:bg-lime-400 hover:text-black border-white/10 text-gray-300'
                        }`}
                        title={`نسخ رابط تحدي ${p.name} المباشر لصاحبك`}
                      >
                        {copiedPlayerId === p.id ? (
                          <>
                            <Check className="w-3 h-3 text-black" />
                            <span>تم النسخ!</span>
                          </>
                        ) : (
                          <>
                            <Link2 className="w-3 h-3" />
                            <span>تحدَّ صاحبك</span>
                          </>
                        )}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'eyes' && (
          <EyesChallenge
            key={`eyes-${rosterKey}`}
            onBackToHome={() => setActiveTab('home')}
            onOpenShare={(score, title) => {
              if (score) setPendingLeaderboardScore({ score, mode: 'eyes' });
              handleOpenShare(score, title);
            }}
            soundMuted={soundMuted}
            onToggleSound={handleToggleSound}
            initialPlayerId={initialPlayerId}
          />
        )}

        {activeTab === 'battle' && (
          <TwoPlayerBattle
            onBackToHome={() => setActiveTab('home')}
            soundMuted={soundMuted}
            onToggleSound={handleToggleSound}
          />
        )}

        {activeTab === 'online' && (
          <OnlineArena
            onBackToHome={() => setActiveTab('home')}
            soundMuted={soundMuted}
            onToggleSound={handleToggleSound}
            initialRoomCode={initialRoomCode}
          />
        )}

        {activeTab === 'trivia' && (
          <TriviaShow
            key={`trivia-${rosterKey}`}
            onBackToHome={() => setActiveTab('home')}
            onOpenShare={(score) => {
              if (score) setPendingLeaderboardScore({ score, mode: 'trivia' });
              handleOpenShare(score);
            }}
          />
        )}

        {activeTab === 'leaderboard' && (
          <Leaderboard
            key={`lb-${rosterKey}`}
            onBackToHome={() => setActiveTab('home')}
            pendingScore={pendingLeaderboardScore}
            onScoreSaved={() => setPendingLeaderboardScore(undefined)}
          />
        )}

        {activeTab === 'developer' && (
          <DeveloperStudio
            key={`dev-${rosterKey}`}
            onBackToHome={() => setActiveTab('home')}
            onDataChanged={() => setRosterKey((k) => k + 1)}
            onOpenGmailAuth={() => {
              setRequiredOwnerNotice(true);
              setGmailModalOpen(true);
            }}
          />
        )}
      </main>

      <footer className="relative z-20 w-full border-t border-white/10 bg-black/60 backdrop-blur-md py-3 text-center text-xs text-gray-400">
        <div className="max-w-4xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-lime-400" />
            <span className="font-semibold text-gray-300">برنامج فوازير كورة B11 الرسمي</span>
            <a
              href="http://EllooolB11.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] text-lime-400 hover:text-lime-300 font-mono font-bold bg-lime-950/80 px-2 py-0.5 rounded border border-lime-500/30 transition flex items-center gap-1"
            >
              <span>EllooolB11.com</span>
            </a>
          </div>
          <div className="flex items-center gap-3 text-[11px] text-gray-400">
            <button
              onClick={() => startMode('leaderboard')}
              className="hover:text-amber-300 transition cursor-pointer"
            >
              🏆 لوحة الصدارة
            </button>
            <span>•</span>
            <button
              onClick={() => startMode('online')}
              className="hover:text-cyan-300 transition cursor-pointer"
            >
              🌐 سيرفر الأونلاين
            </button>
            <span>•</span>
            <button
              onClick={() => {
                if (!currentUser?.isOwner) {
                  sound.playWrong();
                  setRequiredOwnerNotice(true);
                  setGmailModalOpen(true);
                } else {
                  startMode('developer');
                }
              }}
              className="hover:text-lime-300 transition cursor-pointer"
            >
              {currentUser?.isOwner ? '👑 استوديو المالك (مفعل)' : '🔒 وضع المالك'}
            </button>
          </div>
        </div>
      </footer>

      <ShareModal
        isOpen={shareModalOpen}
        onClose={() => setShareModalOpen(false)}
        score={shareScore}
        playerTitle={shareTitle}
        defaultMode={activeTab === 'home' ? 'eyes' : activeTab}
      />

      <GmailAuthModal
        isOpen={gmailModalOpen}
        onClose={() => setGmailModalOpen(false)}
        onUserChanged={(u) => setCurrentUser(u)}
        requiredOwnerNotice={requiredOwnerNotice}
      />
    </div>
  );
}
