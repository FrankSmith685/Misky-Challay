import { useEffect, useRef, useState } from 'react';
import toast from '@components/mui/MuiToast';
import { useAppSelector } from '@app/hooks';
import { useAppState, type AppState } from '@context/AppStateContext';
import { accountApi, type PurchaseContextInput } from '@features/account/services/account.service';
import { geoApi } from '@features/geo/services/geo.service';

/**
 * PUENTE ENTRE EL NAVEGADOR Y LA CUENTA
 * ---------------------------------------------------------------------------
 * El contexto de compra (direccion activa, local de recojo, modalidad) vive en
 * localStorage, que es de UN navegador. Sin esto, entrar desde otro equipo —o
 * simplemente volver tras cerrar sesion— pedia elegir direccion otra vez aunque
 * el cliente ya la tuviera guardada.
 *
 * Dos sentidos, con una regla de precedencia clara:
 *
 *  - HIDRATAR: al identificarse, se baja lo ultimo que uso. Un invitado puede
 *    conservar un destino temporal en este navegador para completar su compra.
 *  - SUBIR: cada seleccion completa se guarda en su cuenta.
 *
 * La cobertura nunca se hereda del servidor: se vuelve a preguntar por las zonas
 * vigentes antes de aplicar una direccion (RN-001). Una zona pudo cambiar.
 */
export const PurchaseContextSync = () => {
  const userId = useAppSelector((state) => state.auth.user?.id ?? null);
  const {
    cityId,
    address,
    branchId,
    pickupBranch,
    deliveryType,
    hasCoverage,
    selectDelivery,
    selectPickup,
    reset,
  } = useAppState();

  const [isHydrated, setIsHydrated] = useState(false);
  const hydratedFor = useRef<number | null>(null);
  const lastPushed = useRef<string | null>(null);
  const lastExpiryWarning = useRef(0);
  const previousUserId = useRef<number | null>(userId);

  /**
   * Respaldo para cierres que no pasan por `useLogout` (por ejemplo, refresh
   * token vencido o /auth/me rechazado). Tambien elimina datos antiguos que una
   * version previa permitio guardar como invitado: sin cuenta no puede existir
   * una direccion ni un local de recojo activo en la cabecera.
   */
  useEffect(() => {
    const previous = previousUserId.current;
    previousUserId.current = userId;
    // Un visitante sí puede tener un destino temporal en este navegador. Solo
    // limpiamos el contexto cuando una sesión identificada acaba de cerrarse.
    if (userId === null && previous !== null) reset();
  }, [userId, address, branchId, pickupBranch, deliveryType, reset]);

  /**
   * AVISO DE SESION CADUCADA
   * El interceptor emite 'auth:logout' cuando un 401 no se pudo refrescar. Hasta
   * ahora el cliente se quedaba sin sesion en silencio: el carrito seguia lleno,
   * el checkout dejaba de responder y nadie le decia por que. Se avisa desde aqui
   * por ser el unico componente siempre montado de esta capa (el sitio natural
   * seria SessionGate, que ya escucha el mismo evento).
   *
   * Solo escuchamos mientras HAY sesion: a un invitado cuyo 401 venga de un token
   * muerto de hace semanas no se le puede decir que "expiro" nada.
   */
  useEffect(() => {
    if (userId === null) return;

    const warn = () => {
      // Varias peticiones en vuelo fallan a la vez: un solo aviso, no cuatro.
      const now = Date.now();
      if (now - lastExpiryWarning.current < 5_000) return;
      lastExpiryWarning.current = now;
      toast.warning('Tu sesión expiró. Vuelve a ingresar para seguir con tu pedido.');
    };
    window.addEventListener('auth:logout', warn);
    return () => window.removeEventListener('auth:logout', warn);
  }, [userId]);

  /**
   * Estado y acciones vigentes, leibles desde un efecto que NO depende de ellos.
   *
   * `selectDelivery` se recrea en cada cambio del contexto: si el efecto de
   * hidratacion dependiera de el, su limpieza cancelaria la peticion en vuelo en
   * cuanto cualquier otra cosa cambiara, y la hidratacion no volveria a intentarse.
   */
  const current = useRef({ hasCoverage, selectDelivery, selectPickup });
  useEffect(() => {
    current.current = { hasCoverage, selectDelivery, selectPickup };
  });

  // --- Hidratacion: una vez por sesion identificada ---
  useEffect(() => {
    if (userId === null) {
      hydratedFor.current = null;
      lastPushed.current = null;
      setIsHydrated(false);
      return;
    }
    if (hydratedFor.current === userId) return;
    hydratedFor.current = userId;

    // Ya eligio en este navegador: se respeta y se sube (lo hace el efecto de abajo).
    if (current.current.hasCoverage) {
      setIsHydrated(true);
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const remote = await accountApi.getPurchaseContext();
        if (cancelled || remote.source === 'EMPTY') return;

        // El cliente pudo elegir mientras la peticion viajaba; su accion gana.
        if (current.current.hasCoverage) return;

        if (remote.deliveryType === 'PICKUP' && remote.branch) {
          current.current.selectPickup({
            id: remote.branch.id,
            name: remote.branch.name,
            addressLine: remote.branch.addressLine,
          });
          return;
        }

        const saved = remote.address;
        if (!saved) return;

        // RN-001: la sede la decide la cobertura de hoy, no la guardada.
        const coverage = await geoApi.checkCoverage({
          districtId: saved.districtId ?? undefined,
          latitude: saved.latitude == null ? undefined : Number(saved.latitude),
          longitude: saved.longitude == null ? undefined : Number(saved.longitude),
        });
        if (cancelled || !coverage.covered || !coverage.branch) return;
        if (current.current.hasCoverage) return;

        current.current.selectDelivery(
          {
            id: saved.id,
            label: saved.label,
            line1: saved.line1,
            reference: saved.reference ?? undefined,
            districtId: saved.districtId ?? undefined,
            latitude: saved.latitude == null ? undefined : Number(saved.latitude),
            longitude: saved.longitude == null ? undefined : Number(saved.longitude),
          },
          coverage.branch.id,
        );
      } catch {
        // Sin contexto remoto la tienda funciona igual: se le preguntara la direccion.
      } finally {
        if (!cancelled) setIsHydrated(true);
      }
    })();

    return () => {
      cancelled = true;
    };
    // Solo el cambio de usuario reinicia la hidratacion (ver `current`).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // --- Subida: cada seleccion completa queda en la cuenta ---
  useEffect(() => {
    if (userId === null || !isHydrated) return;

    const payload = buildPayload({ deliveryType, cityId, branchId, address, pickupBranch });
    // Seleccion a medias (cambio de modalidad, sede sin confirmar): no se pisa
    // lo que ya estaba guardado con un contexto incompleto.
    if (!payload) return;

    const signature = JSON.stringify(payload);
    if (lastPushed.current === signature) return;

    // Pequeña espera: elegir zona -> direccion -> pin dispara varios cambios seguidos.
    const timer = window.setTimeout(() => {
      lastPushed.current = signature;
      void accountApi.savePurchaseContext(payload).catch(() => {
        // Reintentara en el proximo cambio; no es un error que el cliente deba ver.
        lastPushed.current = null;
      });
    }, 600);

    return () => window.clearTimeout(timer);
  }, [userId, isHydrated, deliveryType, cityId, branchId, address, pickupBranch]);

  return null;
};

const buildPayload = ({
  deliveryType,
  cityId,
  branchId,
  address,
  pickupBranch,
}: Pick<
  AppState,
  'deliveryType' | 'cityId' | 'branchId' | 'address' | 'pickupBranch'
>): PurchaseContextInput | null => {
  if (deliveryType === 'PICKUP') {
    return pickupBranch
      ? { deliveryType: 'PICKUP', cityId, branchId: pickupBranch.id, addressId: null }
      : null;
  }
  // Sin id no hay nada que referenciar en la libreta: guardar solo la sede
  // sustituiria una direccion buena por uno a medias en el proximo inicio.
  if (!address?.id || branchId === null || address.latitude == null || address.longitude == null) return null;
  return { deliveryType: 'DELIVERY', cityId, branchId, addressId: address.id };
};
