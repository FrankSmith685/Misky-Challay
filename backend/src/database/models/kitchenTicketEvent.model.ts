import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
} from 'sequelize';
import { sequelize } from '../connection';

/**
 * Tabla `kitchen_ticket_events`: cada accion en cocina, con quien y cuando.
 * Sirve para medir tiempos (aceptacion, preparacion) y para explicar incidencias.
 */
export class KitchenTicketEvent extends Model<
  InferAttributes<KitchenTicketEvent>,
  InferCreationAttributes<KitchenTicketEvent>
> {
  declare id: CreationOptional<number>;
  declare ticketId: number;
  declare fromStatus: CreationOptional<string | null>;
  declare toStatus: string;
  declare actorId: CreationOptional<number | null>;
  declare comment: CreationOptional<string | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

KitchenTicketEvent.init(
  {
    id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
    ticketId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    fromStatus: { type: DataTypes.STRING(20), allowNull: true },
    toStatus: { type: DataTypes.STRING(20), allowNull: false },
    actorId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    comment: { type: DataTypes.STRING(255), allowNull: true },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize,
    modelName: 'KitchenTicketEvent',
    tableName: 'kitchen_ticket_events',
    indexes: [{ name: 'idx_kte_ticket', fields: ['ticket_id'] }],
  },
);

export default KitchenTicketEvent;
