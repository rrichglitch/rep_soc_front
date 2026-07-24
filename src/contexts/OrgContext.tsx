import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

interface OrgContextType {
  actingAsOrgId: bigint | null;
  actingAsOrgName: string;
  actingAsOrgPicture: string;
  setActingOrg: (id: bigint | null, name?: string, picture?: string) => void;
  clearActingOrg: () => void;
}

const OrgContext = createContext<OrgContextType>({
  actingAsOrgId: null,
  actingAsOrgName: '',
  actingAsOrgPicture: '',
  setActingOrg: () => {},
  clearActingOrg: () => {},
});

export const useOrg = () => useContext(OrgContext);

export function OrgProvider({ children }: { children: ReactNode }) {
  const [actingAsOrgId, setActingAsOrgId] = useState<bigint | null>(null);
  const [actingAsOrgName, setActingAsOrgName] = useState('');
  const [actingAsOrgPicture, setActingAsOrgPicture] = useState('');

  const setActingOrg = useCallback((id: bigint | null, name?: string, picture?: string) => {
    setActingAsOrgId(id);
    setActingAsOrgName(name || '');
    setActingAsOrgPicture(picture || '');
  }, []);

  const clearActingOrg = useCallback(() => {
    setActingAsOrgId(null);
    setActingAsOrgName('');
    setActingAsOrgPicture('');
  }, []);

  return (
    <OrgContext.Provider value={{ actingAsOrgId, actingAsOrgName, actingAsOrgPicture, setActingOrg, clearActingOrg }}>
      {children}
    </OrgContext.Provider>
  );
}
