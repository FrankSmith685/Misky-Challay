# Catálogo geográfico

`peru-ubigeo-2025.json` contiene 1,891 distritos del catálogo INEI 2025, reducido a
los campos necesarios por la aplicación: UBIGEO, departamento, provincia, distrito
y coordenadas de referencia.

Fuente de preparación:
`MichaelSuarez0/ubigeos_peru`, archivo `databases/ubigeo_inei_2025.csv`, basado en
el Directorio Nacional de Gobiernos Regionales, Municipalidades Provinciales,
Distritales y de Centros Poblados 2025.

SHA-256 del CSV usado:
`FF535566FBF211A52FEF8C81100121BBA737CEE6E054560DBB1CBD99A4EC54BB`.

Las coordenadas representan una referencia del distrito; la dirección exacta se
obtiene del proveedor de mapas y se confirma siempre con el pin.

Correcciones verificadas durante la auditoría de integración del mapa:

- UBIGEO `061306`: la provincia es Santa Cruz y el distrito es Ninabamba. El CSV
  de preparación repetía Ninabamba en ambos campos.
- UBIGEO `040101`: el punto de referencia se ajustó dentro del distrito de
  Arequipa; la coordenada original era interpretada por OpenStreetMap como
  Miraflores (`040110`).

La aplicación no considera estas coordenadas como límites territoriales. Para
resolver un pin usa la jerarquía administrativa devuelta por el geocodificador
(`level4`, `level6` y `level8`) y la homologa contra el UBIGEO local completo.
