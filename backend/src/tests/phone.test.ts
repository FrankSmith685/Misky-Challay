import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizePhone } from '../shared/utils/phone';
import { registerSchema } from '../modules/auth/auth.validation';

test('el mismo numero escrito de dos formas normaliza igual', () => {
  // El caso que rompia el registro: la cuenta existente tenia "926 749 330" y el
  // indice unico no reconocia "926749330" como el mismo telefono.
  assert.equal(normalizePhone('926 749 330'), '926749330');
  assert.equal(normalizePhone('926749330'), '926749330');
  assert.equal(normalizePhone('926-749-330'), '926749330');
  assert.equal(normalizePhone(' (926) 749 330 '), '926749330');
});

test('conserva el prefijo internacional', () => {
  assert.equal(normalizePhone('+51 926 749 330'), '+51926749330');
  assert.equal(normalizePhone('+51926749330'), '+51926749330');
});

test('un telefono ausente o vacio se guarda como null, no como cadena vacia', () => {
  // Importa: en MySQL varios NULL conviven bajo un indice unico, pero varias
  // cadenas vacias no. Guardar '' haria que el segundo cliente sin telefono
  // chocara con el primero.
  assert.equal(normalizePhone(undefined), null);
  assert.equal(normalizePhone(null), null);
  assert.equal(normalizePhone(''), null);
  assert.equal(normalizePhone('   '), null);
  assert.equal(normalizePhone('---'), null);
});

test('el registro acepta el telefono con separadores y normaliza el email', () => {
  const result = registerSchema.safeParse({
    body: {
      email: '  Pruebas@Gmail.com ',
      password: 'Frankporx12-a',
      firstName: 'Erick',
      lastName: 'Rojas',
      phone: '926 749 330',
      acceptedTerms: true,
    },
  });

  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.body.email, 'pruebas@gmail.com');
    assert.equal(normalizePhone(result.data.body.phone), '926749330');
  }
});

test('el registro rechaza un telefono sin digitos suficientes', () => {
  const result = registerSchema.safeParse({
    body: {
      email: 'pruebas@gmail.com',
      password: 'Frankporx12-a',
      firstName: 'Erick',
      lastName: 'Rojas',
      phone: '12-3',
      acceptedTerms: true,
    },
  });

  assert.equal(result.success, false);
});
