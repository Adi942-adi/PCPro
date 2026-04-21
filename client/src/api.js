import axios from "axios";

const API_BASE_URL = import.meta.env.VITE_API_URL || "/api";

const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true
});

const authApi = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true
});

let authToken = "";
let refreshToken = "";
let refreshRequest = null;
let onAuthRefresh = null;
let onAuthExpired = null;

export const setAuthToken = (token) => {
  authToken = token || "";
};

export const setRefreshToken = (token) => {
  refreshToken = token || "";
};

export const configureAuthRefresh = (handlers = {}) => {
  onAuthRefresh = typeof handlers.onAuthRefresh === "function" ? handlers.onAuthRefresh : null;
  onAuthExpired = typeof handlers.onAuthExpired === "function" ? handlers.onAuthExpired : null;
};

const isAuthRoute = (url = "") => {
  const normalized = String(url || "");
  return normalized.includes("/auth/login") || normalized.includes("/auth/signup") || normalized.includes("/auth/refresh");
};

const handleRefreshSuccess = (data = {}) => {
  if (data.token) {
    setAuthToken(data.token);
  }
  if (data.refreshToken) {
    setRefreshToken(data.refreshToken);
  }
  if (onAuthRefresh) {
    onAuthRefresh(data);
  }
};

const handleAuthExpired = () => {
  setAuthToken("");
  setRefreshToken("");
  if (onAuthExpired) {
    onAuthExpired();
  }
};

const refreshAccessToken = async () => {
  if (!refreshRequest) {
    const payload = refreshToken ? { refreshToken } : {};
    refreshRequest = authApi
      .post("/auth/refresh", payload)
      .then((response) => {
        const data = response.data || {};
        handleRefreshSuccess(data);
        return data;
      })
      .finally(() => {
        refreshRequest = null;
      });
  }
  return refreshRequest;
};

api.interceptors.request.use((config) => {
  if (authToken) {
    config.headers.Authorization = `Bearer ${authToken}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const responseStatus = error?.response?.status;
    const originalRequest = error?.config || {};

    // Extract cleaner error message if available from our standard error format
    const serverMessage = error.response?.data?.error?.message || error.response?.data?.message;
    if (serverMessage) {
      error.message = serverMessage;
    }

    if (
      responseStatus !== 401 ||
      originalRequest._retry === true ||
      isAuthRoute(originalRequest.url)
    ) {
      throw error;
    }

    try {
      await refreshAccessToken();
      originalRequest._retry = true;
      originalRequest.headers = originalRequest.headers || {};
      if (authToken) {
        originalRequest.headers.Authorization = `Bearer ${authToken}`;
      }
      return api(originalRequest);
    } catch (refreshError) {
      handleAuthExpired();
      throw error;
    }
  }
);

export const fetchComponents = async (params = {}) => {
  const response = await api.get("/components", { params });
  const payload = response.data;
  if (Array.isArray(payload)) {
    return payload;
  }
  return Array.isArray(payload?.items) ? payload.items : [];
};

export const fetchComponent = async (id) => {
  const response = await api.get(`/components/${id}`);
  return response.data;
};

export const fetchComponentReviews = async (componentId, params = {}) => {
  const response = await api.get(`/components/${componentId}/reviews`, { params });
  return response.data;
};

export const submitComponentReview = async (componentId, payload) => {
  const response = await api.post(`/components/${componentId}/reviews`, payload);
  return response.data;
};

export const fetchComponentPriceHistory = async (componentId, params = {}) => {
  const response = await api.get(`/components/${componentId}/price-history`, { params });
  return response.data;
};

export const checkCompatibility = async (selectedPartIds) => {
  const response = await api.post("/compatibility/check", { selectedPartIds });
  return response.data;
};

export const getSuggestedFixes = async (selectedPartIds) => {
  const response = await api.post("/compatibility/suggest-fixes", { selectedPartIds });
  return response.data;
};

export const signup = async (payload) => {
  const response = await api.post("/auth/signup", payload);
  return response.data;
};

export const login = async (payload) => {
  const response = await api.post("/auth/login", payload);
  return response.data;
};

export const requestPasswordReset = async (email) => {
  const response = await api.post("/auth/forgot-password", { email });
  return response.data;
};

export const resetPassword = async (payload) => {
  const response = await api.post("/auth/reset-password", {
    token: payload.token,
    newPassword: payload.password
  });
  return response.data;
};

export const refreshAuthSession = async (tokenOverride = "") => {
  const tokenToUse = tokenOverride || refreshToken;
  const body = tokenToUse ? { refreshToken: tokenToUse } : {};
  const response = await authApi.post("/auth/refresh", body);
  const payload = response.data || {};
  handleRefreshSuccess(payload);
  return payload;
};

export const logoutSession = async (payload = {}) => {
  const tokenToRevoke = payload.refreshToken || refreshToken || "";
  const body = { allDevices: Boolean(payload.allDevices) };
  if (tokenToRevoke) {
    body.refreshToken = tokenToRevoke;
  }
  const response = await api.post("/auth/logout", body);
  setRefreshToken("");
  return response.data;
};

export const fetchMe = async () => {
  const response = await api.get("/auth/me");
  return response.data;
};

export const fetchBuilds = async () => {
  const response = await api.get("/builds");
  const payload = response.data;
  if (Array.isArray(payload)) {
    return payload;
  }
  return Array.isArray(payload?.items) ? payload.items : [];
};

export const createBuild = async (payload) => {
  const response = await api.post("/builds", payload);
  return response.data;
};

export const fetchPublicBuild = async (shareId) => {
  const response = await api.get(`/builds/share/${shareId}`);
  return response.data;
};

export const ensureBuildShare = async (buildId, isPublic = true) => {
  const response = await api.post(`/builds/${buildId}/share`, { isPublic });
  return response.data;
};

export const fetchCart = async () => {
  const response = await api.get("/cart");
  return response.data;
};

export const addCartItem = async (payload) => {
  const response = await api.post("/cart/items", payload);
  return response.data;
};

export const updateCartItem = async (itemId, payload) => {
  const response = await api.patch(`/cart/items/${itemId}`, payload);
  return response.data;
};

export const removeCartItem = async (itemId) => {
  const response = await api.delete(`/cart/items/${itemId}`);
  return response.data;
};

export const clearCart = async () => {
  const response = await api.delete("/cart");
  return response.data;
};

export const createPaymentIntent = async () => {
  const response = await api.post("/payments/create-intent");
  return response.data;
};

export const placeOrderFromCart = async (payload) => {
  const response = await api.post("/orders/from-cart", payload);
  return response.data;
};

export const fetchOrders = async () => {
  const response = await api.get("/orders");
  const payload = response.data;
  if (Array.isArray(payload)) {
    return payload;
  }
  return Array.isArray(payload?.items) ? payload.items : [];
};

export const fetchPriceAlerts = async () => {
  const response = await api.get("/price-alerts");
  return response.data;
};

export const createPriceAlert = async (payload) => {
  const response = await api.post("/price-alerts", payload);
  return response.data;
};

export const updatePriceAlert = async (id, payload) => {
  const response = await api.patch(`/price-alerts/${id}`, payload);
  return response.data;
};

export const deletePriceAlert = async (id) => {
  const response = await api.delete(`/price-alerts/${id}`);
  return response.data;
};

export const fetchNotifications = async (params = {}) => {
  const response = await api.get("/notifications", { params });
  return response.data;
};

export const markNotificationRead = async (id) => {
  const response = await api.patch(`/notifications/${id}/read`);
  return response.data;
};

export const markAllNotificationsRead = async () => {
  const response = await api.post("/notifications/read-all");
  return response.data;
};

export const fetchNotificationPreferences = async () => {
  const response = await api.get("/notifications/preferences");
  return response.data;
};

export const updateNotificationPreferences = async (payload) => {
  const response = await api.patch("/notifications/preferences", payload);
  return response.data;
};

export const fetchPushPublicKey = async () => {
  const response = await api.get("/notifications/push/public-key");
  return response.data;
};

export const fetchPushSubscriptionStatus = async () => {
  const response = await api.get("/notifications/push/subscriptions");
  return response.data;
};

export const savePushSubscription = async (subscription) => {
  const response = await api.post("/notifications/push/subscriptions", { subscription });
  return response.data;
};

export const deletePushSubscription = async (endpoint) => {
  const response = await api.delete("/notifications/push/subscriptions", {
    data: endpoint ? { endpoint } : undefined
  });
  return response.data;
};

export const fetchAdminOverview = async () => {
  const response = await api.get("/admin/overview");
  return response.data;
};

export const fetchAdminComponents = async (params = {}) => {
  const response = await api.get("/admin/components", { params });
  return response.data;
};

export const createAdminComponent = async (payload) => {
  const response = await api.post("/admin/components", payload);
  return response.data;
};

export const updateAdminComponent = async (id, payload) => {
  const response = await api.patch(`/admin/components/${id}`, payload);
  return response.data;
};

export const deleteAdminComponent = async (id) => {
  const response = await api.delete(`/admin/components/${id}`);
  return response.data;
};

export const importAdminComponents = async (items, mode = "upsert") => {
  const response = await api.post("/admin/components/import-json", { items, mode });
  return response.data;
};

export const validateAdminComponentImport = async (items, mode = "upsert") => {
  const response = await api.post("/admin/components/import-validate", { items, mode });
  return response.data;
};

export const fetchAdminOrders = async (params = {}) => {
  const response = await api.get("/admin/orders", { params });
  return response.data;
};

export const updateAdminOrderStatus = async (id, status) => {
  const response = await api.patch(`/admin/orders/${id}/status`, { status });
  return response.data;
};

export const fetchAdminUsers = async (params = {}) => {
  const response = await api.get("/admin/users", { params });
  return response.data;
};

export const createAdminUser = async (payload) => {
  const response = await api.post("/admin/users", payload);
  return response.data;
};

export const updateAdminUserRole = async (id, role) => {
  const response = await api.patch(`/admin/users/${id}/role`, { role });
  return response.data;
};

export const fetchAdminAuditLogs = async (params = {}) => {
  const response = await api.get("/admin/audit-logs", { params });
  return response.data;
};

export const fetchAdminReviews = async (params = {}) => {
  const response = await api.get("/admin/reviews", { params });
  return response.data;
};

export const moderateAdminReview = async (id, payload) => {
  const response = await api.patch(`/admin/reviews/${id}/moderate`, payload);
  return response.data;
};
