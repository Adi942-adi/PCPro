import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function LoginPage() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const requestedPath = location.state?.from;

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const onSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const user = await signIn(email, password);
      const normalizedRequestedPath = typeof requestedPath === "string" ? requestedPath : "";
      const destination = normalizedRequestedPath
        ? normalizedRequestedPath === "/admin" && user?.role !== "admin"
          ? "/builder"
          : normalizedRequestedPath
        : user?.role === "admin"
          ? "/admin"
          : "/builder";

      navigate(destination, { replace: true });
    } catch (err) {
      setError(err.message || "Login failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="auth-shell">
      <form className="auth-card" onSubmit={onSubmit}>
        <h1>Login</h1>
        <p>Continue to your account. Users and admins both login here.</p>

        {error && <p className="error-banner">{error}</p>}

        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </label>

        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </label>
        <p className="auth-foot">
          <Link to="/forgot-password">Forgot password?</Link>
        </p>

        <button type="submit" disabled={loading}>
          {loading ? "Signing in..." : "Login"}
        </button>
        <p className="auth-foot">
          New user? <Link to="/signup">Create account</Link>
        </p>
      </form>
    </section>
  );
}
