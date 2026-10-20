import React, { useState, useEffect, useRef } from 'react';
import { FootballPlayer, TriviaQuestion } from '../data/playersData';
import { getAllPlayers, getAllTrivia } from '../services/storage';
import { PlayerEyeViewer } from './PlayerEyeViewer';
import { sound } from '../services/soundEffects';
import { getPublicShareUrl } from '../services/shareHelper';
import { apiUrl, getWsUrl } from '../services/apiBase';
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

type GameType = 'eyes' | 'trivia';
type Challenge = FootballPlayer | TriviaQuestion;

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
  gameType?: GameType;
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
  const [gameType, setGameType] = useState<GameType>(() =>
    localStorage.getItem('b11_online_game_type') === 'trivia' ? 'trivia' : 'eyes'
  );

  const [roomId, setRoomId] = useState(initialRoomCode || '');
  const [customRoomInput, setCustomRoomInput] = useState(initialRoomCode || '');
  const [roomPlayers, setRoomPlayers] = useState<RemotePlayer[]>([]);
  const [currentRound, setCurrentRound] = useState(0);
  const [totalRounds, setTotalRounds] = useState(5);
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
  // Challenge for the current round, exactly as the server sent it
  const [serverChallenge, setServerChallenge] = useState<Challenge | null>(null);

  const socketRef = useRef<WebSocket | null>(null);
  const botTimerRef = useRef<NodeJS.Timeout | null>(null);
  const searchIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const buzzerCountdownRef = useRef<NodeJS.Timeout | null>(null);
  const matchmakingPollRef = useRef<NodeJS.Timeout | null>(null);

  // Refs mirror the latest values for callbacks created once (socket handlers, timers)
  const modeRef = useRef(mode);
  const roomIdRef = useRef(roomId);
  const challengeRef = useRef<Challenge | null>(null);
  const gameTypeRef = useRef<GameType>(gameType);
  const lastStatusRef = useRef<string>('');
  const lastRoundRef = useRef<number>(-1);
  const roomPollBusyRef = useRef(false);
  modeRef.current = mode;
  roomIdRef.current = roomId;
  gameTypeRef.current = gameType;

  const eyesList = getAllPlayers();
  const triviaList = getAllTrivia();

  const fallbackChallenge = (): Challenge =>
    gameType === 'trivia' ? triviaList[currentRound % triviaList.length] : eyesList[currentRound % eyesList.length];
  const currentChallenge: Challenge = serverChallenge || fallbackChallenge() || eyesList[0];
  challengeRef.current = currentChallenge;

  const isTrivia = gameType === 'trivia';
  const asPlayer = (c: Challenge) => c as FootballPlayer;
  const asTrivia = (c: Challenge) => c as TriviaQuestion;
  const answerOf = (c: Challenge | null, type: GameType): string => {
    if (!c) return '';
    return type === 'trivia' ? asTrivia(c).correctAnswer : asPlayer(c).name;
  };
  const optionsOf = (c: Challenge): string[] => (c as any).options || [];

  const flashNotice = (msg: string) => {
    setStatusNotification(msg);
    setTimeout(() => setStatusNotification(null), 4000);
  };

  const chooseGameType = (type: GameType) => {
    sound.playClick();
    setGameType(type);
    localStorage.setItem('b11_online_game_type', type);
  };

  const loadOpenRooms = async () => {
    try {
      const res = await fetch(apiUrl('/api/open-rooms'));
      if (res.ok) {
        const data = await res.json();
        setOpenRooms(data || []);
      }
    } catch {
      // Offline
    }
  };

  const postJson = async (path: string, body: unknown) => {
    const res = await fetch(apiUrl(path), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    let data: any = null;
    try {
      data = await res.json();
    } catch {
      // not json
    }
    return { ok: res.ok, data };
  };

  const stopCountdown = () => {
    if (buzzerCountdownRef.current) clearInterval(buzzerCountdownRef.current);
    buzzerCountdownRef.current = null;
  };

  const startCountdown = (seconds: number) => {
    stopCountdown();
    setBuzzerTimeLeft(seconds);
    buzzerCountdownRef.current = setInterval(() => {
      setBuzzerTimeLeft((prev) => {
        if (!prev || prev <= 1) {
          stopCountdown();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  // The server is the single source of truth. Every update (socket event, HTTP reply,
  // or the 1s room poll) funnels through here, so a player whose socket missed an
  // event (or never had one) still sees the buzz, the result and the next round.
  const applySnapshot = (snap: any) => {
    if (!snap || !snap.status) return;
    const type: GameType = snap.gameType === 'trivia' ? 'trivia' : 'eyes';
    const prevStatus = lastStatusRef.current;
    const prevRound = lastRoundRef.current;

    if (snap.roomId) setRoomId(snap.roomId);
    setGameType(type);
    setRoomPlayers(snap.players || []);
    setCurrentRound(snap.currentRound || 0);
    if (typeof snap.totalRounds === 'number') setTotalRounds(snap.totalRounds);
    if (snap.challenge) setServerChallenge(snap.challenge);

    if (snap.status === 'waiting') {
      lastStatusRef.current = 'waiting';
      if (modeRef.current === 'lobby' || modeRef.current === 'finding_match') setMode('waiting_room');
      return;
    }

    if (snap.status === 'game_over') {
      lastStatusRef.current = 'game_over';
      if (modeRef.current !== 'game_over') {
        stopCountdown();
        setBuzzerTimeLeft(null);
        setMode('game_over');
        sound.playFanfare();
        confetti({ particleCount: 150, spread: 100 });
      }
      return;
    }

    // playing / round_buzzed / round_finished
    if (modeRef.current !== 'playing') {
      if (matchmakingPollRef.current) clearInterval(matchmakingPollRef.current);
      setMode('playing');
      sound.playWhistle(true);
      flashNotice('بدأت المباراة! ⚡');
      attachSocketToRoom(snap.roomId);
    }

    const newRound = snap.currentRound !== prevRound;
    if (snap.status === 'playing') {
      if (newRound || prevStatus !== 'playing') {
        stopCountdown();
        setBuzzerTimeLeft(null);
        setBuzzedPlayerId(null);
        setBuzzedPlayerName(null);
        setRoundResult(null);
        if (prevRound !== -1 && newRound) sound.playWhistle(true);
      }
    } else if (snap.status === 'round_buzzed') {
      setBuzzedPlayerId(snap.buzzedPlayerId);
      setBuzzedPlayerName(snap.buzzedPlayerName);
      if (prevStatus !== 'round_buzzed') {
        sound.playTick(true);
        startCountdown(12);
      }
    } else if (snap.status === 'round_finished') {
      setBuzzedPlayerId(snap.buzzedPlayerId);
      setBuzzedPlayerName(snap.buzzedPlayerName);
      if (prevStatus !== 'round_finished') {
        stopCountdown();
        setBuzzerTimeLeft(null);
        const correct = answerOf(snap.challenge || challengeRef.current, type);
        const res = snap.lastResult || {};
        if (res.isCorrect) {
          sound.playCorrect();
          setTimeout(() => sound.playStadiumRoar(), 200);
          confetti({ particleCount: 70, spread: 60 });
          setRoundResult(`إجابة صحيحة! ${type === 'trivia' ? 'الإجابة' : 'اللاعب هو'}: ${correct}`);
        } else if (res.isTimeout) {
          sound.playWrong();
          setRoundResult(`انتهى وقت البازر! نقطة مجانية للخصم. الإجابة: ${correct}`);
        } else {
          sound.playWrong();
          setRoundResult(`إجابة خاطئة! نقطة مجانية للطرف الآخر. الإجابة الصحيحة: ${correct}`);
        }
      }
    }

    lastStatusRef.current = snap.status;
    lastRoundRef.current = snap.currentRound;
  };

  const resetSyncState = () => {
    lastStatusRef.current = '';
    lastRoundRef.current = -1;
    stopCountdown();
    setBuzzerTimeLeft(null);
    setBuzzedPlayerId(null);
    setBuzzedPlayerName(null);
    setRoundResult(null);
    setServerChallenge(null);
  };

  const pollRoom = async () => {
    const id = roomIdRef.current;
    if (!id || roomPollBusyRef.current) return;
    roomPollBusyRef.current = true;
    try {
      const res = await fetch(apiUrl(`/api/rooms/${encodeURIComponent(id)}`), { cache: 'no-store' });
      if (res.ok) {
        applySnapshot(await res.json());
      } else if (res.status === 404 && modeRef.current === 'waiting_room') {
        flashNotice('تم إغلاق الغرفة.');
        setMode('lobby');
        setRoomId('');
      }
    } catch {
      // network hiccup: next tick retries
    } finally {
      roomPollBusyRef.current = false;
    }
  };

  const attachSocketToRoom = (id: string) => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN && id) {
      socketRef.current.send(JSON.stringify({ type: 'attach_room', roomId: id, playerId }));
    }
  };

  useEffect(() => {
    loadOpenRooms();
    const interval = setInterval(loadOpenRooms, 6000);
    connectWebSocket().catch(() => {
      // sockets are optional: matchmaking, rooms and the buzzer all work over HTTP
    });

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
      if (matchmakingPollRef.current) clearInterval(matchmakingPollRef.current);
    };
  }, []);

  // Keep the room in sync while waiting for a friend or playing
  useEffect(() => {
    if (isBotMatch || !roomId || (mode !== 'waiting_room' && mode !== 'playing')) return;
    pollRoom();
    const t = setInterval(pollRoom, 1000);
    return () => clearInterval(t);
  }, [mode, roomId, isBotMatch]);

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

      const ws = new WebSocket(getWsUrl());

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
        if (socketRef.current === ws) socketRef.current = null;
      };
    });
  };

  const handleServerMessage = (msg: any) => {
    if (msg.type === 'server_hello' || msg.type === 'queue_update') {
      if (typeof msg.onlineCount === 'number') setOnlineCount(msg.onlineCount);
      if (typeof msg.queueCount === 'number') setQueueCount(msg.queueCount);
    }

    if (msg.type === 'queued') {
      if (typeof msg.queueCount === 'number') setQueueCount(msg.queueCount);
      if (typeof msg.onlineCount === 'number') setOnlineCount(msg.onlineCount);
    }

    // Anything that changes the game: re-read the room from the server right away
    if (['room_joined', 'match_started', 'player_buzzed', 'round_result', 'new_round', 'game_over'].includes(msg.type)) {
      if (msg.type === 'match_started' && msg.status) applySnapshot(msg);
      else pollRoom();
    }

    if (msg.type === 'player_left') {
      stopCountdown();
      setBuzzerTimeLeft(null);
      sound.playWrong();
      flashNotice(msg.message || 'غادر الخصم المباراة! فزت بالمواجهة 🏆');
      pollRoom();
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

  // 1. Matchmaking Search for a Real Person (same game type only)
  const handleFindMatch = async () => {
    sound.playClick();
    setIsBotMatch(false);
    localStorage.setItem('b11_my_player_name', playerName);
    resetSyncState();
    setMode('finding_match');

    const search = async () => {
      try {
        const { ok, data } = await postJson('/api/matchmaking/find', { playerId, playerName, gameType });
        if (!ok || !data) return;
        if (data.status === 'matched') {
          if (matchmakingPollRef.current) clearInterval(matchmakingPollRef.current);
          applySnapshot(data);
        } else if (data.status === 'queued') {
          if (typeof data.queueCount === 'number') setQueueCount(data.queueCount);
          if (typeof data.onlineCount === 'number') setOnlineCount(data.onlineCount);
        }
      } catch {
        // network retry
      }
    };

    if (matchmakingPollRef.current) clearInterval(matchmakingPollRef.current);
    search();
    matchmakingPollRef.current = setInterval(search, 1200);
  };

  // Cancel Matchmaking
  const handleCancelSearch = () => {
    sound.playClick();
    if (matchmakingPollRef.current) clearInterval(matchmakingPollRef.current);
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: 'leave_queue', playerId }));
    }
    postJson('/api/matchmaking/leave', { playerId }).catch(() => {});
    setMode('lobby');
  };

  // 2. Create Private Room for Friend
  const handleCreateRoom = async () => {
    sound.playClick();
    setIsBotMatch(false);
    localStorage.setItem('b11_my_player_name', playerName);
    resetSyncState();

    try {
      const { ok, data } = await postJson('/api/rooms/create', { playerId, playerName, gameType });
      if (!ok || !data) throw new Error('create failed');
      applySnapshot(data);
    } catch {
      flashNotice('تعذر الاتصال بالسيرفر لإنشاء الغرفة.');
    }
  };

  // 3. Join Room
  const handleJoinRoom = async (codeToJoin?: string) => {
    const code = (codeToJoin || customRoomInput || '').trim().toUpperCase();
    if (!code) return;
    sound.playClick();
    setIsBotMatch(false);
    localStorage.setItem('b11_my_player_name', playerName);
    resetSyncState();

    try {
      const { ok, data } = await postJson('/api/rooms/join', { roomId: code, playerId, playerName });
      if (!ok || !data || !data.status) {
        sound.playWrong();
        flashNotice((data && data.error) || 'تعذر الانضمام للغرفة.');
        return;
      }
      applySnapshot(data);
    } catch {
      flashNotice('تعذر الاتصال بالسيرفر.');
    }
  };

  // 4. Start Match from Waiting Room
  const handleStartMatch = async () => {
    if (isBotMatch) {
      setMode('playing');
      setCurrentRound(0);
      setBuzzedPlayerId(null);
      setRoundResult(null);
      sound.playWhistle(true);
      triggerBotTurn();
      return;
    }
    if (!roomId) return;
    try {
      const { ok, data } = await postJson('/api/rooms/start', { roomId });
      if (ok && data) applySnapshot(data);
    } catch {
      flashNotice('تعذر بدء المباراة، حاول مرة أخرى.');
    }
  };

  // 5. Simulated Bot Match (Offline or Instant fallback)
  const handleStartTestMatch = () => {
    sound.playWhistle(true);
    if (matchmakingPollRef.current) clearInterval(matchmakingPollRef.current);
    resetSyncState();
    setIsBotMatch(true);
    const generatedRoom = 'B11-TEST' + Math.floor(100 + Math.random() * 900);
    setRoomId(generatedRoom);
    const mockPlayers: RemotePlayer[] = [
      { id: playerId, name: playerName || 'أنت', score: 0, isHost: true },
      { id: 'bot-opponent', name: 'الكابتن سيف (محاكي ذكي 🤖)', score: 0, isHost: false },
    ];
    setRoomPlayers(mockPlayers);
    setCurrentRound(0);
    setTotalRounds(5);
    setServerChallenge(gameType === 'trivia' ? triviaList[0] : eyesList[0]);
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

    const correct = answerOf(challengeRef.current, gameTypeRef.current);
    if (isCorrect) {
      sound.playCorrect();
      setTimeout(() => sound.playStadiumRoar(), 200);
      confetti({ particleCount: 70, spread: 60 });
      setRoundResult(`إجابة صحيحة! ${gameTypeRef.current === 'trivia' ? 'الإجابة' : 'اللاعب هو'}: ${correct}`);
    } else {
      sound.playWrong();
      setRoundResult(`إجابة خاطئة! نقطة مجانية للطرف الآخر. الإجابة الصحيحة: ${correct}`);
    }
  };

  // Buzzer Click
  const handleBuzzer = async () => {
    if (buzzedPlayerId !== null || roundResult) return;

    if (isBotMatch) {
      if (botTimerRef.current) clearTimeout(botTimerRef.current);
      setBuzzedPlayerId(playerId);
      setBuzzedPlayerName(playerName);
      sound.playTick(true);
      return;
    }

    sound.playClick();
    // Show the press immediately; the server reply (or the next poll) confirms who really won
    try {
      const { ok, data } = await postJson('/api/matchmaking/buzz', { roomId, playerId });
      if (ok && data) {
        if (data.success) {
          applySnapshot(await fetchSnapshot());
        } else {
          flashNotice('الخصم سبقك للبازر! ⚡');
          pollRoom();
        }
      }
    } catch {
      flashNotice('تعذر الاتصال بالسيرفر، حاول مرة أخرى.');
    }
  };

  const fetchSnapshot = async () => {
    const res = await fetch(apiUrl(`/api/rooms/${encodeURIComponent(roomIdRef.current)}`), { cache: 'no-store' });
    return res.ok ? await res.json() : null;
  };

  // Submit Answer
  const handleAnswer = async (option: string) => {
    if (buzzedPlayerId !== playerId) return;
    const isCorrect = option === answerOf(currentChallenge, gameType);

    if (isBotMatch) {
      resolveRound(playerId, isCorrect);
      return;
    }

    try {
      const { ok } = await postJson('/api/matchmaking/answer', { roomId, playerId, isCorrect });
      if (ok) applySnapshot(await fetchSnapshot());
    } catch {
      flashNotice('تعذر إرسال الإجابة، حاول مرة أخرى.');
    }
  };

  // Next Round
  const handleNextRound = async () => {
    if (isBotMatch) {
      const nextR = currentRound + 1;
      if (nextR >= 5) {
        setMode('game_over');
        sound.playFanfare();
        confetti({ particleCount: 150, spread: 100 });
      } else {
        setCurrentRound(nextR);
        setServerChallenge(gameType === 'trivia' ? triviaList[nextR % triviaList.length] : eyesList[nextR % eyesList.length]);
        setBuzzedPlayerId(null);
        setRoundResult(null);
        sound.playWhistle(true);
        triggerBotTurn();
      }
      return;
    }

    try {
      const { ok } = await postJson('/api/matchmaking/next', { roomId });
      if (ok) applySnapshot(await fetchSnapshot());
    } catch {
      flashNotice('تعذر الانتقال للجولة التالية، حاول مرة أخرى.');
    }
  };

  // Live Reactions
  const sendReaction = (emoji: string) => {
    sound.playClick();
    setActiveReaction({ emoji, from: playerId });
    setTimeout(() => setActiveReaction(null), 2500);

    if (!isBotMatch && socketRef.current && socketRef.current.readyState === WebSocket.OPEN && roomId) {
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

          {/* Game type: trivia or eyes challenge */}
          <div className="w-full mb-4">
            <label className="block text-xs font-bold text-gray-300 mb-1">اختر نوع التحدي:</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => chooseGameType('trivia')}
                className={`p-3 rounded-2xl border-2 text-center transition cursor-pointer active:scale-95 ${
                  gameType === 'trivia'
                    ? 'bg-amber-400/15 border-amber-400 text-amber-300 shadow-[0_0_18px_rgba(251,191,36,0.35)]'
                    : 'bg-black/50 border-white/10 text-gray-300 hover:border-amber-400/50'
                }`}
              >
                <span className="block text-2xl mb-0.5">🧠</span>
                <span className="block text-sm font-black">الفوازير</span>
                <span className="block text-[10px] text-gray-400">أسئلة ثقافة كروية</span>
              </button>
              <button
                type="button"
                onClick={() => chooseGameType('eyes')}
                className={`p-3 rounded-2xl border-2 text-center transition cursor-pointer active:scale-95 ${
                  gameType === 'eyes'
                    ? 'bg-cyan-400/15 border-cyan-400 text-cyan-300 shadow-[0_0_18px_rgba(34,211,238,0.35)]'
                    : 'bg-black/50 border-white/10 text-gray-300 hover:border-cyan-400/50'
                }`}
              >
                <span className="block text-2xl mb-0.5">👁️</span>
                <span className="block text-sm font-black">تحدي العيون</span>
                <span className="block text-[10px] text-gray-400">خمّن اللاعب من عينيه</span>
              </button>
            </div>
            <p className="text-[10px] text-gray-500 text-center mt-1.5">
              البحث التلقائي يطابقك مع لاعب اختار نفس التحدي.
            </p>
          </div>

          {/* MAIN ACTION: Search for Real Person */}
          <button
            onClick={handleFindMatch}
            className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-emerald-400 via-lime-400 to-cyan-400 hover:brightness-110 text-black font-black text-sm flex items-center justify-center gap-2 shadow-[0_0_30px_rgba(52,211,153,0.4)] active:scale-95 transition cursor-pointer mb-3"
          >
            <Globe className="w-5 h-5 text-black" />
            <span>البحث عن شخص حقيقي ({isTrivia ? 'الفوازير' : 'تحدي العيون'}) ⚡</span>
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
                      <span className="text-[10px] text-gray-400 font-mono">
                        {r.id} · {r.gameType === 'trivia' ? '🧠 فوازير' : '👁️ عيون'}
                      </span>
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
          <span className="text-[11px] font-bold text-cyan-300 mb-2">
            نوع التحدي: {isTrivia ? '🧠 الفوازير' : '👁️ تحدي العيون'}
          </span>
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
            <span>الجولة: {currentRound + 1} من {isBotMatch ? 5 : totalRounds}</span>
            <span className="text-cyan-400">{isTrivia ? 'فوازير كروية 🧠' : 'من يملك هذه العيون؟'}</span>
          </div>

          {isTrivia ? (
            <div className="w-full p-5 rounded-3xl bg-gradient-to-b from-neutral-900 to-black border border-amber-400/40 text-center shadow-xl">
              <span className="inline-block mb-2 px-3 py-0.5 rounded-full bg-amber-400/15 border border-amber-400/40 text-[10px] font-bold text-amber-300">
                {asTrivia(currentChallenge).category || 'فوازير'} · {asTrivia(currentChallenge).difficulty || ''}
              </span>
              <p className="text-base sm:text-lg font-black text-white leading-relaxed">
                {asTrivia(currentChallenge).question}
              </p>
              {roundResult && asTrivia(currentChallenge).explanation && (
                <p className="mt-3 text-xs text-gray-300 leading-relaxed">{asTrivia(currentChallenge).explanation}</p>
              )}
            </div>
          ) : (
            <PlayerEyeViewer
              player={asPlayer(currentChallenge)}
              revealLevel={roundResult ? 'full' : 'eyes'}
              canRevealMore={false}
            />
          )}

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
                {optionsOf(currentChallenge).map((opt, i) => (
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
