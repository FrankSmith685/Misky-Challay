import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { CartItem } from '@/types/domain';

interface CartState {
  items: CartItem[];
  couponCode: string | null;
  /** El backend siempre recotiza antes del pedido (RN-007): esto es solo referencial. */
  subtotal: number;
  discountTotal: number;
  deliveryFee: number;
  walletAmount: number;
  grandTotal: number;
  /**
   * Linea que el cliente se llevo al constructor para reeditarla. El bowl que vuelva
   * la reemplaza en su sitio en vez de sumarse como una linea nueva: para el cliente
   * fue una edicion, no un producto mas.
   */
  editingItemId: string | null;
}

const initialState: CartState = {
  items: [],
  couponCode: null,
  subtotal: 0,
  discountTotal: 0,
  deliveryFee: 0,
  walletAmount: 0,
  grandTotal: 0,
  editingItemId: null,
};

const recalculate = (state: CartState): void => {
  state.subtotal = state.items.reduce((total, item) => total + item.lineTotal, 0);
  state.grandTotal = Math.max(
    0,
    state.subtotal + state.deliveryFee - state.discountTotal - state.walletAmount,
  );
};

const cartSlice = createSlice({
  name: 'cart',
  initialState,
  reducers: {
    refreshItemPrice: (state, action: PayloadAction<{ id: string; unitPrice: number; extrasTotal: number; lineTotal: number }>) => { const item = state.items.find((entry) => entry.id === action.payload.id); if (item) { Object.assign(item, action.payload); recalculate(state); } },
    replaceCartItems: (state, action: PayloadAction<CartItem[]>) => { state.items = action.payload; state.editingItemId = null; recalculate(state); },
    addItem: (state, action: PayloadAction<CartItem>) => {
      const incoming = action.payload;
      const editedIndex = state.editingItemId
        ? state.items.findIndex((item) => item.id === state.editingItemId)
        : -1;
      const edited = editedIndex >= 0 ? state.items[editedIndex] : null;

      /*
       * Solo se considera edicion si vuelve el mismo producto y con personalizacion:
       * una alta desde el menu (siempre sin selecciones) nunca debe pisar la linea
       * que el cliente dejo abierta. La cantidad original se conserva: quien tenia
       * dos bowls iguales sigue teniendo dos despues de cambiarles un ingrediente.
       */
      if (edited && incoming.productId === edited.productId && incoming.selections.length > 0) {
        const quantity = Math.max(1, edited.quantity);
        state.items[editedIndex] = {
          ...incoming,
          quantity,
          lineTotal: (incoming.unitPrice + incoming.extrasTotal) * quantity,
        };
      } else {
        state.items.push(incoming);
      }

      // La intencion de editar vale para una sola alta: si no era esta, ya no vale.
      state.editingItemId = null;
      recalculate(state);
    },
    /** El cliente se lleva esta linea al constructor (la linea sigue en el carrito). */
    startItemEdit: (state, action: PayloadAction<string>) => {
      state.editingItemId = action.payload;
    },
    cancelItemEdit: (state) => {
      state.editingItemId = null;
    },
    /** Deshacer un "Quitar": devuelve la linea a la posicion que ocupaba. */
    restoreItem: (state, action: PayloadAction<{ item: CartItem; index: number }>) => {
      const { item, index } = action.payload;
      if (state.items.some((entry) => entry.id === item.id)) return;
      state.items.splice(Math.min(Math.max(index, 0), state.items.length), 0, item);
      recalculate(state);
    },
    updateItemQuantity: (state, action: PayloadAction<{ id: string; quantity: number }>) => {
      const item = state.items.find((entry) => entry.id === action.payload.id);
      if (!item) return;
      item.quantity = Math.max(1, action.payload.quantity);
      item.lineTotal = (item.unitPrice + item.extrasTotal) * item.quantity;
      recalculate(state);
    },
    removeItem: (state, action: PayloadAction<string>) => {
      state.items = state.items.filter((item) => item.id !== action.payload);
      if (state.editingItemId === action.payload) state.editingItemId = null;
      recalculate(state);
    },
    applyCoupon: (state, action: PayloadAction<{ code: string; discount: number }>) => {
      state.couponCode = action.payload.code;
      state.discountTotal = action.payload.discount;
      recalculate(state);
    },
    removeCoupon: (state) => {
      state.couponCode = null;
      state.discountTotal = 0;
      recalculate(state);
    },
    setQuote: (
      state,
      action: PayloadAction<{ deliveryFee: number; discountTotal: number; walletAmount: number }>,
    ) => {
      state.deliveryFee = action.payload.deliveryFee;
      state.discountTotal = action.payload.discountTotal;
      state.walletAmount = action.payload.walletAmount;
      recalculate(state);
    },
    clearCart: () => initialState,
    consumePurchasedItems: (state, action: PayloadAction<CartItem[]>) => {
      state.items = state.items.filter((item) => !action.payload.some((bought) => bought.id === item.id && JSON.stringify(bought) === JSON.stringify(item)));
      if (!state.items.length) {
        state.couponCode = null;
        state.subtotal = 0;
        state.discountTotal = 0;
        state.deliveryFee = 0;
        state.walletAmount = 0;
        state.grandTotal = 0;
        state.editingItemId = null;
        return;
      }
      recalculate(state);
    },
  },
});

export const {
  refreshItemPrice,
  replaceCartItems,
  addItem,
  updateItemQuantity,
  removeItem,
  restoreItem,
  startItemEdit,
  cancelItemEdit,
  applyCoupon,
  removeCoupon,
  setQuote,
  clearCart,
  consumePurchasedItems,
} = cartSlice.actions;

export default cartSlice.reducer;
