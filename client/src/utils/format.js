const STORAGE_KEY = "pcpro_pricing_region";

export const PRICING_REGIONS = [
  { key: "usd", label: "USD ($)", locale: "en-US", currency: "USD", rate: 1 },
  { key: "inr", label: "INR (Rs)", locale: "en-IN", currency: "INR", rate: 83.5 }
];

const regionByKey = Object.fromEntries(PRICING_REGIONS.map((region) => [region.key, region]));

const isBrowser = () => typeof window !== "undefined";

export const getPricingRegion = () => {
  if (!isBrowser()) {
    return "usd";
  }
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return regionByKey[value] ? value : "usd";
  } catch (error) {
    return "usd";
  }
};

export const setPricingRegion = (region) => {
  if (!isBrowser()) {
    return "usd";
  }
  const safeRegion = regionByKey[region] ? region : "usd";
  try {
    window.localStorage.setItem(STORAGE_KEY, safeRegion);
  } catch (error) {
    // Ignore storage failures and continue with in-memory preference.
  }
  window.dispatchEvent(new CustomEvent("pcpro:pricing-region", { detail: safeRegion }));
  return safeRegion;
};

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const buildFormatter = (regionKey) => {
  const region = regionByKey[regionKey] || regionByKey.usd;
  return new Intl.NumberFormat(region.locale, {
    style: "currency",
    currency: region.currency,
    maximumFractionDigits: 0
  });
};

const formatterCache = new Map();

const getFormatter = (regionKey) => {
  if (!formatterCache.has(regionKey)) {
    formatterCache.set(regionKey, buildFormatter(regionKey));
  }
  return formatterCache.get(regionKey);
};

export const formatMoney = (value, region = getPricingRegion()) => {
  const safeRegion = regionByKey[region] ? region : "usd";
  const rate = regionByKey[safeRegion].rate;
  const converted = toNumber(value) * rate;
  return getFormatter(safeRegion).format(converted);
};

// Backward-compatible formatter used throughout existing pages.
export const currency = {
  format(value) {
    return formatMoney(value);
  }
};
