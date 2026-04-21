import { Link } from "react-router-dom";
import { useCart } from "../context/CartContext";
import { currency } from "../utils/format";
import { getPartImage } from "../utils/partMedia";

export default function CartPage() {
  const { cart, totals, changeItemQuantity, removeItem, clearAll, loading } = useCart();

  const onQuantityChange = async (itemId, quantity) => {
    await changeItemQuantity(itemId, Number(quantity));
  };

  const items = cart.items || [];

  return (
    <section className="cart-page">
      <div className="section-head">
        <h1>Cart</h1>
        {items.length > 0 && (
          <button type="button" className="ghost-link" onClick={clearAll}>
            Clear cart
          </button>
        )}
      </div>

      {loading && <p>Loading cart...</p>}

      {items.length === 0 && (
        <div className="panel">
          <p>Your cart is empty.</p>
          <Link to="/products" className="solid-link">
            Browse parts
          </Link>
        </div>
      )}

      {items.length > 0 && (
        <div className="cart-layout">
          <div className="panel">
            {items.map((item) => (
              <article key={item._id} className="cart-item">
                <div>
                  <img
                    src={getPartImage(item.component)}
                    alt={item.component?.name || "Part"}
                    className="cart-item-image"
                    loading="lazy"
                  />
                  <h3>{item.component?.name}</h3>
                  <p>{item.component?.brand}</p>
                  <strong>{currency.format(item.component?.price || 0)}</strong>
                </div>
                <div className="cart-item-controls">
                  <select
                    value={item.quantity}
                    onChange={(event) => onQuantityChange(item._id, event.target.value)}
                  >
                    {Array.from({ length: 10 }).map((_, idx) => (
                      <option key={idx + 1} value={idx + 1}>
                        Qty {idx + 1}
                      </option>
                    ))}
                  </select>
                  <button type="button" onClick={() => removeItem(item._id)}>
                    Remove
                  </button>
                </div>
              </article>
            ))}
          </div>

          <aside className="panel summary">
            <h2>Summary</h2>
            <p>Subtotal: {currency.format(totals.subtotal || 0)}</p>
            <p>Shipping: {currency.format(totals.shippingFee || 0)}</p>
            <p>
              Total: <strong>{currency.format(totals.total || 0)}</strong>
            </p>
            <Link to="/checkout" className="solid-link">
              Proceed to Checkout
            </Link>
          </aside>
        </div>
      )}
    </section>
  );
}
