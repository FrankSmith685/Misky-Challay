import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allocateProportionally, splitTaxFromGross } from '@shared/utils/tax';
import { round2 } from '@shared/utils/money';

const IGV = 0.18;

test('el impuesto se extrae del precio, no se suma encima', () => {
  // Un bowl de S/35.40 con IGV incluido: base 30.00 + IGV 5.40.
  const { base, tax } = splitTaxFromGross(35.4, IGV);
  assert.equal(base, 30);
  assert.equal(tax, 5.4);
});

test('base + impuesto reconstruye siempre el bruto exacto', () => {
  // Importes elegidos para provocar redondeo hacia arriba y hacia abajo.
  for (const gross of [0.01, 1, 9.99, 10, 33.33, 35.4, 99.95, 120.5, 1234.56]) {
    const { base, tax } = splitTaxFromGross(gross, IGV);
    assert.equal(round2(base + tax), gross, `falla con ${gross}`);
  }
});

test('un bruto de cero o negativo no genera impuesto', () => {
  assert.deepEqual(splitTaxFromGross(0, IGV), { base: 0, tax: 0 });
  assert.deepEqual(splitTaxFromGross(-5, IGV), { base: 0, tax: 0 });
});

test('el reparto proporcional suma exactamente el importe repartido', () => {
  // El centimo suelto: 10 entre tres partes iguales da 3.33 + 3.33 + 3.33 = 9.99.
  const parts = allocateProportionally(10, [1, 1, 1]);
  assert.equal(round2(parts.reduce((a, b) => a + b, 0)), 10);
});

test('el sobrante del reparto va a la linea de mayor peso', () => {
  const parts = allocateProportionally(10, [1, 1, 8]);
  assert.equal(round2(parts.reduce((a, b) => a + b, 0)), 10);
  assert.equal(parts[2], Math.max(...parts));
});

test('el reparto cuadra con importes y pesos irregulares', () => {
  const casos: Array<[number, number[]]> = [
    [7.77, [12.5, 3.3, 44.05]],
    [0.01, [1, 1, 1]],
    [123.45, [10, 20, 30, 40]],
    [5, [99.99, 0.01]],
  ];

  for (const [amount, weights] of casos) {
    const parts = allocateProportionally(amount, weights);
    assert.equal(
      round2(parts.reduce((a, b) => a + b, 0)),
      round2(amount),
      `no cuadra repartiendo ${amount}`,
    );
  }
});

test('sin pesos o sin importe no revienta', () => {
  assert.deepEqual(allocateProportionally(10, []), []);
  assert.deepEqual(allocateProportionally(0, [1, 2]), [0, 0]);
  assert.deepEqual(allocateProportionally(10, [0, 0]), [0, 0]);
});

test('desglose por linea: la suma de las lineas cuadra con el total del pedido', () => {
  // Pedido real: dos bowls y un delivery, con un cupon de S/10.
  const lineas = [35.4, 28.9];
  const delivery = 8.9;
  const descuento = 10;

  const bruto = round2(lineas.reduce((a, b) => a + b, 0) + delivery - descuento);
  const totalPedido = splitTaxFromGross(bruto, IGV);

  // Se reparte el descuento entre las lineas y el delivery, proporcionalmente.
  const pesos = [...lineas, delivery];
  const descuentos = allocateProportionally(descuento, pesos);
  const porLinea = pesos.map((peso, i) => splitTaxFromGross(round2(peso - descuentos[i]), IGV));

  const sumaBases = round2(porLinea.reduce((a, l) => a + l.base, 0));
  const sumaIgv = round2(porLinea.reduce((a, l) => a + l.tax, 0));

  // Tolerancia de un centimo: el reparto por linea puede diferir del total en el
  // ultimo redondeo, y es justo lo que hay que vigilar al emitir la boleta.
  assert.ok(Math.abs(sumaBases - totalPedido.base) <= 0.01, `bases: ${sumaBases} vs ${totalPedido.base}`);
  assert.ok(Math.abs(sumaIgv - totalPedido.tax) <= 0.01, `igv: ${sumaIgv} vs ${totalPedido.tax}`);
});
