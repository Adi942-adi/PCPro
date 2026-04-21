import { useEffect, useState } from "react";
import { fetchOrders } from "../api";
import { currency } from "../utils/format";

export default function OrdersPage() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const result = await fetchOrders();
        setOrders(result || []);
      } catch (err) {
        setError(err.response?.data?.message || "Failed to load orders.");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  return (
    <section className="orders-page">
      <h1>My Orders</h1>
      {error && <p className="error-banner">{error}</p>}
      {loading && <p>Loading orders...</p>}

      {!loading && orders.length === 0 && <p>No orders yet.</p>}

      <div className="orders-list">
        {orders.map((order) => (
          <article className="panel" key={order._id}>
            <div className="order-head">
              <h3>Order #{order._id.slice(-6).toUpperCase()}</h3>
              <span className="ok-pill">{order.status}</span>
            </div>
            <p>
              {new Date(order.createdAt).toLocaleString()} | {currency.format(order.total || 0)}
            </p>
            <ul className="plain-list">
              {(order.items || []).map((item) => (
                <li key={`${order._id}-${item.component?._id || item.name}`}>
                  {item.name} x {item.quantity} ({currency.format(item.lineTotal || 0)})
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>
    </section>
  );
}
