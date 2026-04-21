export const calculateCartTotals = (items) => {
  const normalized = (items || []).map((item) => {
    const unitPrice = Number(item.component?.price || 0);
    const quantity = Number(item.quantity || 1);
    return {
      component: item.component,
      quantity,
      unitPrice,
      lineTotal: unitPrice * quantity
    };
  });

  const subtotal = normalized.reduce((sum, item) => sum + item.lineTotal, 0);
  const shippingFee = subtotal >= 1000 || subtotal === 0 ? 0 : 25;
  const total = subtotal + shippingFee;

  return {
    items: normalized,
    subtotal,
    shippingFee,
    total
  };
};
