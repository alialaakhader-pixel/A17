// Authentication and Gmail Account Sync Service
// Dedicated Owner Security & Score Linking
import { safeStorage } from './safeStorage';

export const OWNER_EMAIL = 'alialaakhader@gmail.com';

export interface UserAccount {
  email: string;
  name: string;
  avatar: string;
  isOwner: boolean;
  linkedAt: string;
}

const AUTH_STORAGE_KEY = 'b11_user_account';

export function getCurrentUser(): UserAccount | null {
  try {
    const raw = safeStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;
    const user: UserAccount = JSON.parse(raw);
    user.isOwner = user.email.toLowerCase().trim() === OWNER_EMAIL.toLowerCase().trim();
    return user;
  } catch {
    return null;
  }
}

export function isOwner(): boolean {
  try {
    const user = getCurrentUser();
    if (!user) return false;
    return user.email.toLowerCase().trim() === OWNER_EMAIL.toLowerCase().trim();
  } catch {
    return false;
  }
}

export function loginWithGmail(email: string, name?: string): UserAccount {
  try {
    const cleanEmail = (email || '').toLowerCase().trim();
    const displayName = name?.trim() || cleanEmail.split('@')[0] || 'لاعب';
    const isOwnerUser = cleanEmail === OWNER_EMAIL.toLowerCase().trim();

    const user: UserAccount = {
      email: cleanEmail,
      name: isOwnerUser ? 'المالك الرسمي (علي)' : displayName,
      avatar: isOwnerUser ? '👑' : '⚽',
      isOwner: isOwnerUser,
      linkedAt: new Date().toLocaleDateString('ar-EG'),
    };

    safeStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(user));
    safeStorage.setItem('b11_my_player_name', user.name);
    return user;
  } catch (e) {
    console.error('Error logging in with Gmail', e);
    return {
      email: (email || '').toLowerCase().trim(),
      name: name?.trim() || 'لاعب',
      avatar: '⚽',
      isOwner: false,
      linkedAt: 'الآن',
    };
  }
}

export function logout(): void {
  try {
    safeStorage.removeItem(AUTH_STORAGE_KEY);
  } catch {
    // Graceful
  }
}
