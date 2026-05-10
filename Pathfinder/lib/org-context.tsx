'use client';

import { createContext, useContext } from 'react';
import type { Organization } from '@/lib/types';

interface OrgContextValue {
  org: Organization;
  userEmail: string;
  userRole: 'operator' | 'admin';
}

const OrgContext = createContext<OrgContextValue | null>(null);

export function OrgContextProvider({
  org,
  userEmail,
  userRole,
  children,
}: {
  org: Organization;
  userEmail: string;
  userRole: 'operator' | 'admin';
  children: React.ReactNode;
}) {
  return <OrgContext.Provider value={{ org, userEmail, userRole }}>{children}</OrgContext.Provider>;
}

export function useOrg(): OrgContextValue {
  const ctx = useContext(OrgContext);
  if (!ctx) throw new Error('useOrg must be called inside OrgContextProvider');
  return ctx;
}
