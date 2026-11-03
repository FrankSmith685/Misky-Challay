import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { env } from '@config/env';
import { Product } from '@database/models';
import { ApiError } from '@shared/errors/ApiError';

const execFileAsync = promisify(execFile);
const backendRoot = path.resolve(__dirname, '../../..');
const scriptPath = path.join(backendRoot, 'scripts/purge-demo-product.cjs');

export interface DemoProductPurgePlan {
  product: { id: number; name: string; slug: string; status: string; deleted_at: string };
  variants: Array<{ id: number; sku: string }>;
  orderItems: number;
  variantOrderItems: number;
  productAuditLogs: number;
  variantAuditLogs: number;
}

const assertLocalDemoEnvironment = () => {
  if (env.NODE_ENV !== 'development'
    || !['localhost', '127.0.0.1', '::1'].includes(env.DB_HOST)
    || env.DB_NAME !== 'DulceFlow'
    || env.SEED_DEMO_DATA
    || env.MERCADOPAGO_MODE === 'live') {
    throw ApiError.forbidden('El borrado definitivo solo está disponible en la base local de desarrollo sin pagos reales');
  }
  if (!fs.existsSync(scriptPath)) throw ApiError.internal('No se encontró el procedimiento de borrado definitivo');
};

const runPurgeScript = async (productId: number, slug: string, execute: boolean) => {
  try {
    const { stdout } = await execFileAsync(
      process.execPath,
      [scriptPath, String(productId), slug, ...(execute ? ['--execute'] : [])],
      { cwd: backendRoot, windowsHide: true, timeout: 180_000, maxBuffer: 1024 * 1024 },
    );
    return JSON.parse(stdout) as {
      mode: 'dry-run' | 'execute';
      plan: DemoProductPurgePlan;
      backup?: string;
      purgedProductId?: number;
    };
  } catch (error) {
    const failure = error as Error & { stderr?: string; killed?: boolean };
    if (failure.killed) throw ApiError.internal('Se agotó el tiempo del borrado; revisa la base y el respaldo antes de reintentar');
    const reason = failure.stderr?.trim().replace(/^Purga falló:\s*/i, '');
    if (reason) throw ApiError.conflict(reason);
    throw ApiError.internal('No se pudo verificar o borrar la ficha archivada');
  }
};

const archivedProduct = async (productId: number) => {
  const product = await Product.findByPk(productId, { paranoid: false });
  if (!product) throw ApiError.notFound('Ficha no encontrada');
  if (product.status !== 'INACTIVE' || !product.deletedAt) {
    throw ApiError.conflict('Solo se puede eliminar definitivamente una ficha retirada y archivada');
  }
  return product;
};

export const demoProductPurgeService = {
  async preview(productId: number): Promise<DemoProductPurgePlan> {
    assertLocalDemoEnvironment();
    const product = await archivedProduct(productId);
    const result = await runPurgeScript(productId, product.slug, false);
    if (result.mode !== 'dry-run' || result.plan.product.id !== productId) {
      throw ApiError.internal('La vista previa del borrado es inválida');
    }
    return result.plan;
  },

  async execute(productId: number, slug: string) {
    assertLocalDemoEnvironment();
    const product = await archivedProduct(productId);
    if (product.slug !== slug) throw ApiError.conflict('El identificador de la ficha cambió');
    const result = await runPurgeScript(productId, slug, true);
    if (result.mode !== 'execute' || result.purgedProductId !== productId || !result.backup) {
      throw ApiError.internal('No se pudo confirmar el resultado del borrado; revisa la base antes de reintentar');
    }
    return { id: productId, backup: path.basename(result.backup) };
  },
};
