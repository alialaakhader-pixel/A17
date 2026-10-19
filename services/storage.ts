// Local Storage & Server Persistence Manager for Leaderboard, Custom Players, and Trivia
import { PLAYERS_LIST, GENERAL_TRIVIA, FootballPlayer, TriviaQuestion } from '../data/playersData';
import { safeStorage } from './safeStorage';

export interface LeaderboardEntry {
  id: string;
  name: string;
  score: number;
  mode: 'eyes' | 'trivia' | 'total';
  date: string;
  rankBadge: string;
  avatar: string;
}

const LEADERBOARD_KEY = 'b11_football_leaderboard';
const CUSTOM_PLAYERS_KEY = 'b11_custom_players';
const CUSTOM_TRIVIA_KEY = 'b11_custom_trivia';
const DELETED_TRIVIA_KEY = 'b11_deleted_trivia';
const PHOTO_OVERRIDES_KEY = 'b11_player_photo_overrides';

const INITIAL_LEADERBOARD: LeaderboardEntry[] = [
  { id: 'lb-1', name: 'الكابتن طارق - عين الصقر', score: 1480, mode: 'eyes', date: 'اليوم', rankBadge: '🥇 المركز الأول', avatar: '🦅' },
  { id: 'lb-2', name: 'أحمد التكتيكي', score: 1320, mode: 'eyes', date: 'أمس', rankBadge: '🥈 المركز الثاني', avatar: '⚡' },
  { id: 'lb-3', name: 'عمر فوت B11', score: 1190, mode: 'eyes', date: 'منذ يومين', rankBadge: '🥉 المركز الثالث', avatar: '⚽' },
  { id: 'lb-4', name: 'ياسين الملكي', score: 1040, mode: 'eyes', date: 'منذ أسبوع', rankBadge: '⭐ محلل محترف', avatar: '👑' },
  { id: 'lb-5', name: 'موسوعة التشامبيونز', score: 1250, mode: 'trivia', date: 'اليوم', rankBadge: '🥇 ملك الفوازير', avatar: '🏆' },
  { id: 'lb-6', name: 'زياد الكروي', score: 960, mode: 'trivia', date: 'أمس', rankBadge: '🥈 وصيف الفوازير', avatar: '🧠' },
];

// In-memory cache for ultra-fast UI rendering
let cachedPlayers: FootballPlayer[] | null = null;
let cachedTrivia: TriviaQuestion[] | null = null;
let cachedLeaderboard: LeaderboardEntry[] | null = null;

let lastTriviaVersion = 0;
let lastPlayersVersion = 0;

// Subscribers for real-time live data updates
const subscribers: (() => void)[] = [];

export function subscribeToDataChanges(callback: () => void): () => void {
  subscribers.push(callback);
  return () => {
    const idx = subscribers.indexOf(callback);
    if (idx !== -1) subscribers.splice(idx, 1);
  };
}

function notifySubscribers() {
  subscribers.forEach((cb) => {
    try { cb(); } catch (e) { console.error('Subscriber error', e); }
  });
}

// Global server sync
export async function syncFromServer(): Promise<void> {
  try {
    const [triviaRes, playersRes, lbRes] = await Promise.allSettled([
      fetch('/api/trivia', { cache: 'no-store' }),
      fetch('/api/players', { cache: 'no-store' }),
      fetch('/api/leaderboard', { cache: 'no-store' }),
    ]);

    let changed = false;

    if (triviaRes.status === 'fulfilled' && triviaRes.value.ok) {
      const serverTrivia: TriviaQuestion[] = await triviaRes.value.json();
      if (Array.isArray(serverTrivia) && serverTrivia.length > 0) {
        cachedTrivia = serverTrivia;
        safeStorage.setItem(CUSTOM_TRIVIA_KEY, JSON.stringify(serverTrivia));
        changed = true;
      }
    }

    if (playersRes.status === 'fulfilled' && playersRes.value.ok) {
      const serverPlayers: FootballPlayer[] = await playersRes.value.json();
      if (Array.isArray(serverPlayers) && serverPlayers.length > 0) {
        cachedPlayers = serverPlayers;
        safeStorage.setItem(CUSTOM_PLAYERS_KEY, JSON.stringify(serverPlayers));
        changed = true;
      }
    }

    if (lbRes.status === 'fulfilled' && lbRes.value.ok) {
      const serverLb: LeaderboardEntry[] = await lbRes.value.json();
      if (Array.isArray(serverLb) && serverLb.length > 0) {
        cachedLeaderboard = serverLb;
        safeStorage.setItem(LEADERBOARD_KEY, JSON.stringify(serverLb));
        changed = true;
      }
    }

    if (changed) {
      notifySubscribers();
    }
  } catch (err) {
    // Network offline fallback to local storage
  }
}

// Real-Time Background Synchronization Service for All Players
export function startRealtimeSync() {
  if (typeof window === 'undefined') return;

  function connectWs() {
    try {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws`;
      const ws = new WebSocket(wsUrl);

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);

          // 1. Instant Trivia Question Added by Owner
          if (msg.type === 'trivia_added' && msg.question) {
            const current = getAllTrivia();
            const filtered = current.filter((q) => q.id !== msg.question.id);
            const updated = [msg.question, ...filtered];
            cachedTrivia = updated;
            safeStorage.setItem(CUSTOM_TRIVIA_KEY, JSON.stringify(updated));
            notifySubscribers();
            window.dispatchEvent(new CustomEvent('b11_question_added', { detail: msg.question }));
          }

          // 2. Instant Player Added by Owner
          if (msg.type === 'player_added' && msg.player) {
            const current = getAllPlayers();
            const filtered = current.filter((p) => p.id !== msg.player.id);
            const updated = [msg.player, ...filtered];
            cachedPlayers = updated;
            safeStorage.setItem(CUSTOM_PLAYERS_KEY, JSON.stringify(updated));
            notifySubscribers();
            window.dispatchEvent(new CustomEvent('b11_player_added', { detail: msg.player }));
          }

          // 3. Trivia Deleted
          if (msg.type === 'trivia_deleted') {
            const current = getAllTrivia();
            const updated = current.filter((q) => q.id !== msg.id);
            cachedTrivia = updated;
            safeStorage.setItem(CUSTOM_TRIVIA_KEY, JSON.stringify(updated));
            notifySubscribers();
          }

          // 4. Player Deleted
          if (msg.type === 'player_deleted') {
            const current = getAllPlayers();
            const updated = current.filter((p) => p.id !== msg.id);
            cachedPlayers = updated;
            safeStorage.setItem(CUSTOM_PLAYERS_KEY, JSON.stringify(updated));
            notifySubscribers();
          }

          // 5. Leaderboard Updated
          if (msg.type === 'leaderboard_updated' && msg.entry) {
            const current = getLeaderboard();
            const updated = [msg.entry, ...current.filter((e) => e.id !== msg.entry.id)].sort((a, b) => b.score - a.score);
            cachedLeaderboard = updated;
            safeStorage.setItem(LEADERBOARD_KEY, JSON.stringify(updated));
            notifySubscribers();
          }
        } catch {
          // ignore
        }
      };

      ws.onclose = () => {
        setTimeout(connectWs, 4000);
      };
      ws.onerror = () => {
        try { ws.close(); } catch {}
      };
    } catch {
      setTimeout(connectWs, 5000);
    }
  }

  connectWs();

  // Periodic Version Poller fallback every 4 seconds (checks if owner published new questions/players)
  setInterval(async () => {
    try {
      const [tRes, pRes] = await Promise.allSettled([
        fetch('/api/trivia/version', { cache: 'no-store' }),
        fetch('/api/players/version', { cache: 'no-store' }),
      ]);

      let needSync = false;
      if (tRes.status === 'fulfilled' && tRes.value.ok) {
        const tData = await tRes.value.json();
        if (lastTriviaVersion !== 0 && tData.version !== lastTriviaVersion) {
          needSync = true;
        }
        lastTriviaVersion = tData.version;
      }

      if (pRes.status === 'fulfilled' && pRes.value.ok) {
        const pData = await pRes.value.json();
        if (lastPlayersVersion !== 0 && pData.version !== lastPlayersVersion) {
          needSync = true;
        }
        lastPlayersVersion = pData.version;
      }

      if (needSync) {
        syncFromServer();
      }
    } catch {
      // offline
    }
  }, 4000);
}

// Background auto-sync on load
if (typeof window !== 'undefined') {
  syncFromServer();
  startRealtimeSync();
}

// --- Leaderboard ---
export function getLeaderboard(mode?: 'eyes' | 'trivia' | 'total'): LeaderboardEntry[] {
  try {
    let list: LeaderboardEntry[] = cachedLeaderboard || [];
    if (list.length === 0) {
      const raw = safeStorage.getItem(LEADERBOARD_KEY);
      list = raw ? JSON.parse(raw) : INITIAL_LEADERBOARD;
      cachedLeaderboard = list;
    }
    if (mode && mode !== 'total') {
      list = list.filter((item) => item.mode === mode);
    }
    return list.sort((a, b) => b.score - a.score);
  } catch {
    return INITIAL_LEADERBOARD;
  }
}

export function saveLeaderboardEntry(entry: Omit<LeaderboardEntry, 'id' | 'date'>): LeaderboardEntry[] {
  try {
    const current = getLeaderboard();
    const newEntry: LeaderboardEntry = {
      ...entry,
      id: 'lb-' + Date.now(),
      date: new Date().toLocaleDateString('ar-EG', { month: 'short', day: 'numeric' }),
    };
    const updated = [newEntry, ...current].sort((a, b) => b.score - a.score).slice(0, 100);
    cachedLeaderboard = updated;
    safeStorage.setItem(LEADERBOARD_KEY, JSON.stringify(updated));

    // Async push to server
    fetch('/api/leaderboard', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newEntry),
    }).catch(() => {});

    notifySubscribers();
    return updated;
  } catch {
    return INITIAL_LEADERBOARD;
  }
}

export function resetLeaderboard(): LeaderboardEntry[] {
  try {
    cachedLeaderboard = INITIAL_LEADERBOARD;
    safeStorage.setItem(LEADERBOARD_KEY, JSON.stringify(INITIAL_LEADERBOARD));
    notifySubscribers();
  } catch {
    // Graceful
  }
  return INITIAL_LEADERBOARD;
}

// --- Photo Overrides ---
export function getPhotoOverrides(): Record<string, string> {
  try {
    const raw = safeStorage.getItem(PHOTO_OVERRIDES_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function savePlayerPhotoOverride(playerId: string, photoUrl: string): void {
  try {
    const current = getPhotoOverrides();
    current[playerId] = photoUrl;
    safeStorage.setItem(PHOTO_OVERRIDES_KEY, JSON.stringify(current));
    cachedPlayers = null;
    notifySubscribers();
  } catch {
    // Fallback
  }
}

// --- Players ---
export function getAllPlayers(): FootballPlayer[] {
  try {
    if (cachedPlayers && cachedPlayers.length > 0) {
      return cachedPlayers;
    }

    const raw = safeStorage.getItem(CUSTOM_PLAYERS_KEY);
    const custom: FootballPlayer[] = raw ? JSON.parse(raw) : [];
    const overrides = getPhotoOverrides();

    const customIds = new Set(custom.map((p) => p.id));
    const merged = [...custom, ...PLAYERS_LIST.filter((p) => !customIds.has(p.id))].map((player) => {
      if (overrides[player.id]) {
        return { ...player, photoUrl: overrides[player.id] };
      }
      return player;
    });

    cachedPlayers = merged;
    return merged;
  } catch {
    return PLAYERS_LIST;
  }
}

export function saveCustomPlayer(player: FootballPlayer): FootballPlayer[] {
  try {
    const current = getAllPlayers();
    const updated = [player, ...current.filter((p) => p.id !== player.id)];
    cachedPlayers = updated;
    safeStorage.setItem(CUSTOM_PLAYERS_KEY, JSON.stringify(updated));

    // Instant async push to server (Owner Mode)
    fetch('/api/players', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(player),
    }).catch((err) => console.error('Failed to post player to server', err));

    notifySubscribers();
    return updated;
  } catch {
    return PLAYERS_LIST;
  }
}

export function deleteCustomPlayer(playerId: string): FootballPlayer[] {
  try {
    const current = getAllPlayers();
    const updated = current.filter((p) => p.id !== playerId);
    cachedPlayers = updated;
    safeStorage.setItem(CUSTOM_PLAYERS_KEY, JSON.stringify(updated));

    fetch(`/api/players/${playerId}`, { method: 'DELETE' }).catch(() => {});
    notifySubscribers();
    return updated;
  } catch {
    return PLAYERS_LIST;
  }
}

// --- Trivia ---
export function getDeletedTriviaIds(): string[] {
  try {
    const raw = safeStorage.getItem(DELETED_TRIVIA_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function getAllTrivia(): TriviaQuestion[] {
  try {
    if (cachedTrivia && cachedTrivia.length > 0) {
      return cachedTrivia;
    }

    const rawCustom = safeStorage.getItem(CUSTOM_TRIVIA_KEY);
    const custom: TriviaQuestion[] = rawCustom ? JSON.parse(rawCustom) : [];
    const deletedIds = new Set(getDeletedTriviaIds());

    const customIds = new Set(custom.map((q) => q.id));
    const combined = [...custom, ...GENERAL_TRIVIA.filter((q) => !customIds.has(q.id))];
    const filtered = combined.filter((q) => !deletedIds.has(q.id));

    cachedTrivia = filtered;
    return filtered;
  } catch {
    return GENERAL_TRIVIA;
  }
}

export function saveCustomTrivia(question: TriviaQuestion): TriviaQuestion[] {
  try {
    const current = getAllTrivia();
    const updated = [question, ...current.filter((q) => q.id !== question.id)];
    cachedTrivia = updated;
    safeStorage.setItem(CUSTOM_TRIVIA_KEY, JSON.stringify(updated));

    const deleted = getDeletedTriviaIds().filter((id) => id !== question.id);
    safeStorage.setItem(DELETED_TRIVIA_KEY, JSON.stringify(deleted));

    // Instant async push to server (Owner Mode)
    fetch('/api/trivia', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(question),
    })
      .then((res) => res.json())
      .then((data) => {
        console.log('[Storage] Question successfully persisted & broadcasted to all players:', data);
      })
      .catch((err) => console.error('Failed to post trivia to server', err));

    notifySubscribers();
    return updated;
  } catch {
    return GENERAL_TRIVIA;
  }
}

export function deleteTrivia(questionId: string): TriviaQuestion[] {
  try {
    const current = getAllTrivia();
    const updated = current.filter((q) => q.id !== questionId);
    cachedTrivia = updated;
    safeStorage.setItem(CUSTOM_TRIVIA_KEY, JSON.stringify(updated));

    const deletedIds = getDeletedTriviaIds();
    if (!deletedIds.includes(questionId)) {
      deletedIds.push(questionId);
      safeStorage.setItem(DELETED_TRIVIA_KEY, JSON.stringify(deletedIds));
    }

    fetch(`/api/trivia/${questionId}`, { method: 'DELETE' }).catch(() => {});
    notifySubscribers();
    return updated;
  } catch {
    return GENERAL_TRIVIA;
  }
}

export function deleteCustomTrivia(questionId: string): TriviaQuestion[] {
  return deleteTrivia(questionId);
}

export function resetTriviaToDefault(): TriviaQuestion[] {
  try {
    safeStorage.removeItem(CUSTOM_TRIVIA_KEY);
    safeStorage.removeItem(DELETED_TRIVIA_KEY);
    cachedTrivia = GENERAL_TRIVIA;
    notifySubscribers();
  } catch {
    // Graceful
  }
  return GENERAL_TRIVIA;
}

export function compressImageFile(file: File, maxDim = 800, quality = 0.82): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(e.target?.result as string);
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        resolve(dataUrl);
      };
      img.onerror = () => reject(new Error('فشل قراءة ملف الصورة'));
      img.src = e.target?.result as string;
    };
    reader.onerror = () => reject(new Error('فشل رفع الملف من المعرض'));
    reader.readAsDataURL(file);
  });
}
