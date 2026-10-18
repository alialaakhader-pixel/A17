import React, { useState, useEffect, useRef } from 'react';
import { FootballPlayer } from '../data/playersData';
import { getAllPlayers } from '../services/storage';
import { PlayerEyeViewer } from './PlayerEyeViewer';
import { sound } from '../services/soundEffects';
import { getPublicShareUrl } from '../services/shareHelper';
import confetti from 'canvas-confetti';
import {
  Users,
  Zap,
  Globe,
  Share2,
  Copy,
  Check,
  ArrowRight,
  Trophy,
  Volume2,
  VolumeX,
  MessageCircle,
  Bot,
  Play,
  Sparkles,
} from 'lucide-react';

interface OnlineArenaProps {
  onBackToHome: () => void;
  soundMuted: boolean;
  onToggleSound: () => void;
  initialRoomCode?: string;
}

interface RemotePlayer {
  id: string;
  name: string;
  score: number;
  isHost: boolean;
}

export const OnlineArena: React.FC<OnlineArenaProps> = ({
  onBackToHome,
  soundMuted,
  onToggleSound,
  initialRoomCode,
}) => {
  const [playerName, setPlayerName] = useState(() => {
    return localStorage.getItem('b11_my_player_name') || 'كابتن كروي';
  });
  const [playerId] = useState(() => 'usr-' + Math.random().toString(36).substring(2, 9));
  const [mode, setMode] = useState<'lobby' | 'finding_match' | 'waiting_room' | 'playing' | 'game_over'>('lobby');

  const [roomId, setRoomId] = useState(initialRoomCode || '');
  const [customRoomInput, setCustomRoomInput] = useState(initialRoomCode || '');
  const [roomPlayers, setRoomPlayers] = useState<RemotePlayer[]>([]);
  const [currentRound, setCurrentRound] = useState(0);
  const [buzzedPlayerId, setBuzzedPlayerId] = useState<string | null>(null);
  const [buzzedPlayerName, setBuzzedPlayerName] = useState<string | null>(null);
  const [roundResult, setRoundResult] = useState<string | null>(null);
  const [activeReaction, setActiveReaction] = useState<{ emoji: string; from: string } | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [isBotMatch, setIsBotMatch] = useState(false);

  const socketRef = useRef<WebSocket | null>(null);
  const botTimerRef = useRef<NodeJS.Timeout | null>(null);

  const playersList = getAllPlayers();
  const currentChallenge: FootballPlayer = playersList[currentRound % playersList.length];

  useEffect(() => {
    if (initialRoomCode) {
      handleJoinRoom(initialRoomCode);
    }

    return () => {
      if (socketRef.current) {
        socketRef.current.close();
      }
      if (botTimerRef.current) clearTimeout(botTimerRef.current);
    };
  }, []);

  const connectWebSocket = (): Promise<WebSocket> => {
    return new Promise((resolve, reject) => {
      if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
        resolve(socketRef.current);
        return;
      }

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws`;
      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        socketRef.current = ws;
        resolve(ws);
      };

      ws.onerror = (err) => {
        reject(err);
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          handleServerMessage(msg);
        } catch (e) {
          console.error('Failed to parse WS msg', e);
        }
      };
    });
  };

  const handleServerMessage = (msg: any) => {
    if (msg.type === 'queued') {
      setMode('finding_match');
    }

    if (msg.type === 'room_created') {
      setRoomId(msg.roomId);
      setRoomPlayers(msg.players);
      setMode('waiting_room');
    }

    if (msg.type === 'room_joined') {
      setRoomId(msg.roomId);
      setRoomPlayers(msg.players);
      if (msg.players.length >= 2) {
        setMode('waiting_room');
      }
    }

    if (msg.type === 'match_started') {
      setRoomId(msg.roomId);
      setRoomPlayers(msg.players);
      setCurrentRound(msg.currentRound || 0);
      setBuzzedPlayerId(null);
      setRoundResult(null);
      setMode('playing');
      sound.playWhistle(true);
    }

    if (msg.type === 'player_buzzed') {
      setBuzzedPlayerId(msg.buzzedPlayerId);
      setBuzzedPlayerName(msg.buzzedPlayerName);
      sound.playTick(true);
    }

    if (msg.type === 'round_result') {
      setRoomPlayers(msg.players);
      if (msg.isCorrect) {
        sound.playCorrect();
        setTimeout(() => sound.playStadiumRoar(), 200);
        confetti({ particleCount: 70, spread: 60 });
        setRoundResult(`إجابة صحيحة! اللاعب هو ${currentChallenge.name}`);
      } else {
        sound.playWrong();
        setRoundResult(`إجابة خاطئة! نقطة مجانية للخصم.`);
      }
    }

    if (msg.type === 'new_round') {
      setCurrentRound(msg.currentRound);
      setBuzzedPlayerId(null);
      setRoundResult(null);
      sound.playWhistle(true);
    }

    if (msg.type === 'game_over') {
      setRoomPlayers(msg.players);
      setMode('game_over');
      sound.playFanfare();
      confetti({ particleCount: 150, spread: 100 });
    }

    if (msg.type === 'reaction') {
      setActiveReaction({ emoji: msg.emoji, from: msg.playerId });
      setTimeout(() => setActiveReaction(null), 2500);
    }
  };

  // 1. Random Matchmaking
  const handleFindMatch = async () => {
    sound.playClick();
    setIsBotMatch(false);
    localStorage.setItem('b11_my_player_name', playerName);
    const ws = await connectWebSocket();
    ws.send(JSON.stringify({ type: 'find_match', playerId, playerName }));
    setMode('finding_match');
  };

  // 2. Create Private Room for Friend
  const handleCreateRoom = async () => {
    sound.playClick();
    setIsBotMatch(false);
    localStorage.setItem('b11_my_player_name', playerName);
    const ws = await connectWebSocket();
    ws.send(JSON.stringify({ type: 'create_room', playerId, playerName }));
  };

  // 3. Join Room
  const handleJoinRoom = async (codeToJoin?: string) => {
    const code = codeToJoin || customRoomInput;
    if (!code) return;
    sound.playClick();
    setIsBotMatch(false);
    localStorage.setItem('b11_my_player_name', playerName);
    const ws = await connectWebSocket();
    ws.send(JSON.stringify({ type: 'join_room', roomId: code.trim(), playerId, playerName }));
  };

  // 4. Start Real Match
  const handleStartMatch = () => {
    if (isBotMatch) {
      setMode('playing');
      setCurrentRound(0);
      setBuzzedPlayerId(null);
      setRoundResult(null);
      sound.playWhistle(true);
      triggerBotTurn();
      return;
    }
    if (!socketRef.current || !roomId) return;
    socketRef.current.send(JSON.stringify({ type: 'start_match', roomId }));
  };

  // 5. Start Test Match (Simulated Opponent Bot)
  const handleStartTestMatch = () => {
    sound.playWhistle(true);
    setIsBotMatch(true);
    const generatedRoom = 'B11-TEST' + Math.floor(100 + Math.random() * 900);
    setRoomId(generatedRoom);
    const mockPlayers: RemotePlayer[] = [
      { id: playerId, name: playerName || 'أنت', score: 0, isHost: true },
      { id: 'bot-opponent', name: 'الكابتن سيف (منافس تجريبي 🤖)', score: 0, isHost: false },
    ];
    setRoomPlayers(mockPlayers);
    setCurrentRound(0);
    setBuzzedPlayerId(null);
    setRoundResult(null);
    setMode('playing');
    triggerBotTurn();
  };

  // Bot AI logic for testing
  const triggerBotTurn = () => {
    if (botTimerRef.current) clearTimeout(botTimerRef.current);

    // Bot buzzes after 5 to 10 seconds if user hasn't buzzed
    const delay = Math.floor(5500 + Math.random() * 4500);
    botTimerRef.current = setTimeout(() => {
      setBuzzedPlayerId((prev) => {
        if (prev !== null) return prev; // User already buzzed!
        sound.playTick(true);
        setBuzzedPlayerName('الكابتن سيف (منافس تجريبي 🤖)');

        // Bot answers after 1.8 seconds
        setTimeout(() => {
          const isCorrect = Math.random() > 0.25; // 75% accuracy
          resolveRound('bot-opponent', isCorrect);
        }, 1800);

        return 'bot-opponent';
      });
    }, delay);
  };

  const resolveRound = (answeringPlayerId: string, isCorrect: boolean) => {
    setRoomPlayers((prev) => {
      return prev.map((p) => {
        if (p.id === answeringPlayerId) {
          return { ...p, score: isCorrect ? p.score + 100 : p.score };
        } else {
          // Other player gets 50 if wrong
          return { ...p, score: !isCorrect ? p.score + 50 : p.score };
        }
      });
    });

    if (isCorrect) {
      sound.playCorrect();
      setTimeout(() => sound.playStadiumRoar(), 200);
      confetti({ particleCount: 70, spread: 60 });
      setRoundResult(`إجابة صحيحة! اللاعب هو ${currentChallenge.name}`);
    } else {
      sound.playWrong();
      setRoundResult(`إجابة خاطئة! نقطة للطرف الآخر.`);
    }
  };

  // Buzzer Click
  const handleBuzzer = () => {
    if (buzzedPlayerId !== null || roundResult) return;

    if (isBotMatch) {
      if (botTimerRef.current) clearTimeout(botTimerRef.current);
      setBuzzedPlayerId(playerId);
      setBuzzedPlayerName(playerName);
      sound.playTick(true);
      return;
    }

    if (!socketRef.current || !roomId) return;
    socketRef.current.send(JSON.stringify({ type: 'press_buzzer', roomId, playerId }));
  };

  // Submit Answer
  const handleAnswer = (option: string) => {
    if (buzzedPlayerId !== playerId) return;
    const isCorrect = option === currentChallenge.name;

    if (isBotMatch) {
      resolveRound(playerId, isCorrect);
      return;
    }

    if (!socketRef.current || !roomId) return;
    socketRef.current.send(JSON.stringify({ type: 'submit_answer', roomId, playerId, isCorrect }));
  };

  // Next Round
  const handleNextRound = () => {
    if (isBotMatch) {
      const nextR = currentRound + 1;
      if (nextR >= 5) {
        setMode('game_over');
        sound.playFanfare();
        confetti({ particleCount: 150, spread: 100 });
      } else {
        setCurrentRound(nextR);
        setBuzzedPlayerId(null);
        setRoundResult(null);
        sound.playWhistle(true);
        triggerBotTurn();
      }
      return;
    }

    if (!socketRef.current || !roomId) return;
    socketRef.current.send(JSON.stringify({ type: 'next_round', roomId }));
  };

  // Reactions
  const sendReaction = (emoji: string) => {
    sound.playClick();
    setActiveReaction({ emoji, from: playerId });
    setTimeout(() => setActiveReaction(null), 2500);

    if (!isBotMatch && socketRef.current && roomId) {
      socketRef.current.send(JSON.stringify({ type: 'send_reaction', roomId, playerId, emoji }));
    }
  };

  // Public Share URL (Eliminates 403 Forbidden for friends!)
  const publicFriendUrl = getPublicShareUrl({ room: roomId, mode: 'online' });

  const copyRoomLink = async () => {
    sound.playClick();
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(publicFriendUrl);
      } else {
        const input = document.createElement('input');
        input.value = publicFriendUrl;
        document.body.appendChild(input);
        input.select();
        document.execCommand('copy');
        document.body.removeChild(input);
      }
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    } catch {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    }
  };

  const whatsappRoomShareUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(
    `⚽ أدخل والعب معي الآن في فوازير كورة B11 أونلاين 1 ضد 1!\nرمز الغرفة: ${roomId}\nادخل من هذا الرابط مباشرة بدون تسجيل أو تحميل:\n${publicFriendUrl}`
  )}`;

  const me = roomPlayers.find((p) => p.id === playerId);
  const opponent = roomPlayers.find((p) => p.id !== playerId);

  return (
    <div className="relative z-10 w-full max-w-4xl mx-auto px-4 py-3 flex flex-col items-center animate-fadeIn">
      {/* Top Header */}
      <div className="w-full flex items-center justify-between mb-4 bg-black/70 border border-cyan-400/30 px-4 py-2.5 rounded-2xl shadow-xl">
        <button
          onClick={onBackToHome}
          className="text-xs sm:text-sm text-gray-300 hover:text-cyan-400 font-bold transition flex items-center gap-1 cursor-pointer"
        >
          <ArrowRight className="w-4 h-4" />
          <span>القائمة</span>
        </button>

        <div className="flex items-center gap-2">
          <Globe className="w-4 h-4 text-cyan-400 animate-spin" />
          <h2 className="text-sm sm:text-base font-black text-cyan-300">
            أونلاين: اللعب المباشر ضد أشخاص حقيقيين 1 ضد 1
          </h2>
        </div>

        <button
          onClick={onToggleSound}
          className="p-1.5 rounded-lg bg-neutral-900 border border-white/10 text-gray-300 hover:text-cyan-400 cursor-pointer"
        >
          {soundMuted ? <VolumeX className="w-4 h-4 text-red-400" /> : <Volume2 className="w-4 h-4 text-cyan-400" />}
        </button>
      </div>

      {activeReaction && (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 z-50 text-6xl animate-bounce drop-shadow-[0_0_20px_rgba(255,255,255,0.8)]">
          {activeReaction.emoji}
        </div>
      )}

      {/* 1. LOBBY */}
      {mode === 'lobby' && (
        <div className="w-full max-w-lg bg-neutral-900/90 border border-white/10 rounded-3xl p-6 shadow-2xl backdrop-blur-md flex flex-col items-center">
          <div className="w-16 h-16 rounded-3xl bg-cyan-500/10 border border-cyan-400/40 flex items-center justify-center text-cyan-400 mb-4 shadow-[0_0_25px_rgba(6,182,212,0.3)]">
            <Users className="w-8 h-8" />
          </div>

          <h3 className="text-xl font-black text-white text-center mb-1">
            سيرفر المواجهات الحية (Online Arena)
          </h3>
          <p className="text-xs text-gray-300 text-center mb-5">
            تحدَّ أصدقاءك برابط مباشر أو ابدأ تجربة مواجهة فورية لاختبار مهاراتك!
          </p>

          <div className="w-full mb-4">
            <label className="block text-xs font-bold text-gray-300 mb-1">اسمك في المباراة:</label>
            <input
              type="text"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              className="w-full bg-black/60 border border-white/20 rounded-xl px-3 py-2 text-sm text-cyan-300 font-bold focus:border-cyan-400 outline-none text-center"
            />
          </div>

          {/* Test Match Button */}
          <div className="w-full mb-4 p-3 bg-gradient-to-r from-emerald-950/90 via-neutral-900 to-lime-950/90 border-2 border-lime-400/60 rounded-2xl flex flex-col items-center shadow-lg">
            <div className="flex items-center gap-1.5 mb-1.5 text-lime-300 text-xs font-black">
              <Sparkles className="w-4 h-4 text-yellow-300 animate-pulse" />
              <span>تريد تجربة الأونلاين والبازر الآن فوراً؟</span>
            </div>
            <button
              onClick={handleStartTestMatch}
              className="w-full py-2.5 px-4 rounded-xl bg-lime-400 hover:bg-lime-300 text-black font-black text-xs sm:text-sm flex items-center justify-center gap-2 cursor-pointer transition shadow-md active:scale-95"
            >
              <Bot className="w-4 h-4" />
              <span>بدء مباراة تجريبية فورية (اختبار التحدي والبازر) ⚡</span>
            </button>
          </div>

          {/* Create Room For Friend */}
          <button
            onClick={handleCreateRoom}
            className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-cyan-500 via-sky-400 to-cyan-500 hover:from-cyan-400 hover:to-sky-300 text-black font-black text-sm flex items-center justify-center gap-2 shadow-[0_0_25px_rgba(6,182,212,0.4)] active:scale-95 transition cursor-pointer mb-3"
          >
            <Share2 className="w-4 h-4" />
            <span>إنشاء غرفة وإرسال رابط عام لصاحبي ⚡</span>
          </button>

          {/* Find Random Real Opponent */}
          <button
            onClick={handleFindMatch}
            className="w-full py-3 rounded-2xl bg-neutral-800 hover:bg-neutral-700 border border-cyan-400/40 text-cyan-300 font-bold text-xs flex items-center justify-center gap-2 cursor-pointer transition mb-4"
          >
            <Globe className="w-4 h-4" />
            <span>بحث عشوائي عن شخص حقيقي أونلاين</span>
          </button>

          {/* Join By Code */}
          <div className="w-full flex gap-2">
            <input
              type="text"
              placeholder="رمز الغرفة (مثال: B11-1234)"
              value={customRoomInput}
              onChange={(e) => setCustomRoomInput(e.target.value)}
              className="flex-1 bg-black/60 border border-white/10 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-cyan-400 font-mono text-center"
            />
            <button
              onClick={() => handleJoinRoom()}
              className="px-4 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-white font-bold text-xs cursor-pointer border border-white/20 transition"
            >
              انضمام
            </button>
          </div>
        </div>
      )}

      {/* 2. FINDING MATCH */}
      {mode === 'finding_match' && (
        <div className="w-full max-w-md bg-neutral-900/90 border border-cyan-400/40 rounded-3xl p-8 flex flex-col items-center text-center shadow-2xl">
          <div className="w-16 h-16 rounded-full border-4 border-cyan-400 border-t-transparent animate-spin mb-4" />
          <h3 className="text-lg font-black text-white mb-2">جاري البحث عن خصم حقيقي...</h3>
          <p className="text-xs text-gray-400 mb-6">
            السيرفر يبحث الآن في غرف الانتظار عن لاعب نشط لبدء التحدي المباشر.
          </p>

          <div className="flex gap-2 w-full">
            <button
              onClick={handleStartTestMatch}
              className="flex-1 py-2.5 rounded-xl bg-lime-400 text-black text-xs font-black cursor-pointer"
            >
              بدء تجربة اللعب فوراً ⚡
            </button>
            <button
              onClick={() => {
                if (socketRef.current) socketRef.current.close();
                setMode('lobby');
              }}
              className="px-4 py-2.5 rounded-xl bg-neutral-800 text-gray-300 text-xs font-bold cursor-pointer hover:text-white"
            >
              إلغاء
            </button>
          </div>
        </div>
      )}

      {/* 3. WAITING ROOM */}
      {mode === 'waiting_room' && (
        <div className="w-full max-w-lg bg-neutral-900/90 border border-white/10 rounded-3xl p-6 shadow-2xl flex flex-col items-center">
          <div className="w-12 h-12 rounded-2xl bg-lime-400/10 text-lime-400 flex items-center justify-center mb-2">
            <Zap className="w-6 h-6" />
          </div>

          <h3 className="text-lg font-black text-white mb-1">غرفة التحدي الخاصة جاهزة!</h3>
          <span className="text-xs font-mono font-black text-lime-400 bg-lime-950 px-3 py-1 rounded-full border border-lime-500/30 mb-4">
            رمز الغرفة: {roomId}
          </span>

          {/* Public Anti-403 Link Box */}
          <div className="w-full bg-black/60 border border-lime-400/40 rounded-2xl p-3 mb-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] font-bold text-lime-400">
                الرابط العام لصاحبك (بدون خطأ 403):
              </span>
              <span className="text-[10px] bg-emerald-950 text-emerald-300 px-1.5 py-0.5 rounded border border-emerald-500/30">
                دخول مباشر ومجاني
              </span>
            </div>

            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-gray-300 truncate max-w-[200px] font-mono">
                {publicFriendUrl}
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={copyRoomLink}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1 transition cursor-pointer active:scale-95 ${
                    copiedLink ? 'bg-emerald-500 text-black' : 'bg-lime-400 text-black hover:bg-lime-300'
                  }`}
                >
                  {copiedLink ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedLink ? 'تم النسخ!' : 'نسخ الرابط'}</span>
                </button>

                <a
                  href={whatsappRoomShareUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => sound.playClick()}
                  className="p-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white transition cursor-pointer shadow-md flex items-center justify-center"
                  title="مشاركة مباشرة عبر واتساب"
                >
                  <MessageCircle className="w-4 h-4" />
                </a>
              </div>
            </div>
          </div>

          {/* Room Players Status */}
          <div className="w-full grid grid-cols-2 gap-3 mb-5">
            <div className="p-3 bg-black/40 rounded-xl border border-white/10 text-center">
              <span className="text-[10px] text-gray-400 block mb-1">أنت</span>
              <span className="text-sm font-bold text-white block">{playerName}</span>
              <span className="text-[10px] text-emerald-400 font-bold">جاهز في الغرفة ✅</span>
            </div>

            <div className="p-3 bg-black/40 rounded-xl border border-white/10 text-center">
              <span className="text-[10px] text-gray-400 block mb-1">المنافس</span>
              {opponent ? (
                <>
                  <span className="text-sm font-bold text-cyan-300 block">{opponent.name}</span>
                  <span className="text-[10px] text-emerald-400 font-bold">انضم للغرفة ✅</span>
                </>
              ) : (
                <span className="text-xs text-amber-400 animate-pulse block mt-1 font-semibold">
                  في انتظار دخول صديقك...
                </span>
              )}
            </div>
          </div>

          <div className="w-full flex flex-col gap-2">
            <button
              onClick={handleStartMatch}
              disabled={roomPlayers.length < 2}
              className={`w-full py-3.5 rounded-2xl font-black text-sm flex items-center justify-center gap-2 transition cursor-pointer ${
                roomPlayers.length >= 2
                  ? 'bg-lime-400 hover:bg-lime-300 text-black shadow-lg shadow-lime-400/30'
                  : 'bg-neutral-800 text-gray-500 cursor-not-allowed'
              }`}
            >
              <span>بدء مواجهة الصديق ⚡</span>
            </button>

            {/* Test Bot Option */}
            <button
              onClick={handleStartTestMatch}
              className="w-full py-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 border border-white/10 text-gray-300 text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer"
            >
              <Bot className="w-4 h-4 text-lime-400" />
              <span>أو اختبر المباراة الآن ضد منافس تجريبي</span>
            </button>
          </div>
        </div>
      )}

      {/* 4. ACTIVE PLAYING */}
      {mode === 'playing' && (
        <div className="w-full max-w-lg flex flex-col items-center">
          {/* Top Scoreboard */}
          <div className="w-full grid grid-cols-2 gap-3 mb-3">
            <div
              className={`p-3 rounded-2xl border-2 transition-all flex items-center justify-between ${
                buzzedPlayerId === me?.id
                  ? 'bg-emerald-950 border-emerald-400 shadow-[0_0_20px_rgba(52,211,153,0.5)]'
                  : 'bg-neutral-900 border-white/10'
              }`}
            >
              <div>
                <span className="text-[10px] text-gray-400 block">أنت ({me?.name})</span>
                <span className="text-base font-black text-lime-400 font-mono">
                  {me?.score || 0} نقطة
                </span>
              </div>
              {buzzedPlayerId === me?.id && <span className="text-xl animate-bounce">⚡</span>}
            </div>

            <div
              className={`p-3 rounded-2xl border-2 transition-all flex items-center justify-between ${
                buzzedPlayerId === opponent?.id
                  ? 'bg-red-950 border-red-400 shadow-[0_0_20px_rgba(239,68,68,0.5)]'
                  : 'bg-neutral-900 border-white/10'
              }`}
            >
              <div>
                <span className="text-[10px] text-gray-400 block truncate max-w-[120px]">
                  {opponent?.name || 'الخصم'}
                </span>
                <span className="text-base font-black text-cyan-400 font-mono">
                  {opponent?.score || 0} نقطة
                </span>
              </div>
              {buzzedPlayerId === opponent?.id && <span className="text-xl animate-bounce">⚡</span>}
            </div>
          </div>

          <PlayerEyeViewer
            player={currentChallenge}
            revealLevel={roundResult ? 'full' : 'eyes'}
            canRevealMore={false}
          />

          <div className="flex items-center gap-2 my-2">
            <span className="text-[10px] text-gray-400">تفاعل سريع:</span>
            {['⚽', '🔥', '🏆', '👏', '😱'].map((emoji) => (
              <button
                key={emoji}
                onClick={() => sendReaction(emoji)}
                className="w-8 h-8 rounded-full bg-neutral-800 hover:bg-neutral-700 flex items-center justify-center text-sm cursor-pointer transition active:scale-90"
              >
                {emoji}
              </button>
            ))}
          </div>

          {/* Big Buzzer Button */}
          {!buzzedPlayerId && !roundResult && (
            <button
              onClick={handleBuzzer}
              className="w-full mt-3 py-6 rounded-3xl bg-gradient-to-b from-amber-400 to-amber-600 hover:from-amber-300 hover:to-amber-500 border-4 border-amber-200 text-black font-black text-xl shadow-[0_0_40px_rgba(245,158,11,0.6)] active:scale-95 transition cursor-pointer flex flex-col items-center justify-center"
            >
              <Zap className="w-8 h-8 mb-1" />
              <span>اضغط البازر أولاً للإجابة! ⚡</span>
              <span className="text-xs font-normal">أسرع ضغطة تكسب حق الإجابة</span>
            </button>
          )}

          {/* Answering State */}
          {buzzedPlayerId && !roundResult && (
            <div className="w-full mt-3 flex flex-col items-center">
              <div className="mb-3 px-4 py-1.5 rounded-full text-xs font-black bg-amber-400 text-black animate-pulse text-center">
                {buzzedPlayerId === me?.id
                  ? 'أنت ضغطت البازر أولاً! اختر الإجابة الصحيحة الآن:'
                  : `الخصم (${buzzedPlayerName}) ضغط البازر أولاً ويقوم بالاختيار...`}
              </div>

              <div className="w-full grid grid-cols-2 gap-2">
                {currentChallenge.options.map((opt, i) => (
                  <button
                    key={i}
                    onClick={() => handleAnswer(opt)}
                    disabled={buzzedPlayerId !== me?.id}
                    className={`p-3 rounded-2xl border-2 font-bold text-xs sm:text-sm text-center transition ${
                      buzzedPlayerId === me?.id
                        ? 'bg-neutral-900 border-lime-400 hover:bg-neutral-800 cursor-pointer active:scale-95'
                        : 'bg-neutral-950 border-neutral-800 text-gray-500 cursor-not-allowed'
                    }`}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            </div>
          )}

          {roundResult && (
            <div className="w-full mt-4 p-4 rounded-2xl bg-neutral-900/90 border border-white/20 flex flex-col items-center text-center animate-fadeIn">
              <p className="text-sm font-black text-lime-400 mb-3">{roundResult}</p>
              <button
                onClick={handleNextRound}
                className="py-2.5 px-6 rounded-xl bg-lime-400 hover:bg-lime-300 text-black font-black text-xs cursor-pointer shadow-lg active:scale-95 transition"
              >
                الجولة التالية ⚡
              </button>
            </div>
          )}
        </div>
      )}

      {/* 5. GAME OVER */}
      {mode === 'game_over' && (
        <div className="w-full max-w-md bg-neutral-900/90 border-2 border-yellow-400/60 rounded-3xl p-6 shadow-2xl flex flex-col items-center text-center">
          <Trophy className="w-16 h-16 text-yellow-400 mb-3 animate-bounce" />
          <h3 className="text-2xl font-black text-white mb-2">انتهت المباراة!</h3>

          <div className="w-full bg-black/60 rounded-2xl p-4 border border-white/10 mb-4 flex items-center justify-around">
            <div>
              <span className="text-xs text-gray-400 block">{me?.name}</span>
              <span className="text-2xl font-black text-lime-400 font-mono">
                {me?.score || 0}
              </span>
            </div>
            <div className="text-lg font-black text-yellow-400">ضد</div>
            <div>
              <span className="text-xs text-gray-400 block">{opponent?.name || 'الخصم'}</span>
              <span className="text-2xl font-black text-cyan-400 font-mono">
                {opponent?.score || 0}
              </span>
            </div>
          </div>

          <p className="text-sm font-bold text-amber-300 mb-5">
            {(me?.score || 0) > (opponent?.score || 0)
              ? '🎉 مبروك الفوز الساحق يا أسطورة!'
              : (me?.score || 0) < (opponent?.score || 0)
              ? '💪 مباراة قوية! حظاً أوفر في الجولة القادمة'
              : '🤝 تعادل مثير بين البطلين!'}
          </p>

          <div className="flex gap-2 w-full">
            <button
              onClick={handleStartTestMatch}
              className="flex-1 py-3 rounded-xl bg-lime-400 hover:bg-lime-300 text-black font-black text-xs cursor-pointer"
            >
              إعادة التجربة ⚡
            </button>
            <button
              onClick={() => setMode('lobby')}
              className="flex-1 py-3 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-gray-300 font-bold text-xs cursor-pointer"
            >
              الردهة الرئيسية
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
