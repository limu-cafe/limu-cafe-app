import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { CartItem, Item } from '@/types';

interface CartStore {
  items: CartItem[];
  addItem: (item: Item) => void;
  removeItem: (itemId: string) => void;
  updateQuantity: (itemId: string, quantity: number) => void;
  clearCart: () => void;
  total: () => number;
  count: () => number;
}

export const useCartStore = create<CartStore>()(
  persist(
    (set, get) => ({
      items: [],

      addItem: (item) => {
        set((state) => {
          const existing = state.items.find((i) => i.item.id === item.id);
          if (existing) {
            return {
              items: state.items.map((i) =>
                i.item.id === item.id
                  ? { ...i, quantity: i.quantity + 1 }
                  : i
              ),
            };
          }
          return { items: [...state.items, { item, quantity: 1 }] };
        });
      },

      removeItem: (itemId) => {
        set((state) => ({
          items: state.items.filter((i) => i.item.id !== itemId),
        }));
      },

      updateQuantity: (itemId, quantity) => {
        if (quantity <= 0) {
          get().removeItem(itemId);
          return;
        }
        set((state) => ({
          items: state.items.map((i) =>
            i.item.id === itemId ? { ...i, quantity } : i
          ),
        }));
      },

      clearCart: () => set({ items: [] }),

      total: () =>
        get().items.reduce(
          (sum, item) => sum + item.item.price * item.quantity,
          0
        ),

      count: () =>
        get().items.reduce((sum, item) => sum + item.quantity, 0),
    }),
    { name: 'limu-cafe-cart' }
  )
);
