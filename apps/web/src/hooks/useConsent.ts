import { useCallback, useEffect, useState } from 'react';
import { hasConsented as readConsent, recordConsent } from '../lib/consent';

interface UseConsentValue {
  hasConsented: boolean;
  grant: () => Promise<void>;
  ready: boolean;
}

export function useConsent(): UseConsentValue {
  const [hasConsented, setHasConsented] = useState<boolean>(() => readConsent());
  const [ready, setReady] = useState<boolean>(false);

  useEffect(() => {
    setHasConsented(readConsent());
    setReady(true);
  }, []);

  const grant = useCallback(async () => {
    await recordConsent({ syncToServer: true });
    setHasConsented(true);
  }, []);

  return { hasConsented, grant, ready };
}
