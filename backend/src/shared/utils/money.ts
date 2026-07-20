/**
 * Redondeo a dos decimales, con un unico dueno.
 *
 * El dinero se guarda en DECIMAL(12,2) y Sequelize lo entrega como numero, pero las
 * sumas intermedias en JS arrastran binario (0.1 + 0.2 = 0.30000000000000004). Cada
 * importe que se escribe o se compara pasa por aqui para que dos modulos no lleguen
 * a conclusiones distintas sobre el mismo total.
 */
export const round2 = (value: number): number => Math.round(value * 100) / 100;
