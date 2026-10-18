// Local Storage Persistence Manager for Leaderboard, Custom Players, and Trivia
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
  {
    id: 'lb-1',
    name: 'الكابتن طارق - عين الصقر',
    score: 1480,
    mode: 'eyes',
    date: 'اليوم',
    rankBadge: '🥇 المركز الأول',
    avatar: '🦅',
  },
  {
    id: 'lb-2',
    name: 'أحمد التكتيكي',
    score: 1320,
    mode: 'eyes',
    date: 'أمس',
    rankBadge: '🥈 المركز الثاني',
    avatar: '⚡',
  },
  {
    id: 'lb-3',
    name: 'عمر فوت B11',
    score: 1190,
    mode: 'eyes',
    date: 'منذ يومين',
    rankBadge: '🥉 المركز الثالث',
    avatar: '⚽',
  },
  {
    id: 'lb-4',
    name: 'ياسين الملكي',
    score: 1040,
    mode: 'eyes',
    date: 'منذ أسبوع',
    rankBadge: '⭐ محلل محترف',
    avatar: '👑',
  },
  {
    id: 'lb-5',
    name: 'موسوعة التشامبيونز',
    score: 1250,
    mode: 'trivia',
    date: 'اليوم',
    rankBadge: '🥇 ملك الفوازير',
    avatar: '🏆',
  },
  {
    id: 'lb-6',
    name: 'زياد الكروي',
    score: 960,
    mode: 'trivia',
    date: 'أمس',
    rankBadge: '🥈 وصيف الفوازير',
    avatar: '🧠',
  },
];

export function getLeaderboard(mode?: 'eyes' | 'trivia' | 'total'): LeaderboardEntry[] {
  try {
    const raw = safeStorage.getItem(LEADERBOARD_KEY);
    let list: LeaderboardEntry[] = raw ? JSON.parse(raw) : INITIAL_LEADERBOARD;
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
    const updated = [newEntry, ...current].sort((a, b) => b.score - a.score).slice(0, 50);
    safeStorage.setItem(LEADERBOARD_KEY, JSON.stringify(updated));
    return updated;
  } catch {
    return INITIAL_LEADERBOARD;
  }
}

export function resetLeaderboard(): LeaderboardEntry[] {
  try {
    safeStorage.setItem(LEADERBOARD_KEY, JSON.stringify(INITIAL_LEADERBOARD));
  } catch {
    // Graceful
  }
  return INITIAL_LEADERBOARD;
}

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
  } catch {
    // Fallback
  }
}

export function getAllPlayers(): FootballPlayer[] {
  try {
    const raw = safeStorage.getItem(CUSTOM_PLAYERS_KEY);
    const custom: FootballPlayer[] = raw ? JSON.parse(raw) : [];
    const overrides = getPhotoOverrides();

    const merged = [...custom, ...PLAYERS_LIST].map((player) => {
      if (overrides[player.id]) {
        return { ...player, photoUrl: overrides[player.id] };
      }
      return player;
    });

    return merged;
  } catch {
    return PLAYERS_LIST;
  }
}

export function saveCustomPlayer(player: FootballPlayer): FootballPlayer[] {
  try {
    const raw = safeStorage.getItem(CUSTOM_PLAYERS_KEY);
    const custom: FootballPlayer[] = raw ? JSON.parse(raw) : [];
    const updated = [player, ...custom.filter((p) => p.id !== player.id)];
    safeStorage.setItem(CUSTOM_PLAYERS_KEY, JSON.stringify(updated));
    return getAllPlayers();
  } catch {
    return PLAYERS_LIST;
  }
}

export function deleteCustomPlayer(playerId: string): FootballPlayer[] {
  try {
    const raw = safeStorage.getItem(CUSTOM_PLAYERS_KEY);
    const custom: FootballPlayer[] = raw ? JSON.parse(raw) : [];
    const updated = custom.filter((p) => p.id !== playerId);
    safeStorage.setItem(CUSTOM_PLAYERS_KEY, JSON.stringify(updated));
    return getAllPlayers();
  } catch {
    return PLAYERS_LIST;
  }
}

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
    const rawCustom = safeStorage.getItem(CUSTOM_TRIVIA_KEY);
    const custom: TriviaQuestion[] = rawCustom ? JSON.parse(rawCustom) : [];
    const deletedIds = new Set(getDeletedTriviaIds());

    const combined = [...custom, ...GENERAL_TRIVIA];
    return combined.filter((q) => !deletedIds.has(q.id));
  } catch {
    return GENERAL_TRIVIA;
  }
}

export function saveCustomTrivia(question: TriviaQuestion): TriviaQuestion[] {
  try {
    const raw = safeStorage.getItem(CUSTOM_TRIVIA_KEY);
    const custom: TriviaQuestion[] = raw ? JSON.parse(raw) : [];
    const updated = [question, ...custom.filter((q) => q.id !== question.id)];
    safeStorage.setItem(CUSTOM_TRIVIA_KEY, JSON.stringify(updated));

    const deleted = getDeletedTriviaIds().filter((id) => id !== question.id);
    safeStorage.setItem(DELETED_TRIVIA_KEY, JSON.stringify(deleted));

    return getAllTrivia();
  } catch {
    return GENERAL_TRIVIA;
  }
}

export function deleteTrivia(questionId: string): TriviaQuestion[] {
  try {
    const rawCustom = safeStorage.getItem(CUSTOM_TRIVIA_KEY);
    const custom: TriviaQuestion[] = rawCustom ? JSON.parse(rawCustom) : [];
    const updatedCustom = custom.filter((q) => q.id !== questionId);
    safeStorage.setItem(CUSTOM_TRIVIA_KEY, JSON.stringify(updatedCustom));

    const deletedIds = getDeletedTriviaIds();
    if (!deletedIds.includes(questionId)) {
      deletedIds.push(questionId);
      safeStorage.setItem(DELETED_TRIVIA_KEY, JSON.stringify(deletedIds));
    }

    return getAllTrivia();
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
