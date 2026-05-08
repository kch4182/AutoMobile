const LOCK_KEY = 'autoMobile_deviceLock';
const LOCK_TTL_MS = 120_000;

interface DeviceLockPayload {
  owner: string;
  page: 'play' | 'studio';
  expiresAt: number;
}

const getTabId = () => {
  const key = 'autoMobile_tabId';
  const existing = sessionStorage.getItem(key);
  if (existing) return existing;
  const next = `tab_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  sessionStorage.setItem(key, next);
  return next;
};

const readLock = (): DeviceLockPayload | null => {
  const raw = localStorage.getItem(LOCK_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as DeviceLockPayload;
    if (!parsed.owner || parsed.expiresAt < Date.now()) {
      localStorage.removeItem(LOCK_KEY);
      return null;
    }
    return parsed;
  } catch {
    localStorage.removeItem(LOCK_KEY);
    return null;
  }
};

export const acquireDeviceLock = (page: DeviceLockPayload['page']) => {
  const owner = getTabId();
  const current = readLock();
  if (current && current.owner !== owner) return false;
  localStorage.setItem(LOCK_KEY, JSON.stringify({ owner, page, expiresAt: Date.now() + LOCK_TTL_MS }));
  return true;
};

export const refreshDeviceLock = (page: DeviceLockPayload['page']) => acquireDeviceLock(page);

export const releaseDeviceLock = () => {
  const current = readLock();
  if (current?.owner === getTabId()) localStorage.removeItem(LOCK_KEY);
};

export const isDeviceLockedByOtherTab = () => {
  const current = readLock();
  return Boolean(current && current.owner !== getTabId());
};
