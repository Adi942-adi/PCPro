import { useEffect, useMemo, useState } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { fetchNotifications } from "../api";
import { useAuth } from "../context/AuthContext";
import { useCart } from "../context/CartContext";
import { PRICING_REGIONS, getPricingRegion, setPricingRegion } from "../utils/format";

const baseNavItems = [
  { to: "/", label: "Home" },
  { to: "/builder", label: "Builder" },
  { to: "/products", label: "Products" },
  { to: "/alerts", label: "Alerts" },
  { to: "/cart", label: "Cart" },
  { to: "/orders", label: "Orders" }
];

export default function Layout() {
  const { isAuthenticated, user, signOut } = useAuth();
  const { cart } = useCart();
  const navigate = useNavigate();
  const [pricingRegion, setPricingRegionState] = useState(getPricingRegion());
  const [unreadNotifications, setUnreadNotifications] = useState(0);

  const cartCount = (cart.items || []).reduce((sum, item) => sum + Number(item.quantity || 0), 0);

  const navItems = useMemo(() => {
    const withAlerts = baseNavItems.map((item) => {
      if (item.to !== "/alerts") {
        return item;
      }
      return {
        ...item,
        label: unreadNotifications > 0 ? `Alerts (${unreadNotifications})` : "Alerts"
      };
    });
    return user?.role === "admin" ? [...withAlerts, { to: "/admin", label: "Admin" }] : withAlerts;
  }, [unreadNotifications, user?.role]);

  const onLogout = () => {
    signOut();
    navigate("/");
  };

  useEffect(() => {
    const onPricingRegionChanged = (event) => {
      setPricingRegionState(event.detail || getPricingRegion());
    };

    window.addEventListener("pcpro:pricing-region", onPricingRegionChanged);
    return () => {
      window.removeEventListener("pcpro:pricing-region", onPricingRegionChanged);
    };
  }, []);

  useEffect(() => {
    if (!isAuthenticated) {
      setUnreadNotifications(0);
      return;
    }

    let active = true;
    const loadUnread = async () => {
      try {
        const result = await fetchNotifications({ unreadOnly: true, limit: 1 });
        if (active) {
          setUnreadNotifications(Number(result?.unreadCount || 0));
        }
      } catch (error) {
        if (active) {
          setUnreadNotifications(0);
        }
      }
    };

    loadUnread();
    const timer = window.setInterval(loadUnread, 45000);

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [isAuthenticated]);

  return (
    <div className="site">
      <header className="topbar">
        <div className="topbar-inner">
          <Link to="/" className="brand">
            <span>PC</span>Pro
          </Link>

          <nav className="main-nav">
            {navItems.map((item) => (
              <NavLink key={item.to} to={item.to} className="nav-link">
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="top-actions">
            <label className="region-picker">
              <span>Region</span>
              <select
                value={pricingRegion}
                onChange={(event) => {
                  const next = setPricingRegion(event.target.value);
                  setPricingRegionState(next);
                }}
              >
                {PRICING_REGIONS.map((region) => (
                  <option key={region.key} value={region.key}>
                    {region.label}
                  </option>
                ))}
              </select>
            </label>
            <Link to="/cart" className="cart-pill">
              Cart {cartCount > 0 ? `(${cartCount})` : ""}
            </Link>
            {!isAuthenticated && (
              <>
                <Link to="/login" className="ghost-link">
                  Login
                </Link>
                <Link to="/signup" className="solid-link">
                  Sign Up
                </Link>
              </>
            )}
            {isAuthenticated && (
              <>
                <span className="user-name">{user?.name}</span>
                <button type="button" className="logout-btn" onClick={onLogout}>
                  Logout
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="page-shell">
        <Outlet />
      </main>
    </div>
  );
}
