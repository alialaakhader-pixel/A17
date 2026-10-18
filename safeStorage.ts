// Safe Storage Wrapper with In-Memory Fallback
// Prevents SecurityError or QuotaExceededError in restricted webviews or iframes

const memoryStore = new Map<string, string>();

export const safeStorage = {
  getItem(key: string): string | null {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        return window.localStorage.getItem(key);
      }
    } catch {
      // Fallback to memory
    }
    return memoryStore.get(key) || null;
  },

  setItem(key: string, value: string): boolean {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(key, value);
        return true;
      }
    } catch {
      // Fallback to memory
    }
    memoryStore.set(key, value);
    return true;
  },

  removeItem(key: string): boolean {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.removeItem(key);
      }
    } catch {
      // Fallback
    }
    memoryStore.delete(key);
    return true;
  },
};
