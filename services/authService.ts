// Authentication and Gmail Account Sync Service
// Dedicated Owner Security & Score Linking
import { safeStorage } from './safeStorage';

export const OWNER_EMAILS = [
  'alialaakhader@gmail.com',
  'fcmopile75@gmail.com',
];

export interface UserAccount {
  email: string;
  name: string;
  avatar: string;
  isOwner: boolean;
  linkedAt: string;
}

const AUTH_STORAGE_KEY = 'b11_user_account';
const OWNER_OVERRIDE_KEY = 'b11_owner_mode_active';

export function isOwnerEmail(email?: string | null): boolean {
  if (!email) return false;
  const clean = email.toLowerCase().trim();
  return OWNER_EMAILS.some((owner) => owner.toLowerCase().trim() === clean);
}

export function getCurrentUser(): UserAccount | null {
  try {
    const raw = safeStorage.getItem(AUTH_STORAGE_KEY);
    const override = safeStorage.getItem(OWNER_OVERRIDE_KEY) === 'true';

    if (!raw) {
      if (override) {
        return {
          email: 'fcmopile75@gmail.com',
          name: 'مالك التطبيق 👑',
          avatar: '👑',
          isOwner: true,
          linkedAt: 'الآن',
        };
      }
      return null;
    }

    const user: UserAccount = JSON.parse(raw);
    user.isOwner = isOwnerEmail(user.email) || override;
    return user;
  } catch {
    return null;
  }
}

export function isOwner(): boolean {
  try {
    if (safeStorage.getItem(OWNER_OVERRIDE_KEY) === 'true') {
      return true;
    }
    const user = getCurrentUser();
    if (!user) return false;
    return user.isOwner || isOwnerEmail(user.email);
  } catch {
    return false;
  }
}

export function setOwnerModeOverride(active: boolean): void {
  try {
    if (active) {
      safeStorage.setItem(OWNER_OVERRIDE_KEY, 'true');
      if (!safeStorage.getItem(AUTH_STORAGE_KEY)) {
        loginWithGmail('fcmopile75@gmail.com', 'مالك التطبيق 👑');
      }
    } else {
      safeStorage.removeItem(OWNER_OVERRIDE_KEY);
    }
  } catch {
    // Fallback
  }
}

export function loginWithGmail(email: string, name?: string): UserAccount {
  try {
    const cleanEmail = (email || '').toLowerCase().trim();
    const isOwnerUser = isOwnerEmail(cleanEmail);
    const displayName = name?.trim() || (isOwnerUser ? 'مالك التطبيق 👑' : cleanEmail.split('@')[0] || 'لاعب');

    const user: UserAccount = {
      email: cleanEmail,
      name: displayName,
      avatar: isOwnerUser ? '👑' : '⚽',
      isOwner: isOwnerUser,
      linkedAt: new Date().toLocaleDateString('ar-EG'),
    };

    if (isOwnerUser) {
      safeStorage.setItem(OWNER_OVERRIDE_KEY, 'true');
    }

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
    safeStorage.removeItem(OWNER_OVERRIDE_KEY);
  } catch {
    // Graceful
  }
}
