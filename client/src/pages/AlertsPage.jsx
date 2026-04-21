import { useEffect, useState } from "react";
import {
  deletePushSubscription,
  deletePriceAlert,
  fetchNotificationPreferences,
  fetchNotifications,
  fetchPushPublicKey,
  fetchPushSubscriptionStatus,
  fetchPriceAlerts,
  markAllNotificationsRead,
  markNotificationRead,
  savePushSubscription,
  updateNotificationPreferences,
  updatePriceAlert
} from "../api";
import { currency } from "../utils/format";
import { getPartImage } from "../utils/partMedia";
import {
  getCurrentPushSubscription,
  getPushPermission,
  isPushSupported,
  registerPushSubscription,
  requestPushPermission,
  unregisterPushSubscription
} from "../utils/pushNotifications";

const DEFAULT_NOTIFICATION_PREFS = {
  emailPriceDrops: true,
  emailReviewModeration: true,
  pushPriceDrops: false,
  pushReviewModeration: false
};

const formatDateTime = (value) => {
  if (!value) {
    return "-";
  }
  return new Date(value).toLocaleString();
};

export default function AlertsPage() {
  const [alerts, setAlerts] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [targetDraftById, setTargetDraftById] = useState({});
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [notificationPrefs, setNotificationPrefs] = useState(DEFAULT_NOTIFICATION_PREFS);
  const [pushSupported, setPushSupported] = useState(false);
  const [pushPermission, setPushPermission] = useState("default");
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushSubscriptionCount, setPushSubscriptionCount] = useState(0);
  const [channelLoading, setChannelLoading] = useState(false);

  const setDraft = (id, value) => {
    setTargetDraftById((current) => ({ ...current, [id]: value }));
  };

  useEffect(() => {
    setPushSupported(isPushSupported());
    setPushPermission(getPushPermission());
  }, []);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [alertsResult, notificationsResult, prefsResult, pushStatusResult] = await Promise.all([
        fetchPriceAlerts(),
        fetchNotifications({ limit: 40 }),
        fetchNotificationPreferences(),
        fetchPushSubscriptionStatus()
      ]);

      const alertItems = alertsResult?.items || [];
      setAlerts(alertItems);
      setNotifications(notificationsResult?.items || []);
      setUnreadCount(Number(notificationsResult?.unreadCount || 0));
      setNotificationPrefs({
        ...DEFAULT_NOTIFICATION_PREFS,
        ...(prefsResult?.notificationPrefs || {})
      });
      setPushEnabled(Boolean(pushStatusResult?.enabled));
      setPushSubscriptionCount(Number(pushStatusResult?.count || 0));
      setTargetDraftById(
        Object.fromEntries(
          alertItems.map((item) => [item.id, Number.isFinite(Number(item.targetPrice)) ? String(item.targetPrice) : ""])
        )
      );
    } catch (err) {
      setError(err.response?.data?.message || "Failed to load alerts.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const onUpdatePreference = async (key, nextValue) => {
    setError("");
    setSuccess("");
    try {
      const result = await updateNotificationPreferences({ [key]: Boolean(nextValue) });
      setNotificationPrefs({
        ...DEFAULT_NOTIFICATION_PREFS,
        ...(result?.notificationPrefs || {})
      });
      setSuccess("Notification preferences updated.");
    } catch (err) {
      setError(err.response?.data?.message || "Failed to update notification preferences.");
    }
  };

  const onEnablePush = async () => {
    setError("");
    setSuccess("");
    setChannelLoading(true);

    try {
      if (!isPushSupported()) {
        setError("Push notifications are not supported in this browser.");
        return;
      }

      const permission = await requestPushPermission();
      setPushPermission(permission);
      if (permission !== "granted") {
        setError("Push permission was not granted.");
        return;
      }

      const config = await fetchPushPublicKey();
      if (!config?.configured || !config?.publicKey) {
        setError("Push is not configured on the server yet.");
        return;
      }

      const subscription = await registerPushSubscription({ publicKey: config.publicKey });
      const payload = typeof subscription?.toJSON === "function" ? subscription.toJSON() : subscription;
      await savePushSubscription(payload);

      let updatedPrefs = notificationPrefs;
      if (!notificationPrefs.pushPriceDrops || !notificationPrefs.pushReviewModeration) {
        const prefsResult = await updateNotificationPreferences({
          pushPriceDrops: true,
          pushReviewModeration: true
        });
        updatedPrefs = {
          ...DEFAULT_NOTIFICATION_PREFS,
          ...(prefsResult?.notificationPrefs || {})
        };
      }

      setNotificationPrefs(updatedPrefs);
      setPushEnabled(true);
      setPushSubscriptionCount((count) => Math.max(1, count));
      setSuccess("Push notifications enabled for this browser.");
    } catch (err) {
      setError(err.response?.data?.message || err.message || "Failed to enable push notifications.");
    } finally {
      setChannelLoading(false);
    }
  };

  const onDisablePush = async () => {
    setError("");
    setSuccess("");
    setChannelLoading(true);

    try {
      const current = await getCurrentPushSubscription();
      const endpoint = current?.endpoint || "";
      if (endpoint) {
        await deletePushSubscription(endpoint);
      } else {
        await deletePushSubscription();
      }
      await unregisterPushSubscription();

      setPushEnabled(false);
      setPushSubscriptionCount((count) => Math.max(0, count - 1));
      setSuccess("Push notifications disabled on this browser.");
    } catch (err) {
      setError(err.response?.data?.message || "Failed to disable push notifications.");
    } finally {
      setChannelLoading(false);
    }
  };

  const onSaveTarget = async (alertId) => {
    const raw = targetDraftById[alertId];
    const numeric = Number(raw);
    if (!Number.isFinite(numeric) || numeric < 0) {
      setError("Target price must be a valid non-negative number.");
      return;
    }

    setError("");
    setSuccess("");
    try {
      const updated = await updatePriceAlert(alertId, { targetPrice: numeric });
      setAlerts((current) => current.map((item) => (item.id === alertId ? updated : item)));
      setSuccess("Target price updated.");
    } catch (err) {
      setError(err.response?.data?.message || "Failed to update alert.");
    }
  };

  const onToggleActive = async (alertId, nextActive) => {
    setError("");
    setSuccess("");
    try {
      const updated = await updatePriceAlert(alertId, { isActive: nextActive });
      setAlerts((current) => current.map((item) => (item.id === alertId ? updated : item)));
      setSuccess(nextActive ? "Alert activated." : "Alert paused.");
    } catch (err) {
      setError(err.response?.data?.message || "Failed to update alert status.");
    }
  };

  const onDeleteAlert = async (alertId) => {
    setError("");
    setSuccess("");
    try {
      await deletePriceAlert(alertId);
      setAlerts((current) => current.filter((item) => item.id !== alertId));
      setSuccess("Alert deleted.");
    } catch (err) {
      setError(err.response?.data?.message || "Failed to delete alert.");
    }
  };

  const onMarkNotificationRead = async (notificationId) => {
    setError("");
    try {
      const updated = await markNotificationRead(notificationId);
      setNotifications((current) =>
        current.map((item) => (String(item._id) === String(notificationId) ? updated : item))
      );
      setUnreadCount((count) => Math.max(0, count - 1));
    } catch (err) {
      setError(err.response?.data?.message || "Failed to mark notification as read.");
    }
  };

  const onMarkAllRead = async () => {
    setError("");
    setSuccess("");
    try {
      await markAllNotificationsRead();
      setNotifications((current) =>
        current.map((item) =>
          item.isRead ? item : { ...item, isRead: true, readAt: new Date().toISOString() }
        )
      );
      setUnreadCount(0);
      setSuccess("All notifications marked as read.");
    } catch (err) {
      setError(err.response?.data?.message || "Failed to mark all notifications as read.");
    }
  };

  return (
    <section className="alerts-page">
      <header className="panel dark-panel alerts-header">
        <h1>Price Alerts</h1>
        <p className="meta-line">
          Track component price targets and get notified on price drops. Unread notifications:{" "}
          <strong>{unreadCount}</strong>
        </p>
        <div className="admin-action-row">
          <button type="button" className="ghost-link" onClick={load} disabled={loading}>
            {loading ? "Refreshing..." : "Refresh"}
          </button>
          <button type="button" onClick={onMarkAllRead} disabled={unreadCount === 0}>
            Mark All Read
          </button>
        </div>
        {error && <p className="error-banner">{error}</p>}
        {success && <p className="success-banner">{success}</p>}
      </header>

      <div className="alerts-layout">
        <section className="panel dark-panel alerts-settings">
          <h2>Delivery Channels</h2>
          <p className="meta-line">
            In-app notifications are always stored. Configure extra delivery channels outside the app.
          </p>
          <div className="alerts-preferences">
            <label className="alerts-pref-row">
              <span>Email price-drop alerts</span>
              <input
                type="checkbox"
                checked={Boolean(notificationPrefs.emailPriceDrops)}
                onChange={(event) => onUpdatePreference("emailPriceDrops", event.target.checked)}
              />
            </label>
            <label className="alerts-pref-row">
              <span>Email review moderation alerts</span>
              <input
                type="checkbox"
                checked={Boolean(notificationPrefs.emailReviewModeration)}
                onChange={(event) => onUpdatePreference("emailReviewModeration", event.target.checked)}
              />
            </label>
            <label className="alerts-pref-row">
              <span>Push price-drop alerts</span>
              <input
                type="checkbox"
                checked={Boolean(notificationPrefs.pushPriceDrops)}
                onChange={(event) => onUpdatePreference("pushPriceDrops", event.target.checked)}
              />
            </label>
            <label className="alerts-pref-row">
              <span>Push review moderation alerts</span>
              <input
                type="checkbox"
                checked={Boolean(notificationPrefs.pushReviewModeration)}
                onChange={(event) => onUpdatePreference("pushReviewModeration", event.target.checked)}
              />
            </label>
          </div>
          <div className="admin-action-row">
            <button type="button" onClick={onEnablePush} disabled={channelLoading || !pushSupported}>
              {channelLoading ? "Working..." : "Enable Push On This Browser"}
            </button>
            <button
              type="button"
              className="ghost-link"
              onClick={onDisablePush}
              disabled={channelLoading || !pushSupported || !pushEnabled}
            >
              Disable Push On This Browser
            </button>
          </div>
          <p className="meta-line">
            Push status:{" "}
            {pushSupported
              ? `${pushEnabled ? "Enabled" : "Disabled"} (permission: ${pushPermission}, devices: ${pushSubscriptionCount})`
              : "Not supported in this browser"}
          </p>
        </section>

        <section className="panel dark-panel">
          <h2>Active Alerts</h2>
          {alerts.length === 0 && <p className="meta-line">No alerts configured yet. Use Products page to add one.</p>}
          <div className="alerts-list">
            {alerts.map((alert) => (
              <article key={alert.id} className="alert-card">
                <div className="alert-part">
                  {alert.component && (
                    <img
                      src={getPartImage(alert.component)}
                      alt={alert.component.name}
                      className="alert-image"
                      loading="lazy"
                    />
                  )}
                  <div>
                    <h3>{alert.component?.name || "Component unavailable"}</h3>
                    <p className="meta-line">
                      {alert.component?.brand || "-"} | Current:{" "}
                      {currency.format(Number(alert.component?.price || 0))}
                    </p>
                    <p className={alert.isTriggered ? "ok-pill" : "bad-pill"}>
                      {alert.isTriggered ? "Target reached" : "Waiting"}
                    </p>
                  </div>
                </div>

                <div className="alert-controls">
                  <label>
                    Target Price
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={targetDraftById[alert.id] ?? ""}
                      onChange={(event) => setDraft(alert.id, event.target.value)}
                    />
                  </label>
                  <div className="admin-action-row">
                    <button type="button" onClick={() => onSaveTarget(alert.id)}>
                      Save
                    </button>
                    <button
                      type="button"
                      className="ghost-link"
                      onClick={() => onToggleActive(alert.id, !alert.isActive)}
                    >
                      {alert.isActive ? "Pause" : "Resume"}
                    </button>
                    <button type="button" className="ghost-link" onClick={() => onDeleteAlert(alert.id)}>
                      Delete
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="panel dark-panel">
          <h2>Notifications</h2>
          {notifications.length === 0 && <p className="meta-line">No notifications yet.</p>}
          <div className="alerts-notification-list">
            {notifications.map((item) => (
              <article key={item._id} className={item.isRead ? "notification-card read" : "notification-card unread"}>
                <div>
                  <h3>{item.title}</h3>
                  <p>{item.message}</p>
                  <small className="meta-line">{formatDateTime(item.createdAt)}</small>
                </div>
                {!item.isRead && (
                  <button type="button" className="ghost-link" onClick={() => onMarkNotificationRead(item._id)}>
                    Mark Read
                  </button>
                )}
              </article>
            ))}
          </div>
        </section>
      </div>
    </section>
  );
}
