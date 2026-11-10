import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  NonAttribute,
} from 'sequelize';
import { sequelize } from '../connection';
import type { ComplaintResponse } from './complaintResponse.model';
import type { ComplaintNote } from './complaintNote.model';
import type { ComplaintEvidence } from './complaintEvidence.model';
import type { User } from './user.model';

/**
 * LIBRO DE RECLAMACIONES VIRTUAL (INDECOPI)
 * ---------------------------------------------------------------------------
 * Obligatorio para todo comercio electronico en Peru (D.S. 011-2011-PCM y su
 * reglamento). No es un buzon de contacto: es un registro formal con correlativo,
 * copia al consumidor y un plazo legal de respuesta.
 *
 * La ley distingue dos figuras y hay que respetarla:
 *   RECLAMO -> disconformidad con el producto o el servicio (algo salio mal).
 *   QUEJA   -> disconformidad con la atencion (el trato, no el producto).
 */
export const COMPLAINT_TYPE = { RECLAMO: 'RECLAMO', QUEJA: 'QUEJA' } as const;
export type ComplaintType = (typeof COMPLAINT_TYPE)[keyof typeof COMPLAINT_TYPE];

/** Sobre que recae: un bien contratado o un servicio. */
export const COMPLAINT_ITEM = { PRODUCTO: 'PRODUCTO', SERVICIO: 'SERVICIO' } as const;
export type ComplaintItem = (typeof COMPLAINT_ITEM)[keyof typeof COMPLAINT_ITEM];

/** Documento de identidad del consumidor. */
export const COMPLAINT_DOC = { DNI: 'DNI', CE: 'CE', PASAPORTE: 'PASAPORTE', RUC: 'RUC' } as const;
export type ComplaintDoc = (typeof COMPLAINT_DOC)[keyof typeof COMPLAINT_DOC];

export const COMPLAINT_STATUS = {
  RECEIVED: 'RECEIVED',
  IN_PROGRESS: 'IN_PROGRESS',
  RESOLVED: 'RESOLVED',
} as const;
export type ComplaintStatus = (typeof COMPLAINT_STATUS)[keyof typeof COMPLAINT_STATUS];

export class Complaint extends Model<
  InferAttributes<Complaint>,
  InferCreationAttributes<Complaint>
> {
  declare id: CreationOptional<number>;
  /** Correlativo legal visible ("LR-000123"). Se asigna al crear, desde el id. */
  declare code: CreationOptional<string | null>;

  declare type: ComplaintType;
  declare itemType: ComplaintItem;

  // --- Consumidor (identificacion obligatoria) ---
  declare consumerName: string;
  declare docType: ComplaintDoc;
  declare docNumber: string;
  declare email: string;
  declare phone: CreationOptional<string | null>;
  declare address: CreationOptional<string | null>;
  /** Menor de edad: la ley exige entonces los datos del padre o apoderado. */
  declare isMinor: CreationOptional<boolean>;
  declare guardianName: CreationOptional<string | null>;

  // --- Detalle ---
  declare itemDescription: CreationOptional<string | null>;
  /** Monto reclamado, si aplica (bienes o servicios con importe). */
  declare claimedAmount: CreationOptional<number | null>;
  declare detail: string;
  /** Lo que el consumidor pide (pedido concreto). */
  declare request: string;
  /** Pedido asociado, si el reclamo nace de una compra. */
  declare orderId: CreationOptional<number | null>;
  declare userId: CreationOptional<number | null>;

  // --- Trazabilidad y respuesta ---
  declare status: CreationOptional<ComplaintStatus>;
  /** Fecha limite de respuesta segun el plazo legal, congelada al crear. */
  declare dueAt: Date;
  declare response: CreationOptional<string | null>;
  declare respondedAt: CreationOptional<Date | null>;
  declare respondedBy: CreationOptional<number | null>;
  declare assignedTo: CreationOptional<number | null>;
  declare assignedAt: CreationOptional<Date | null>;
  declare reopenedAt: CreationOptional<Date | null>;
  declare reopenedBy: CreationOptional<number | null>;
  declare reopenReason: CreationOptional<string | null>;
  declare draftResponse: CreationOptional<string | null>;
  declare draftUpdatedAt: CreationOptional<Date | null>;
  declare draftBy: CreationOptional<number | null>;
  declare escalatedAt: CreationOptional<Date | null>;
  declare escalationReason: CreationOptional<string | null>;

  declare assignedUser?: NonAttribute<User | null>;
  declare responses?: NonAttribute<ComplaintResponse[]>;
  declare notes?: NonAttribute<ComplaintNote[]>;
  declare evidences?: NonAttribute<ComplaintEvidence[]>;

  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

Complaint.init(
  {
    id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
    code: { type: DataTypes.STRING(20), allowNull: true },

    type: { type: DataTypes.ENUM(...Object.values(COMPLAINT_TYPE)), allowNull: false },
    itemType: {
      type: DataTypes.ENUM(...Object.values(COMPLAINT_ITEM)),
      allowNull: false,
      defaultValue: COMPLAINT_ITEM.PRODUCTO,
    },

    consumerName: { type: DataTypes.STRING(160), allowNull: false },
    docType: {
      type: DataTypes.ENUM(...Object.values(COMPLAINT_DOC)),
      allowNull: false,
      defaultValue: COMPLAINT_DOC.DNI,
    },
    docNumber: { type: DataTypes.STRING(20), allowNull: false },
    email: { type: DataTypes.STRING(160), allowNull: false },
    phone: { type: DataTypes.STRING(30), allowNull: true },
    address: { type: DataTypes.STRING(200), allowNull: true },
    isMinor: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    guardianName: { type: DataTypes.STRING(160), allowNull: true },

    itemDescription: { type: DataTypes.STRING(255), allowNull: true },
    claimedAmount: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
    detail: { type: DataTypes.TEXT, allowNull: false },
    request: { type: DataTypes.TEXT, allowNull: false },
    orderId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    userId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },

    status: {
      type: DataTypes.ENUM(...Object.values(COMPLAINT_STATUS)),
      allowNull: false,
      defaultValue: COMPLAINT_STATUS.RECEIVED,
    },
    dueAt: { type: DataTypes.DATE, allowNull: false },
    response: { type: DataTypes.TEXT, allowNull: true },
    respondedAt: { type: DataTypes.DATE, allowNull: true },
    respondedBy: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    assignedTo: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    assignedAt: { type: DataTypes.DATE, allowNull: true },
    reopenedAt: { type: DataTypes.DATE, allowNull: true },
    reopenedBy: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    reopenReason: { type: DataTypes.STRING(500), allowNull: true },
    draftResponse: { type: DataTypes.TEXT, allowNull: true },
    draftUpdatedAt: { type: DataTypes.DATE, allowNull: true },
    draftBy: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    escalatedAt: { type: DataTypes.DATE, allowNull: true },
    escalationReason: { type: DataTypes.STRING(500), allowNull: true },

    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize,
    modelName: 'Complaint',
    tableName: 'complaints',
    indexes: [
      { name: 'uq_complaints_code', unique: true, fields: ['code'] },
      { name: 'idx_complaints_status_created', fields: ['status', 'created_at'] },
      { name: 'idx_complaints_user', fields: ['user_id'] },
      { name: 'idx_complaints_doc', fields: ['doc_number'] },
      { name: 'idx_complaints_due_assignment', fields: ['status', 'due_at', 'assigned_to'] },
    ],
  },
);

export default Complaint;
