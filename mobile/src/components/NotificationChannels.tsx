import { useState } from 'react';
import { Switch, Text, View } from 'react-native';
import { useResource } from '../hooks/useResource';
import { apiRequest } from '../services/api/client';
import { PrimaryButton } from './PrimaryButton';
export function NotificationChannels() {
  const resource = useResource<{ channels: { email: boolean; whatsapp: boolean; push: boolean } }>({
    key: 'account:notification-channels',
    fetcher: () => apiRequest('/customer/workspace', { auth: true }),
    cacheMs: 0,
  });
  const [message, setMessage] = useState('');
  const update = async (key: 'email' | 'whatsapp' | 'push', value: boolean) => {
    if (!resource.data?.channels) return;
    try {
      await apiRequest('/customer/channels', {
        method: 'PUT',
        auth: true,
        body: { ...resource.data.channels, [key]: value },
      });
      await resource.refetch();
      setMessage('Preferencias guardadas.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No pudimos guardar.');
    }
  };
  return (
    <View style={{ padding: 18, gap: 12, backgroundColor: '#fff', borderRadius: 14 }}>
      <Text style={{ fontSize: 19, fontWeight: '700' }}>Avisos de mis pedidos</Text>
      <Text>
        Las promociones se gestionan por separado. WhatsApp requiere también autorización por pedido
        y conexión del negocio.
      </Text>
      {resource.data?.channels &&
        (['email', 'whatsapp', 'push'] as const).map((key) => (
          <View
            key={key}
            style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
          >
            <Text>
              {key === 'email'
                ? 'Correo electrónico'
                : key === 'whatsapp'
                  ? 'WhatsApp'
                  : 'Notificaciones en el teléfono'}
            </Text>
            <Switch
              accessibilityLabel={`Avisos por ${key}`}
              value={resource.data!.channels[key]}
              onValueChange={(value) => void update(key, value)}
            />
          </View>
        ))}
      {message || resource.error ? <Text>{message || resource.error?.message}</Text> : null}
      <PrimaryButton
        label="Actualizar preferencias"
        variant="ghost"
        onPress={() => void resource.refetch()}
      />
    </View>
  );
}
