import { useState } from "react";
import { Link } from "react-router-dom";
import { requestPasswordReset } from "../api";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  const onSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);

    try {
      const result = await requestPasswordReset(email);
      setSuccess(
        result?.message || "If an account exists for that email, a password reset link has been sent."
      );
    } catch (err) {
      setError(err.message || "Unable to process request.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="auth-shell">
      <form className="auth-card" onSubmit={onSubmit}>
        <h1>Forgot Password</h1>
        <p>Enter your account email and we will send a reset link.</p>

        {error && <p className="error-banner">{error}</p>}
        {success && <p className="success-banner">{success}</p>}

        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </label>

        <button type="submit" disabled={loading}>
          {loading ? "Sending..." : "Send Reset Link"}
        </button>

        <p className="auth-foot">
          Remembered your password? <Link to="/login">Back to login</Link>
        </p>
      </form>
    </section>
  );
}
