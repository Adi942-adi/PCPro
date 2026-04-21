import { createContext, useContext, useEffect, useMemo, useState } from "react";
import {
  configureAuthRefresh,
  fetchMe,
  login,
  logoutSession,
  refreshAuthSession,
  setAuthToken,
  setRefreshToken,
  signup
} from "../api";

const AuthContext = createContext(null);

const createEmptySession = () => ({ token: "", refreshToken: "", user: null });

export function AuthProvider({ children }) {
  const [session, setSession] = useState(() => createEmptySession());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setAuthToken(session.token);
    setRefreshToken(session.refreshToken);
  }, [session]);

  useEffect(() => {
    configureAuthRefresh({
      onAuthRefresh: (payload) => {
        if (!payload?.token) {
          return;
        }
        setSession((current) => ({
          token: payload.token,
          refreshToken: payload.refreshToken || current.refreshToken || "",
          user: payload.user || current.user
        }));
      },
      onAuthExpired: () => {
        setSession(createEmptySession());
      }
    });

    return () => {
      configureAuthRefresh({});
    };
  }, []);

  useEffect(() => {
    const bootstrap = async () => {
      try {
        const result = await fetchMe();
        setSession({
          token: "",
          refreshToken: "",
          user: result.user
        });
      } catch (error) {
        try {
          const refreshed = await refreshAuthSession();
          const user = refreshed.user || (await fetchMe()).user;
          setSession({
            token: refreshed.token || "",
            refreshToken: refreshed.refreshToken || "",
            user
          });
        } catch (refreshError) {
          setSession(createEmptySession());
        }
      } finally {
        setLoading(false);
      }
    };

    bootstrap();
  }, []);

  const signIn = async (email, password) => {
    const result = await login({ email, password });
    setSession({ token: result.token, refreshToken: result.refreshToken || "", user: result.user });
    return result.user;
  };

  const signUp = async (name, email, password) => {
    const result = await signup({ name, email, password });
    setSession({ token: result.token, refreshToken: result.refreshToken || "", user: result.user });
    return result.user;
  };

  const signOut = (options = {}) => {
    const currentRefreshToken = session.refreshToken;
    logoutSession({
      refreshToken: currentRefreshToken,
      allDevices: Boolean(options.allDevices)
    }).catch(() => {});
    setSession(createEmptySession());
  };

  const value = useMemo(
    () => ({
      token: session.token,
      refreshToken: session.refreshToken,
      user: session.user,
      isAuthenticated: Boolean(session.user),
      loading,
      signIn,
      signUp,
      signOut,
      setUser: (user) => setSession((current) => ({ ...current, user }))
    }),
    [session, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider.");
  }
  return context;
};
