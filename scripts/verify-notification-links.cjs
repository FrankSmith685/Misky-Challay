const assert = require('node:assert/strict');
const path = require('node:path');
const { buildSync } = require('esbuild');

const root = path.resolve(__dirname, '..');
const load = (entry, tsconfig) => {
  const result = buildSync({
    absWorkingDir: root,
    entryPoints: [entry],
    tsconfig,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    write: false,
    logLevel: 'silent',
  });
  const loaded = { exports: {} };
  new Function('module', 'exports', 'require', result.outputFiles[0].text)(loaded, loaded.exports, require);
  return loaded.exports;
};

const { notificationDestination: web } = load('frontend/src/lib/notificationDestination.ts', 'frontend/tsconfig.json');
const { mobileNotificationHref: mobile } = load('mobile/src/lib/notificationRoutes.ts', 'mobile/tsconfig.json');

const order = 'VB-MVQZJVOG-7948';
const webOrder = `/cuenta/pedidos/${order}`;
for (const actionUrl of [`/order/${order}`, webOrder]) {
  assert.equal(web({ actionUrl }), webOrder);
  assert.deepEqual(mobile(actionUrl), { pathname: '/order/[orderNumber]', params: { orderNumber: order } });
}
assert.equal(web({ actionUrl: null, order: { orderNumber: order } }), webOrder);
assert.equal(web({ actionUrl: '/wallet' }), '/cuenta/saldo');
assert.equal(web({ actionUrl: '/staff/kitchen?branchId=3' }), '/admin/cocina?branchId=3');
assert.equal(web({ actionUrl: '/admin/compras?branchId=3' }), '/admin/compras?branchId=3');
assert.equal(web({ actionUrl: '/cuenta/disenos?solicitud=12' }), '/cuenta/disenos?solicitud=12');
assert.equal(web({ actionUrl: '/menu/torta-chocolate' }), '/menu/torta-chocolate');
assert.equal(web({ actionUrl: null, template: 'PLAN_ACTIVATED' }), '/cuenta/saldo');
assert.equal(web({ actionUrl: null, template: 'COMPLAINT_RESPONDED' }), '/libro-de-reclamaciones');
assert.equal(web({ actionUrl: '//malicioso.example' }), null);
assert.equal(web({ actionUrl: 'javascript:alert(1)' }), null);
assert.equal(web({ actionUrl: '/ruta-inexistente' }), null);

assert.deepEqual(mobile('/admin/cocina?branchId=3'), { pathname: '/staff/[module]', params: { module: 'kitchen', branchId: '3' } });
assert.equal(mobile('/cuenta/saldo'), '/wallet');
assert.equal(mobile('/libro-de-reclamaciones'), '/support');
assert.equal(mobile('/cuenta/disenos?solicitud=12'), '/cakes');
assert.equal(mobile('/ruta-inexistente'), null);

process.stdout.write('Destinos de avisos web y móvil: correctos.\n');
