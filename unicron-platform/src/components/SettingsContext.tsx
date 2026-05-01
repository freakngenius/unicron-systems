import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { loadLocal, loadRemote, saveLocal, saveRemote } from '../lib/settings';

export type ArchitectNotifications = 'all' | 'sources' | 'off';

export type Settings = {
  showInternalCostMetrics: boolean;
  hoverLabels: boolean;
  activityFeed: boolean;
  reducedMotion: boolean;
  architectNotifications: ArchitectNotifications;
  qualityAlerts: boolean;
  dailyDigest: boolean;
  autoAcceptTrustedSources: boolean;
  autoAcceptLowRiskTuning: boolean;
  confidenceThreshold: number;
};

const defaults: Settings = {
  showInternalCostMetrics: false,
  hoverLabels: true,
  activityFeed: true,
  reducedMotion: false,
  architectNotifications: 'all',
  qualityAlerts: true,
  dailyDigest: false,
  autoAcceptTrustedSources: false,
  autoAcceptLowRiskTuning: false,
  confidenceThreshold: 0.85,
};

type Toast = { id: number; text: string };

type SettingsContextValue = {
  settings: Settings;
  update: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
  toast: Toast | null;
  showToast: (text: string) => void;
};

const SettingsContext = createContext<SettingsContextValue | null>(null);

type ProviderProps = {
  children: ReactNode;
  /**
   * Optional Supabase auth user_id. When provided, settings are scoped to
   * that operator. When null/undefined, the sentinel anonymous key is used
   * so the same row is shared in local dev.
   */
  operatorKey?: string | null;
};

const REMOTE_DEBOUNCE_MS = 800;

export function SettingsProvider({ children, operatorKey = null }: ProviderProps) {
  const [settings, setSettings] = useState<Settings>(() => {
    const cached = loadLocal();
    return cached ? { ...defaults, ...(cached as Partial<Settings>) } : defaults;
  });
  const [toast, setToast] = useState<Toast | null>(null);
  const remoteWriteTimer = useRef<number | null>(null);

  const showToast = useCallback((text: string) => {
    setToast({ id: Date.now(), text });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 2000);
    return () => window.clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    const root = document.documentElement;
    if (settings.reducedMotion) root.classList.add('reduced-motion');
    else root.classList.remove('reduced-motion');
  }, [settings.reducedMotion]);

  // On mount: hydrate from Supabase, replacing the localStorage snapshot.
  useEffect(() => {
    let cancelled = false;
    loadRemote(operatorKey).then((remote) => {
      if (cancelled || !remote) return;
      setSettings((curr) => ({ ...curr, ...(remote as Partial<Settings>) }));
    });
    return () => {
      cancelled = true;
    };
  }, [operatorKey]);

  // On settings change: cache locally immediately, schedule a debounced
  // remote upsert. Skip the very first effect tick to avoid an unnecessary
  // upsert when nothing changed since hydration.
  const skipFirst = useRef(true);
  useEffect(() => {
    saveLocal(settings as unknown as Record<string, unknown>);
    if (skipFirst.current) {
      skipFirst.current = false;
      return;
    }
    if (remoteWriteTimer.current) {
      window.clearTimeout(remoteWriteTimer.current);
    }
    remoteWriteTimer.current = window.setTimeout(() => {
      saveRemote(operatorKey, settings as unknown as Record<string, unknown>);
    }, REMOTE_DEBOUNCE_MS);
    return () => {
      if (remoteWriteTimer.current) {
        window.clearTimeout(remoteWriteTimer.current);
        remoteWriteTimer.current = null;
      }
    };
  }, [settings, operatorKey]);

  const update = useCallback(
    <K extends keyof Settings>(key: K, value: Settings[K]) => {
      setSettings((prev) => {
        if (
          key === 'showInternalCostMetrics' &&
          value === true &&
          prev.showInternalCostMetrics === false
        ) {
          showToast('internal cost metrics visible');
        }
        return { ...prev, [key]: value };
      });
    },
    [showToast],
  );

  const value = useMemo(
    () => ({ settings, update, toast, showToast }),
    [settings, update, toast, showToast],
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used within SettingsProvider');
  return ctx;
}
