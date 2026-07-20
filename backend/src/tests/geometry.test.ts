import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { pointInPolygon, polygonsOverlap, polygonSelfIntersects } from '../modules/geo/geometry';

const square = [
  { lat: 0, lng: 0 }, { lat: 0, lng: 4 }, { lat: 4, lng: 4 }, { lat: 4, lng: 0 },
];

describe('coverage geometry', () => {
  it('detects points inside and outside a polygon', () => {
    assert.equal(pointInPolygon({ lat: 2, lng: 2 }, square), true);
    assert.equal(pointInPolygon({ lat: 6, lng: 2 }, square), false);
  });

  it('detects crossing polygons even when no vertex is inside', () => {
    const horizontal = [{ lat: 1, lng: -1 }, { lat: 1, lng: 5 }, { lat: 3, lng: 5 }, { lat: 3, lng: -1 }];
    assert.equal(polygonsOverlap(square, horizontal), true);
  });

  it('detects a self-crossing bow tie', () => {
    assert.equal(polygonSelfIntersects([{ lat: 0, lng: 0 }, { lat: 4, lng: 4 }, { lat: 0, lng: 4 }, { lat: 4, lng: 0 }]), true);
  });
});
