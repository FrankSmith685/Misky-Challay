import { useEffect, useState } from 'react';
import { hasLocalStorageFailure } from '@lib/storage';
export function LocalPersistenceNotice() {
  const [failed, setFailed] = useState(hasLocalStorageFailure);
  useEffect(() => { const fail = () => setFailed(true); const recover = () => setFailed(false); window.addEventListener('dulceflow:storage-error', fail); window.addEventListener('dulceflow:storage-restored', recover); return () => { window.removeEventListener('dulceflow:storage-error', fail); window.removeEventListener('dulceflow:storage-restored', recover); }; }, []);
  return failed ? <p role="alert" className="border-b border-amber-300 bg-amber-50 px-4 py-3 text-sm">El navegador no pudo guardar tus cambios. Mantén esta página abierta hasta guardar tu trabajo en la cuenta o recuperar el almacenamiento del dispositivo.</p> : null;
}
