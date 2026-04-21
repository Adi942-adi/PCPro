import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { addCartItem, clearCart, fetchCart, removeCartItem, updateCartItem } from "../api";
import { useAuth } from "./AuthContext";

const CartContext = createContext(null);

const emptyTotals = {
  subtotal: 0,
  shippingFee: 0,
  total: 0
};

export function CartProvider({ children }) {
  const { isAuthenticated } = useAuth();
  const [cart, setCart] = useState({ items: [] });
  const [totals, setTotals] = useState(emptyTotals);
  const [loading, setLoading] = useState(false);

  const syncFromServer = async () => {
    if (!isAuthenticated) {
      setCart({ items: [] });
      setTotals(emptyTotals);
      return;
    }

    setLoading(true);
    try {
      const result = await fetchCart();
      setCart(result.cart || { items: [] });
      setTotals(result.totals || emptyTotals);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    syncFromServer();
  }, [isAuthenticated]);

  const addItem = async (componentId, quantity = 1) => {
    const result = await addCartItem({ componentId, quantity });
    setCart(result.cart);
    setTotals(result.totals);
  };

  const changeItemQuantity = async (itemId, quantity) => {
    const result = await updateCartItem(itemId, { quantity });
    setCart(result.cart);
    setTotals(result.totals);
  };

  const removeItem = async (itemId) => {
    const result = await removeCartItem(itemId);
    setCart(result.cart);
    setTotals(result.totals);
  };

  const clearAll = async () => {
    const result = await clearCart();
    setCart(result.cart);
    setTotals(result.totals);
  };

  const value = useMemo(
    () => ({
      cart,
      totals,
      loading,
      refreshCart: syncFromServer,
      addItem,
      changeItemQuantity,
      removeItem,
      clearAll
    }),
    [cart, totals, loading, isAuthenticated]
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export const useCart = () => {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error("useCart must be used within CartProvider.");
  }
  return context;
};
