import PriceAlert from "../models/PriceAlert.js";
import PriceHistory from "../models/PriceHistory.js";
import { dispatchUserNotification } from "./notificationDelivery.js";

const PRICE_EPSILON = 0.0001;

const toNumber = (value, fallback = NaN) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const formatPrice = (value) => {
  const numeric = toNumber(value, 0);
  if (Number.isInteger(numeric)) {
    return `$${numeric}`;
  }
  return `$${numeric.toFixed(2)}`;
};

const hasPriceChanged = (previousPrice, nextPrice) => {
  const prev = toNumber(previousPrice, NaN);
  const next = toNumber(nextPrice, NaN);
  if (!Number.isFinite(next)) {
    return false;
  }
  if (!Number.isFinite(prev)) {
    return true;
  }
  return Math.abs(prev - next) > PRICE_EPSILON;
};

export const recordInitialComponentPrice = async ({
  component,
  source = "system",
  actorId = null,
  note = ""
}) => {
  if (!component?._id) {
    return;
  }

  const price = toNumber(component.price, NaN);
  if (!Number.isFinite(price)) {
    return;
  }

  await PriceHistory.create({
    componentId: component._id,
    price,
    source,
    actorId,
    note
  });
};

export const trackComponentPriceChange = async ({
  component,
  previousPrice,
  nextPrice = undefined,
  source = "system",
  actorId = null,
  note = ""
}) => {
  if (!component?._id) {
    return { changed: false, notificationsSent: 0 };
  }

  const prev = toNumber(previousPrice, NaN);
  const next = toNumber(nextPrice ?? component.price, NaN);
  if (!hasPriceChanged(prev, next)) {
    return { changed: false, notificationsSent: 0 };
  }

  await PriceHistory.create({
    componentId: component._id,
    price: next,
    source,
    actorId,
    note
  });

  if (!Number.isFinite(prev) || next >= prev) {
    return { changed: true, notificationsSent: 0 };
  }

  const activeAlerts = await PriceAlert.find({
    componentId: component._id,
    isActive: true,
    targetPrice: { $gte: next }
  }).populate("userId", "name email notificationPrefs");

  let notificationsSent = 0;
  for (const alert of activeAlerts) {
    const target = toNumber(alert.targetPrice, NaN);
    if (!Number.isFinite(target)) {
      continue;
    }

    const crossedTarget = prev > target && next <= target;
    const notifiedAtHigherPrice =
      Number.isFinite(toNumber(alert.lastNotifiedPrice, NaN)) && next < Number(alert.lastNotifiedPrice);
    if (!crossedTarget && !notifiedAtHigherPrice) {
      continue;
    }

    const title = `Price drop alert: ${component.name}`;
    const message = `${component.name} dropped from ${formatPrice(prev)} to ${formatPrice(
      next
    )}. Target was ${formatPrice(target)}.`;

    await dispatchUserNotification({
      userId: alert.userId?._id || alert.userId,
      user: typeof alert.userId === "object" ? alert.userId : null,
      type: "price_drop",
      title,
      message,
      data: {
        componentId: component._id,
        componentName: component.name,
        previousPrice: prev,
        currentPrice: next,
        targetPrice: target,
        url: `/products/${component._id}`
      },
      channels: {
        inApp: true,
        email: true,
        push: true
      }
    });

    alert.lastNotifiedAt = new Date();
    alert.lastNotifiedPrice = next;
    await alert.save();
    notificationsSent += 1;
  }

  return { changed: true, notificationsSent };
};
