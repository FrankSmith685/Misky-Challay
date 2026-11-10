import { NotificationPreferences } from '../components/NotificationPreferences';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Apple,
  Camera,
  Check,
  ChevronRight,
  Eye,
  EyeOff,
  Info,
  LockKeyhole,
  Mail,
  MapPin,
  Phone,
  Save,
  ShieldCheck,
  Trash2,
  User2,
} from 'lucide-react';
import toast from '@components/mui/MuiToast';
import { PageHeader } from '@components/common/PageHeader';
import { Button } from '@components/ui/Button';
import { Input } from '@components/ui/Input';
import { Card, CardDescription, CardTitle } from '@components/ui/Card';
import { Skeleton } from '@components/ui/Skeleton';
import { getApiErrorMessage } from '@services/api/client';
import { useAppDispatch } from '@app/hooks';
import { fetchCurrentUser } from '@features/auth/authSlice';
import { ROUTES } from '@constants/routes';
import { cn } from '@lib/cn';
import { accountApi, type FoodPreferences, type Profile } from '../services/account.service';
import { catalogApi } from '@features/catalog/services/catalog.service';
import { PasswordStrength } from '@features/auth/components/PasswordStrength';
import { PasswordMatchStatus } from '@features/auth/components/PasswordMatchStatus';
import type { Allergen, DietaryTag } from '@features/catalog/types';
import { AccountLoadError, AccountSectionCard } from '../components/AccountSectionCard';

const EMPTY_PREFERENCES: FoodPreferences = {
  allergens: [],
  dietaryTags: [],
  dislikedOptionIds: [],
};

const profileSchema = z.object({
  firstName: z.string().min(2, 'Nombre demasiado corto'),
  lastName: z.string().min(2, 'Apellido demasiado corto'),
  phone: z
    .string()
    .trim()
    .regex(/^[0-9+\s-]{6,20}$/, 'Teléfono inválido')
    .optional()
    .or(z.literal('')),
});
type ProfileForm = z.infer<typeof profileSchema>;

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Ingresa tu contraseña actual'),
    newPassword: z.string().min(8, 'Mínimo 8 caracteres'),
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'Las contraseñas no coinciden',
    path: ['confirmPassword'],
  })
  .refine((data) => data.currentPassword !== data.newPassword, {
    message: 'La nueva contraseña debe ser diferente a la actual',
    path: ['newPassword'],
  });
type PasswordForm = z.infer<typeof passwordSchema>;

const PROFILE_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
const readDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('No pudimos leer la imagen.'));
    reader.readAsDataURL(file);
  });

const ProfilePage = () => {
  const dispatch = useAppDispatch();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);
  const [preferences, setPreferences] = useState<FoodPreferences>(EMPTY_PREFERENCES);
  const [allergens, setAllergens] = useState<Allergen[]>([]);
  const [dietaryTags, setDietaryTags] = useState<DietaryTag[]>([]);
  const [savingPreferences, setSavingPreferences] = useState(false);
  const [preferencesError, setPreferencesError] = useState(false);
  const [preferencesDirty, setPreferencesDirty] = useState(false);
  const [showPasswords, setShowPasswords] = useState(false);
  const [savingAvatar, setSavingAvatar] = useState(false);
  const avatarInput = useRef<HTMLInputElement>(null);

  const profileForm = useForm<ProfileForm>({
    resolver: zodResolver(profileSchema),
    mode: 'onBlur',
  });
  const passwordForm = useForm<PasswordForm>({
    resolver: zodResolver(passwordSchema),
    mode: 'onChange',
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
  });
  const newPassword = passwordForm.watch('newPassword');
  const confirmPassword = passwordForm.watch('confirmPassword');

  useEffect(() => {
    accountApi
      .getProfile()
      .then((data) => {
        setProfile(data);
        setLoadError(null);
        profileForm.reset({
          firstName: data.firstName ?? '',
          lastName: data.lastName ?? '',
          phone: data.phone ?? '',
        });
      })
      // El formulario en blanco pasaria por "no tienes datos": mejor decir que fallo.
      .catch((error) => setLoadError(getApiErrorMessage(error)))
      .finally(() => setIsLoading(false));
    Promise.all([
      catalogApi.getAllergens(),
      catalogApi.getDietaryTags(),
      accountApi.getFoodPreferences(),
    ])
      .then(([allergenRows, tagRows, saved]) => {
        setAllergens(allergenRows);
        setDietaryTags(tagRows);
        setPreferences(saved); setPreferencesError(false);
        setPreferencesDirty(false);
      })
      .catch(() => setPreferencesError(true));
    // Solo el reintento explicito vuelve a cargar la pantalla.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retryNonce]);

  const onSaveProfile = async (values: ProfileForm) => {
    try {
      const updated = await accountApi.updateProfile({
        firstName: values.firstName,
        lastName: values.lastName,
        phone: values.phone ?? '',
      });
      setProfile(updated);
      profileForm.reset({
        firstName: updated.firstName ?? '',
        lastName: updated.lastName ?? '',
        phone: updated.phone ?? '',
      });
      // Refresca el usuario en Redux para que el nombre cambie en la cabecera.
      void dispatch(fetchCurrentUser());
      toast.success('Perfil actualizado');
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    }
  };

  const onChangePassword = async (values: PasswordForm) => {
    try {
      await accountApi.changePassword({
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
      });
      passwordForm.reset({ currentPassword: '', newPassword: '', confirmPassword: '' });
      toast.success('Contraseña actualizada');
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    }
  };

  const changeAvatar = async (file?: File) => {
    if (!file) return;
    if (!PROFILE_IMAGE_TYPES.includes(file.type as (typeof PROFILE_IMAGE_TYPES)[number])) {
      toast.error('Usa una imagen JPG, PNG o WebP.');
      return;
    }
    if (file.size === 0 || file.size > 5 * 1024 * 1024) {
      toast.error('La foto debe pesar menos de 5 MB.');
      return;
    }

    setSavingAvatar(true);
    try {
      const updated = await accountApi.updateAvatar({
        fileName: file.name,
        mimeType: file.type as 'image/webp' | 'image/jpeg' | 'image/png',
        dataUrl: await readDataUrl(file),
      });
      setProfile(updated);
      void dispatch(fetchCurrentUser());
      toast.success('Foto de perfil actualizada');
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    } finally {
      setSavingAvatar(false);
    }
  };

  const removeAvatar = async () => {
    setSavingAvatar(true);
    try {
      const updated = await accountApi.removeAvatar();
      setProfile(updated);
      void dispatch(fetchCurrentUser());
      toast.success('Foto de perfil eliminada');
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    } finally {
      setSavingAvatar(false);
    }
  };

  const togglePreference = (key: 'allergens' | 'dietaryTags', code: string) => {
    setPreferencesDirty(true);
    setPreferences((current) => ({
      ...current,
      [key]: current[key].includes(code)
        ? current[key].filter((item) => item !== code)
        : [...current[key], code],
    }));
  };

  const savePreferences = async () => {
    setSavingPreferences(true);
    try {
      setPreferences(await accountApi.updateFoodPreferences(preferences));
      setPreferencesDirty(false);
      toast.success('Preferencias alimentarias guardadas');
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    } finally {
      setSavingPreferences(false);
    }
  };

  /* Titulo y migas visibles tambien mientras carga y si falla: la pagina ya no
   * desaparece entera detras del spinner y el contenido deja de saltar al resolver. */
  const header = (
    <PageHeader
      eyebrow="Mi cuenta"
      title="Mi perfil"
      description="Administra tus datos personales, preferencias alimentarias y seguridad."
      icon={User2}
      crumbs={[{ label: 'Inicio', to: '/' }, { label: 'Mi cuenta' }, { label: 'Perfil' }]}
      className="mb-6"
    />
  );

  if (isLoading) {
    return (
      <div>
        {header}
        <ProfileSkeleton />
      </div>
    );
  }

  if (loadError) {
    return (
      <div>
        {header}
        <AccountLoadError
          title="No pudimos cargar tu perfil"
          message={loadError}
          onRetry={() => {
            setIsLoading(true);
            setRetryNonce((value) => value + 1);
          }}
        />
      </div>
    );
  }

  const fullName = [profile?.firstName, profile?.lastName].filter(Boolean).join(' ') || 'Tu perfil';
  const initials =
    [profile?.firstName, profile?.lastName]
      .filter(Boolean)
      .map((part) => part?.[0])
      .join('')
      .slice(0, 2)
      .toUpperCase() || 'VB';
  const selectedPreferenceCount = preferences.allergens.length + preferences.dietaryTags.length;
  const completedProfileFields = [
    profile?.firstName,
    profile?.lastName,
    profile?.email,
    profile?.phone,
  ].filter(Boolean).length;

  return (
    <div>
      {header}
      <NotificationPreferences />

      <section
        className="mb-5 overflow-hidden rounded-card border border-brand-700 p-5 text-white shadow-e3 sm:p-6"
        style={{
          background: 'linear-gradient(120deg, var(--color-brand-800), var(--color-brand-600))',
        }}
        aria-labelledby="profile-summary-title"
      >
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            <button
              type="button"
              className="group relative grid size-16 shrink-0 place-items-center overflow-hidden rounded-full border-2 border-white/30 bg-white/10 text-lg font-black focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              onClick={() => avatarInput.current?.click()}
              disabled={savingAvatar}
              aria-label={profile?.avatarUrl ? 'Cambiar foto de perfil' : 'Agregar foto de perfil'}
            >
              {profile?.avatarUrl ? (
                <img src={profile.avatarUrl} alt="Foto de perfil" className="size-full object-cover" />
              ) : initials}
              <span className="absolute inset-x-0 bottom-0 grid h-6 place-items-center bg-black/45 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                <Camera className="size-3.5" />
              </span>
            </button>
            <input
              ref={avatarInput}
              type="file"
              accept={PROFILE_IMAGE_TYPES.join(',')}
              className="hidden"
              onChange={(event) => {
                void changeAvatar(event.target.files?.[0]);
                event.target.value = '';
              }}
            />
            <div className="min-w-0">
              <h2 id="profile-summary-title" className="truncate text-xl font-black">
                {fullName}
              </h2>
              <p className="mt-1 flex items-center gap-2 truncate text-sm text-brand-100">
                <Mail className="size-3.5 shrink-0" /> {profile?.email}
              </p>
              {profile?.phone && (
                <p className="mt-1 flex items-center gap-2 text-xs text-brand-200">
                  <Phone className="size-3.5" /> {profile.phone}
                </p>
              )}
              <div className="mt-2 flex flex-wrap gap-1.5">
                <Button size="sm" variant="ghost" leftIcon={<Camera className="size-3.5" />} isLoading={savingAvatar} onClick={() => avatarInput.current?.click()}>
                  {profile?.avatarUrl ? 'Cambiar foto' : 'Agregar foto'}
                </Button>
                {profile?.avatarUrl && (
                  <Button size="sm" variant="ghost" leftIcon={<Trash2 className="size-3.5" />} disabled={savingAvatar} onClick={() => void removeAvatar()}>
                    Quitar
                  </Button>
                )}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 text-center sm:w-[250px]">
            <div className="rounded-card border border-white/10 bg-white/[.07] p-3">
              <p className="text-xl font-black">{selectedPreferenceCount}</p>
              <p className="mt-0.5 text-[10px] uppercase tracking-wide text-brand-200">
                Preferencias
              </p>
            </div>
            <div className="rounded-card border border-white/10 bg-white/[.07] p-3">
              <p className="text-xl font-black">{completedProfileFields}/4</p>
              <p className="mt-0.5 text-[10px] uppercase tracking-wide text-brand-200">
                Datos listos
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Oculta hasta lg: por debajo de ese ancho AccountLayout ya fija su propia fila de
        * secciones en esa misma banda y esta quedaba entera detras. El offset sale de la
        * altura real de la cabecera (72px del Toolbar + 1px de borde), no de un 69 magico. */}
      <nav
        aria-label="Secciones del perfil"
        className="sticky top-[var(--vb-header-h,73px)] z-10 mb-6 hidden gap-2 overflow-x-auto border-y border-line bg-white/95 py-3 backdrop-blur [scrollbar-width:none] lg:flex"
      >
        {[
          { href: '#datos-personales', icon: User2, label: 'Datos personales' },
          { href: '#perfil-alimentario', icon: Apple, label: 'Preferencias' },
          { href: '#seguridad', icon: ShieldCheck, label: 'Seguridad' },
        ].map(({ href, icon: Icon, label }) => (
          <a
            key={href}
            href={href}
            className="inline-flex shrink-0 items-center gap-2 rounded-pill border border-line bg-white px-3 py-2 text-xs font-bold text-ink-muted transition hover:border-brand-300 hover:text-brand-700"
          >
            <Icon className="size-3.5" /> {label}
          </a>
        ))}
      </nav>

      <div className="grid gap-6">
        <div className="grid gap-6">
          <AccountSectionCard
            id="datos-personales"
            icon={User2}
            title="Datos personales"
            description="Información que usamos para identificar tus pedidos y contactarte."
            bodyClassName="p-0"
            action={
              <span className="inline-flex items-center gap-1.5 rounded-pill border border-brand-100 bg-brand-50 px-3 py-1.5 text-xs font-extrabold text-brand-700">
                <Check className="size-3.5" /> {completedProfileFields}/4 completos
              </span>
            }
          >
            <form
              onSubmit={profileForm.handleSubmit(onSaveProfile)}
              className="grid gap-6 p-5 sm:p-6"
              noValidate
            >
              {/* Los mismos autoComplete que el registro: el dato ya conocido no se
                * vuelve a teclear y el gestor de contraseñas asocia la cuenta. */}
              <div className="grid gap-6 md:grid-cols-2">
                <Input
                  label="Nombre"
                  autoComplete="given-name"
                  error={profileForm.formState.errors.firstName?.message}
                  {...profileForm.register('firstName')}
                />
                <Input
                  label="Apellido"
                  autoComplete="family-name"
                  error={profileForm.formState.errors.lastName?.message}
                  {...profileForm.register('lastName')}
                />
              </div>
              <div className="grid gap-6 md:grid-cols-2">
                <Input
                  label="Correo electrónico"
                  autoComplete="email"
                  value={profile?.email ?? ''}
                  disabled
                  hint="El correo de acceso no se modifica desde aquí."
                  startAdornment={<Mail className="size-4" />}
                />
                <Input
                  label="Teléfono"
                  type="tel"
                  autoComplete="tel"
                  placeholder="999 999 999"
                  error={profileForm.formState.errors.phone?.message}
                  startAdornment={<Phone className="size-4" />}
                  {...profileForm.register('phone')}
                />
              </div>
              <div className="flex flex-col-reverse gap-3 border-t border-line pt-5 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs leading-5 text-ink-muted">
                  Mantén tus datos actualizados para recibir avisos sobre tus pedidos.
                </p>
                <Button
                  type="submit"
                  className="w-full sm:w-auto"
                  disabled={!profileForm.formState.isDirty}
                  isLoading={profileForm.formState.isSubmitting}
                  leftIcon={<Save className="size-4" />}
                >
                  Guardar datos
                </Button>
              </div>
            </form>
          </AccountSectionCard>

          <AccountSectionCard
            id="perfil-alimentario"
            icon={Apple}
            title="Perfil alimentario"
            description="Personaliza las alertas y recomendaciones que verás en el menú y al armar tu bowl."
            className="border-brand-100"
            bodyClassName="grid gap-6"
            action={
              <span className="inline-flex items-center gap-1.5 rounded-pill border border-brand-100 bg-white px-3 py-1.5 text-xs font-extrabold text-brand-700">
                <Apple className="size-3.5" /> {selectedPreferenceCount} seleccionadas
              </span>
            }
          >
            <div className="grid gap-5 lg:grid-cols-2">
              <fieldset className="rounded-card border border-line bg-white p-4 sm:p-5">
                <legend className="text-sm font-extrabold text-ink">
                  Alérgenos que necesito evitar
                </legend>
                <p className="mt-1 text-xs leading-5 text-ink-muted">
                  Te mostraremos advertencias; esto no sustituye consultar al local ante una alergia
                  severa.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {allergens.map((item) => {
                    const selected = preferences.allergens.includes(item.code);
                    return (
                      <button
                        key={item.id}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => togglePreference('allergens', item.code)}
                        className={cn(
                          'inline-flex items-center gap-1.5 rounded-field border px-3 py-2 text-sm font-semibold transition',
                          selected
                            ? 'border-red-300 bg-red-50 text-red-700 shadow-sm'
                            : 'border-line bg-white text-ink-muted hover:border-red-200',
                        )}
                      >
                        {selected && <Check className="size-3.5" />} {item.name}
                      </button>
                    );
                  })}
                </div>
              </fieldset>

              <fieldset className="rounded-card border border-line bg-white p-4 sm:p-5">
                <legend className="text-sm font-extrabold text-ink">
                  Mi estilo de alimentación
                </legend>
                <p className="mt-1 text-xs leading-5 text-ink-muted">
                  Ajustaremos las recomendaciones según el tipo de alimentación que prefieres.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {dietaryTags.map((item) => {
                    const selected = preferences.dietaryTags.includes(item.code);
                    return (
                      <button
                        key={item.id}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => togglePreference('dietaryTags', item.code)}
                        className={cn(
                          'inline-flex items-center gap-1.5 rounded-field border px-3 py-2 text-sm font-semibold transition',
                          selected
                            ? 'border-brand-400 bg-brand-50 text-brand-700 shadow-sm'
                            : 'border-line bg-white text-ink-muted hover:border-brand-300',
                        )}
                      >
                        {selected && <Check className="size-3.5" />} {item.name}
                      </button>
                    );
                  })}
                </div>
              </fieldset>
            </div>

            <div className="flex flex-col-reverse gap-3 border-t border-line pt-5 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs leading-5 text-ink-muted">
                Estas preferencias sirven como guía y puedes modificarlas cuando quieras.
              </p>
              {preferencesError && <p role="alert">No pudimos cargar tus preferencias. Recarga antes de modificarlas.</p>}
              <Button
                type="button"
                className="w-full sm:w-auto"
                disabled={!preferencesDirty || preferencesError}
                onClick={savePreferences}
                isLoading={savingPreferences}
                leftIcon={<Save className="size-4" />}
              >
                Guardar preferencias
              </Button>
            </div>
          </AccountSectionCard>
        </div>

        <div className="grid gap-6">
          <AccountSectionCard
            id="seguridad"
            icon={LockKeyhole}
            title="Contraseña y seguridad"
            description="Actualiza tus credenciales de acceso sin salir de tu cuenta."
            bodyClassName="p-0"
            action={
              <button
                type="button"
                onClick={() => setShowPasswords((visible) => !visible)}
                className="inline-flex min-h-9 items-center gap-2 rounded-field border border-line bg-white px-3 text-xs font-bold text-ink-muted transition hover:border-brand-300 hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                aria-label={showPasswords ? 'Ocultar contraseñas' : 'Mostrar contraseñas'}
                aria-pressed={showPasswords}
                title={showPasswords ? 'Ocultar contraseñas' : 'Mostrar contraseñas'}
              >
                {showPasswords ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                {showPasswords ? 'Ocultar' : 'Mostrar'}
              </button>
            }
          >
            <form
              onSubmit={passwordForm.handleSubmit(onChangePassword)}
              className="grid gap-6 p-5 sm:p-6"
              noValidate
            >
              <Input
                label="Contraseña actual"
                type={showPasswords ? 'text' : 'password'}
                autoComplete="current-password"
                error={passwordForm.formState.errors.currentPassword?.message}
                {...passwordForm.register('currentPassword')}
              />

              <div className="grid gap-6 md:grid-cols-2">
                <div>
                  <Input
                    label="Nueva contraseña"
                    type={showPasswords ? 'text' : 'password'}
                    autoComplete="new-password"
                    error={passwordForm.formState.errors.newPassword?.message}
                    {...passwordForm.register('newPassword')}
                  />
                  <PasswordStrength password={newPassword} />
                </div>

                <div>
                  <Input
                    label="Confirma la nueva contraseña"
                    type={showPasswords ? 'text' : 'password'}
                    autoComplete="new-password"
                    error={passwordForm.formState.errors.confirmPassword?.message}
                    {...passwordForm.register('confirmPassword')}
                  />
                  <PasswordMatchStatus
                    password={newPassword}
                    confirmation={confirmPassword}
                    reserveSpace={false}
                  />
                </div>
              </div>

              <div className="flex gap-2 rounded-card border border-brand-100 bg-brand-50/60 p-3 text-xs leading-5 text-ink-muted">
                <Info className="mt-0.5 size-4 shrink-0 text-brand-700" />
                <p>Usa al menos 8 caracteres y una contraseña diferente a la actual.</p>
              </div>

              <div className="flex flex-col-reverse gap-3 border-t border-line pt-5 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs leading-5 text-ink-muted">
                  Al actualizarla, podrás seguir usando tu sesión actual normalmente.
                </p>
                <Button
                  type="submit"
                  className="w-full sm:w-auto"
                  disabled={!passwordForm.formState.isDirty}
                  isLoading={passwordForm.formState.isSubmitting}
                  leftIcon={<ShieldCheck className="size-4" />}
                >
                  Actualizar contraseña
                </Button>
              </div>
            </form>

            {/* La baja vive también en el pie, pero quien tiene sesión abierta la
                busca dentro de «Mi cuenta», no en el footer. */}
            <div className="mt-6 flex flex-col gap-3 border-t border-line pt-5 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs leading-5 text-ink-muted">
                Da de baja tu cuenta y borra tus datos personales. Tus comprobantes se conservan por
                obligación tributaria.
              </p>
              <Button
                component={Link}
                to={ROUTES.deleteAccount}
                variant="outline"
                size="sm"
                className="w-full shrink-0 sm:w-auto"
              >
                Eliminar mi cuenta
              </Button>
            </div>
          </AccountSectionCard>

          <Card className="flex flex-col gap-4 rounded-card border-brand-100 bg-gradient-to-r from-brand-50/80 to-white sm:flex-row sm:items-center sm:justify-between sm:p-6">
            <div className="flex items-start gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-card bg-white text-brand-700 shadow-sm">
                <MapPin className="size-5" />
              </span>
              <div>
                <CardTitle>Direcciones de entrega</CardTitle>
                <CardDescription className="mt-1">
                  Administra tus lugares frecuentes y la dirección principal.
                </CardDescription>
              </div>
            </div>
            <Button
              component={Link}
              to={ROUTES.accountAddresses}
              variant="outline"
              size="sm"
              className="w-full sm:w-auto"
            >
              Gestionar direcciones <ChevronRight className="size-4" />
            </Button>
          </Card>
        </div>
      </div>
    </div>
  );
};

/** Silueta real: tarjeta de resumen + las tres secciones con su cabecera y su formulario. */
const ProfileSkeleton = () => (
  <div>
    <Skeleton className="mb-5 h-38 w-full rounded-card sm:h-33" />
    <div className="grid gap-6">
      {Array.from({ length: 3 }).map((_, index) => (
        <div key={index} className="overflow-hidden rounded-card border border-line bg-white">
          <div className="flex items-center gap-3 border-b border-line bg-surface-muted/55 p-5 sm:px-6">
            <Skeleton className="size-10 shrink-0 rounded-card" />
            <div className="min-w-0 flex-1">
              <Skeleton className="h-4 w-44" />
              <Skeleton className="mt-2 h-3 w-64 max-w-full" />
            </div>
          </div>
          <div className="grid gap-6 p-5 sm:p-6">
            <div className="grid gap-6 md:grid-cols-2">
              <Skeleton className="h-14 rounded-field" />
              <Skeleton className="h-14 rounded-field" />
            </div>
            <div className="flex justify-end border-t border-line pt-5">
              <Skeleton className="h-11 w-44 rounded-field" />
            </div>
          </div>
        </div>
      ))}
    </div>
  </div>
);

export default ProfilePage;

