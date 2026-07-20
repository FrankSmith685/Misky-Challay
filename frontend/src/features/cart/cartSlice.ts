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
}

const initialState: CartState = {
  items: [],
  couponCode: null,
  subtotal: 0,
  discountTotal: 0,
  deliveryFee: 0,
  walletAmount: 0,
  grandTotal: 0,
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
    addItem: (state, action: PayloadAction<CartItem>) => {
      state.items.push(action.payload);
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
  },
});

export const {
  addItem,
  updateItemQuantity,
  removeItem,
  applyCoupon,
  removeCoupon,
  setQuote,
  clearCart,
} = cartSlice.actions;

export default cartSlice.reducer;
