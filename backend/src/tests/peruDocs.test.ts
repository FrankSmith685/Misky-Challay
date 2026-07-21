import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isValidDni, isValidRuc } from '@shared/utils/peruDocs';

test('acepta RUC reales con digito verificador correcto', () => {
  // RUC de entidades publicas peruanas (digito verificador real).
  assert.equal(isValidRuc('20131312955'), true); // SUNAT
  assert.equal(isValidRuc('20100070970'), true); // Backus
});

test('rechaza RUC con prefijo imposible', () => {
  assert.equal(isValidRuc('99999999999'), false);
  assert.equal(isValidRuc('12345678901'), false); // prefijo 12 no existe
});

test('rechaza RUC con digito verificador incorrecto', () => {
  // Prefijo valido (20) pero ultimo digito mal.
  assert.equal(isValidRuc('20131312954'), false);
  assert.equal(isValidRuc('20100070971'), false);
});

test('rechaza RUC de longitud incorrecta o no numerico', () => {
  assert.equal(isValidRuc('2013131295'), false); // 10 digitos
  assert.equal(isValidRuc('201313129550'), false); // 12 digitos
  assert.equal(isValidRuc('2013131295a'), false);
  assert.equal(isValidRuc(''), false);
});

test('DNI valido es exactamente 8 digitos', () => {
  assert.equal(isValidDni('12345678'), true);
  assert.equal(isValidDni('1234567'), false);
  assert.equal(isValidDni('123456789'), false);
  assert.equal(isValidDni('1234567a'), false);
});
