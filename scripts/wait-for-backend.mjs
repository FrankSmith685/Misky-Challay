import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { loadEnv } from 'vite';

const frontendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../frontend');
const env = loadEnv('development', frontendDir, '');
const apiBase = env.VITE_API_URL || '/api/v1';

// An absolute API URL bypasses Vite's proxy, so it needs no local backend wait.
if (/^https?:\/\//i.test(apiBase)) {
  process.exit(0);
}

const target = env.VITE_API_PROXY_TARGET || 'http://localhost:4000';
const readyUrl = new URL(`${apiBase.replace(/\/+$/, '')}/ready`, target);
const deadline = Date.now() + 180_000;

console.log(`Esperando al backend en ${readyUrl.href}...`);

while (Date.now() < deadline) {
  try {
    const response = await fetch(readyUrl, { signal: AbortSignal.timeout(2_000) });
    if (response.ok) {
      console.log('Backend listo. Iniciando frontend.');
      process.exit(0);
    }
  } catch {
    // El puerto permanece cerrado mientras MySQL y los seeders arrancan.
  }
  await sleep(1_000);
}

console.error(`El backend no respondió en ${readyUrl.href} tras 180 segundos. Revisa los logs de BACKEND.`);
process.exit(1);
