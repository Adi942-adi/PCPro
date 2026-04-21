import { useMemo, useState } from "react";
import { Elements, CardElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import { Link, useNavigate } from "react-router-dom";
import { createPaymentIntent, placeOrderFromCart } from "../api";
import { useAuth } from "../context/AuthContext";
import { useCart } from "../context/CartContext";
import { currency } from "../utils/format";

const stripeKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || "";
const stripePromise = stripeKey ? loadStripe(stripeKey) : null;

const defaultAddress = {
  fullName: "",
  email: "",
  phone: "",
  line1: "",
  line2: "",
  city: "",
  state: "",
  postalCode: "",
  country: "US"
};

const requiredFields = ["fullName", "email", "line1", "city", "state", "postalCode", "country"];

function StripePaymentForm({ shippingAddress, onOrderPlaced, onError, onLoading }) {
  const stripe = useStripe();
  const elements = useElements();
  const { refreshCart } = useCart();

  const payNow = async () => {
    if (!stripe || !elements) {
      return;
    }

    try {
      onLoading(true);
      const intent = await createPaymentIntent();
      if (intent.mode !== "stripe") {
        throw new Error(intent.message || "Stripe mode is not available.");
      }

      const card = elements.getElement(CardElement);
      if (!card) {
        throw new Error("Card element is not ready.");
      }

      const confirmation = await stripe.confirmCardPayment(intent.clientSecret, {
        payment_method: {
          card,
          billing_details: {
            name: shippingAddress.fullName,
            email: shippingAddress.email
          }
        }
      });

      if (confirmation.error) {
        throw new Error(confirmation.error.message || "Payment confirmation failed.");
      }

      if (confirmation.paymentIntent?.status !== "succeeded") {
        throw new Error("Payment was not completed.");
      }

      const order = await placeOrderFromCart({
        paymentMode: "stripe",
        paymentIntentId: confirmation.paymentIntent.id,
        shippingAddress
      });

      await refreshCart();
      onOrderPlaced(order);
    } catch (error) {
      onError(error.message || "Checkout failed.");
    } finally {
      onLoading(false);
    }
  };

  return (
    <div className="payment-block">
      <label>
        Card Details
        <div className="card-element">
          <CardElement />
        </div>
      </label>
      <button type="button" onClick={payNow}>
        Pay and Place Order
      </button>
    </div>
  );
}

export default function CheckoutPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { totals, cart, refreshCart } = useCart();
  const [shippingAddress, setShippingAddress] = useState({
    ...defaultAddress,
    email: user?.email || "",
    fullName: user?.name || ""
  });
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const hasItems = (cart.items || []).length > 0;

  const shippingValid = useMemo(() => {
    return requiredFields.every((field) => String(shippingAddress[field] || "").trim().length > 0);
  }, [shippingAddress]);

  const setField = (field, value) => {
    setShippingAddress((current) => ({ ...current, [field]: value }));
  };

  const onMockCheckout = async () => {
    try {
      setLoading(true);
      setError("");
      const intent = await createPaymentIntent();
      const order = await placeOrderFromCart({
        paymentMode: intent.mode === "stripe" ? "stripe" : "mock",
        paymentIntentId: intent.paymentIntentId || "mock_payment",
        shippingAddress
      });

      await refreshCart();
      setMessage(`Order placed successfully: ${order._id}`);
      setTimeout(() => navigate("/orders"), 900);
    } catch (err) {
      setError(err.response?.data?.message || err.message || "Checkout failed.");
    } finally {
      setLoading(false);
    }
  };

  const onOrderPlaced = (order) => {
    setMessage(`Order placed successfully: ${order._id}`);
    setTimeout(() => navigate("/orders"), 900);
  };

  if (!hasItems) {
    return (
      <section className="panel">
        <h1>Checkout</h1>
        <p>Your cart is empty.</p>
        <Link to="/products" className="solid-link">
          Add components
        </Link>
      </section>
    );
  }

  return (
    <section className="checkout-page">
      <h1>Checkout</h1>
      <div className="checkout-layout">
        <section className="panel">
          <h2>Shipping Information</h2>
          {error && <p className="error-banner">{error}</p>}
          {message && <p className="success-banner">{message}</p>}

          <div className="form-grid">
            <label>
              Full Name
              <input
                value={shippingAddress.fullName}
                onChange={(event) => setField("fullName", event.target.value)}
                required
              />
            </label>
            <label>
              Email
              <input
                type="email"
                value={shippingAddress.email}
                onChange={(event) => setField("email", event.target.value)}
                required
              />
            </label>
            <label>
              Phone
              <input
                value={shippingAddress.phone}
                onChange={(event) => setField("phone", event.target.value)}
              />
            </label>
            <label>
              Address Line 1
              <input
                value={shippingAddress.line1}
                onChange={(event) => setField("line1", event.target.value)}
                required
              />
            </label>
            <label>
              Address Line 2
              <input
                value={shippingAddress.line2}
                onChange={(event) => setField("line2", event.target.value)}
              />
            </label>
            <label>
              City
              <input
                value={shippingAddress.city}
                onChange={(event) => setField("city", event.target.value)}
                required
              />
            </label>
            <label>
              State
              <input
                value={shippingAddress.state}
                onChange={(event) => setField("state", event.target.value)}
                required
              />
            </label>
            <label>
              Postal Code
              <input
                value={shippingAddress.postalCode}
                onChange={(event) => setField("postalCode", event.target.value)}
                required
              />
            </label>
            <label>
              Country
              <input
                value={shippingAddress.country}
                onChange={(event) => setField("country", event.target.value)}
                required
              />
            </label>
          </div>

          {stripePromise ? (
            <Elements stripe={stripePromise}>
              <StripePaymentForm
                shippingAddress={shippingAddress}
                onOrderPlaced={onOrderPlaced}
                onError={setError}
                onLoading={setLoading}
              />
            </Elements>
          ) : (
            <div className="payment-block">
              <p className="meta-line">
                Stripe key not found. Running in mock mode. Set{" "}
                <code>VITE_STRIPE_PUBLISHABLE_KEY</code> to enable real card payments.
              </p>
              <button type="button" onClick={onMockCheckout} disabled={loading || !shippingValid}>
                {loading ? "Processing..." : "Place Order"}
              </button>
            </div>
          )}
        </section>

        <aside className="panel summary">
          <h2>Order Summary</h2>
          <p>Subtotal: {currency.format(totals.subtotal || 0)}</p>
          <p>Shipping: {currency.format(totals.shippingFee || 0)}</p>
          <p>
            Total: <strong>{currency.format(totals.total || 0)}</strong>
          </p>
        </aside>
      </div>
    </section>
  );
}
