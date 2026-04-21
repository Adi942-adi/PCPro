import { useEffect, useMemo, useState } from "react";
import {
  createAdminUser,
  createAdminComponent,
  deleteAdminComponent,
  fetchAdminAuditLogs,
  fetchAdminComponents,
  fetchAdminOrders,
  fetchAdminReviews,
  fetchAdminOverview,
  fetchAdminUsers,
  importAdminComponents,
  moderateAdminReview,
  validateAdminComponentImport,
  updateAdminComponent,
  updateAdminOrderStatus,
  updateAdminUserRole
} from "../api";
import { PART_TYPES } from "../constants";
import { currency } from "../utils/format";

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "components", label: "Components" },
  { key: "orders", label: "Orders" },
  { key: "users", label: "Users" },
  { key: "reviews", label: "Reviews" },
  { key: "audit", label: "Audit Logs" }
];

const emptyComponentForm = {
  id: "",
  type: "cpu",
  name: "",
  brand: "",
  price: "",
  imageUrl: "",
  specsJson: "{\n  \n}"
};
const emptyUserForm = {
  name: "",
  email: "",
  password: "",
  role: "user"
};

const orderStatusOptions = ["pending", "paid", "shipped", "delivered", "cancelled"];
const roleOptions = ["user", "admin"];

const formatDateTime = (value) => {
  if (!value) {
    return "-";
  }
  return new Date(value).toLocaleString();
};

const isPlainObject = (value) => value && typeof value === "object" && !Array.isArray(value);

const normalizeColumnName = (value) => {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9.]/g, "");
};

const parseCsvScalar = (value) => {
  if (typeof value !== "string") {
    return value;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  const lowered = trimmed.toLowerCase();
  if (lowered === "true") {
    return true;
  }
  if (lowered === "false") {
    return false;
  }
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    return Number(trimmed);
  }
  return trimmed;
};

const parseCsvMatrix = (text) => {
  const rows = [];
  let currentRow = [];
  let currentCell = "";
  let inQuotes = false;
  const source = String(text || "").replace(/^\uFEFF/, "");

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];

    if (inQuotes) {
      if (char === '"') {
        if (source[index + 1] === '"') {
          currentCell += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        currentCell += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      continue;
    }

    if (char === ",") {
      currentRow.push(currentCell);
      currentCell = "";
      continue;
    }

    if (char === "\n") {
      currentRow.push(currentCell);
      rows.push(currentRow);
      currentRow = [];
      currentCell = "";
      continue;
    }

    if (char === "\r") {
      continue;
    }

    currentCell += char;
  }

  if (inQuotes) {
    throw new Error("CSV file has an unclosed quoted value.");
  }

  currentRow.push(currentCell);
  if (currentRow.length > 1 || currentRow[0] !== "" || rows.length === 0) {
    rows.push(currentRow);
  }

  return rows;
};

const normalizeImportItem = (rawItem) => {
  if (!isPlainObject(rawItem)) {
    return rawItem;
  }

  const normalizedSource = {};
  for (const [rawKey, rawValue] of Object.entries(rawItem)) {
    const key = normalizeColumnName(rawKey);
    if (!key) {
      continue;
    }
    normalizedSource[key] = rawValue;
  }

  const type = normalizedSource.type;
  const name = normalizedSource.name;
  const brand = normalizedSource.brand;
  const imageUrl = normalizedSource.imageurl ?? normalizedSource.image ?? "";
  const rawPrice = normalizedSource.price;
  let price = rawPrice;
  if (typeof rawPrice === "string" && rawPrice.trim() !== "") {
    price = Number(rawPrice);
  }

  let specs = {};
  if (isPlainObject(normalizedSource.specs)) {
    specs = normalizedSource.specs;
  } else if (typeof normalizedSource.specs === "string") {
    const trimmedSpecs = normalizedSource.specs.trim();
    if (trimmedSpecs) {
      try {
        specs = JSON.parse(trimmedSpecs);
      } catch (error) {
        specs = normalizedSource.specs;
      }
    }
  } else if (normalizedSource.specs !== undefined) {
    specs = normalizedSource.specs;
  }

  for (const [key, value] of Object.entries(normalizedSource)) {
    if (!key.startsWith("specs.") || key.length <= 6) {
      continue;
    }
    if (!isPlainObject(specs)) {
      specs = {};
    }
    specs[key.slice(6)] = typeof value === "string" ? parseCsvScalar(value) : value;
  }

  return {
    type,
    name,
    brand,
    price,
    imageUrl,
    specs
  };
};

const parseJsonImport = (text) => {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Error("JSON file is invalid.");
  }

  const items = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.items) ? parsed.items : null;
  if (!items) {
    throw new Error("JSON must be an array or an object with an items array.");
  }

  return items.map((item) => normalizeImportItem(item));
};

const parseCsvImport = (text) => {
  const matrix = parseCsvMatrix(text);
  if (!matrix.length) {
    throw new Error("CSV file is empty.");
  }

  const headers = matrix[0].map((value) => normalizeColumnName(value));
  if (!headers.some(Boolean)) {
    throw new Error("CSV header row is empty.");
  }

  const rows = [];
  for (let rowIndex = 1; rowIndex < matrix.length; rowIndex += 1) {
    const row = matrix[rowIndex];
    if (row.every((cell) => !String(cell || "").trim())) {
      continue;
    }

    const mapped = {};
    for (let index = 0; index < headers.length; index += 1) {
      const key = headers[index];
      if (!key) {
        continue;
      }
      mapped[key] = String(row[index] ?? "").trim();
    }
    rows.push(normalizeImportItem(mapped));
  }

  if (!rows.length) {
    throw new Error("CSV has no data rows.");
  }

  return rows;
};

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState("overview");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [overview, setOverview] = useState(null);

  const [componentsData, setComponentsData] = useState({ items: [], pagination: null });
  const [componentPage, setComponentPage] = useState(1);
  const [componentSearch, setComponentSearch] = useState("");
  const [componentType, setComponentType] = useState("all");
  const [componentForm, setComponentForm] = useState(emptyComponentForm);
  const [importMode, setImportMode] = useState("upsert");
  const [importSourceName, setImportSourceName] = useState("");
  const [importDataset, setImportDataset] = useState([]);
  const [importPreview, setImportPreview] = useState(null);
  const [importResult, setImportResult] = useState(null);

  const [ordersData, setOrdersData] = useState({ items: [], pagination: null });
  const [ordersPage, setOrdersPage] = useState(1);
  const [ordersStatus, setOrdersStatus] = useState("all");
  const [ordersSearch, setOrdersSearch] = useState("");

  const [usersData, setUsersData] = useState({ items: [], pagination: null });
  const [usersPage, setUsersPage] = useState(1);
  const [usersRole, setUsersRole] = useState("all");
  const [usersSearch, setUsersSearch] = useState("");
  const [userForm, setUserForm] = useState(emptyUserForm);

  const [reviewsData, setReviewsData] = useState({ items: [], pagination: null });
  const [reviewsPage, setReviewsPage] = useState(1);
  const [reviewsStatus, setReviewsStatus] = useState("pending");
  const [reviewsRating, setReviewsRating] = useState("all");
  const [reviewsSearch, setReviewsSearch] = useState("");
  const [reviewModerationNotes, setReviewModerationNotes] = useState({});

  const [auditData, setAuditData] = useState({ items: [], pagination: null });
  const [auditPage, setAuditPage] = useState(1);
  const [auditAction, setAuditAction] = useState("");
  const [auditResource, setAuditResource] = useState("");

  const selectedTabLabel = useMemo(() => {
    return TABS.find((item) => item.key === activeTab)?.label || "Admin";
  }, [activeTab]);

  const clearMessages = () => {
    setError("");
    setSuccess("");
  };

  const withGuard = async (fn) => {
    setLoading(true);
    clearMessages();
    try {
      await fn();
    } catch (err) {
      setError(err.response?.data?.message || err.message || "Operation failed.");
    } finally {
      setLoading(false);
    }
  };

  const loadOverview = async () => {
    const result = await fetchAdminOverview();
    setOverview(result);
  };

  const loadComponents = async () => {
    const result = await fetchAdminComponents({
      page: componentPage,
      limit: 12,
      search: componentSearch || undefined,
      type: componentType === "all" ? undefined : componentType,
      sortBy: "createdAt",
      sortDir: "desc"
    });
    setComponentsData(result);
  };

  const loadOrders = async () => {
    const result = await fetchAdminOrders({
      page: ordersPage,
      limit: 12,
      status: ordersStatus,
      search: ordersSearch || undefined
    });
    setOrdersData(result);
  };

  const loadUsers = async () => {
    const result = await fetchAdminUsers({
      page: usersPage,
      limit: 12,
      role: usersRole,
      search: usersSearch || undefined
    });
    setUsersData(result);
  };

  const loadAuditLogs = async () => {
    const result = await fetchAdminAuditLogs({
      page: auditPage,
      limit: 15,
      action: auditAction || undefined,
      resource: auditResource || undefined
    });
    setAuditData(result);
  };

  const loadReviews = async () => {
    const result = await fetchAdminReviews({
      page: reviewsPage,
      limit: 12,
      status: reviewsStatus,
      rating: reviewsRating === "all" ? undefined : reviewsRating,
      search: reviewsSearch || undefined
    });
    setReviewsData(result);
  };

  useEffect(() => {
    withGuard(async () => {
      if (activeTab === "overview") {
        await loadOverview();
      } else if (activeTab === "components") {
        await loadComponents();
      } else if (activeTab === "orders") {
        await loadOrders();
      } else if (activeTab === "users") {
        await loadUsers();
      } else if (activeTab === "reviews") {
        await loadReviews();
      } else if (activeTab === "audit") {
        await loadAuditLogs();
      }
    });
  }, [
    activeTab,
    componentPage,
    componentSearch,
    componentType,
    ordersPage,
    ordersStatus,
    ordersSearch,
    usersPage,
    usersRole,
    usersSearch,
    reviewsPage,
    reviewsStatus,
    reviewsRating,
    reviewsSearch,
    auditPage,
    auditAction,
    auditResource
  ]);

  const setFormField = (field, value) => {
    setComponentForm((current) => ({ ...current, [field]: value }));
  };
  const setUserFormField = (field, value) => {
    setUserForm((current) => ({ ...current, [field]: value }));
  };

  const resetComponentForm = () => {
    setComponentForm(emptyComponentForm);
  };
  const resetUserForm = () => {
    setUserForm(emptyUserForm);
  };

  const onEditComponent = (item) => {
    setComponentForm({
      id: item._id,
      type: item.type,
      name: item.name,
      brand: item.brand,
      price: String(item.price ?? ""),
      imageUrl: item.imageUrl || "",
      specsJson: JSON.stringify(item.specs || {}, null, 2)
    });
  };

  const onSubmitComponent = async (event) => {
    event.preventDefault();

    await withGuard(async () => {
      let specs = {};
      try {
        specs = componentForm.specsJson.trim() ? JSON.parse(componentForm.specsJson) : {};
      } catch (error) {
        throw new Error("Invalid specs JSON.");
      }

      const payload = {
        type: componentForm.type,
        name: componentForm.name,
        brand: componentForm.brand,
        price: Number(componentForm.price),
        imageUrl: componentForm.imageUrl,
        specs
      };

      if (componentForm.id) {
        await updateAdminComponent(componentForm.id, payload);
        setSuccess("Component updated.");
      } else {
        await createAdminComponent(payload);
        setSuccess("Component created.");
      }

      resetComponentForm();
      await loadComponents();
    });
  };

  const onDeleteComponent = async (id) => {
    await withGuard(async () => {
      await deleteAdminComponent(id);
      setSuccess("Component deleted.");
      await loadComponents();
    });
  };

  const onImportFileSelected = async (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    await withGuard(async () => {
      const rawText = await file.text();
      const lowerFileName = file.name.toLowerCase();
      let parsedRows = [];

      if (lowerFileName.endsWith(".json")) {
        parsedRows = parseJsonImport(rawText);
      } else if (lowerFileName.endsWith(".csv")) {
        parsedRows = parseCsvImport(rawText);
      } else {
        throw new Error("Unsupported file format. Upload .json or .csv.");
      }

      if (!Array.isArray(parsedRows) || parsedRows.length === 0) {
        throw new Error("No rows found in file.");
      }

      setImportSourceName(file.name);
      setImportDataset(parsedRows);
      setImportPreview(null);
      setImportResult(null);
      setSuccess(`Loaded ${parsedRows.length} rows from ${file.name}.`);
    });
  };

  const onValidateImport = async () => {
    await withGuard(async () => {
      if (!importDataset.length) {
        throw new Error("Upload a CSV or JSON file first.");
      }

      const result = await validateAdminComponentImport(importDataset, importMode);
      setImportPreview(result);
      setImportResult(null);
      setSuccess("Validation completed.");
    });
  };

  const onImportValidRows = async () => {
    await withGuard(async () => {
      if (!importPreview) {
        throw new Error("Run validation before importing.");
      }
      if (!Array.isArray(importPreview.readyIndexes) || importPreview.readyIndexes.length === 0) {
        throw new Error("There are no valid rows to import.");
      }

      const items = importPreview.readyIndexes
        .map((index) => importDataset[index])
        .filter((item) => item !== undefined);

      if (!items.length) {
        throw new Error("Validation output does not match current file. Re-validate and try again.");
      }

      const result = await importAdminComponents(items, importMode);
      setImportResult(result);
      setSuccess("Valid rows imported.");
      await loadComponents();
    });
  };

  const onOrderStatusChange = async (orderId, status) => {
    await withGuard(async () => {
      await updateAdminOrderStatus(orderId, status);
      setSuccess("Order status updated.");
      await loadOrders();
    });
  };

  const onUserRoleChange = async (userId, role) => {
    await withGuard(async () => {
      await updateAdminUserRole(userId, role);
      setSuccess("User role updated.");
      await loadUsers();
    });
  };

  const onSubmitUser = async (event) => {
    event.preventDefault();
    await withGuard(async () => {
      const payload = {
        name: String(userForm.name || "").trim(),
        email: String(userForm.email || "").trim(),
        password: String(userForm.password || ""),
        role: userForm.role
      };
      await createAdminUser(payload);
      setSuccess(`New ${payload.role} account created.`);
      resetUserForm();
      await loadUsers();
    });
  };

  const setReviewNote = (reviewId, note) => {
    setReviewModerationNotes((current) => ({ ...current, [reviewId]: note }));
  };

  const onModerateReview = async (reviewId, status) => {
    await withGuard(async () => {
      const moderationNote = String(reviewModerationNotes[reviewId] || "").trim();
      await moderateAdminReview(reviewId, { status, moderationNote });
      setSuccess(`Review ${status}.`);
      await loadReviews();
    });
  };

  const renderPagination = (pagination, onPrev, onNext) => {
    if (!pagination) {
      return null;
    }
    return (
      <div className="admin-pagination">
        <button type="button" className="ghost-link" onClick={onPrev} disabled={pagination.page <= 1}>
          Previous
        </button>
        <span>
          Page {pagination.page} / {pagination.totalPages} ({pagination.total} total)
        </span>
        <button
          type="button"
          className="ghost-link"
          onClick={onNext}
          disabled={pagination.page >= pagination.totalPages}
        >
          Next
        </button>
      </div>
    );
  };

  return (
    <section className="admin-page">
      <header className="admin-header panel dark-panel">
        <h1>Admin Panel</h1>
        <p>{selectedTabLabel}</p>
        <div className="admin-tabs">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              className={activeTab === tab.key ? "admin-tab active" : "admin-tab"}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>
        {loading && <p className="meta-line">Loading...</p>}
        {error && <p className="error-banner">{error}</p>}
        {success && <p className="success-banner">{success}</p>}
      </header>

      {activeTab === "overview" && (
        <div className="admin-section panel dark-panel">
          <h2>System Overview</h2>
          <div className="admin-metrics-grid">
            <article>
              <h3>Components</h3>
              <p>{overview?.metrics?.components ?? 0}</p>
            </article>
            <article>
              <h3>Users</h3>
              <p>{overview?.metrics?.users ?? 0}</p>
            </article>
            <article>
              <h3>Orders</h3>
              <p>{overview?.metrics?.orders ?? 0}</p>
            </article>
            <article>
              <h3>Builds</h3>
              <p>{overview?.metrics?.builds ?? 0}</p>
            </article>
            <article>
              <h3>Reviews</h3>
              <p>{overview?.metrics?.reviews ?? 0}</p>
            </article>
            <article>
              <h3>Pending Reviews</h3>
              <p>{overview?.metrics?.pendingReviews ?? 0}</p>
            </article>
            <article>
              <h3>Paid Orders</h3>
              <p>{overview?.metrics?.paidOrders ?? 0}</p>
            </article>
            <article>
              <h3>Revenue</h3>
              <p>{currency.format(overview?.metrics?.revenue ?? 0)}</p>
            </article>
          </div>

          <div className="admin-columns">
            <div>
              <h3>Recent Orders</h3>
              <div className="admin-list">
                {(overview?.recentOrders || []).map((order) => (
                  <article key={order._id} className="admin-list-item">
                    <p>
                      {order._id} | {order.status}
                    </p>
                    <p>{currency.format(order.total || 0)}</p>
                    <p>{order.userId?.email || order.shippingAddress?.email || "-"}</p>
                  </article>
                ))}
              </div>
            </div>
            <div>
              <h3>Recent Audit Logs</h3>
              <div className="admin-list">
                {(overview?.recentAuditLogs || []).map((log) => (
                  <article key={log._id} className="admin-list-item">
                    <p>
                      {log.action} | {log.resource}
                    </p>
                    <p>{log.actorEmail}</p>
                    <p>{formatDateTime(log.createdAt)}</p>
                  </article>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === "components" && (
        <div className="admin-section panel dark-panel">
          <h2>Components Management</h2>
          <div className="admin-toolbar">
            <input
              placeholder="Search name/brand"
              value={componentSearch}
              onChange={(event) => {
                setComponentPage(1);
                setComponentSearch(event.target.value);
              }}
            />
            <select
              value={componentType}
              onChange={(event) => {
                setComponentPage(1);
                setComponentType(event.target.value);
              }}
            >
              <option value="all">All Types</option>
              {PART_TYPES.map((part) => (
                <option key={part.key} value={part.key}>
                  {part.label}
                </option>
              ))}
            </select>
          </div>

          <div className="admin-columns">
            <div>
              <h3>{componentForm.id ? "Edit Component" : "Create Component"}</h3>
              <form className="admin-form" onSubmit={onSubmitComponent}>
                <select
                  value={componentForm.type}
                  onChange={(event) => setFormField("type", event.target.value)}
                  required
                >
                  {PART_TYPES.map((part) => (
                    <option key={part.key} value={part.key}>
                      {part.label}
                    </option>
                  ))}
                </select>
                <input
                  placeholder="Name"
                  value={componentForm.name}
                  onChange={(event) => setFormField("name", event.target.value)}
                  required
                />
                <input
                  placeholder="Brand"
                  value={componentForm.brand}
                  onChange={(event) => setFormField("brand", event.target.value)}
                  required
                />
                <input
                  placeholder="Price"
                  type="number"
                  min="0"
                  step="0.01"
                  value={componentForm.price}
                  onChange={(event) => setFormField("price", event.target.value)}
                  required
                />
                <input
                  placeholder="Image URL"
                  value={componentForm.imageUrl}
                  onChange={(event) => setFormField("imageUrl", event.target.value)}
                />
                <textarea
                  placeholder="Specs JSON"
                  value={componentForm.specsJson}
                  onChange={(event) => setFormField("specsJson", event.target.value)}
                  rows={10}
                />
                <div className="admin-action-row">
                  <button type="submit">{componentForm.id ? "Update" : "Create"}</button>
                  {componentForm.id && (
                    <button type="button" className="ghost-link" onClick={resetComponentForm}>
                      Cancel
                    </button>
                  )}
                </div>
              </form>
            </div>

            <div>
              <h3>Bulk Import (CSV/JSON)</h3>
              <div className="admin-form">
                <input
                  type="file"
                  accept=".json,.csv,application/json,text/csv"
                  onChange={onImportFileSelected}
                />
                {importSourceName && (
                  <p className="meta-line">
                    File: {importSourceName} | Rows loaded: {importDataset.length}
                  </p>
                )}
                <select
                  value={importMode}
                  onChange={(event) => {
                    setImportMode(event.target.value);
                    setImportPreview(null);
                    setImportResult(null);
                  }}
                >
                  <option value="upsert">Upsert</option>
                  <option value="insert">Insert only</option>
                </select>
                <div className="admin-action-row">
                  <button type="button" onClick={onValidateImport} disabled={!importDataset.length}>
                    Validate File
                  </button>
                  <button
                    type="button"
                    className="ghost-link"
                    onClick={onImportValidRows}
                    disabled={!importPreview?.readyCount}
                  >
                    Import Valid Rows Only
                  </button>
                </div>
                {importPreview && (
                  <div className="admin-import-result">
                    <p>
                      Requested: {importPreview.totalRequested} | Ready: {importPreview.readyCount} | Errors:{" "}
                      {importPreview.errorCount} | Skipped: {importPreview.skipCount}
                    </p>
                    <p>
                      Will insert: {importPreview.insertCount} | Will update: {importPreview.updateCount}
                    </p>

                    {Array.isArray(importPreview.errors) && importPreview.errors.length > 0 && (
                      <>
                        <p className="meta-line">Validation errors (first {importPreview.errors.length}):</p>
                        <ul className="admin-validation-list">
                          {importPreview.errors.map((issue) => (
                            <li key={`error-${issue.index}`}>
                              Row {issue.index + 1}: {issue.message}
                            </li>
                          ))}
                        </ul>
                      </>
                    )}

                    {Array.isArray(importPreview.skips) && importPreview.skips.length > 0 && (
                      <>
                        <p className="meta-line">Skipped rows (first {importPreview.skips.length}):</p>
                        <ul className="admin-validation-list">
                          {importPreview.skips.map((issue) => (
                            <li key={`skip-${issue.index}`}>
                              Row {issue.index + 1}: {issue.message}
                            </li>
                          ))}
                        </ul>
                      </>
                    )}
                  </div>
                )}
                {importResult && (
                  <div className="admin-import-result">
                    <p>
                      Imported successfully | Inserted: {importResult.inserted} | Updated:{" "}
                      {importResult.updated} | Skipped: {importResult.skipped}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="admin-list">
            {(componentsData.items || []).map((item) => (
              <article key={item._id} className="admin-list-item">
                <div>
                  <p>
                    <strong>{item.name}</strong> ({item.type})
                  </p>
                  <p>
                    {item.brand} | {currency.format(item.price || 0)}
                  </p>
                </div>
                <div className="admin-action-row">
                  <button type="button" className="ghost-link" onClick={() => onEditComponent(item)}>
                    Edit
                  </button>
                  <button type="button" onClick={() => onDeleteComponent(item._id)}>
                    Delete
                  </button>
                </div>
              </article>
            ))}
          </div>

          {renderPagination(
            componentsData.pagination,
            () => setComponentPage((p) => Math.max(1, p - 1)),
            () => setComponentPage((p) => p + 1)
          )}
        </div>
      )}

      {activeTab === "orders" && (
        <div className="admin-section panel dark-panel">
          <h2>Orders Management</h2>
          <div className="admin-toolbar">
            <input
              placeholder="Search by order id or email"
              value={ordersSearch}
              onChange={(event) => {
                setOrdersPage(1);
                setOrdersSearch(event.target.value);
              }}
            />
            <select
              value={ordersStatus}
              onChange={(event) => {
                setOrdersPage(1);
                setOrdersStatus(event.target.value);
              }}
            >
              <option value="all">All status</option>
              {orderStatusOptions.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </div>

          <div className="admin-list">
            {(ordersData.items || []).map((order) => (
              <article key={order._id} className="admin-list-item">
                <div>
                  <p>
                    <strong>{order._id}</strong> | {currency.format(order.total || 0)}
                  </p>
                  <p>
                    {order.shippingAddress?.email || order.userId?.email || "-"} |{" "}
                    {formatDateTime(order.createdAt)}
                  </p>
                </div>
                <div className="admin-action-row">
                  <select defaultValue={order.status} onChange={(event) => onOrderStatusChange(order._id, event.target.value)}>
                    {orderStatusOptions.map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>
                </div>
              </article>
            ))}
          </div>

          {renderPagination(
            ordersData.pagination,
            () => setOrdersPage((p) => Math.max(1, p - 1)),
            () => setOrdersPage((p) => p + 1)
          )}
        </div>
      )}

      {activeTab === "users" && (
        <div className="admin-section panel dark-panel">
          <h2>Users Management</h2>
          <div className="admin-toolbar">
            <input
              placeholder="Search users"
              value={usersSearch}
              onChange={(event) => {
                setUsersPage(1);
                setUsersSearch(event.target.value);
              }}
            />
            <select
              value={usersRole}
              onChange={(event) => {
                setUsersPage(1);
                setUsersRole(event.target.value);
              }}
            >
              <option value="all">All roles</option>
              {roleOptions.map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>
          </div>

          <form className="admin-form" onSubmit={onSubmitUser}>
            <h3>Create User/Admin</h3>
            <input
              placeholder="Full name"
              value={userForm.name}
              onChange={(event) => setUserFormField("name", event.target.value)}
              required
            />
            <input
              type="email"
              placeholder="Email"
              value={userForm.email}
              onChange={(event) => setUserFormField("email", event.target.value)}
              required
            />
            <input
              type="password"
              placeholder="Password"
              value={userForm.password}
              onChange={(event) => setUserFormField("password", event.target.value)}
              minLength={8}
              required
            />
            <select value={userForm.role} onChange={(event) => setUserFormField("role", event.target.value)}>
              {roleOptions.map((role) => (
                <option key={`create-${role}`} value={role}>
                  {role}
                </option>
              ))}
            </select>
            <div className="admin-action-row">
              <button type="submit">Create Account</button>
              <button type="button" className="ghost-link" onClick={resetUserForm}>
                Clear
              </button>
            </div>
            <p className="meta-line">Password must include uppercase, lowercase, and number.</p>
          </form>

          <div className="admin-list">
            {(usersData.items || []).map((user) => (
              <article key={user._id} className="admin-list-item">
                <div>
                  <p>
                    <strong>{user.name}</strong> ({user.email})
                  </p>
                  <p>
                    Role: {user.role} | Created: {formatDateTime(user.createdAt)}
                  </p>
                </div>
                <div className="admin-action-row">
                  <select defaultValue={user.role} onChange={(event) => onUserRoleChange(user._id, event.target.value)}>
                    {roleOptions.map((role) => (
                      <option key={role} value={role}>
                        {role}
                      </option>
                    ))}
                  </select>
                </div>
              </article>
            ))}
          </div>

          {renderPagination(
            usersData.pagination,
            () => setUsersPage((p) => Math.max(1, p - 1)),
            () => setUsersPage((p) => p + 1)
          )}
        </div>
      )}

      {activeTab === "reviews" && (
        <div className="admin-section panel dark-panel">
          <h2>Review Moderation</h2>
          <div className="admin-review-filters">
            <select
              value={reviewsStatus}
              onChange={(event) => {
                setReviewsPage(1);
                setReviewsStatus(event.target.value);
              }}
            >
              <option value="all">All status</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </select>

            <select
              value={reviewsRating}
              onChange={(event) => {
                setReviewsPage(1);
                setReviewsRating(event.target.value);
              }}
            >
              <option value="all">All ratings</option>
              <option value="5">5 stars</option>
              <option value="4">4 stars</option>
              <option value="3">3 stars</option>
              <option value="2">2 stars</option>
              <option value="1">1 star</option>
            </select>

            <input
              placeholder="Search in comment"
              value={reviewsSearch}
              onChange={(event) => {
                setReviewsPage(1);
                setReviewsSearch(event.target.value);
              }}
            />
          </div>

          <div className="admin-list">
            {(reviewsData.items || []).map((review) => (
              <article key={review.id} className="admin-review-card">
                <div className="admin-review-top">
                  <p>
                    <strong>{review.component?.name || "Unknown component"}</strong>
                  </p>
                  <span className={`status-pill ${review.status}`}>{review.status}</span>
                </div>

                <p className="admin-review-meta">
                  {review.component?.type || "-"} | User: {review.user?.name || "Unknown"} (
                  {review.user?.email || "-"}) | Rating: {review.rating}/5
                </p>
                <p className="admin-review-meta">
                  Submitted: {formatDateTime(review.createdAt)} | Updated: {formatDateTime(review.updatedAt)}
                </p>

                {review.comment && <p>{review.comment}</p>}

                {Array.isArray(review.pros) && review.pros.length > 0 && (
                  <div>
                    <p className="ok-text">Pros</p>
                    <ul className="plain-list">
                      {review.pros.map((item, index) => (
                        <li key={`pros-${review.id}-${index}`}>{item}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {Array.isArray(review.cons) && review.cons.length > 0 && (
                  <div>
                    <p className="bad-text">Cons</p>
                    <ul className="plain-list">
                      {review.cons.map((item, index) => (
                        <li key={`cons-${review.id}-${index}`}>{item}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <label>
                  Moderation note
                  <input
                    value={reviewModerationNotes[review.id] ?? review.moderationNote ?? ""}
                    onChange={(event) => setReviewNote(review.id, event.target.value)}
                    placeholder="Optional note visible to user"
                  />
                </label>

                <div className="admin-action-row">
                  <button type="button" onClick={() => onModerateReview(review.id, "approved")}>
                    Approve
                  </button>
                  <button type="button" className="ghost-link" onClick={() => onModerateReview(review.id, "rejected")}>
                    Reject
                  </button>
                  <button type="button" className="ghost-link" onClick={() => onModerateReview(review.id, "pending")}>
                    Mark Pending
                  </button>
                </div>
              </article>
            ))}
          </div>

          {renderPagination(
            reviewsData.pagination,
            () => setReviewsPage((p) => Math.max(1, p - 1)),
            () => setReviewsPage((p) => p + 1)
          )}
        </div>
      )}

      {activeTab === "audit" && (
        <div className="admin-section panel dark-panel">
          <h2>Audit Logs</h2>
          <div className="admin-toolbar">
            <input
              placeholder="Action (e.g. component.update)"
              value={auditAction}
              onChange={(event) => {
                setAuditPage(1);
                setAuditAction(event.target.value);
              }}
            />
            <input
              placeholder="Resource (component/order/user)"
              value={auditResource}
              onChange={(event) => {
                setAuditPage(1);
                setAuditResource(event.target.value);
              }}
            />
          </div>

          <div className="admin-list">
            {(auditData.items || []).map((log) => (
              <article key={log._id} className="admin-list-item">
                <div>
                  <p>
                    <strong>{log.action}</strong> | {log.resource}
                  </p>
                  <p>
                    Actor: {log.actorEmail} | {formatDateTime(log.createdAt)}
                  </p>
                  <p>Resource ID: {log.resourceId || "-"}</p>
                </div>
              </article>
            ))}
          </div>

          {renderPagination(
            auditData.pagination,
            () => setAuditPage((p) => Math.max(1, p - 1)),
            () => setAuditPage((p) => p + 1)
          )}
        </div>
      )}
    </section>
  );
}
