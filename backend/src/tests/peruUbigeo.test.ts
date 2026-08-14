import assert from 'node:assert/strict';
import test from 'node:test';
import { peruUbigeoService } from '@modules/geo/peruUbigeo.service';

test('expone la jerarquía UBIGEO nacional completa', () => {
  const departments = peruUbigeoService.listDepartments();
  assert.equal(departments.length, 25);

  const arequipa = departments.find((row) => row.name === 'Arequipa');
  assert.equal(arequipa?.code, '04');

  const provinces = peruUbigeoService.listProvinces('04');
  assert.ok(provinces.some((row) => row.name === 'Arequipa' && row.code === '0401'));

  const districts = peruUbigeoService.listDistricts('0401');
  assert.ok(districts.some((row) => row.name === 'Cayma' && row.code === '040103'));
});

test('homologa un distrito repetido usando provincia, departamento y coordenadas', () => {
  const result = peruUbigeoService.matchDistrict({
    districtNames: ['Miraflores'],
    provinceNames: ['Arequipa'],
    departmentNames: ['Arequipa'],
    latitude: -16.3947,
    longitude: -71.5225,
  });

  assert.equal(result?.code, '040110');
  assert.equal(result?.province, 'Arequipa');
});

test('homologa Cercado de Lima al UBIGEO oficial del distrito de Lima', () => {
  const result = peruUbigeoService.matchDistrict({
    districtNames: ['Cercado de Lima'],
    provinceNames: ['Lima'],
    departmentNames: ['Lima'],
    latitude: -12.0453,
    longitude: -77.0308,
  });

  assert.equal(result?.code, '150101');
  assert.equal(result?.name, 'Lima');
});

test('no confunde la localidad Pachacutec del Callao con el distrito de Ica', () => {
  const result = peruUbigeoService.matchDistrict({
    districtNames: ['Pachacútec', 'Ventanilla'],
    provinceNames: ['Callao'],
    departmentNames: ['Provincia Constitucional del Callao'],
    latitude: -11.88,
    longitude: -77.13,
  });

  assert.equal(result?.code, '070106');
  assert.equal(result?.department, 'Callao');
  assert.equal(result?.name, 'Ventanilla');
});

test('rechaza un distrito homónimo demasiado lejano al pin', () => {
  const result = peruUbigeoService.matchDistrict({
    districtNames: ['Pachacútec'],
    latitude: -11.88,
    longitude: -77.13,
  });

  assert.equal(result, null);
});

test('homologa la grafía Cuzco del mapa con el UBIGEO oficial Cusco', () => {
  const result = peruUbigeoService.matchDistrict({
    districtNames: ['Cuzco'],
    provinceNames: ['Cuzco'],
    departmentNames: ['Cusco'],
    latitude: -13.5167,
    longitude: -71.9781,
  });

  assert.equal(result?.code, '080101');
  assert.equal(result?.department, 'Cusco');
  assert.equal(result?.province, 'Cusco');
  assert.equal(result?.name, 'Cusco');
});

test('el catálogo mantiene la jerarquía oficial de Ninabamba', () => {
  const ninabamba = peruUbigeoService.findDistrictByCode('061306');

  assert.equal(ninabamba?.department, 'Cajamarca');
  assert.equal(ninabamba?.province, 'Santa Cruz');
  assert.equal(ninabamba?.name, 'Ninabamba');
});

test('homologa correctamente los 1,891 distritos usando su jerarquía completa', () => {
  const allDistricts = peruUbigeoService
    .listDepartments()
    .flatMap((department) => peruUbigeoService
      .listProvinces(department.code)
      .flatMap((province) => peruUbigeoService.listDistricts(province.code)));

  assert.equal(allDistricts.length, 1_891);
  for (const district of allDistricts) {
    const result = peruUbigeoService.matchDistrict({
      districtNames: [district.name],
      provinceNames: [district.province],
      departmentNames: [district.department],
      latitude: district.latitude,
      longitude: district.longitude,
    });
    assert.equal(result?.code, district.code, `No homologó ${district.code} ${district.name}`);
  }
});
