# Espaciado de la web

## Corrección compartida

Material UI y Tailwind usan este orden de capas:

```css
@layer theme, base, mui, components, utilities;
```

`StyledEngineProvider enableCssLayer` en `frontend/src/main.tsx` incluye los
estilos de Material UI en `mui`. El orden se declara antes de Tailwind en
`frontend/src/styles/index.css` y al iniciar el proveedor. Así las clases de
las vistas pueden aplicar los márgenes, tamaños y distribución que definen.

El problema anterior era que el reset `margin: 0` de los botones, campos y
textos de Material UI tenía prioridad sobre las utilidades. Por ejemplo,
`mt-7` en el botón de cajas mensuales se resolvía a cero. Ahora conserva sus
28 px de separación respecto a la lista.

Referencia: [integración oficial de Material UI y Tailwind v4 para Vite](https://mui.com/material-ui/integrations/tailwindcss/tailwindcss-v4/#vitejs-or-any-other-spa).

## Criterios de las vistas

| Relación | Separación habitual |
| --- | --- |
| Icono y texto | 8–12 px |
| Acciones de una misma fila | 8–12 px, con salto de línea |
| Campos relacionados | 16–24 px |
| Encabezado y contenido de una tarjeta | 16–20 px |
| Contenido y acción principal | 24–28 px |
| Secciones de un formulario | 24 px |

- Usar `grid` o `flex` con `gap` para filas y grupos; `FormGrid` y `FormStack`
  ya proporcionan el ritmo de los formularios.
- Usar `mt-*` y `mb-*` para separar bloques. Las clases funcionan también en
  componentes de Material UI y dentro de los portales de los modales.
- Mantener los campos a una columna cuando el ancho no permita leerlos con
  comodidad. Permitir que las acciones pasen de fila.
- Los encabezados limitan el ancho de sus acciones y permiten envolverlas.
  El selector compartido de sucursal ocupa el ancho disponible en celular y
  230 px en escritorio, respetando siempre el ancho de su contenedor.
- Mantener los colores y radios vinculados al tema gestionable.

## Verificación

`e2e/layout-spacing.spec.ts` recorre las vistas públicas, de cuenta y de
administración en 390 y 1440 px, incluidas las pestañas de configuración.
Detecta márgenes anulados, controles fuera de pantalla y desbordamientos.
Comprueba también la distancia real entre la lista y el botón de cajas
mensuales, y entre campos dentro del modal de direcciones.

Las consultas se interceptan con datos de prueba. Los estados vacíos de listas
se complementan con los escenarios con contenido de `business-designs`,
`cake-live-price`, `checkout-prices`, `communications`, `delivery-reference`,
`direct-payments` y `experiences`.

Revisión realizada en 390 y 1440 px:

| Área | Rutas y estados principales |
| --- | ---: |
| Tienda, acceso y contenido informativo | 17 |
| Cuenta del cliente | 10 |
| Administración y pestañas de configuración | 36 |
| Total | 63 |

Las 10 pruebas de espaciado y las 23 pruebas seleccionadas de flujos con contenido
quedaron verificadas. TypeScript, ESLint de los componentes modificados y la
compilación de producción también pasaron.

```sh
npx playwright test e2e/layout-spacing.spec.ts
```

La revisión automática cubre las rutas y los estados definidos en esas pruebas;
conviene revisar visualmente los nuevos formularios y datos especialmente largos
que se incorporen al sistema.
