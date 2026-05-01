import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

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

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(defaults);
  const [toast, setToast] = useState<Toast | null>(null);

  const showToast = useCallback((text: string) => {
    setToast({ id: Date.now(), text });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2000);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    const root = document.documentElement;
    if (settings.reducedMotion) root.classList.add('reduced-motion');
    else root.classList.remove('reduced-motion');
  }, [settings.reducedMotion]);

  const update = useCallback(
    <K extends keyof Settings>(key: K, value: Settings[K]) => {
      setSettings((prev) => {
        if (key === 'showInternalCostMetrics' && value === true && prev.showInternalCostMetrics === false) {
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
