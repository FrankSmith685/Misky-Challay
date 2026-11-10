import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
} from 'sequelize';
import { sequelize } from '../connection';

/** Un vertice del poligono de cobertura. */
export interface GeoPoint {
  lat: number;
  lng: number;
}

/**
 * Tabla `coverage_zones` (seccion 14.8).
 *
 * El poligono se guarda como JSON de puntos y la validacion punto-en-poligono se
 * hace en el servicio (geo.service.ts). Es suficiente para zonas urbanas simples y
 * evita depender de tipos espaciales. Si las zonas crecen o se necesitan consultas
 * espaciales indexadas, se migra este campo a GEOMETRY (MySQL) o PostGIS.
 */
export class CoverageZone extends Model<
  InferAttributes<CoverageZone>,
  InferCreationAttributes<CoverageZone>
> {
  declare id: CreationOptional<number>;
  declare cityId: number;
  declare name: string;
  declare polygon: GeoPoint[] | null;
  declare deliveryFee: number;
  /** Recargo logístico único cuando el pedido contiene tortas. */
  declare cakeDeliveryFee: CreationOptional<number>;
  declare extraCoverageKm: CreationOptional<number>;
  declare extraFeePerKm: CreationOptional<number>;
  /** 0 = sin mínimo. Un monto positivo exige ese subtotal de productos solo en delivery. */
  declare minimumOrder: CreationOptional<number>;
  declare estimatedMinutes: CreationOptional<number>;
  declare priority: CreationOptional<number>;
  declare isActive: CreationOptional<boolean>;
  /** Version de concurrencia optimista: evita sobrescribir cambios de otro admin. */
  declare version: CreationOptional<number>;
  /** Fecha de entrada en vigor de la configuracion publicada. */
  declare effectiveFrom: CreationOptional<Date | null>;
  /** Apagado historico: la zona no se borra porque puede estar en pedidos antiguos. */
  declare archivedAt: CreationOptional<Date | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

CoverageZone.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    cityId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    name: { type: DataTypes.STRING(80), allowNull: false },
    polygon: { type: DataTypes.JSON, allowNull: true },
    deliveryFee: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
    cakeDeliveryFee: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
    extraCoverageKm: { type: DataTypes.DECIMAL(6, 2), allowNull: false, defaultValue: 0 },
    extraFeePerKm: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
    minimumOrder: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
    estimatedMinutes: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 45 },
    priority: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    version: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 1 },
    effectiveFrom: { type: DataTypes.DATE, allowNull: true },
    archivedAt: { type: DataTypes.DATE, allowNull: true },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  { sequelize, modelName: 'CoverageZone', tableName: 'coverage_zones' },
);

export default CoverageZone;
