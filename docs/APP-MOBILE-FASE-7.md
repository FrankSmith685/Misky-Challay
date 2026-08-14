# Aplicación móvil — Fase 7

## Objetivo

Cerrar la operación comercial para restaurantes en Perú sin confundir un pago declarado por el cliente con dinero realmente conciliado ni una vista imprimible con un comprobante aceptado.

## Flujo de Yape y Plin

```text
Administrador configura Yape/Plin
              ↓
Cliente paga y escribe código de operación
              ↓
Pedido PENDING_PAYMENT + reserva temporal
              ↓
Caja compara el movimiento en Yape/Plin
       ↙ aprobar                ↘ rechazar
Pedido confirmado → Cocina       Pedido cancelado
Stock/cupo confirmados            Reservas y saldo liberados
```

- Cada código de operación es único por proveedor.
- Caja necesita `payment.verify` y solo ve pedidos de sus sucursales.
- Un pedido pendiente no genera ticket de Cocina.
- Si el cliente cancela antes de la validación, el movimiento desaparece de la cola pendiente.
- La validación y su actor quedan en auditoría.

## Comprobantes

El pedido congela tipo de documento, receptor, base imponible, IGV y total. El permiso `invoice.manage` permite registrar la serie, correlativo, fecha, referencia del OSE y enlaces PDF/XML una vez que un proveedor real confirmó la emisión.

La impresión previa muestra de forma explícita “pendiente de emisión”. El sistema no inventa un número SUNAT ni llama “emitido” a una previsualización.

## Soporte al cliente

La app incluye una pantalla nativa de soporte con WhatsApp, políticas y Libro de Reclamaciones. Desde el detalle del pedido, WhatsApp prepara un mensaje que incluye el número del pedido para reducir errores de atención.

## Configuración necesaria

1. En `Admin → Configuración → Pagos`, habilitar Yape y/o Plin y completar los datos reales.
2. Asignar `payment.verify` a quienes concilian Caja.
3. Asignar `invoice.manage` solo a quienes registran comprobantes emitidos.
4. Ejecutar las migraciones `0021` y `0022` y volver a sembrar RBAC.
5. Para emisión automática, contratar un OSE/integrador y conectar sus credenciales en backend; esta fase deja el contrato y la trazabilidad, no credenciales ficticias.
