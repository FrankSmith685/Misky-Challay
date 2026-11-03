import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { coverageExtensionFor, distanceToPolygonKm } from '../modules/geo/coverageExtension';

const polygon = [
  { lat: -12.10, lng: -77.05 },
  { lat: -12.10, lng: -77.04 },
  { lat: -12.09, lng: -77.04 },
  { lat: -12.09, lng: -77.05 },
];

describe('extensión tarifada de cobertura', () => {
  it('mide la distancia al borde más cercano, no al centro de la zona', () => {
    const distance = distanceToPolygonKm({ lat: -12.095, lng: -77.039 }, polygon);
    assert.ok(distance > 0.1 && distance < 0.12);
  });

  it('suma el recargo configurado solo dentro del alcance máximo', () => {
    const zone = { polygon, extraCoverageKm: 1, extraFeePerKm: 10, priority: 1 };
    const near = coverageExtensionFor({ lat: -12.095, lng: -77.039 }, [zone]);
    assert.equal(near?.zone, zone);
    assert.ok(near && near.fee > 1 && near.fee < 1.2);
    assert.equal(coverageExtensionFor({ lat: -12.095, lng: -77.02 }, [zone]), null);
  });

  it('no extiende una zona sin polígono o sin tarifa', () => {
    const point = { lat: -12.095, lng: -77.039 };
    assert.equal(coverageExtensionFor(point, [{ polygon: null, extraCoverageKm: 1, extraFeePerKm: 10, priority: 1 }]), null);
    assert.equal(coverageExtensionFor(point, [{ polygon, extraCoverageKm: 1, extraFeePerKm: 0, priority: 1 }]), null);
  });

  it('cotiza fuera de la zona sin límite cuando se configuró una tarifa', () => {
    const zone = { polygon, extraCoverageKm: 0, extraFeePerKm: 1.5, priority: 1 };
    const near = coverageExtensionFor({ lat: -12.095, lng: -77.039 }, [zone]);
    const far = coverageExtensionFor({ lat: -12.095, lng: -77.02 }, [zone]);
    assert.equal(far?.zone, zone);
    assert.ok(near && far && near.fee > 0 && far.fee > near.fee);
  });
});
