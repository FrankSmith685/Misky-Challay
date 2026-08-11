# Verde Bowl Mobile

Aplicación móvil del cliente construida con Expo SDK 57, React Native y TypeScript. Usa el mismo backend de Verde Bowl; no duplica reglas de precios, cobertura, stock, pagos ni pedidos.

## Primer arranque en un celular

1. Instala las dependencias del repositorio móvil:

   ```powershell
   npm install --prefix mobile
   ```

2. Obtén la IPv4 de la computadora:

   ```powershell
   ipconfig
   ```

3. Copia `mobile/.env.example` como `mobile/.env` y reemplaza la IP:

   ```env
   EXPO_PUBLIC_API_URL=http://192.168.1.50:4000/api/v1
   EXPO_PUBLIC_WEB_URL=http://192.168.1.50:5173
   ```

4. Levanta backend y web. El backend atiende la API y la web sirve las imágenes locales del catálogo.

   ```powershell
   npm run dev
   ```

5. Inicia Expo desde otra terminal:

   ```powershell
   npm run dev:mobile
   ```

6. Conecta el teléfono y la computadora al mismo Wi-Fi, instala Expo Go y escanea el QR.
7. Debes ver el inicio móvil, el selector de modalidad y los productos publicados por el backend.

### Versión necesaria de Expo Go

Este proyecto utiliza Expo SDK 57. El teléfono debe tener Expo Go compatible con SDK 57; una versión anterior mostrará `Project is incompatible with this version of Expo Go` antes de cargar la aplicación.

1. Actualiza Expo Go desde Play Store.
2. Si Play Store todavía conserva una versión anterior, desinstálala e instala la versión Android para SDK 57 desde `https://expo.dev/go?device=true&platform=android&sdkVersion=57`.
3. Detén Metro con `Ctrl+C` y reinícialo limpiando la caché:

   ```powershell
   npm run start:clear --prefix mobile
   ```

4. Escanea el QR nuevo. No reutilices un proyecto reciente guardado dentro del Expo Go anterior.

## Si el teléfono no conecta

- Abre `http://TU_IP:4000/api/v1/health` en el navegador del teléfono.
- Abre `http://TU_IP:5173/images/builder/bowl-signature.jpg` para comprobar las imágenes locales.
- Verifica que no se haya escrito `localhost` en `mobile/.env`.
- Autoriza Node y el puerto 4000 en el firewall para redes privadas.
- Comprueba que el Wi-Fi no tenga aislamiento entre dispositivos.
- Para el emulador Android usa `http://10.0.2.2:4000/api/v1`.
- `npm run start:tunnel --prefix mobile` crea un túnel para Expo/Metro, pero no publica automáticamente el backend.

## Comandos

```powershell
npm run dev:mobile
npm run start:clear --prefix mobile
npm run start:dev-client --prefix mobile
npm run typecheck --prefix mobile
npm run android --prefix mobile
npm run ios --prefix mobile
```

## Estructura inicial

```text
mobile/
├── app/                         rutas de Expo Router
├── src/config/                  variables y configuración
├── src/features/                pantallas agrupadas por dominio
├── src/services/api/            cliente y contratos del backend
├── src/services/session/        credenciales en SecureStore
├── src/theme/                   tokens visuales nativos
├── app.json                     identidad Android/iOS y plugins
└── .env.example                ejemplo de conexión local
```

## Funciones disponibles hasta Fase 6

- Navegación inferior: Inicio, Menú, Carrito, Pedidos y Cuenta.
- Sesión restaurada y renovada desde SecureStore.
- Registro, inicio, recuperación y cierre de sesión.
- Delivery, recojo o consumo en salón.
- Selección de sede para recojo y salón.
- Inicio, menú, búsqueda, categorías y ficha de producto con datos reales.
- Carrito persistente y constructor de bowls cotizado por el backend.
- Direcciones privadas, búsqueda geográfica y cobertura antes de guardar.
- Checkout con recojo/delivery, boleta/factura, cupón y medios de pago.
- Escáner QR de mesa, carta del local y envío de comandas a cocina.
- Historial real de pedidos para clientes autenticados.
- Detalle y seguimiento visual por estados, historial y totales del pedido.
- Cancelación controlada y repetición de productos que continúen publicados.
- Retorno seguro desde la pasarela a la app mediante el esquema `verdebowl://`.
- GPS, geocodificación inversa, mapa y pin arrastrable al crear una dirección.
- Notificaciones push de cambios del pedido, revocables al cerrar sesión.
- Diferenciación visible entre experiencia cliente y panel de personal.
- Comparación de planes, detalle de beneficios y compra mediante la pasarela.
- Retorno seguro de la compra del plan a la app y verificación de activación.
- Billetera con saldo disponible, composición por lotes, vencimientos y movimientos.
- Aplicación opcional del saldo durante el checkout, con desglose del importe restante.
- Pedidos para ahora o programados en franjas reales de la sede, respetando su capacidad.
- Favoritos sincronizados con la cuenta, disponibles en cualquier dispositivo.
- Reseñas verificadas, habilitadas únicamente para productos de pedidos entregados.
- Preferencias separadas para promociones y analítica opcional.
- Recomendaciones personalizadas por favoritos, historial y preferencias alimentarias.
- Embudo móvil con consentimiento y métricas visibles en el panel de administración.

Las entregas están documentadas en `docs/APP-MOBILE-FASE-1.md` hasta `docs/APP-MOBILE-FASE-6.md`.

## APK de desarrollo y notificaciones remotas

Expo Go permite revisar gran parte de la interfaz, pero la recepción de push remoto
se prueba con el development build configurado en `eas.json`:

```powershell
cd mobile
npx eas-cli@latest login
npx eas-cli@latest init
npx eas-cli@latest build --platform android --profile development
```

Instala en el teléfono el APK que entrega EAS. Luego inicia Metro con:

```powershell
npm run start:dev-client
```

`eas init` asigna `extra.eas.projectId`. También puedes copiarlo a
`EXPO_PUBLIC_EAS_PROJECT_ID` en `mobile/.env`. No uses el valor de ejemplo.
