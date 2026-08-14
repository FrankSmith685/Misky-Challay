// Configuración dinámica de Expo. `app.json` aporta la base estática y aquí se resuelve
// todo lo que depende del perfil con el que se compila.
//
// Existe por dos motivos concretos:
//   1. El tráfico HTTP en claro debe estar permitido en desarrollo (el backend local corre
//      en http://IP:4000) y prohibido en producción. Un valor fijo en app.json no puede ser
//      las dos cosas.
//   2. Una build de producción sin EXPO_PUBLIC_API_URL cae al `http://localhost:4000` de
//      src/config/env.ts y produce un binario que no conecta con nada desde un teléfono.
//      Es preferible que la compilación falle aquí, en un segundo, a descubrirlo con el
//      APK ya instalado.

const PERFIL = process.env.EAS_BUILD_PROFILE ?? '';
const esProduccion = PERFIL === 'production';
const apiUrl = process.env.EXPO_PUBLIC_API_URL ?? '';

// Fuera de producción se permite HTTP salvo que se pida lo contrario explícitamente.
const permitirHttp = esProduccion
  ? process.env.EXPO_PUBLIC_ALLOW_HTTP === 'true'
  : process.env.EXPO_PUBLIC_ALLOW_HTTP !== 'false';

module.exports = ({ config }) => {
  if (esProduccion && !/^https:\/\//i.test(apiUrl)) {
    throw new Error(
      'Build de producción sin EXPO_PUBLIC_API_URL en https. Define la URL real del backend ' +
        'en el perfil "production" de eas.json antes de compilar; de lo contrario la app ' +
        'saldría apuntando a http://localhost:4000 y no conectaría desde ningún teléfono.',
    );
  }

  const plugins = (config.plugins ?? []).map((plugin) => {
    const esBuildProperties =
      plugin === 'expo-build-properties' ||
      (Array.isArray(plugin) && plugin[0] === 'expo-build-properties');
    if (!esBuildProperties) return plugin;

    const opciones = Array.isArray(plugin) ? (plugin[1] ?? {}) : {};
    return [
      'expo-build-properties',
      {
        ...opciones,
        android: { ...(opciones.android ?? {}), usesCleartextTraffic: permitirHttp },
      },
    ];
  });
  if (!plugins.some((plugin) => plugin === 'expo-sharing' || (Array.isArray(plugin) && plugin[0] === 'expo-sharing'))) {
    plugins.push('expo-sharing');
  }

  return {
    ...config,
    plugins,
  };
};
