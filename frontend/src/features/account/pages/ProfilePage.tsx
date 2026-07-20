import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Apple, MapPin, ShieldCheck } from 'lucide-react';
import toast from 'react-hot-toast';
import { SectionHeading } from '@components/common/SectionHeading';
import { PageLoader } from '@components/common/PageLoader';
import { Button } from '@components/ui/Button';
import { Input } from '@components/ui/Input';
import { Card, CardDescription, CardTitle } from '@components/ui/Card';
import { getApiErrorMessage } from '@services/api/client';
import { useAppDispatch } from '@app/hooks';
import { fetchCurrentUser } from '@features/auth/authSlice';
import { ROUTES } from '@constants/routes';
import { cn } from '@lib/cn';
import { accountApi, type FoodPreferences, type Profile } from '../services/account.service';
import { catalogApi } from '@features/catalog/services/catalog.service';
import type { Allergen, DietaryTag } from '@features/catalog/types';

const EMPTY_PREFERENCES: FoodPreferences = {
  allergens: [], dietaryTags: [], dislikedOptionIds: [], calorieTarget: null, proteinTarget: null,
};

const profileSchema = z.object({
  firstName: z.string().min(2, 'Nombre demasiado corto'),
  lastName: z.string().min(2, 'Apellido demasiado corto'),
  phone: z
    .string()
    .trim()
    .regex(/^[0-9+\s-]{6,20}$/, 'Telefono invalido')
    .optional()
    .or(z.literal('')),
});
type ProfileForm = z.infer<typeof profileSchema>;

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Ingresa tu contrasena actual'),
    newPassword: z.string().min(8, 'Minimo 8 caracteres'),
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'Las contrasenas no coinciden',
    path: ['confirmPassword'],
  });
type PasswordForm = z.infer<typeof passwordSchema>;

const ProfilePage = () => {
  const dispatch = useAppDispatch();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [preferences, setPreferences] = useState<FoodPreferences>(EMPTY_PREFERENCES);
  const [allergens, setAllergens] = useState<Allergen[]>([]);
  const [dietaryTags, setDietaryTags] = useState<DietaryTag[]>([]);
  const [savingPreferences, setSavingPreferences] = useState(false);

  const profileForm = useForm<ProfileForm>({ resolver: zodResolver(profileSchema) });
  const passwordForm = useForm<PasswordForm>({ resolver: zodResolver(passwordSchema) });

  useEffect(() => {
    accountApi
      .getProfile()
      .then((data) => {
        setProfile(data);
        profileForm.reset({
          firstName: data.firstName ?? '',
          lastName: data.lastName ?? '',
          phone: data.phone ?? '',
        });
      })
      .catch((error) => toast.error(getApiErrorMessage(error)))
      .finally(() => setIsLoading(false));
    Promise.all([catalogApi.getAllergens(), catalogApi.getDietaryTags(), accountApi.getFoodPreferences()])
      .then(([allergenRows, tagRows, saved]) => {
        setAllergens(allergenRows);
        setDietaryTags(tagRows);
        setPreferences(saved);
      })
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onSaveProfile = async (values: ProfileForm) => {
    try {
      const updated = await accountApi.updateProfile({
        firstName: values.firstName,
        lastName: values.lastName,
        phone: values.phone ?? '',
      });
      setProfile(updated);
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
      toast.success('Contrasena actualizada');
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    }
  };

  const togglePreference = (key: 'allergens' | 'dietaryTags', code: string) => {
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
      toast.success('Preferencias alimentarias guardadas');
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    } finally {
      setSavingPreferences(false);
    }
  };

  if (isLoading) return <PageLoader />;

  return (
    <div>
      <SectionHeading title="Mi perfil" description="Tus datos, tu contrasena y tus direcciones." />

      <div className="space-y-6">
        <Card className="overflow-hidden border-brand-100 bg-gradient-to-br from-white to-brand-50/70">
          <CardTitle className="flex items-center gap-2">
            <Apple className="size-5 text-brand-600" /> Tu perfil alimentario
          </CardTitle>
          <CardDescription className="mt-1">
            Lo tendremos en cuenta al recomendar ingredientes y te avisaremos antes de elegir un alergeno.
          </CardDescription>

          <div className="mt-5 space-y-5">
            <fieldset>
              <legend className="text-sm font-bold text-ink">Necesito evitar</legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {allergens.map((item) => {
                  const selected = preferences.allergens.includes(item.code);
                  return <button key={item.id} type="button" aria-pressed={selected} onClick={() => togglePreference('allergens', item.code)} className={cn('rounded-full border px-3 py-2 text-sm font-semibold transition', selected ? 'border-red-300 bg-red-50 text-red-700 shadow-sm' : 'border-surface-border bg-white text-ink-muted hover:border-brand-300')}>{item.name}</button>;
                })}
              </div>
            </fieldset>
            <fieldset>
              <legend className="text-sm font-bold text-ink">Mi estilo de alimentacion</legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {dietaryTags.map((item) => {
                  const selected = preferences.dietaryTags.includes(item.code);
                  return <button key={item.id} type="button" aria-pressed={selected} onClick={() => togglePreference('dietaryTags', item.code)} className={cn('rounded-full border px-3 py-2 text-sm font-semibold transition', selected ? 'border-brand-400 bg-brand-50 text-brand-700 shadow-sm' : 'border-surface-border bg-white text-ink-muted hover:border-brand-300')}>{item.name}</button>;
                })}
              </div>
            </fieldset>
            <div className="grid gap-4 sm:grid-cols-2">
              <Input label="Meta maxima de calorias" type="number" min={300} max={5000} placeholder="Ej. 650" value={preferences.calorieTarget ?? ''} onChange={(event) => setPreferences((current) => ({ ...current, calorieTarget: event.target.value ? Number(event.target.value) : null }))} />
              <Input label="Meta minima de proteina (g)" type="number" min={0} max={500} placeholder="Ej. 30" value={preferences.proteinTarget ?? ''} onChange={(event) => setPreferences((current) => ({ ...current, proteinTarget: event.target.value ? Number(event.target.value) : null }))} />
            </div>
            <Button type="button" onClick={savePreferences} isLoading={savingPreferences}>Guardar preferencias</Button>
          </div>
        </Card>
        {/* Datos personales */}
        <Card>
          <CardTitle>Datos personales</CardTitle>
          <form onSubmit={profileForm.handleSubmit(onSaveProfile)} className="mt-4 space-y-4" noValidate>
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Nombre"
                error={profileForm.formState.errors.firstName?.message}
                {...profileForm.register('firstName')}
              />
              <Input
                label="Apellido"
                error={profileForm.formState.errors.lastName?.message}
                {...profileForm.register('lastName')}
              />
            </div>

            <Input
              label="Email"
              value={profile?.email ?? ''}
              disabled
              hint="El email no se puede cambiar."
            />

            <Input
              label="Telefono"
              type="tel"
              placeholder="999 999 999"
              error={profileForm.formState.errors.phone?.message}
              {...profileForm.register('phone')}
            />

            <Button type="submit" isLoading={profileForm.formState.isSubmitting}>
              Guardar cambios
            </Button>
          </form>
        </Card>

        {/* Cambio de contrasena */}
        <Card>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="size-5 text-brand-600" /> Seguridad
          </CardTitle>
          <CardDescription className="mt-1">Cambia tu contrasena cuando quieras.</CardDescription>

          <form
            onSubmit={passwordForm.handleSubmit(onChangePassword)}
            className="mt-4 space-y-4"
            noValidate
          >
            <Input
              label="Contrasena actual"
              type="password"
              autoComplete="current-password"
              error={passwordForm.formState.errors.currentPassword?.message}
              {...passwordForm.register('currentPassword')}
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Nueva contrasena"
                type="password"
                autoComplete="new-password"
                error={passwordForm.formState.errors.newPassword?.message}
                {...passwordForm.register('newPassword')}
              />
              <Input
                label="Repite la nueva"
                type="password"
                autoComplete="new-password"
                error={passwordForm.formState.errors.confirmPassword?.message}
                {...passwordForm.register('confirmPassword')}
              />
            </div>

            <Button type="submit" variant="outline" isLoading={passwordForm.formState.isSubmitting}>
              Cambiar contrasena
            </Button>
          </form>
        </Card>

        {/* Acceso a direcciones */}
        <Card className="flex items-center justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="size-5 text-brand-600" /> Mis direcciones
            </CardTitle>
            <CardDescription className="mt-1">
              Guarda tus direcciones para pedir mas rapido.
            </CardDescription>
          </div>
          <Link to={ROUTES.accountAddresses}>
            <Button variant="outline" size="sm">
              Gestionar
            </Button>
          </Link>
        </Card>
      </div>
    </div>
  );
};

export default ProfilePage;
