import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        'react-hot-toast': path.resolve(__dirname, './src/components/mui/MuiToast.tsx'),
        '@': path.resolve(__dirname, './src'),
        '@app': path.resolve(__dirname, './src/app'),
        '@components': path.resolve(__dirname, './src/components'),
        '@features': path.resolve(__dirname, './src/features'),
        '@hooks': path.resolve(__dirname, './src/hooks'),
        '@services': path.resolve(__dirname, './src/services'),
        '@context': path.resolve(__dirname, './src/context'),
        '@lib': path.resolve(__dirname, './src/lib'),
        '@types': path.resolve(__dirname, './src/types'),
        '@constants': path.resolve(__dirname, './src/constants'),
      },
    },
    server: {
      // La app móvil abre imágenes y el puente de retorno de pago desde el teléfono.
      // Escuchar solo en localhost haría que 192.168.x.x:5173 no respondiera.
      host: '0.0.0.0',
      port: 5173,
      // No abrir el navegador solo: evita golpear el backend antes de que arranque.
      open: false,
      // El frontend llama a /api/... y Vite lo redirige al backend: sin CORS en desarrollo.
      proxy: {
        '/api': {
          // En Windows, `localhost` puede resolver a IPv6 e IPv4 a la vez y
          // Node lo reporta como AggregateError si el backend aun arranca.
          target: env.VITE_API_PROXY_TARGET || 'http://127.0.0.1:4000',
          changeOrigin: true,
          // El backend tarda ~40s en arrancar (sync BD + seeders). En esa ventana el
          // puerto aun no escucha: evitamos el volcado de AggregateError [ECONNREFUSED]
          // y respondemos 503 con un aviso limpio de una linea.
          configure: (proxy) => {
            proxy.on('error', (err, req, res) => {
              const code = (err as NodeJS.ErrnoException).code;
              const stillBooting = code === 'ECONNREFUSED' || code === 'ECONNRESET';

              if (stillBooting && res && 'writeHead' in res && !res.headersSent) {
                res.writeHead(503, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, message: 'Backend iniciando...' }));
              }

              if (stillBooting) {
                // Aviso discreto (amarillo, sin stack) mientras el backend termina de arrancar.
                console.log(`\x1b[33m[proxy]\x1b[0m backend aun no responde (${req.url}) — reintentando...`);
                return;
              }

              console.error('[proxy] error inesperado:', err.message);
            });
          },
        },
      },
    },
    build: {
      outDir: 'dist',
      sourcemap: mode !== 'production',
      rollupOptions: {
        output: {
          // La base visual y React cambian con mucha menos frecuencia que las
          // pantallas del negocio: separarlos mejora cache y carga recurrente.
          manualChunks(id) {
            if (id.includes('node_modules/@mui/') || id.includes('node_modules/@emotion/')) return 'vendor-mui';
            if (
              id.includes('node_modules/react/') ||
              id.includes('node_modules/react-dom/') ||
              id.includes('node_modules/react-router') ||
              id.includes('node_modules/@reduxjs/') ||
              id.includes('node_modules/react-redux')
            ) return 'vendor-react';
            return undefined;
          },
        },
      },
    },
  };
});
