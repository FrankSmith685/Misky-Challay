import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, ExternalLink, Home, Info, MapPin, Navigation, Plus, Star, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { PageHeader } from '@components/common/PageHeader';
import { PageLoader } from '@components/common/PageLoader';
import { Button } from '@components/ui/Button';
import { Input } from '@components/ui/Input';
import { Modal } from '@components/ui/Modal';
import { Select, SelectOption } from '@components/ui/Select';
import { Checkbox } from '@components/ui/Checkbox';
import { FormActions, FormSection } from '@components/ui/FormSection';
import { Card, CardDescription } from '@components/ui/Card';
import { getApiErrorMessage } from '@services/api/client';
import { geoApi } from '@features/geo/services/geo.service';
import { AddressMapPicker } from '@features/geo/components/AddressMapPicker';
import { AddressAutocomplete } from '@features/geo/components/AddressAutocomplete';
import type { Address, City, District } from '@features/geo/types';
import { accountApi, type AddressInput } from '../services/account.service';

const EMPTY: AddressInput = {
  label: 'Casa',
  line1: '',
  reference: '',
  districtId: null,
  latitude: null,
  longitude: null,
  isDefault: false,
};

const AddressesPage = () => {
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [cities, setCities] = useState<City[]>([]);
  const [districts, setDistricts] = useState<District[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<AddressInput>(EMPTY);
  const [cityId, setCityId] = useState<number | ''>('');
  const [isSaving, setIsSaving] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Address | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [formErrors, setFormErrors] = useState<{ line1?: string; districtId?: string; position?: string }>({});

  const load = useCallback(async () => {
    try {
      setAddresses(await accountApi.listAddresses());
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    geoApi
      .getCities()
      .then((rows) => {
        setCities(rows);
        if (rows[0]) setCityId(rows[0].id);
      })
      .catch(() => setCities([]));
  }, [load]);

  // Carga los distritos de la ciudad elegida en el formulario.
  useEffect(() => {
    if (cityId === '') {
      setDistricts([]);
      return;
    }
    geoApi
      .getDistricts(Number(cityId))
      .then(setDistricts)
      .catch(() => setDistricts([]));
  }, [cityId]);

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY);
    setFormErrors({});
    if (cities[0]) setCityId(cities[0].id);
    setModalOpen(true);
  };

  const openEdit = (address: Address) => {
    setEditingId(address.id);
    setFormErrors({});
    setForm({
      label: address.label,
      line1: address.line1,
      reference: address.reference ?? '',
      districtId: address.districtId,
      latitude: address.latitude === null ? null : Number(address.latitude),
      longitude: address.longitude === null ? null : Number(address.longitude),
      isDefault: address.isDefault,
    });
    // Si conocemos la ciudad del distrito, la seleccionamos.
    const city = cities.find((c) => districts.some((d) => d.id === address.districtId && d.cityId === c.id));
    if (city) setCityId(city.id);
    setModalOpen(true);
  };

  const handleSave = async () => {
    const errors = {
      ...(form.line1.trim().length < 5 ? { line1: 'Ingresa calle, número y selecciona una sugerencia.' } : {}),
      ...(!form.districtId ? { districtId: 'Selecciona el distrito correspondiente.' } : {}),
      ...(form.latitude == null || form.longitude == null ? { position: 'Confirma la entrada exacta en el mapa.' } : {}),
    };
    setFormErrors(errors);
    if (Object.keys(errors).length) return;

    setIsSaving(true);
    try {
      if (editingId) {
        await accountApi.updateAddress(editingId, form);
        toast.success('Direccion actualizada');
      } else {
        await accountApi.createAddress(form);
        toast.success('Direccion guardada');
      }
      setModalOpen(false);
      await load();
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!pendingDelete) return;
    setIsDeleting(true);
    try {
      await accountApi.deleteAddress(pendingDelete.id);
      toast.success('Direccion eliminada');
      setPendingDelete(null);
      await load();
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    } finally {
      setIsDeleting(false);
    }
  };

  const handleMakeDefault = async (address: Address) => {
    try {
      await accountApi.updateAddress(address.id, { isDefault: true });
      await load();
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    }
  };

  if (isLoading) return <PageLoader />;

  return (
    <div>
      <PageHeader
        eyebrow="Mi cuenta"
        title="Mis direcciones"
        description="Guarda y organiza los lugares donde recibes tus pedidos."
        icon={MapPin}
        action={<Button leftIcon={<Plus className="size-4" />} onClick={openCreate}>Nueva dirección</Button>}
      />

      {addresses.length === 0 ? (
        <Card className="border-dashed py-12 text-center">
          <MapPin className="mx-auto size-10 text-ink-muted" />
          <CardDescription className="mt-3">Todavia no tienes direcciones guardadas.</CardDescription>
        </Card>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {addresses.map((address) => (
            <li key={address.id}>
              <Card className="h-full">
                <div className="flex items-start justify-between gap-2">
                  <p className="flex items-center gap-1.5 font-semibold text-ink">
                    <Home className="size-4 text-brand-600" />
                    {address.label}
                    {address.isDefault && (
                      <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-medium text-brand-700">
                        Principal
                      </span>
                    )}
                  </p>
                  <button
                    type="button"
                    onClick={() => setPendingDelete(address)}
                    className="rounded-full p-1 text-ink-muted hover:bg-red-50 hover:text-red-600"
                    aria-label="Eliminar"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>

                <p className="mt-2 text-sm text-ink">{address.line1}</p>
                {address.reference && (
                  <p className="text-xs text-ink-muted">Ref: {address.reference}</p>
                )}
                {address.district && (
                  <p className="mt-1 text-xs text-ink-muted">
                    {address.district.name}
                    {address.district.ubigeoCode && ` · UBIGEO ${address.district.ubigeoCode}`}
                  </p>
                )}

                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => openEdit(address)}>
                    Editar
                  </Button>
                  {address.latitude !== null && address.longitude !== null && (
                    <Button
                      size="sm"
                      variant="ghost"
                      leftIcon={<ExternalLink className="size-3.5" />}
                      component="a"
                      href={`https://www.openstreetmap.org/?mlat=${address.latitude}&mlon=${address.longitude}#map=17/${address.latitude}/${address.longitude}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Ver mapa
                    </Button>
                  )}
                  {!address.isDefault && (
                    <Button
                      size="sm"
                      variant="ghost"
                      leftIcon={<Star className="size-3.5" />}
                      onClick={() => handleMakeDefault(address)}
                    >
                      Hacer principal
                    </Button>
                  )}
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingId ? 'Editar direccion' : 'Nueva direccion'}
        description="Completa la zona, selecciona una coincidencia y confirma la entrada exacta en el mapa."
        icon={MapPin}
        eyebrow="Ubicación de entrega"
        maxWidth="lg"
      >
        <div>
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(340px,.92fr)]">
            <div className="space-y-4">
              <FormSection title="Zona y dirección" description="Usamos el distrito para priorizar coincidencias cercanas y validar cobertura." icon={Navigation}>
                <div className="grid gap-4 sm:grid-cols-2">
              <Select
                id="city"
                label="Provincia / ciudad"
                value={cityId}
                onChange={(event) => {
                  setCityId(event.target.value === '' ? '' : Number(event.target.value));
                  setForm((current) => ({ ...current, districtId: null, latitude: null, longitude: null }));
                }}
              >
                {cities.map((city) => (
                  <SelectOption key={city.id} value={city.id}>
                    {city.name}
                  </SelectOption>
                ))}
              </Select>

              <Select
                id="district"
                label="Distrito"
                error={formErrors.districtId}
                value={form.districtId ?? ''}
                onChange={(event) =>
                  setForm((f) => ({
                    ...f,
                    districtId: event.target.value === '' ? null : Number(event.target.value),
                    latitude: null,
                    longitude: null,
                  }))
                }
              >
                <SelectOption value="">Selecciona...</SelectOption>
                {districts.map((district) => (
                  <SelectOption key={district.id} value={district.id}>
                    {district.name}{district.ubigeoCode ? ` · ${district.ubigeoCode}` : ''}
                  </SelectOption>
                ))}
              </Select>
                </div>
                <div className="mt-4">
                  <AddressAutocomplete
                    value={form.line1}
                    onChange={(line1) => {
                      setForm((current) => ({ ...current, line1, latitude: null, longitude: null }));
                      setFormErrors((current) => ({ ...current, line1: undefined }));
                    }}
                    onSelect={(suggestion) => setForm((current) => ({
                      ...current,
                      line1: suggestion.line1,
                      districtId: suggestion.districtId ?? current.districtId,
                      latitude: suggestion.latitude,
                      longitude: suggestion.longitude,
                    }))}
                    cityId={cityId === '' ? null : Number(cityId)}
                    cityName={cities.find((city) => city.id === Number(cityId))?.name}
                    districtId={form.districtId}
                    districtName={districts.find((district) => district.id === form.districtId)?.name}
                    error={formErrors.line1}
                  />
                  {form.line1.trim().length >= 5 && !/\d/.test(form.line1) && (
                    <p role="status" className="mt-3 flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-xs text-amber-800">
                      <AlertTriangle className="mt-0.5 size-4 shrink-0" /> Añade el número, lote o puerta para evitar demoras.
                    </p>
                  )}
                </div>
              </FormSection>

              <FormSection title="Detalles para el repartidor" description="Ayuda a identificar rápidamente el lugar al llegar." icon={Info}>
                <div className="space-y-4">
                  <Input label="Etiqueta" placeholder="Casa, Oficina..." value={form.label} onChange={(event) => setForm((f) => ({ ...f, label: event.target.value }))} />
                  <Input label="Referencia (opcional)" placeholder="Frente al parque, puerta verde..." value={form.reference ?? ''} onChange={(event) => setForm((f) => ({ ...f, reference: event.target.value }))} />
                  <Checkbox checked={form.isDefault ?? false} onChange={(event) => setForm((f) => ({ ...f, isDefault: event.target.checked }))} label="Usar como dirección principal" />
                </div>
              </FormSection>
            </div>

            <FormSection title="Confirma la entrada" description="Puedes ajustar el punto haciendo clic sobre el mapa." icon={MapPin} tone="brand" className="h-fit lg:sticky lg:top-0">
              <AddressMapPicker
                value={form.latitude != null && form.longitude != null ? { latitude: form.latitude, longitude: form.longitude } : null}
                onChange={({ latitude, longitude }) => {
                  setForm((current) => ({ ...current, latitude, longitude }));
                  setFormErrors((current) => ({ ...current, position: undefined }));
                }}
                cityId={cityId === '' ? null : Number(cityId)}
                onAddressResolved={(address) => {
                  setForm((current) => ({
                    ...current,
                    line1: address.line1,
                    districtId: address.districtId ?? current.districtId,
                    latitude: address.latitude,
                    longitude: address.longitude,
                  }));
                  setFormErrors((current) => ({ ...current, line1: undefined, districtId: undefined, position: undefined }));
                }}
              />
              {formErrors.position && <p role="alert" className="mt-2 text-xs font-semibold text-red-600">{formErrors.position}</p>}
            </FormSection>
          </div>

          <FormActions>
            <Button variant="outline" disabled={isSaving} onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button isLoading={isSaving} onClick={handleSave}>{editingId ? 'Guardar cambios' : 'Guardar dirección'}</Button>
          </FormActions>
        </div>
      </Modal>

      <Modal
        isOpen={pendingDelete !== null}
        onClose={() => !isDeleting && setPendingDelete(null)}
        title="Eliminar dirección"
        description={`Esta acción eliminará “${pendingDelete?.label ?? ''}” de tus direcciones guardadas.`}
      >
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" disabled={isDeleting} onClick={() => setPendingDelete(null)}>Cancelar</Button>
          <Button variant="danger" isLoading={isDeleting} onClick={() => void handleDelete()}>Eliminar dirección</Button>
        </div>
      </Modal>
    </div>
  );
};

export default AddressesPage;
