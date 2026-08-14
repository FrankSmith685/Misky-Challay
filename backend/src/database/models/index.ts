import { sequelize } from '../connection';

// Identidad y permisos
import { User } from './user.model';
import { Role } from './role.model';
import { Permission } from './permission.model';
import { UserRole } from './userRole.model';
import { RolePermission } from './rolePermission.model';
import { Address } from './address.model';
import { UserPreference } from './userPreference.model';
import { UserPurchaseContext } from './userPurchaseContext.model';

// Geografia, cobertura y sucursales
import { City } from './city.model';
import { District } from './district.model';
import { CoverageZone } from './coverageZone.model';
import { Branch } from './branch.model';
import { ZoneBranch } from './zoneBranch.model';
import { BranchSchedule } from './branchSchedule.model';
import { DeliverySlot } from './deliverySlot.model';

// Catalogo
import { Category } from './category.model';
import { Product } from './product.model';
import { ProductVariant } from './productVariant.model';
import { ProductNutrition } from './productNutrition.model';
import { Allergen } from './allergen.model';
import { DietaryTag } from './dietaryTag.model';
import { ProductAllergen } from './productAllergen.model';
import { ProductDietaryTag } from './productDietaryTag.model';
import { BranchProductAvailability } from './branchProductAvailability.model';

// Motor de personalizacion
import { CustomizationGroup } from './customizationGroup.model';
import { CustomizationOption } from './customizationOption.model';
import { ProductCustomizationGroup } from './productCustomizationGroup.model';
import { OptionIncompatibility } from './optionIncompatibility.model';
import { BranchOptionAvailability } from './branchOptionAvailability.model';
import { BuilderPreset } from './builderPreset.model';
import { BuilderPresetItem } from './builderPresetItem.model';
import { SavedBowl } from './savedBowl.model';
import { MediaAsset } from './mediaAsset.model';
import { BuilderEvent } from './builderEvent.model';
import { UxEvent } from './uxEvent.model';
import { ProductFavorite } from './productFavorite.model';
import { ProductReview } from './productReview.model';
import { NewsletterSubscription } from './newsletterSubscription.model';

// Comercio: pedidos, cupones y pagos
import { Order } from './order.model';
import { OrderItem } from './orderItem.model';
import { OrderItemCustomization } from './orderItemCustomization.model';
import { OrderDiscount } from './orderDiscount.model';
import { OrderStatusHistory } from './orderStatusHistory.model';
import { Coupon } from './coupon.model';
import { CouponRedemption } from './couponRedemption.model';
import { Payment } from './payment.model';
import { PaymentAttempt } from './paymentAttempt.model';
import { MobilePaymentClaim } from './mobilePaymentClaim.model';
import { Refund } from './refund.model';
import { WebhookEvent } from './webhookEvent.model';
import { DiningTable } from './diningTable.model';
import { DiningOffering } from './diningOffering.model';
import { DiningOrderRequest } from './diningOrderRequest.model';

// Operacion: cocina, inventario, delivery y gobierno
import { KitchenTicket } from './kitchenTicket.model';
import { KitchenTicketEvent } from './kitchenTicketEvent.model';
import { InventoryItem } from './inventoryItem.model';
import { BranchInventory } from './branchInventory.model';
import { InventoryMovement } from './inventoryMovement.model';
import { Recipe } from './recipe.model';
import { RecipeItem } from './recipeItem.model';
import { Driver } from './driver.model';
import { Delivery } from './delivery.model';
import { DeliveryEvent } from './deliveryEvent.model';
import { AuditLog } from './auditLog.model';
import { AdminDraft } from './adminDraft.model';
import { Complaint } from './complaint.model';

// Notificaciones
import { Notification } from './notification.model';
import { ProductAvailabilitySubscription } from './productAvailabilitySubscription.model';
import { KitchenPushSubscription } from './kitchenPushSubscription.model';
import { MobileDevice } from './mobileDevice.model';

// Planes y billetera
import { Plan } from './plan.model';
import { PlanBenefit } from './planBenefit.model';
import { UserPlan } from './userPlan.model';
import { Wallet } from './wallet.model';
import { WalletTransaction } from './walletTransaction.model';
import { WalletCreditLot } from './walletCreditLot.model';
import { WalletLotAllocation } from './walletLotAllocation.model';
import { BusinessSetting } from './businessSetting.model';
import { CommunicationSetting } from './communicationSetting.model';
import { LocalPaymentSetting } from './localPaymentSetting.model';
import { ReceiptSetting } from './receiptSetting.model';

/**
 * Registro central de modelos y asociaciones.
 *
 * COMO AGREGAR UNA TABLA NUEVA
 * 1) Crear src/database/models/<nombre>.model.ts siguiendo el patron de user.model.ts
 * 2) Importarlo aqui arriba
 * 3) Exportarlo en `models`
 * 4) Declarar sus asociaciones dentro de registerModels()
 * Con DB_SYNC=true la tabla se crea sola al reiniciar el servidor.
 */
export const models = {
  User,
  Role,
  Permission,
  UserRole,
  RolePermission,
  Address,
  UserPreference,
  UserPurchaseContext,
  City,
  District,
  CoverageZone,
  Branch,
  ZoneBranch,
  BranchSchedule,
  DeliverySlot,
  Category,
  Product,
  ProductVariant,
  ProductNutrition,
  Allergen,
  DietaryTag,
  ProductAllergen,
  ProductDietaryTag,
  BranchProductAvailability,
  CustomizationGroup,
  CustomizationOption,
  ProductCustomizationGroup,
  OptionIncompatibility,
  BranchOptionAvailability,
  BuilderPreset,
  BuilderPresetItem,
  SavedBowl,
  MediaAsset,
  BuilderEvent,
  UxEvent,
  ProductFavorite,
  ProductReview,
  NewsletterSubscription,
  Order,
  OrderItem,
  OrderItemCustomization,
  OrderDiscount,
  OrderStatusHistory,
  Coupon,
  CouponRedemption,
  Payment,
  PaymentAttempt,
  MobilePaymentClaim,
  Refund,
  WebhookEvent,
  DiningTable,
  DiningOffering,
  DiningOrderRequest,
  KitchenTicket,
  KitchenTicketEvent,
  InventoryItem,
  BranchInventory,
  InventoryMovement,
  Recipe,
  RecipeItem,
  Driver,
  Delivery,
  DeliveryEvent,
  AuditLog,
  AdminDraft,
  Complaint,
  Plan,
  PlanBenefit,
  UserPlan,
  Wallet,
  WalletTransaction,
  WalletCreditLot,
  WalletLotAllocation,
  BusinessSetting,
  CommunicationSetting,
  LocalPaymentSetting,
  ReceiptSetting,
  Notification,
  ProductAvailabilitySubscription,
  KitchenPushSubscription,
  MobileDevice,
};

export type Models = typeof models;

/* ==========================================================================
 * POLITICA DE BORRADO
 * --------------------------------------------------------------------------
 * Cuando una asociacion no declara `onDelete`, Sequelize la deduce de si la clave
 * foranea admite nulos: CASCADE si es obligatoria, SET NULL si es opcional. Eso
 * significa que la politica de borrado del negocio la estaba decidiendo un detalle
 * de tipado, y en varios sitios decidia mal:
 *
 *   - borrar una sucursal borraba TODOS sus pedidos (order.branch_id es NOT NULL)
 *   - borrar un pedido borraba sus lineas, descuentos e historial de estados
 *   - borrar una billetera borraba el libro mayor del saldo
 *   - borrar un cupon borraba el registro de quien lo habia canjeado
 *
 * A partir de aqui cada asociacion declara la suya con una de estas tres.
 * ========================================================================== */

/**
 * El hijo no significa nada sin el padre y no es un registro contable:
 * filas de tablas puente, configuracion, presets. Se borra con el padre.
 */
const OWNED = { onDelete: 'CASCADE', onUpdate: 'CASCADE' } as const;

/**
 * Registro historico, contable o legal. Impide borrar el padre mientras exista.
 * Es deliberado que moleste: si hay que dar de baja algo con historial, se
 * desactiva (`isActive`) o se borra en blando, no se destruye.
 */
const PROTECTED = { onDelete: 'RESTRICT', onUpdate: 'CASCADE' } as const;

/**
 * Referencia opcional de contexto: si el padre desaparece, el hijo sobrevive con el
 * campo en null. Exige que la clave foranea admita nulos.
 * En pedidos de invitado `user_id` ya es nulo, asi que esto ademas deja preparada la
 * anonimizacion que pide el derecho de supresion (Ley 29733).
 */
const CONTEXT = { onDelete: 'SET NULL', onUpdate: 'CASCADE' } as const;

let registered = false;

export const registerModels = (): Models => {
  if (registered) return models;

  // --- Identidad y permisos (RBAC) ---
  User.belongsToMany(Role, {
    through: UserRole,
    foreignKey: 'userId',
    otherKey: 'roleId',
    as: 'roles',
    ...OWNED,
  });
  User.hasOne(UserPreference, { foreignKey: 'userId', as: 'foodPreferences', ...OWNED });
  UserPreference.belongsTo(User, { foreignKey: 'userId', as: 'user', ...OWNED });
  // owner_user_id es obligatorio: un borrador sin dueno no tiene a quien mostrarse.
  User.hasMany(AdminDraft, { foreignKey: 'ownerUserId', as: 'adminDrafts', ...OWNED });
  AdminDraft.belongsTo(User, { foreignKey: 'ownerUserId', as: 'owner', ...OWNED });
  User.hasMany(UxEvent, { foreignKey: 'userId', as: 'uxEvents', ...CONTEXT });
  UxEvent.belongsTo(User, { foreignKey: 'userId', as: 'user', ...CONTEXT });
  User.hasMany(ProductFavorite, { foreignKey: 'userId', as: 'productFavorites', ...OWNED });
  ProductFavorite.belongsTo(User, { foreignKey: 'userId', as: 'user', ...OWNED });
  User.hasMany(ProductReview, { foreignKey: 'userId', as: 'productReviews', ...PROTECTED });
  ProductReview.belongsTo(User, { foreignKey: 'userId', as: 'user', ...PROTECTED });
  User.hasMany(NewsletterSubscription, { foreignKey: 'userId', as: 'newsletterSubscriptions', ...CONTEXT });
  NewsletterSubscription.belongsTo(User, { foreignKey: 'userId', as: 'user', ...CONTEXT });
  Role.belongsToMany(User, {
    through: UserRole,
    foreignKey: 'roleId',
    otherKey: 'userId',
    as: 'users',
    ...OWNED,
  });

  // La asignacion directa permite mostrar y auditar el alcance por cocina.
  UserRole.belongsTo(Branch, { foreignKey: 'branchId', as: 'branch', ...CONTEXT });
  Branch.hasMany(UserRole, { foreignKey: 'branchId', as: 'staffAssignments', ...CONTEXT });

  Role.belongsToMany(Permission, {
    through: RolePermission,
    foreignKey: 'roleId',
    otherKey: 'permissionId',
    as: 'permissions',
    ...OWNED,
  });
  Permission.belongsToMany(Role, {
    through: RolePermission,
    foreignKey: 'permissionId',
    otherKey: 'roleId',
    as: 'roles',
    ...OWNED,
  });

  // --- Direcciones del cliente ---
  User.hasMany(Address, { foreignKey: 'userId', as: 'addresses', ...OWNED });
  Address.belongsTo(User, { foreignKey: 'userId', as: 'user', ...OWNED });
  Address.belongsTo(District, { foreignKey: 'districtId', as: 'district', ...CONTEXT });

  /* --- Contexto de compra ---
   * Donde se quedo el cliente (modalidad, sede y direccion activa). Se va con el
   * cliente, pero borrar la sede o la direccion a la que apunta solo lo deja
   * incompleto: se vuelve a preguntar, no se pierde la cuenta. */
  User.hasOne(UserPurchaseContext, { foreignKey: 'userId', as: 'purchaseContext', ...OWNED });
  UserPurchaseContext.belongsTo(User, { foreignKey: 'userId', as: 'user', ...OWNED });
  UserPurchaseContext.belongsTo(Address, { foreignKey: 'addressId', as: 'address', ...CONTEXT });
  UserPurchaseContext.belongsTo(Branch, { foreignKey: 'branchId', as: 'branch', ...CONTEXT });
  UserPurchaseContext.belongsTo(City, { foreignKey: 'cityId', as: 'city', ...CONTEXT });

  // --- Geografia y cobertura ---
  // El maestro territorial no se borra si algo cuelga de el: un distrito con
  // direcciones o una zona con pedidos son historia que no se puede evaporar.
  City.hasMany(District, { foreignKey: 'cityId', as: 'districts', ...PROTECTED });
  District.belongsTo(City, { foreignKey: 'cityId', as: 'city', ...PROTECTED });

  City.hasMany(CoverageZone, { foreignKey: 'cityId', as: 'zones', ...PROTECTED });
  CoverageZone.belongsTo(City, { foreignKey: 'cityId', as: 'city', ...PROTECTED });

  // Un distrito puede resolverse a una zona sin geocodificar (MVP).
  CoverageZone.hasMany(District, { foreignKey: 'coverageZoneId', as: 'districts', ...CONTEXT });
  District.belongsTo(CoverageZone, { foreignKey: 'coverageZoneId', as: 'coverageZone', ...CONTEXT });

  City.hasMany(Branch, { foreignKey: 'cityId', as: 'branches', ...PROTECTED });
  Branch.belongsTo(City, { foreignKey: 'cityId', as: 'city', ...PROTECTED });
  Branch.belongsTo(District, { foreignKey: 'districtId', as: 'district', ...CONTEXT });

  // Una zona la pueden atender varias sucursales, con prioridad (RN-002).
  CoverageZone.belongsToMany(Branch, {
    through: ZoneBranch,
    foreignKey: 'coverageZoneId',
    otherKey: 'branchId',
    as: 'branches',
  });
  Branch.belongsToMany(CoverageZone, {
    through: ZoneBranch,
    foreignKey: 'branchId',
    otherKey: 'coverageZoneId',
    as: 'zones',
  });

  Branch.hasMany(BranchSchedule, { foreignKey: 'branchId', as: 'schedules', ...OWNED });
  BranchSchedule.belongsTo(Branch, { foreignKey: 'branchId', as: 'branch', ...OWNED });

  // Una franja puede tener pedidos reservados: no desaparece con la sucursal.
  Branch.hasMany(DeliverySlot, { foreignKey: 'branchId', as: 'slots', ...PROTECTED });
  DeliverySlot.belongsTo(Branch, { foreignKey: 'branchId', as: 'branch', ...PROTECTED });
  DeliverySlot.belongsTo(CoverageZone, { foreignKey: 'coverageZoneId', as: 'zone', ...CONTEXT });

  // --- Catalogo (M04) ---
  // Categorias y productos son `paranoid`: el borrado normal es en blando y esto solo
  // actua ante un DELETE fisico, que es justo cuando conviene que proteja.
  Category.hasMany(Category, { foreignKey: 'parentId', as: 'children', ...CONTEXT });
  Category.belongsTo(Category, { foreignKey: 'parentId', as: 'parent', ...CONTEXT });

  Category.hasMany(Product, { foreignKey: 'categoryId', as: 'products', ...PROTECTED });
  Product.belongsTo(Category, { foreignKey: 'categoryId', as: 'category', ...PROTECTED });
  Product.hasMany(ProductFavorite, { foreignKey: 'productId', as: 'favorites', ...OWNED });
  ProductFavorite.belongsTo(Product, { foreignKey: 'productId', as: 'product', ...OWNED });
  Product.hasMany(ProductReview, { foreignKey: 'productId', as: 'reviews', ...PROTECTED });
  ProductReview.belongsTo(Product, { foreignKey: 'productId', as: 'product', ...PROTECTED });

  Product.hasMany(ProductVariant, { foreignKey: 'productId', as: 'variants', ...OWNED });
  ProductVariant.belongsTo(Product, { foreignKey: 'productId', as: 'product', ...OWNED });

  // La nutricion se guarda por variante (decision de Fase 0: carga manual).
  ProductVariant.hasOne(ProductNutrition, { foreignKey: 'variantId', as: 'nutrition', ...OWNED });
  ProductNutrition.belongsTo(ProductVariant, { foreignKey: 'variantId', as: 'variant', ...OWNED });
  Product.hasMany(ProductNutrition, { foreignKey: 'productId', as: 'nutritionRows', ...OWNED });

  Product.belongsToMany(Allergen, {
    through: ProductAllergen,
    foreignKey: 'productId',
    otherKey: 'allergenId',
    as: 'allergens',
    ...OWNED,
  });
  Allergen.belongsToMany(Product, {
    through: ProductAllergen,
    foreignKey: 'allergenId',
    otherKey: 'productId',
    as: 'products',
    ...OWNED,
  });

  Product.belongsToMany(DietaryTag, {
    through: ProductDietaryTag,
    foreignKey: 'productId',
    otherKey: 'dietaryTagId',
    as: 'dietaryTags',
    ...OWNED,
  });
  DietaryTag.belongsToMany(Product, {
    through: ProductDietaryTag,
    foreignKey: 'dietaryTagId',
    otherKey: 'productId',
    as: 'products',
    ...OWNED,
  });

  Product.hasMany(BranchProductAvailability, {
    foreignKey: 'productId',
    as: 'branchAvailability',
    ...OWNED,
  });
  BranchProductAvailability.belongsTo(Product, { foreignKey: 'productId', as: 'product', ...OWNED });
  BranchProductAvailability.belongsTo(Branch, { foreignKey: 'branchId', as: 'branch', ...OWNED });

  // --- Motor de personalizacion (M05) ---
  // Una opcion del constructor esta congelada en `order_item_customizations` de los
  // pedidos que la usaron, asi que borrarla no rompe el historico; lo que se protege
  // aqui es la configuracion viva.
  CustomizationGroup.hasMany(CustomizationOption, { foreignKey: 'groupId', as: 'options', ...OWNED });
  CustomizationOption.belongsTo(CustomizationGroup, { foreignKey: 'groupId', as: 'group', ...OWNED });

  // Un grupo se reutiliza en varios productos, con reglas ajustables por producto.
  Product.belongsToMany(CustomizationGroup, {
    through: ProductCustomizationGroup,
    foreignKey: 'productId',
    otherKey: 'groupId',
    as: 'customizationGroups',
    ...OWNED,
  });
  CustomizationGroup.belongsToMany(Product, {
    through: ProductCustomizationGroup,
    foreignKey: 'groupId',
    otherKey: 'productId',
    as: 'products',
    ...OWNED,
  });
  ProductCustomizationGroup.belongsTo(CustomizationGroup, {
    foreignKey: 'groupId',
    as: 'group',
    ...OWNED,
  });
  ProductCustomizationGroup.belongsTo(Product, { foreignKey: 'productId', as: 'product', ...OWNED });

  CustomizationOption.hasMany(OptionIncompatibility, {
    foreignKey: 'optionId',
    as: 'incompatibilities',
    ...OWNED,
  });
  OptionIncompatibility.belongsTo(CustomizationOption, {
    foreignKey: 'optionId',
    as: 'option',
    ...OWNED,
  });

  CustomizationOption.hasMany(BranchOptionAvailability, {
    foreignKey: 'optionId',
    as: 'branchAvailability',
    ...OWNED,
  });
  BranchOptionAvailability.belongsTo(CustomizationOption, {
    foreignKey: 'optionId',
    as: 'option',
    ...OWNED,
  });
  BranchOptionAvailability.belongsTo(Branch, { foreignKey: 'branchId', as: 'branch', ...OWNED });

  Product.hasMany(BuilderPreset, { foreignKey: 'productId', as: 'builderPresets', ...OWNED });
  BuilderPreset.belongsTo(Product, { foreignKey: 'productId', as: 'product', ...OWNED });
  BuilderPreset.hasMany(BuilderPresetItem, { foreignKey: 'presetId', as: 'items', ...OWNED });
  BuilderPresetItem.belongsTo(BuilderPreset, { foreignKey: 'presetId', as: 'preset', ...OWNED });
  BuilderPresetItem.belongsTo(CustomizationOption, { foreignKey: 'optionId', as: 'option', ...OWNED });
  CustomizationOption.hasMany(BuilderPresetItem, {
    foreignKey: 'optionId',
    as: 'presetItems',
    ...OWNED,
  });

  // Bowls guardados: contenido del cliente, se va con el cliente.
  User.hasMany(SavedBowl, { foreignKey: 'userId', as: 'savedBowls', ...OWNED });
  SavedBowl.belongsTo(User, { foreignKey: 'userId', as: 'user', ...OWNED });
  SavedBowl.belongsTo(Product, { foreignKey: 'productId', as: 'product', ...OWNED });
  // variant_id es obligatorio: un bowl guardado sin su variante no se puede recomponer.
  SavedBowl.belongsTo(ProductVariant, { foreignKey: 'variantId', as: 'variant', ...OWNED });

  MediaAsset.belongsTo(User, { foreignKey: 'createdBy', as: 'creator', ...CONTEXT });

  // Telemetria: sobrevive a lo que mide, o los embudos se falsean solos.
  BuilderEvent.belongsTo(User, { foreignKey: 'userId', as: 'user', ...CONTEXT });
  // product_id es obligatorio en el evento: sin producto no hay embudo que medir.
  BuilderEvent.belongsTo(Product, { foreignKey: 'productId', as: 'product', ...OWNED });
  BuilderEvent.belongsTo(CustomizationGroup, { foreignKey: 'groupId', as: 'group', ...CONTEXT });
  BuilderEvent.belongsTo(CustomizationOption, { foreignKey: 'optionId', as: 'option', ...CONTEXT });
  BuilderEvent.belongsTo(BuilderPreset, { foreignKey: 'presetId', as: 'preset', ...CONTEXT });

  /* --- Pedidos (M09) ---
   * Un pedido es el registro contable de una venta. Nada de lo que cuelga de el se
   * borra en cascada, y nada de lo que apunta a el se puede borrar mientras exista.
   * `user_id` es la excepcion deliberada: es nulo en los pedidos de invitado, y
   * dejarlo en CONTEXT permite anonimizar a un cliente sin destruir su facturacion,
   * que es exactamente lo que exige el derecho de supresion. */
  User.hasMany(Order, { foreignKey: 'userId', as: 'orders', ...CONTEXT });
  Order.belongsTo(User, { foreignKey: 'userId', as: 'user', ...CONTEXT });
  // Sin esto, borrar una sucursal borraba TODOS sus pedidos: branch_id es NOT NULL.
  Order.belongsTo(Branch, { foreignKey: 'branchId', as: 'branch', ...PROTECTED });
  Order.belongsTo(CoverageZone, { foreignKey: 'coverageZoneId', as: 'zone', ...CONTEXT });
  Order.belongsTo(DeliverySlot, { foreignKey: 'deliverySlotId', as: 'slot', ...CONTEXT });
  Branch.hasMany(DiningTable, { foreignKey: 'branchId', as: 'diningTables', ...OWNED });
  DiningTable.belongsTo(Branch, { foreignKey: 'branchId', as: 'branch', ...OWNED });
  Branch.hasMany(DiningOffering, { foreignKey: 'branchId', as: 'diningOfferings', ...OWNED });
  DiningOffering.belongsTo(Branch, { foreignKey: 'branchId', as: 'branch', ...OWNED });
  Product.hasMany(DiningOffering, { foreignKey: 'productId', as: 'diningOfferings', ...OWNED });
  DiningOffering.belongsTo(Product, { foreignKey: 'productId', as: 'product', ...OWNED });
  ProductVariant.hasMany(DiningOffering, { foreignKey: 'variantId', as: 'diningOfferings', ...OWNED });
  DiningOffering.belongsTo(ProductVariant, { foreignKey: 'variantId', as: 'variant', ...OWNED });
  DiningTable.hasMany(Order, { foreignKey: 'diningTableId', as: 'orders', ...PROTECTED });
  Order.belongsTo(DiningTable, { foreignKey: 'diningTableId', as: 'diningTable', ...CONTEXT });
  User.hasMany(Order, { foreignKey: 'waiterId', as: 'servedOrders', ...CONTEXT });
  Order.belongsTo(User, { foreignKey: 'waiterId', as: 'waiter', ...CONTEXT });

  Order.hasMany(OrderItem, { foreignKey: 'orderId', as: 'items', ...PROTECTED });
  OrderItem.belongsTo(Order, { foreignKey: 'orderId', as: 'order', ...PROTECTED });
  OrderItem.hasOne(ProductReview, { foreignKey: 'orderItemId', as: 'review', ...PROTECTED });
  ProductReview.belongsTo(OrderItem, { foreignKey: 'orderItemId', as: 'orderItem', ...PROTECTED });

  OrderItem.hasMany(OrderItemCustomization, {
    foreignKey: 'orderItemId',
    as: 'customizations',
    ...PROTECTED,
  });
  OrderItemCustomization.belongsTo(OrderItem, {
    foreignKey: 'orderItemId',
    as: 'item',
    ...PROTECTED,
  });

  Order.hasMany(OrderDiscount, { foreignKey: 'orderId', as: 'discounts', ...PROTECTED });
  OrderDiscount.belongsTo(Order, { foreignKey: 'orderId', as: 'order', ...PROTECTED });

  Order.hasMany(OrderStatusHistory, { foreignKey: 'orderId', as: 'statusHistory', ...PROTECTED });
  OrderStatusHistory.belongsTo(Order, { foreignKey: 'orderId', as: 'order', ...PROTECTED });

  // --- Cupones (M07) ---
  // El canje es la prueba de que ese descuento se aplico: sobrevive al cupon.
  Coupon.hasMany(CouponRedemption, { foreignKey: 'couponId', as: 'redemptions', ...PROTECTED });
  CouponRedemption.belongsTo(Coupon, { foreignKey: 'couponId', as: 'coupon', ...PROTECTED });
  CouponRedemption.belongsTo(Order, { foreignKey: 'orderId', as: 'order', ...PROTECTED });
  CouponRedemption.belongsTo(User, { foreignKey: 'userId', as: 'user', ...CONTEXT });

  // --- Pagos (M08) ---
  // payments es polimorfica (ORDER o PLAN_PURCHASE): la relacion con el pedido se
  // resuelve en el servicio, no con una FK, para poder cubrir tambien la compra de planes.
  Payment.hasMany(PaymentAttempt, { foreignKey: 'paymentId', as: 'attempts', ...PROTECTED });
  PaymentAttempt.belongsTo(Payment, { foreignKey: 'paymentId', as: 'payment', ...PROTECTED });

  Payment.hasOne(MobilePaymentClaim, { foreignKey: 'paymentId', as: 'mobileClaim', ...PROTECTED });
  MobilePaymentClaim.belongsTo(Payment, { foreignKey: 'paymentId', as: 'payment', ...PROTECTED });
  MobilePaymentClaim.belongsTo(User, { foreignKey: 'reviewedBy', as: 'reviewer', ...CONTEXT });

  // Un reembolso es dinero que salio de la cuenta: no se borra con nada.
  Payment.hasMany(Refund, { foreignKey: 'paymentId', as: 'refunds', ...PROTECTED });
  Refund.belongsTo(Payment, { foreignKey: 'paymentId', as: 'payment', ...PROTECTED });

  // --- Cocina (M10) ---
  // El ticket y sus eventos son la trazabilidad de la preparacion (tiempos reales).
  Order.hasOne(KitchenTicket, { foreignKey: 'orderId', as: 'kitchenTicket', ...PROTECTED });
  KitchenTicket.belongsTo(Order, { foreignKey: 'orderId', as: 'order', ...PROTECTED });
  KitchenTicket.belongsTo(Branch, { foreignKey: 'branchId', as: 'branch', ...PROTECTED });

  KitchenTicket.hasMany(KitchenTicketEvent, { foreignKey: 'ticketId', as: 'events', ...PROTECTED });
  KitchenTicketEvent.belongsTo(KitchenTicket, { foreignKey: 'ticketId', as: 'ticket', ...PROTECTED });

  // --- Inventario (M10) ---
  InventoryItem.hasMany(BranchInventory, { foreignKey: 'inventoryItemId', as: 'stocks', ...OWNED });
  BranchInventory.belongsTo(InventoryItem, { foreignKey: 'inventoryItemId', as: 'item', ...OWNED });
  BranchInventory.belongsTo(Branch, { foreignKey: 'branchId', as: 'branch', ...OWNED });

  // Los movimientos son el libro del stock: sin ellos no se puede auditar una merma.
  InventoryItem.hasMany(InventoryMovement, {
    foreignKey: 'inventoryItemId',
    as: 'movements',
    ...PROTECTED,
  });
  InventoryMovement.belongsTo(InventoryItem, {
    foreignKey: 'inventoryItemId',
    as: 'item',
    ...PROTECTED,
  });
  InventoryMovement.belongsTo(Branch, { foreignKey: 'branchId', as: 'branch', ...PROTECTED });
  InventoryMovement.belongsTo(Order, { foreignKey: 'orderId', as: 'order', ...CONTEXT });

  // Receta de una variante fija -> insumos
  ProductVariant.hasOne(Recipe, { foreignKey: 'variantId', as: 'recipe', ...OWNED });
  Recipe.belongsTo(ProductVariant, { foreignKey: 'variantId', as: 'variant', ...OWNED });
  Recipe.belongsTo(Product, { foreignKey: 'productId', as: 'product', ...OWNED });

  Recipe.hasMany(RecipeItem, { foreignKey: 'recipeId', as: 'items', ...OWNED });
  RecipeItem.belongsTo(Recipe, { foreignKey: 'recipeId', as: 'recipe', ...OWNED });
  RecipeItem.belongsTo(InventoryItem, { foreignKey: 'inventoryItemId', as: 'item', ...PROTECTED });

  // Cada opcion del constructor puede descontar un insumo
  CustomizationOption.belongsTo(InventoryItem, {
    foreignKey: 'inventoryItemId',
    as: 'inventoryItem',
    ...CONTEXT,
  });

  // --- Delivery (M11) ---
  Order.hasOne(Delivery, { foreignKey: 'orderId', as: 'delivery', ...PROTECTED });
  Delivery.belongsTo(Order, { foreignKey: 'orderId', as: 'order', ...PROTECTED });
  Delivery.belongsTo(Branch, { foreignKey: 'branchId', as: 'branch', ...PROTECTED });
  // Dar de baja a un repartidor no puede borrar los repartos que hizo.
  Delivery.belongsTo(Driver, { foreignKey: 'driverId', as: 'driver', ...CONTEXT });

  Delivery.hasMany(DeliveryEvent, { foreignKey: 'deliveryId', as: 'events', ...PROTECTED });
  DeliveryEvent.belongsTo(Delivery, { foreignKey: 'deliveryId', as: 'delivery', ...PROTECTED });

  Driver.belongsTo(Branch, { foreignKey: 'branchId', as: 'branch', ...PROTECTED });
  Driver.belongsTo(User, { foreignKey: 'userId', as: 'user', ...CONTEXT });
  Driver.hasMany(Delivery, { foreignKey: 'driverId', as: 'deliveries', ...CONTEXT });

  // --- Gobierno (M13) ---
  // La auditoria sobrevive al usuario auditado: si no, basta con borrar la cuenta
  // para borrar el rastro de lo que hizo.
  AuditLog.belongsTo(User, { foreignKey: 'actorId', as: 'actor', ...CONTEXT });

  // --- Libro de Reclamaciones ---
  // Registro legal: no se borra con el cliente ni con el pedido, solo pierde el
  // vinculo. Un reclamo puede llegar de un invitado, asi que ambas FK son opcionales.
  Complaint.belongsTo(User, { foreignKey: 'userId', as: 'user', ...CONTEXT });
  Complaint.belongsTo(Order, { foreignKey: 'orderId', as: 'order', ...CONTEXT });
  User.hasMany(Complaint, { foreignKey: 'userId', as: 'complaints', ...CONTEXT });

  // --- Notificaciones (M12) ---
  User.hasMany(Notification, { foreignKey: 'userId', as: 'notifications', ...OWNED });
  Notification.belongsTo(User, { foreignKey: 'userId', as: 'user', ...OWNED });
  Notification.belongsTo(Order, { foreignKey: 'orderId', as: 'order', ...CONTEXT });

  User.hasMany(ProductAvailabilitySubscription, {
    foreignKey: 'userId',
    as: 'availabilitySubscriptions',
    ...OWNED,
  });
  ProductAvailabilitySubscription.belongsTo(User, { foreignKey: 'userId', as: 'user', ...OWNED });
  ProductAvailabilitySubscription.belongsTo(Product, { foreignKey: 'productId', as: 'product', ...OWNED });
  ProductAvailabilitySubscription.belongsTo(Branch, { foreignKey: 'branchId', as: 'branch', ...OWNED });
  User.hasMany(KitchenPushSubscription, { foreignKey: 'userId', as: 'kitchenPushSubscriptions', ...OWNED });
  KitchenPushSubscription.belongsTo(User, { foreignKey: 'userId', as: 'user', ...OWNED });
  Branch.hasMany(KitchenPushSubscription, { foreignKey: 'branchId', as: 'kitchenPushSubscriptions', ...OWNED });
  KitchenPushSubscription.belongsTo(Branch, { foreignKey: 'branchId', as: 'branch', ...OWNED });
  User.hasMany(MobileDevice, { foreignKey: 'userId', as: 'mobileDevices', ...OWNED });
  MobileDevice.belongsTo(User, { foreignKey: 'userId', as: 'user', ...OWNED });

  // --- Planes y billetera (M06) ---
  Plan.hasMany(PlanBenefit, { foreignKey: 'planId', as: 'benefits', ...OWNED });
  PlanBenefit.belongsTo(Plan, { foreignKey: 'planId', as: 'plan', ...OWNED });
  Plan.belongsTo(City, { foreignKey: 'cityId', as: 'city', ...CONTEXT });

  // Una activacion es una compra: el plan no se puede borrar mientras alguien lo tenga.
  User.hasMany(UserPlan, { foreignKey: 'userId', as: 'plans', ...PROTECTED });
  UserPlan.belongsTo(User, { foreignKey: 'userId', as: 'user', ...PROTECTED });
  UserPlan.belongsTo(Plan, { foreignKey: 'planId', as: 'plan', ...PROTECTED });

  User.hasOne(Wallet, { foreignKey: 'userId', as: 'wallet', ...PROTECTED });
  Wallet.belongsTo(User, { foreignKey: 'userId', as: 'user', ...PROTECTED });

  // RN-013: el libro mayor del saldo. Es dinero prepagado del cliente; borrarlo en
  // cascada con la billetera dejaba el saldo sin ninguna justificacion documental.
  Wallet.hasMany(WalletTransaction, { foreignKey: 'walletId', as: 'transactions', ...PROTECTED });
  WalletTransaction.belongsTo(Wallet, { foreignKey: 'walletId', as: 'wallet', ...PROTECTED });
  WalletTransaction.belongsTo(UserPlan, { foreignKey: 'userPlanId', as: 'userPlan', ...CONTEXT });
  WalletTransaction.belongsTo(Order, { foreignKey: 'orderId', as: 'order', ...CONTEXT });

  // Los lotes separan capital pagado, bono y devoluciones; las asignaciones
  // documentan qué lote se consumió en cada pedido.
  Wallet.hasMany(WalletCreditLot, { foreignKey: 'walletId', as: 'creditLots', ...PROTECTED });
  WalletCreditLot.belongsTo(Wallet, { foreignKey: 'walletId', as: 'wallet', ...PROTECTED });
  WalletCreditLot.belongsTo(UserPlan, { foreignKey: 'userPlanId', as: 'userPlan', ...CONTEXT });
  WalletCreditLot.belongsTo(WalletTransaction, {
    foreignKey: 'sourceTransactionId',
    as: 'sourceTransaction',
    ...CONTEXT,
  });
  WalletTransaction.hasMany(WalletLotAllocation, {
    foreignKey: 'walletTransactionId',
    as: 'lotAllocations',
    ...PROTECTED,
  });
  WalletLotAllocation.belongsTo(WalletTransaction, {
    foreignKey: 'walletTransactionId',
    as: 'walletTransaction',
    ...PROTECTED,
  });
  WalletCreditLot.hasMany(WalletLotAllocation, {
    foreignKey: 'walletCreditLotId',
    as: 'allocations',
    ...PROTECTED,
  });
  WalletLotAllocation.belongsTo(WalletCreditLot, {
    foreignKey: 'walletCreditLotId',
    as: 'creditLot',
    ...PROTECTED,
  });

  // Configuración singleton. Conserva quién realizó la última modificación.
  BusinessSetting.belongsTo(User, { foreignKey: 'updatedBy', as: 'updater', ...CONTEXT });
  CommunicationSetting.belongsTo(User, { foreignKey: 'updatedBy', as: 'updater', ...CONTEXT });
  ReceiptSetting.belongsTo(User, { foreignKey: 'updatedBy', as: 'updater', ...CONTEXT });

  registered = true;
  return models;
};

export {
  sequelize,
  User,
  Role,
  Permission,
  UserRole,
  RolePermission,
  Address,
  City,
  District,
  CoverageZone,
  Branch,
  ZoneBranch,
  BranchSchedule,
  DeliverySlot,
  Category,
  Product,
  ProductVariant,
  ProductNutrition,
  Allergen,
  DietaryTag,
  ProductAllergen,
  ProductDietaryTag,
  BranchProductAvailability,
  CustomizationGroup,
  CustomizationOption,
  ProductCustomizationGroup,
  OptionIncompatibility,
  BranchOptionAvailability,
  BuilderPreset,
  BuilderPresetItem,
  SavedBowl,
  MediaAsset,
  BuilderEvent,
  Order,
  OrderItem,
  OrderItemCustomization,
  OrderDiscount,
  OrderStatusHistory,
  Coupon,
  CouponRedemption,
  Payment,
  PaymentAttempt,
  MobilePaymentClaim,
  Refund,
  WebhookEvent,
  DiningTable,
  DiningOffering,
  DiningOrderRequest,
  KitchenTicket,
  KitchenTicketEvent,
  InventoryItem,
  BranchInventory,
  InventoryMovement,
  Recipe,
  RecipeItem,
  Driver,
  Delivery,
  DeliveryEvent,
  AuditLog,
  Plan,
  PlanBenefit,
  UserPlan,
  Wallet,
  WalletTransaction,
  WalletCreditLot,
  WalletLotAllocation,
  BusinessSetting,
  CommunicationSetting,
  LocalPaymentSetting,
  ReceiptSetting,
  Notification,
  ProductAvailabilitySubscription,
  KitchenPushSubscription,
  MobileDevice,
  UserPreference,
  UserPurchaseContext,
  AdminDraft,
  UxEvent,
  ProductFavorite,
  ProductReview,
  NewsletterSubscription,
  Complaint,
};
