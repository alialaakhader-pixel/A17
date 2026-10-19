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
  RefreshCw,
  Clock,
  Radio,
  AlertCircle,
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

interface OpenRoomInfo {
  id: string;
  hostName: string;
  playerCount: number;
  status: string;
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
  const [serverChallengeId, setServerChallengeId] = useState<string>('salah');
  const [buzzedPlayerId, setBuzzedPlayerId] = useState<string | null>(null);
  const [buzzedPlayerName, setBuzzedPlayerName] = useState<string | null>(null);
  const [buzzerTimeLeft, setBuzzerTimeLeft] = useState<number | null>(null);
  const [roundResult, setRoundResult] = useState<string | null>(null);
  const [activeReaction, setActiveReaction] = useState<{ emoji: string; from: string } | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [isBotMatch, setIsBotMatch] = useState(false);
  const [statusNotification, setStatusNotification] = useState<string | null>(null);

  // Matchmaking real-time search indicators
  const [searchTimer, setSearchTimer] = useState(0);
  const [onlineCount, setOnlineCount] = useState<number>(1);
  const [queueCount, setQueueCount] = useState<number>(0);
  const [openRooms, setOpenRooms] = useState<OpenRoomInfo[]>([]);
  const [serverChallenge, setServerChallenge] = useState<FootballPlayer | null>(null);

  const socketRef = useRef<WebSocket | null>(null);
  const botTimerRef = useRef<NodeJS.Timeout | null>(null);
  const searchIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const buzzerCountdownRef = useRef<NodeJS.Timeout | null>(null);
  const matchmakingPollRef = useRef<NodeJS.Timeout | null>(null);
  const roomPollRef = useRef<NodeJS.Timeout | null>(null);

  const playersList = getAllPlayers();
  // Authoritative synced challenge
  const currentChallenge: FootballPlayer =
    serverChallenge ||
    playersList.find((p) => p.id === serverChallengeId) ||
    playersList[currentRound % playersList.length] ||
    playersList[0];

  const flashNotice = (msg: string) => {
    setStatusNotification(msg);
    setTimeout(() => setStatusNotification(null), 4000);
  };

  const loadOpenRooms = async () => {
    try {
      const res = await fetch('/api/open-rooms');
      if (res.ok) {
        const data = await res.json();
        setOpenRooms(data || []);
      }
    } catch {
      // Offline
    }
  };

  useEffect(() => {
    loadOpenRooms();
    const interval = setInterval(loadOpenRooms, 6000);

    if (initialRoomCode) {
      handleJoinRoom(initialRoomCode);
    }

    return () => {
      clearInterval(interval);
      if (socketRef.current) {
        socketRef.current.close();
      }
      if (botTimerRef.current) clearTimeout(botTimerRef.current);
      if (searchIntervalRef.current) clearInterval(searchIntervalRef.current);
      if (buzzerCountdownRef.current) clearInterval(buzzerCountdownRef.current);
    };
  }, []);

  // Search Timer
  useEffect(() => {
    if (mode === 'finding_match') {
      setSearchTimer(0);
      searchIntervalRef.current = setInterval(() => {
        setSearchTimer((s) => s + 1);
      }, 1000);
    } else {
      if (searchIntervalRef.current) clearInterval(searchIntervalRef.current);
    }
    return () => {
      if (searchIntervalRef.current) clearInterval(searchIntervalRef.current);
    };
  }, [mode]);

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
        console.error('WebSocket connection error:', err);
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

      ws.onclose = () => {
        socketRef.current = null;
      };
    });
  };

  const handleServerMessage = (msg: any) => {
    if (msg.type === 'server_hello' || msg.type === 'queue_update') {
      if (typeof msg.onlineCount === 'number') setOnlineCount(msg.onlineCount);
      if (typeof msg.queueCount === 'number') setQueueCount(msg.queueCount);
    }

    if (msg.type === 'queued') {
      setMode('finding_match');
      if (typeof msg.queueCount === 'number') setQueueCount(msg.queueCount);
      if (typeof msg.onlineCount === 'number') setOnlineCount(msg.onlineCount);
    }

    if (msg.type === 'left_queue') {
      setMode('lobby');
    }

    if (msg.type === 'room_created') {
      setRoomId(msg.roomId);
      setRoomPlayers(msg.players);
      setMode('waiting_room');
    }

    if (msg.type === 'room_joined') {
      setRoomId(msg.roomId);
      setRoomPlayers(msg.players);
      if (msg.currentChallengeId) setServerChallengeId(msg.currentChallengeId);
      if (msg.players.length >= 2) {
        setMode('waiting_room');
      }
    }

    if (msg.type === 'match_started') {
      if (matchmakingPollRef.current) clearInterval(matchmakingPollRef.current);
      setRoomId(msg.roomId);
      setRoomPlayers(msg.players);
      setCurrentRound(msg.currentRound || 0);
      if (msg.challenge) setServerChallenge(msg.challenge);
      else if (msg.currentChallengeId) setServerChallengeId(msg.currentChallengeId);
      setBuzzedPlayerId(null);
      setBuzzerTimeLeft(null);
      setRoundResult(null);
      setMode('playing');
      sound.playWhistle(true);
      flashNotice('تم العثور على خصم حقيقي! بدأت المباراة ⚡');
    }

    if (msg.type === 'player_buzzed') {
      setBuzzedPlayerId(msg.buzzedPlayerId);
      setBuzzedPlayerName(msg.buzzedPlayerName);
      sound.playTick(true);

      // Start visual 12-second countdown bar
      setBuzzerTimeLeft(msg.timeLimit || 12);
      if (buzzerCountdownRef.current) clearInterval(buzzerCountdownRef.current);
      buzzerCountdownRef.current = setInterval(() => {
        setBuzzerTimeLeft((prev) => {
          if (!prev || prev <= 1) {
            clearInterval(buzzerCountdownRef.current!);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }

    if (msg.type === 'round_result') {
      if (buzzerCountdownRef.current) clearInterval(buzzerCountdownRef.current);
      setBuzzerTimeLeft(null);
      setRoomPlayers(msg.players);

      if (msg.isCorrect) {
        sound.playCorrect();
        setTimeout(() => sound.playStadiumRoar(), 200);
        confetti({ particleCount: 70, spread: 60 });
        setRoundResult(`إجابة صحيحة! اللاعب هو ${currentChallenge.name}`);
      } else if (msg.isTimeout) {
        sound.playWrong();
        setRoundResult(`انتهى وقت البازر! نقطة مجانية للخصم.`);
      } else {
        sound.playWrong();
        setRoundResult(`إجابة خاطئة! نقطة مجانية للطرف الآخر.`);
      }
    }

    if (msg.type === 'new_round') {
      if (buzzerCountdownRef.current) clearInterval(buzzerCountdownRef.current);
      setBuzzerTimeLeft(null);
      setCurrentRound(msg.currentRound);
      if (msg.challenge) setServerChallenge(msg.challenge);
      else if (msg.currentChallengeId) setServerChallengeId(msg.currentChallengeId);
      setBuzzedPlayerId(null);
      setRoundResult(null);
      sound.playWhistle(true);
    }

    if (msg.type === 'game_over') {
      if (buzzerCountdownRef.current) clearInterval(buzzerCountdownRef.current);
      setRoomPlayers(msg.players);
      setMode('game_over');
      sound.playFanfare();
      confetti({ particleCount: 150, spread: 100 });
    }

    if (msg.type === 'player_left') {
      if (buzzerCountdownRef.current) clearInterval(buzzerCountdownRef.current);
      setBuzzerTimeLeft(null);
      sound.playWrong();
      flashNotice(msg.message || 'غادر الخصم المباراة! فزت بالمواجهة 🏆');
      setRoundResult('غادر المنافس المباراة. تم احتساب الفوز لك! 🏆');
    }

    if (msg.type === 'reaction') {
      setActiveReaction({ emoji: msg.emoji, from: msg.playerId });
      setTimeout(() => setActiveReaction(null), 2500);
    }

    if (msg.type === 'error') {
      sound.playWrong();
      flashNotice(msg.message || 'حدث خطأ في الاتصال');
    }
  };

  // 1. Matchmaking Search for a Real Person
  const handleFindMatch = async () => {
    sound.playClick();
    setIsBotMatch(false);
    localStorage.setItem('b11_my_player_name', playerName);
    setMode('finding_match');

    // 1. Connect via WebSocket
    try {
      const ws = await connectWebSocket();
      ws.send(JSON.stringify({ type: 'find_match', playerId, playerName }));
    } catch {
      // WS error will be handled by HTTP polling fallback
    }

    // 2. Start HTTP Matchmaking polling in parallel (ensures real opponents match under any network)
    if (matchmakingPollRef.current) clearInterval(matchmakingPollRef.current);
    matchmakingPollRef.current = setInterval(async () => {
      try {
        const res = await fetch('/api/matchmaking/find', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ playerId, playerName }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.status === 'matched') {
            if (matchmakingPollRef.current) clearInterval(matchmakingPollRef.current);
            setRoomId(data.roomId);
            setRoomPlayers(data.players || []);
            setCurrentRound(data.currentRound || 0);
            if (data.challenge) setServerChallenge(data.challenge);
            setBuzzedPlayerId(null);
            setRoundResult(null);
            setMode('playing');
            sound.playWhistle(true);
            flashNotice('تم العثور على خصم حقيقي! بدأت المباراة ⚡');
          } else if (data.status === 'queued') {
            if (typeof data.queueCount === 'number') setQueueCount(data.queueCount);
            if (typeof data.onlineCount === 'number') setOnlineCount(data.onlineCount);
          }
        }
      } catch {
        // network retry
      }
    }, 1200);
  };

  // Cancel Matchmaking
  const handleCancelSearch = () => {
    sound.playClick();
    if (matchmakingPollRef.current) clearInterval(matchmakingPollRef.current);
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: 'leave_queue', playerId }));
    }
    fetch('/api/matchmaking/leave', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerId }),
    }).catch(() => {});
    setMode('lobby');
  };

  // 2. Create Private Room for Friend
  const handleCreateRoom = async () => {
    sound.playClick();
    setIsBotMatch(false);
    localStorage.setItem('b11_my_player_name', playerName);

    try {
      const ws = await connectWebSocket();
      ws.send(JSON.stringify({ type: 'create_room', playerId, playerName }));
    } catch {
      flashNotice('تعذر الاتصال بالسيرفر لإنشاء الغرفة.');
    }
  };

  // 3. Join Room
  const handleJoinRoom = async (codeToJoin?: string) => {
    const code = codeToJoin || customRoomInput;
    if (!code) return;
    sound.playClick();
    setIsBotMatch(false);
    localStorage.setItem('b11_my_player_name', playerName);

    try {
      const ws = await connectWebSocket();
      ws.send(JSON.stringify({ type: 'join_room', roomId: code.trim().toUpperCase(), playerId, playerName }));
    } catch {
      flashNotice('تعذر الاتصال بالسيرفر.');
    }
  };

  // 4. Start Match from Waiting Room
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

  // 5. Simulated Bot Match (Offline or Instant fallback)
  const handleStartTestMatch = () => {
    sound.playWhistle(true);
    setIsBotMatch(true);
    const generatedRoom = 'B11-TEST' + Math.floor(100 + Math.random() * 900);
    setRoomId(generatedRoom);
    const mockPlayers: RemotePlayer[] = [
      { id: playerId, name: playerName || 'أنت', score: 0, isHost: true },
      { id: 'bot-opponent', name: 'الكابتن سيف (محاكي ذكي 🤖)', score: 0, isHost: false },
    ];
    setRoomPlayers(mockPlayers);
    setCurrentRound(0);
    setServerChallengeId(playersList[0]?.id || 'salah');
    setBuzzedPlayerId(null);
    setRoundResult(null);
    setMode('playing');
    triggerBotTurn();
  };

  const triggerBotTurn = () => {
    if (botTimerRef.current) clearTimeout(botTimerRef.current);

    // Bot buzzes between 5 and 9 seconds
    const delay = Math.floor(5500 + Math.random() * 4000);
    botTimerRef.current = setTimeout(() => {
      setBuzzedPlayerId((prev) => {
        if (prev !== null) return prev; // Player buzzed first!
        sound.playTick(true);
        setBuzzedPlayerName('الكابتن سيف (محاكي ذكي 🤖)');

        setTimeout(() => {
          const isCorrect = Math.random() > 0.25;
          resolveRound('bot-opponent', isCorrect);
        }, 2000);

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
      setRoundResult(`إجابة خاطئة! نقطة مجانية للطرف الآخر.`);
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

    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: 'press_buzzer', roomId, playerId }));
    }
    fetch('/api/matchmaking/buzz', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomId, playerId }),
    }).catch(() => {});
  };

  // Submit Answer
  const handleAnswer = (option: string) => {
    if (buzzedPlayerId !== playerId) return;
    const isCorrect = option === currentChallenge.name;

    if (isBotMatch) {
      resolveRound(playerId, isCorrect);
      return;
    }

    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: 'submit_answer', roomId, playerId, isCorrect }));
    }
    fetch('/api/matchmaking/answer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomId, playerId, isCorrect }),
    }).catch(() => {});
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
        setServerChallengeId(playersList[nextR % playersList.length]?.id || 'salah');
        setServerChallenge(null);
        setBuzzedPlayerId(null);
        setRoundResult(null);
        sound.playWhistle(true);
        triggerBotTurn();
      }
      return;
    }

    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: 'next_round', roomId }));
    }
    fetch('/api/matchmaking/next', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomId }),
    }).catch(() => {});
  };

  // Live Reactions
  const sendReaction = (emoji: string) => {
    sound.playClick();
    setActiveReaction({ emoji, from: playerId });
    setTimeout(() => setActiveReaction(null), 2500);

    if (!isBotMatch && socketRef.current && roomId) {
      socketRef.current.send(JSON.stringify({ type: 'send_reaction', roomId, playerId, emoji }));
    }
  };

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
    `⚽ أدخل والعب معي الآن في فوازير كورة B11 أونلاين 1 ضد 1!\nرمز الغرفة: ${roomId}\nادخل من هذا الرابط مباشرة:\n${publicFriendUrl}`
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

      {statusNotification && (
        <div className="w-full max-w-md mb-3 px-4 py-2 bg-cyan-950/90 border border-cyan-400 rounded-xl text-center text-xs font-bold text-cyan-200 animate-slideUp flex items-center justify-center gap-2">
          <Sparkles className="w-4 h-4 text-cyan-400 shrink-0" />
          <span>{statusNotification}</span>
        </div>
      )}

      {activeReaction && (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 z-50 text-6xl animate-bounce drop-shadow-[0_0_20px_rgba(255,255,255,0.8)]">
          {activeReaction.emoji}
        </div>
      )}

      {/* 1. LOBBY */}
      {mode === 'lobby' && (
        <div className="w-full max-w-lg bg-neutral-900/95 border border-white/10 rounded-3xl p-5 sm:p-6 shadow-2xl backdrop-blur-md flex flex-col items-center">
          <div className="w-16 h-16 rounded-3xl bg-cyan-500/10 border border-cyan-400/40 flex items-center justify-center text-cyan-400 mb-3 shadow-[0_0_25px_rgba(6,182,212,0.3)]">
            <Users className="w-8 h-8" />
          </div>

          <h3 className="text-xl font-black text-white text-center mb-1">
            سيرفر المواجهات الحية (Online Arena)
          </h3>
          <p className="text-xs text-gray-300 text-center mb-4">
            تحدَّ أشخاصاً حقيقيين أونلاين أو أرسل رابطاً لصاحبك برمز الغرفة للعب فوراً!
          </p>

          {/* Online Live Status Bar */}
          <div className="w-full mb-4 px-3 py-2 bg-black/60 border border-cyan-500/20 rounded-xl flex items-center justify-between text-[11px] font-bold">
            <div className="flex items-center gap-1.5 text-emerald-400">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>المتصلون الآن: {Math.max(1, onlineCount)} لاعب</span>
            </div>
            <div className="text-gray-400">
              طابور البحث: <span className="text-cyan-300">{queueCount}</span>
            </div>
          </div>

          <div className="w-full mb-4">
            <label className="block text-xs font-bold text-gray-300 mb-1">اسمك في التحدي:</label>
            <input
              type="text"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              className="w-full bg-black/60 border border-white/20 rounded-xl px-3 py-2 text-sm text-cyan-300 font-bold focus:border-cyan-400 outline-none text-center"
            />
          </div>

          {/* MAIN ACTION: Search for Real Person */}
          <button
            onClick={handleFindMatch}
            className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-emerald-400 via-lime-400 to-cyan-400 hover:brightness-110 text-black font-black text-sm flex items-center justify-center gap-2 shadow-[0_0_30px_rgba(52,211,153,0.4)] active:scale-95 transition cursor-pointer mb-3"
          >
            <Globe className="w-5 h-5 text-black" />
            <span>البحث التلقائي عن شخص حقيقي أونلاين ⚡</span>
          </button>

          {/* Create Room For Friend */}
          <button
            onClick={handleCreateRoom}
            className="w-full py-3 rounded-2xl bg-neutral-800 hover:bg-neutral-700 border border-cyan-400/50 text-cyan-300 font-black text-xs flex items-center justify-center gap-2 active:scale-95 transition cursor-pointer mb-3"
          >
            <Share2 className="w-4 h-4 text-cyan-400" />
            <span>إنشاء غرفة ومشاركة الرابط مع صديقي 📲</span>
          </button>

          {/* Test Match Button */}
          <button
            onClick={handleStartTestMatch}
            className="w-full py-2.5 rounded-xl bg-neutral-900 hover:bg-neutral-800 border border-white/10 text-gray-300 font-bold text-xs flex items-center justify-center gap-2 cursor-pointer transition mb-4"
          >
            <Bot className="w-4 h-4 text-lime-400" />
            <span>تجربة فورية ضد لاعب ذكي محاكي (تدريب وبازر) 🤖</span>
          </button>

          {/* Join By Code */}
          <div className="w-full flex gap-2 mb-4">
            <input
              type="text"
              placeholder="رمز الغرفة (مثال: B11-1234)"
              value={customRoomInput}
              onChange={(e) => setCustomRoomInput(e.target.value)}
              className="flex-1 bg-black/60 border border-white/10 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-cyan-400 font-mono text-center"
            />
            <button
              onClick={() => handleJoinRoom()}
              className="px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black font-black text-xs cursor-pointer transition"
            >
              انضمام
            </button>
          </div>

          {/* Open Public Rooms Section */}
          {openRooms.length > 0 && (
            <div className="w-full mt-2 pt-3 border-t border-white/10">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-lime-400 flex items-center gap-1">
                  <Radio className="w-3.5 h-3.5 animate-pulse text-lime-400" />
                  <span>غرف مفتوحة بانتظار منافس ({openRooms.length}):</span>
                </span>
                <button
                  onClick={loadOpenRooms}
                  className="text-[10px] text-gray-400 hover:text-white flex items-center gap-1"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>تحديث</span>
                </button>
              </div>

              <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                {openRooms.map((r) => (
                  <div
                    key={r.id}
                    className="p-2 bg-black/50 border border-white/10 rounded-xl flex items-center justify-between"
                  >
                    <div>
                      <span className="text-xs font-bold text-white block">{r.hostName}</span>
                      <span className="text-[10px] text-gray-400 font-mono">{r.id}</span>
                    </div>
                    <button
                      onClick={() => handleJoinRoom(r.id)}
                      className="px-3 py-1 rounded-lg bg-lime-400 hover:bg-lime-300 text-black font-bold text-xs transition"
                    >
                      تحدي الآن ⚔️
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 2. FINDING MATCH */}
      {mode === 'finding_match' && (
        <div className="w-full max-w-md bg-neutral-900/95 border border-cyan-400/50 rounded-3xl p-6 sm:p-8 flex flex-col items-center text-center shadow-2xl animate-fadeIn">
          {/* Radar Animation */}
          <div className="relative w-24 h-24 mb-5 flex items-center justify-center">
            <div className="absolute inset-0 rounded-full border border-cyan-400/30 animate-ping opacity-60" />
            <div className="absolute inset-2 rounded-full border border-cyan-400/50 animate-pulse" />
            <div className="w-14 h-14 rounded-full bg-gradient-to-tr from-cyan-500 to-emerald-400 flex items-center justify-center text-black font-black shadow-[0_0_25px_rgba(6,182,212,0.6)]">
              <Globe className="w-7 h-7 text-black animate-spin" />
            </div>
          </div>

          <h3 className="text-lg font-black text-white mb-1">جاري البحث عن شخص حقيقي أونلاين...</h3>
          <div className="flex items-center gap-1.5 text-xs text-cyan-300 font-mono mb-3 bg-cyan-950/70 border border-cyan-500/30 px-3 py-1 rounded-full">
            <Clock className="w-3.5 h-3.5" />
            <span>وقت البحث: {searchTimer} ثانية</span>
          </div>

          <p className="text-xs text-gray-300 mb-4 leading-relaxed">
            السيرفر يمسح الآن قائمة اللاعبين النشطين في طابور الأونلاين لمطابقتك فوراً في مواجهة 1 ضد 1 حقيقية.
          </p>

          <div className="w-full mb-4 p-3 bg-cyan-950/40 border border-cyan-400/30 rounded-2xl flex flex-col gap-2">
            <span className="text-[11px] font-bold text-cyan-300">
              💡 يمكنك أيضاً دعوة صديقك ليدخل في ثوانٍ أثناء البحث:
            </span>
            <div className="flex gap-2">
              <a
                href={`https://api.whatsapp.com/send?text=${encodeURIComponent(
                  `⚽ تعال العب معي الآن في فوازير كورة B11 أونلاين 1 ضد 1!\nاضغط هنا وادخل مباشرة:\n${getPublicShareUrl({ mode: 'online' })}`
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs flex items-center justify-center gap-1.5 transition"
              >
                <MessageCircle className="w-3.5 h-3.5" />
                <span>دعوة عبر واتساب</span>
              </a>
              <button
                onClick={async () => {
                  sound.playClick();
                  try {
                    await navigator.clipboard.writeText(getPublicShareUrl({ mode: 'online' }));
                    flashNotice('تم نسخ رابط الأونلاين! أرسله لأي صديق ليدخل فوراً 📲');
                  } catch {
                    flashNotice('تم نسخ الرابط!');
                  }
                }}
                className="py-2 px-3 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-cyan-300 border border-cyan-500/30 font-bold text-xs flex items-center gap-1 transition"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>نسخ الرابط</span>
              </button>
            </div>
          </div>

          {/* Dynamic Helper if taking a few seconds */}
          {searchTimer >= 6 && (
            <div className="w-full mb-4 p-3 bg-amber-950/50 border border-amber-400/40 rounded-2xl text-xs text-amber-200 animate-slideUp">
              <p className="font-bold mb-2">
                هل تنتظر منافساً؟ يمكنك مواصلة البحث، أو بدء مباراة فورية للتدريب:
              </p>
              <button
                onClick={handleStartTestMatch}
                className="w-full py-2 px-3 rounded-xl bg-lime-400 hover:bg-lime-300 text-black font-black text-xs flex items-center justify-center gap-1.5 transition"
              >
                <Bot className="w-4 h-4" />
                <span>بدء مواجهة فورية (منافس ذكي وبازر مباشر) ⚡</span>
              </button>
            </div>
          )}

          <div className="flex gap-2 w-full">
            <button
              onClick={handleCancelSearch}
              className="w-full py-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-gray-300 text-xs font-bold cursor-pointer"
            >
              إلغاء البحث والعودة
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

          {/* Public Link Box */}
          <div className="w-full bg-black/60 border border-lime-400/40 rounded-2xl p-3 mb-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] font-bold text-lime-400">
                الرابط المباشر لصاحبك (دخول فوري بدون تسجيل):
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
                  <span>{copiedLink ? 'تم النسخ!' : 'نسخ'}</span>
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
              <span className="text-sm font-bold text-white block truncate">{playerName}</span>
              <span className="text-[10px] text-emerald-400 font-bold">جاهز في الغرفة ✅</span>
            </div>

            <div className="p-3 bg-black/40 rounded-xl border border-white/10 text-center">
              <span className="text-[10px] text-gray-400 block mb-1">المنافس</span>
              {opponent ? (
                <>
                  <span className="text-sm font-bold text-cyan-300 block truncate">{opponent.name}</span>
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
                <span className="text-[10px] text-gray-400 block truncate max-w-[120px]">
                  أنت ({me?.name})
                </span>
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

          {/* Round Indicator */}
          <div className="w-full flex items-center justify-between px-2 mb-2 text-xs font-bold text-gray-400">
            <span>الجولة: {currentRound + 1} من 5</span>
            <span className="text-cyan-400">من يملك هذه العيون؟</span>
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
              <div className="mb-2 px-4 py-1.5 rounded-full text-xs font-black bg-amber-400 text-black animate-pulse text-center">
                {buzzedPlayerId === me?.id
                  ? 'أنت ضغطت البازر أولاً! اختر الإجابة الصحيحة الآن:'
                  : `الخصم (${buzzedPlayerName}) ضغط البازر أولاً ويقوم بالاختيار...`}
              </div>

              {/* Buzzer countdown bar */}
              {buzzerTimeLeft !== null && (
                <div className="w-full max-w-xs mb-3 flex items-center gap-2">
                  <Clock className="w-3.5 h-3.5 text-amber-400" />
                  <div className="flex-1 h-2 bg-neutral-800 rounded-full overflow-hidden border border-white/10">
                    <div
                      className="h-full bg-amber-400 transition-all duration-1000 ease-linear rounded-full"
                      style={{ width: `${(buzzerTimeLeft / 12) * 100}%` }}
                    />
                  </div>
                  <span className="text-xs font-mono font-bold text-amber-300">{buzzerTimeLeft}s</span>
                </div>
              )}

              <div className="w-full grid grid-cols-2 gap-2">
                {currentChallenge.options.map((opt, i) => (
                  <button
                    key={i}
                    onClick={() => handleAnswer(opt)}
                    disabled={buzzedPlayerId !== me?.id}
                    className={`p-3 rounded-2xl border-2 font-bold text-xs sm:text-sm text-center transition ${
                      buzzedPlayerId === me?.id
                        ? 'bg-neutral-900 border-lime-400 hover:bg-neutral-800 cursor-pointer active:scale-95 text-white'
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
              <span className="text-xs text-gray-400 block truncate max-w-[120px]">{me?.name}</span>
              <span className="text-2xl font-black text-lime-400 font-mono">
                {me?.score || 0}
              </span>
            </div>
            <div className="text-lg font-black text-yellow-400">ضد</div>
            <div>
              <span className="text-xs text-gray-400 block truncate max-w-[120px]">{opponent?.name || 'الخصم'}</span>
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
              onClick={handleFindMatch}
              className="flex-1 py-3 rounded-xl bg-lime-400 hover:bg-lime-300 text-black font-black text-xs cursor-pointer transition"
            >
              بحث عن مباراة أخرى ⚡
            </button>
            <button
              onClick={() => setMode('lobby')}
              className="flex-1 py-3 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-gray-300 font-bold text-xs cursor-pointer transition"
            >
              الردهة الرئيسية
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
