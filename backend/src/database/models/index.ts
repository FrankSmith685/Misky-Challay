import { sequelize } from '../connection';

// Identidad y permisos
import { User } from './user.model';
import { Role } from './role.model';
import { Permission } from './permission.model';
import { UserRole } from './userRole.model';
import { RolePermission } from './rolePermission.model';
import { Address } from './address.model';
import { UserPreference } from './userPreference.model';

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
import { Refund } from './refund.model';
import { WebhookEvent } from './webhookEvent.model';

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

// Notificaciones
import { Notification } from './notification.model';

// Planes y billetera
import { Plan } from './plan.model';
import { PlanBenefit } from './planBenefit.model';
import { UserPlan } from './userPlan.model';
import { Wallet } from './wallet.model';
import { WalletTransaction } from './walletTransaction.model';

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
  Order,
  OrderItem,
  OrderItemCustomization,
  OrderDiscount,
  OrderStatusHistory,
  Coupon,
  CouponRedemption,
  Payment,
  PaymentAttempt,
  Refund,
  WebhookEvent,
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
  Plan,
  PlanBenefit,
  UserPlan,
  Wallet,
  WalletTransaction,
  Notification,
};

export type Models = typeof models;

let registered = false;

export const registerModels = (): Models => {
  if (registered) return models;

  // --- Identidad y permisos (RBAC) ---
  User.belongsToMany(Role, {
    through: UserRole,
    foreignKey: 'userId',
    otherKey: 'roleId',
    as: 'roles',
  });
  User.hasOne(UserPreference, { foreignKey: 'userId', as: 'foodPreferences' });
  UserPreference.belongsTo(User, { foreignKey: 'userId', as: 'user' });
  User.hasMany(AdminDraft, { foreignKey: 'ownerUserId', as: 'adminDrafts' });
  AdminDraft.belongsTo(User, { foreignKey: 'ownerUserId', as: 'owner' });
  User.hasMany(UxEvent, { foreignKey: 'userId', as: 'uxEvents' });
  UxEvent.belongsTo(User, { foreignKey: 'userId', as: 'user' });
  Role.belongsToMany(User, {
    through: UserRole,
    foreignKey: 'roleId',
    otherKey: 'userId',
    as: 'users',
  });

  // La asignacion directa permite mostrar y auditar el alcance por cocina.
  UserRole.belongsTo(Branch, { foreignKey: 'branchId', as: 'branch' });
  Branch.hasMany(UserRole, { foreignKey: 'branchId', as: 'staffAssignments' });

  Role.belongsToMany(Permission, {
    through: RolePermission,
    foreignKey: 'roleId',
    otherKey: 'permissionId',
    as: 'permissions',
  });
  Permission.belongsToMany(Role, {
    through: RolePermission,
    foreignKey: 'permissionId',
    otherKey: 'roleId',
    as: 'roles',
  });

  // --- Direcciones del cliente ---
  User.hasMany(Address, { foreignKey: 'userId', as: 'addresses' });
  Address.belongsTo(User, { foreignKey: 'userId', as: 'user' });
  Address.belongsTo(District, { foreignKey: 'districtId', as: 'district' });

  // --- Geografia y cobertura ---
  City.hasMany(District, { foreignKey: 'cityId', as: 'districts' });
  District.belongsTo(City, { foreignKey: 'cityId', as: 'city' });

  City.hasMany(CoverageZone, { foreignKey: 'cityId', as: 'zones' });
  CoverageZone.belongsTo(City, { foreignKey: 'cityId', as: 'city' });

  // Un distrito puede resolverse a una zona sin geocodificar (MVP).
  CoverageZone.hasMany(District, { foreignKey: 'coverageZoneId', as: 'districts' });
  District.belongsTo(CoverageZone, { foreignKey: 'coverageZoneId', as: 'coverageZone' });

  City.hasMany(Branch, { foreignKey: 'cityId', as: 'branches' });
  Branch.belongsTo(City, { foreignKey: 'cityId', as: 'city' });
  Branch.belongsTo(District, { foreignKey: 'districtId', as: 'district' });

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

  Branch.hasMany(BranchSchedule, { foreignKey: 'branchId', as: 'schedules' });
  BranchSchedule.belongsTo(Branch, { foreignKey: 'branchId', as: 'branch' });

  Branch.hasMany(DeliverySlot, { foreignKey: 'branchId', as: 'slots' });
  DeliverySlot.belongsTo(Branch, { foreignKey: 'branchId', as: 'branch' });
  DeliverySlot.belongsTo(CoverageZone, { foreignKey: 'coverageZoneId', as: 'zone' });

  // --- Catalogo (M04) ---
  Category.hasMany(Category, { foreignKey: 'parentId', as: 'children' });
  Category.belongsTo(Category, { foreignKey: 'parentId', as: 'parent' });

  Category.hasMany(Product, { foreignKey: 'categoryId', as: 'products' });
  Product.belongsTo(Category, { foreignKey: 'categoryId', as: 'category' });

  Product.hasMany(ProductVariant, { foreignKey: 'productId', as: 'variants' });
  ProductVariant.belongsTo(Product, { foreignKey: 'productId', as: 'product' });

  // La nutricion se guarda por variante (decision de Fase 0: carga manual).
  ProductVariant.hasOne(ProductNutrition, { foreignKey: 'variantId', as: 'nutrition' });
  ProductNutrition.belongsTo(ProductVariant, { foreignKey: 'variantId', as: 'variant' });
  Product.hasMany(ProductNutrition, { foreignKey: 'productId', as: 'nutritionRows' });

  Product.belongsToMany(Allergen, {
    through: ProductAllergen,
    foreignKey: 'productId',
    otherKey: 'allergenId',
    as: 'allergens',
  });
  Allergen.belongsToMany(Product, {
    through: ProductAllergen,
    foreignKey: 'allergenId',
    otherKey: 'productId',
    as: 'products',
  });

  Product.belongsToMany(DietaryTag, {
    through: ProductDietaryTag,
    foreignKey: 'productId',
    otherKey: 'dietaryTagId',
    as: 'dietaryTags',
  });
  DietaryTag.belongsToMany(Product, {
    through: ProductDietaryTag,
    foreignKey: 'dietaryTagId',
    otherKey: 'productId',
    as: 'products',
  });

  Product.hasMany(BranchProductAvailability, { foreignKey: 'productId', as: 'branchAvailability' });
  BranchProductAvailability.belongsTo(Product, { foreignKey: 'productId', as: 'product' });
  BranchProductAvailability.belongsTo(Branch, { foreignKey: 'branchId', as: 'branch' });

  // --- Motor de personalizacion (M05) ---
  CustomizationGroup.hasMany(CustomizationOption, { foreignKey: 'groupId', as: 'options' });
  CustomizationOption.belongsTo(CustomizationGroup, { foreignKey: 'groupId', as: 'group' });

  // Un grupo se reutiliza en varios productos, con reglas ajustables por producto.
  Product.belongsToMany(CustomizationGroup, {
    through: ProductCustomizationGroup,
    foreignKey: 'productId',
    otherKey: 'groupId',
    as: 'customizationGroups',
  });
  CustomizationGroup.belongsToMany(Product, {
    through: ProductCustomizationGroup,
    foreignKey: 'groupId',
    otherKey: 'productId',
    as: 'products',
  });
  ProductCustomizationGroup.belongsTo(CustomizationGroup, { foreignKey: 'groupId', as: 'group' });
  ProductCustomizationGroup.belongsTo(Product, { foreignKey: 'productId', as: 'product' });

  CustomizationOption.hasMany(OptionIncompatibility, {
    foreignKey: 'optionId',
    as: 'incompatibilities',
  });
  OptionIncompatibility.belongsTo(CustomizationOption, { foreignKey: 'optionId', as: 'option' });

  CustomizationOption.hasMany(BranchOptionAvailability, {
    foreignKey: 'optionId',
    as: 'branchAvailability',
  });
  BranchOptionAvailability.belongsTo(CustomizationOption, { foreignKey: 'optionId', as: 'option' });
  BranchOptionAvailability.belongsTo(Branch, { foreignKey: 'branchId', as: 'branch' });

  Product.hasMany(BuilderPreset, { foreignKey: 'productId', as: 'builderPresets' });
  BuilderPreset.belongsTo(Product, { foreignKey: 'productId', as: 'product' });
  BuilderPreset.hasMany(BuilderPresetItem, {
    foreignKey: 'presetId',
    as: 'items',
    onDelete: 'CASCADE',
  });
  BuilderPresetItem.belongsTo(BuilderPreset, { foreignKey: 'presetId', as: 'preset' });
  BuilderPresetItem.belongsTo(CustomizationOption, { foreignKey: 'optionId', as: 'option' });
  CustomizationOption.hasMany(BuilderPresetItem, { foreignKey: 'optionId', as: 'presetItems' });

  User.hasMany(SavedBowl, { foreignKey: 'userId', as: 'savedBowls' });
  SavedBowl.belongsTo(User, { foreignKey: 'userId', as: 'user' });
  SavedBowl.belongsTo(Product, { foreignKey: 'productId', as: 'product' });
  SavedBowl.belongsTo(ProductVariant, { foreignKey: 'variantId', as: 'variant' });

  MediaAsset.belongsTo(User, { foreignKey: 'createdBy', as: 'creator' });
  BuilderEvent.belongsTo(User, { foreignKey: 'userId', as: 'user' });
  BuilderEvent.belongsTo(Product, { foreignKey: 'productId', as: 'product' });
  BuilderEvent.belongsTo(CustomizationGroup, { foreignKey: 'groupId', as: 'group' });
  BuilderEvent.belongsTo(CustomizationOption, { foreignKey: 'optionId', as: 'option' });
  BuilderEvent.belongsTo(BuilderPreset, { foreignKey: 'presetId', as: 'preset' });

  // --- Pedidos (M09) ---
  User.hasMany(Order, { foreignKey: 'userId', as: 'orders' });
  Order.belongsTo(User, { foreignKey: 'userId', as: 'user' });
  Order.belongsTo(Branch, { foreignKey: 'branchId', as: 'branch' });
  Order.belongsTo(CoverageZone, { foreignKey: 'coverageZoneId', as: 'zone' });
  Order.belongsTo(DeliverySlot, { foreignKey: 'deliverySlotId', as: 'slot' });

  Order.hasMany(OrderItem, { foreignKey: 'orderId', as: 'items' });
  OrderItem.belongsTo(Order, { foreignKey: 'orderId', as: 'order' });

  OrderItem.hasMany(OrderItemCustomization, { foreignKey: 'orderItemId', as: 'customizations' });
  OrderItemCustomization.belongsTo(OrderItem, { foreignKey: 'orderItemId', as: 'item' });

  Order.hasMany(OrderDiscount, { foreignKey: 'orderId', as: 'discounts' });
  OrderDiscount.belongsTo(Order, { foreignKey: 'orderId', as: 'order' });

  Order.hasMany(OrderStatusHistory, { foreignKey: 'orderId', as: 'statusHistory' });
  OrderStatusHistory.belongsTo(Order, { foreignKey: 'orderId', as: 'order' });

  // --- Cupones (M07) ---
  Coupon.hasMany(CouponRedemption, { foreignKey: 'couponId', as: 'redemptions' });
  CouponRedemption.belongsTo(Coupon, { foreignKey: 'couponId', as: 'coupon' });
  CouponRedemption.belongsTo(Order, { foreignKey: 'orderId', as: 'order' });
  CouponRedemption.belongsTo(User, { foreignKey: 'userId', as: 'user' });

  // --- Pagos (M08) ---
  // payments es polimorfica (ORDER o PLAN_PURCHASE): la relacion con el pedido se
  // resuelve en el servicio, no con una FK, para poder cubrir tambien la compra de planes.
  Payment.hasMany(PaymentAttempt, { foreignKey: 'paymentId', as: 'attempts' });
  PaymentAttempt.belongsTo(Payment, { foreignKey: 'paymentId', as: 'payment' });

  Payment.hasMany(Refund, { foreignKey: 'paymentId', as: 'refunds' });
  Refund.belongsTo(Payment, { foreignKey: 'paymentId', as: 'payment' });

  // --- Cocina (M10) ---
  Order.hasOne(KitchenTicket, { foreignKey: 'orderId', as: 'kitchenTicket' });
  KitchenTicket.belongsTo(Order, { foreignKey: 'orderId', as: 'order' });
  KitchenTicket.belongsTo(Branch, { foreignKey: 'branchId', as: 'branch' });

  KitchenTicket.hasMany(KitchenTicketEvent, { foreignKey: 'ticketId', as: 'events' });
  KitchenTicketEvent.belongsTo(KitchenTicket, { foreignKey: 'ticketId', as: 'ticket' });

  // --- Inventario (M10) ---
  InventoryItem.hasMany(BranchInventory, { foreignKey: 'inventoryItemId', as: 'stocks' });
  BranchInventory.belongsTo(InventoryItem, { foreignKey: 'inventoryItemId', as: 'item' });
  BranchInventory.belongsTo(Branch, { foreignKey: 'branchId', as: 'branch' });

  InventoryItem.hasMany(InventoryMovement, { foreignKey: 'inventoryItemId', as: 'movements' });
  InventoryMovement.belongsTo(InventoryItem, { foreignKey: 'inventoryItemId', as: 'item' });
  InventoryMovement.belongsTo(Branch, { foreignKey: 'branchId', as: 'branch' });
  InventoryMovement.belongsTo(Order, { foreignKey: 'orderId', as: 'order' });

  // Receta de una variante fija -> insumos
  ProductVariant.hasOne(Recipe, { foreignKey: 'variantId', as: 'recipe' });
  Recipe.belongsTo(ProductVariant, { foreignKey: 'variantId', as: 'variant' });
  Recipe.belongsTo(Product, { foreignKey: 'productId', as: 'product' });

  Recipe.hasMany(RecipeItem, { foreignKey: 'recipeId', as: 'items' });
  RecipeItem.belongsTo(Recipe, { foreignKey: 'recipeId', as: 'recipe' });
  RecipeItem.belongsTo(InventoryItem, { foreignKey: 'inventoryItemId', as: 'item' });

  // Cada opcion del constructor puede descontar un insumo
  CustomizationOption.belongsTo(InventoryItem, {
    foreignKey: 'inventoryItemId',
    as: 'inventoryItem',
  });

  // --- Delivery (M11) ---
  Order.hasOne(Delivery, { foreignKey: 'orderId', as: 'delivery' });
  Delivery.belongsTo(Order, { foreignKey: 'orderId', as: 'order' });
  Delivery.belongsTo(Branch, { foreignKey: 'branchId', as: 'branch' });
  Delivery.belongsTo(Driver, { foreignKey: 'driverId', as: 'driver' });

  Delivery.hasMany(DeliveryEvent, { foreignKey: 'deliveryId', as: 'events' });
  DeliveryEvent.belongsTo(Delivery, { foreignKey: 'deliveryId', as: 'delivery' });

  Driver.belongsTo(Branch, { foreignKey: 'branchId', as: 'branch' });
  Driver.belongsTo(User, { foreignKey: 'userId', as: 'user' });
  Driver.hasMany(Delivery, { foreignKey: 'driverId', as: 'deliveries' });

  // --- Gobierno (M13) ---
  AuditLog.belongsTo(User, { foreignKey: 'actorId', as: 'actor' });

  // --- Notificaciones (M12) ---
  User.hasMany(Notification, { foreignKey: 'userId', as: 'notifications' });
  Notification.belongsTo(User, { foreignKey: 'userId', as: 'user' });
  Notification.belongsTo(Order, { foreignKey: 'orderId', as: 'order' });

  // --- Planes y billetera (M06) ---
  Plan.hasMany(PlanBenefit, { foreignKey: 'planId', as: 'benefits' });
  PlanBenefit.belongsTo(Plan, { foreignKey: 'planId', as: 'plan' });
  Plan.belongsTo(City, { foreignKey: 'cityId', as: 'city' });

  User.hasMany(UserPlan, { foreignKey: 'userId', as: 'plans' });
  UserPlan.belongsTo(User, { foreignKey: 'userId', as: 'user' });
  UserPlan.belongsTo(Plan, { foreignKey: 'planId', as: 'plan' });

  User.hasOne(Wallet, { foreignKey: 'userId', as: 'wallet' });
  Wallet.belongsTo(User, { foreignKey: 'userId', as: 'user' });

  Wallet.hasMany(WalletTransaction, { foreignKey: 'walletId', as: 'transactions' });
  WalletTransaction.belongsTo(Wallet, { foreignKey: 'walletId', as: 'wallet' });
  WalletTransaction.belongsTo(UserPlan, { foreignKey: 'userPlanId', as: 'userPlan' });
  WalletTransaction.belongsTo(Order, { foreignKey: 'orderId', as: 'order' });

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
  Refund,
  WebhookEvent,
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
  Notification,
  UserPreference,
  AdminDraft,
  UxEvent,
};
