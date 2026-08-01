import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import { orgAccountIdentityHex } from '../utils/spacetime';

export interface ActiveOrg {
  id: bigint;
  name: string;
  picture: string;
  city: string;
  description: string;
  identity: string; // deterministic org account identity (0x4f + id)
}

interface OrgContextType {
  activeOrg: ActiveOrg | null;
  loginAsOrg: (org: { id: bigint; name: string; picture?: string; city?: string; description?: string }) => void;
  logoutOrg: () => void;
}

const OrgContext = createContext<OrgContextType>({
  activeOrg: null,
  loginAsOrg: () => {},
  logoutOrg: () => {},
});

export const useOrg = () => useContext(OrgContext);

export function OrgProvider({ children }: { children: ReactNode }) {
  const [activeOrg, setActiveOrg] = useState<ActiveOrg | null>(null);

  const loginAsOrg = useCallback((org: { id: bigint; name: string; picture?: string; city?: string; description?: string }) => {
    setActiveOrg({
      id: org.id,
      name: org.name,
      picture: org.picture || '',
      city: org.city || '',
      description: org.description || '',
      identity: orgAccountIdentityHex(org.id),
    });
  }, []);

  const logoutOrg = useCallback(() => {
    setActiveOrg(null);
  }, []);

  return (
    <OrgContext.Provider value={{ activeOrg, loginAsOrg, logoutOrg }}>
      {children}
    </OrgContext.Provider>
  );
}
