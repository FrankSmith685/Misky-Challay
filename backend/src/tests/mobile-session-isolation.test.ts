import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

/** Load the actual cache implementation without mounting React Native. */
function cacheModule() {
  const source = readFileSync(resolve(process.cwd(), '../mobile/src/hooks/useResource.ts'), 'utf8') + '\nexport const testing = { runFetch, readCache, ResourceInvalidatedError, listeners };';
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports: Record<string, unknown> = {};
  const context = vm.createContext({ exports, setTimeout, clearTimeout, setInterval, clearInterval,
    require: (name: string) => name.includes('client') ? { ApiRequestError: class extends Error {} } : {} });
  vm.runInContext(code, context);
  return exports as { invalidateResource: (key?: string, options?: { prefix?: boolean; reset?: boolean }) => void; testing: { runFetch: <T>(key: string, fetcher: () => Promise<T>, retries: number) => Promise<T>; readCache: (key: string) => { value: unknown } | undefined; listeners: Map<string, Set<(reset?: boolean) => void>> } };
}

test('cerrar A y cargar B impide que una respuesta tardía vuelva a llenar la caché con A', async () => {
  const { invalidateResource, testing } = cacheModule();
  let resolveA!: (value: string) => void;
  const old = testing.runFetch('orders:private', () => new Promise<string>((resolve) => { resolveA = resolve; }), 0);
  const rejected = assert.rejects(old);
  invalidateResource();
  await testing.runFetch('orders:private', async () => 'usuario-B', 0);
  resolveA('usuario-A');
  await rejected;
  assert.equal(testing.readCache('orders:private')?.value, 'usuario-B');
});

test('invalidar una familia descarta también claves que solo tienen una petición pendiente', async () => {
  const { invalidateResource, testing } = cacheModule();
  let resolveOld!: (value: string) => void;
  const old = testing.runFetch('staff:orders:1', () => new Promise<string>((resolve) => { resolveOld = resolve; }), 0);
  const rejected = assert.rejects(old);
  invalidateResource('staff:', { prefix: true });
  resolveOld('anterior'); await rejected;
  assert.equal(testing.readCache('staff:orders:1'), undefined);
  assert.equal(await testing.runFetch('staff:orders:1', async () => 'actual', 0), 'actual');
});

test('la salida de sesión borra el dato montado y un refresco por push conserva su borrador', () => {
  const { invalidateResource, testing } = cacheModule();
  const events: boolean[] = [];
  testing.listeners.set('account:private', new Set([(reset = false) => events.push(reset)]));
  invalidateResource(undefined, { reset: false });
  invalidateResource();
  assert.deepEqual(events, [false, true]);
});
