import React, { useCallback, useEffect, useMemo, useState } from "react";
import universityLogo from "../../assets/Logo-DOh1oyg8.png";
import { api, exportCsv, queryString } from "./api.js";
import { Icon } from "./icons.jsx";

const ROLE_LABELS = {
  faculty_staff: "Faculty / Staff",
  mis: "MIS Personnel",
  administrator: "Administrator",
};

const STATUS_LABELS = {
  new: "New",
  in_progress: "In progress",
  waiting_on_requester: "Waiting on requester",
  resolved: "Resolved",
  closed: "Closed",
};

const PRIORITY_LABELS = {
  low: "Low",
  normal: "Normal",
  high: "High",
  urgent: "Urgent",
};

const NAVIGATION = {
  faculty_staff: [
    { id: "overview", label: "Overview", icon: "dashboard" },
    { id: "requests", label: "My requests", icon: "file" },
    { id: "new-request", label: "New request", icon: "plus" },
    { id: "notifications", label: "Notifications", icon: "bell" },
  ],
  mis: [
    { id: "overview", label: "Overview", icon: "dashboard" },
    { id: "requests", label: "Request queue", icon: "file" },
    { id: "technicians", label: "Technicians", icon: "briefcase" },
    { id: "notifications", label: "Notifications", icon: "bell" },
  ],
  administrator: [
    { id: "overview", label: "Dashboard", icon: "dashboard" },
    { id: "requests", label: "ICT requests", icon: "file" },
    { id: "users", label: "User management", icon: "users" },
    { id: "departments", label: "Departments", icon: "building" },
    { id: "categories", label: "Categories", icon: "grid" },
    { id: "reports", label: "Reports & analytics", icon: "chart" },
    { id: "activity", label: "Activity log", icon: "activity" },
    { id: "technicians", label: "Technicians", icon: "briefcase" },
    { id: "settings", label: "Settings", icon: "settings" },
  ],
};

function dateTime(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function initials(name = "") {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

function ErrorMessage({ children }) {
  if (!children) return null;
  return <div className="alert alert-error" role="alert">{children}</div>;
}

function Notice({ children, tone = "success" }) {
  if (!children) return null;
  return <div className={`alert alert-${tone}`} role="status">{children}</div>;
}

function Loading({ label = "Loading your workspace…" }) {
  return <div className="loading-state"><span className="spinner" />{label}</div>;
}

function EmptyState({ icon = "file", title, detail, action }) {
  return (
    <div className="empty-state">
      <span className="empty-icon"><Icon name={icon} size={23} /></span>
      <h3>{title}</h3>
      {detail && <p>{detail}</p>}
      {action}
    </div>
  );
}

function StatusBadge({ status }) {
  return <span className={`badge badge-${status}`}>{STATUS_LABELS[status] || status}</span>;
}

function PriorityBadge({ priority }) {
  return <span className={`priority priority-${priority}`}>{PRIORITY_LABELS[priority] || priority}</span>;
}

function Button({ children, variant = "primary", icon, className = "", ...props }) {
  return (
    <button className={`button button-${variant} ${className}`} {...props}>
      {icon && <Icon name={icon} size={16} />}
      {children}
    </button>
  );
}

function PageHeading({ eyebrow, title, description, action }) {
  return (
    <div className="page-heading">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        {description && <p className="page-description">{description}</p>}
      </div>
      {action}
    </div>
  );
}

function StatCard({ label, value, detail, icon, tone = "blue" }) {
  return (
    <article className="stat-card">
      <div className="stat-copy">
        <span>{label}</span>
        <strong>{value ?? "—"}</strong>
        {detail && <small>{detail}</small>}
      </div>
      <span className={`stat-icon stat-${tone}`}><Icon name={icon} size={19} /></span>
    </article>
  );
}

function Login({ onLogin, initialError }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(initialError || "");
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const result = await api("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      setPassword("");
      onLogin(result.user);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login-shell">
      <div className="login-layout">
        <section className="login-visual" aria-label="Liceo de Cagayan University">
          <div className="login-seal-wrap">
            <img src="/liceo-seal.png" alt="Liceo de Cagayan University seal" />
          </div>
          <p className="login-visual-kicker">LICEO DE CAGAYAN UNIVERSITY</p>
          <h2>Main Campus</h2>
          <span className="login-visual-rule" />
          <p className="login-visual-caption">Information and Communications Technology Services</p>
        </section>
        <section className="login-card">
          <div className="login-form-content">
            <div className="login-mark"><Icon name="shield" size={22} /></div>
            <p className="eyebrow">REQUESTHUB PORTAL</p>
            <h1>Welcome back</h1>
            <p className="page-description login-description">Enter your institutional account details to continue.</p>
            <ErrorMessage>{error}</ErrorMessage>
            <form onSubmit={submit} className="form-stack login-form">
              <label>Email address<input autoComplete="username" type="email" required maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@liceo.edu.ph" /></label>
              <label>Password<input autoComplete="current-password" type="password" required maxLength={72} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Enter your password" /></label>
              <Button type="submit" disabled={busy} className="button-block">{busy ? "Signing in…" : "Sign in"} <Icon name="chevron" size={17} /></Button>
            </form>
            <p className="login-footnote">Accounts are managed by your RequestHub administrator.</p>
          </div>
        </section>
      </div>
    </main>
  );
}

function NotificationBell({ notifications, unreadCount, onNavigate, onRefresh }) {
  const [open, setOpen] = useState(false);

  async function markRead() {
    try {
      await api("/api/notifications/read-all", { method: "PATCH", body: JSON.stringify({}) });
      onRefresh();
    } catch (error) { onRefresh(error.message); }
  }

  return (
    <div className="notification-wrap">
      <button className="icon-button notification-trigger" aria-label={`${unreadCount} unread notifications`} onClick={() => setOpen((current) => !current)}>
        <Icon name="bell" size={19} />
        {unreadCount > 0 && <span className="notification-dot">{unreadCount > 9 ? "9+" : unreadCount}</span>}
      </button>
      {open && (
        <div className="notification-popover">
          <div className="popover-heading"><strong>Notifications</strong><button type="button" className="text-button" onClick={markRead}>Mark all read</button></div>
          {!notifications.length ? <p className="popover-empty">You're all caught up.</p> : notifications.slice(0, 6).map((item) => (
            <button className={`notification-item ${!item.readAt ? "notification-unread" : ""}`} key={item.id} onClick={() => { setOpen(false); onNavigate(item.requestId); }}>
              <span className="notification-item-icon"><Icon name={item.kind === "new_request" ? "plus" : "activity"} size={15} /></span>
              <span><strong>{item.title}</strong><small>{item.message}</small><time>{dateTime(item.createdAt)}</time></span>
            </button>
          ))}
          <button className="notification-footer" onClick={() => { setOpen(false); onNavigate("all"); }}>View all notifications</button>
        </div>
      )}
    </div>
  );
}

function AppShell({ user, onLogout, children, navigation, page, setPage, notifications, unreadCount, refreshNotifications, onOpenRequest }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const pageTitle = navigation.find((item) => item.id === page)?.label || "Overview";

  return (
    <div className="app-shell">
      <aside className={`sidebar ${sidebarOpen ? "sidebar-open" : ""}`}>
        <div className="sidebar-brand">
          <img src={universityLogo} alt="" />
          <span><strong>RequestHub</strong><small>Liceo · Main Campus</small></span>
          <button className="icon-button sidebar-close" aria-label="Close navigation" onClick={() => setSidebarOpen(false)}><Icon name="close" /></button>
        </div>
        <div className="sidebar-label">WORKSPACE</div>
        <nav className="sidebar-nav">
          {navigation.map((item) => (
            <button className={`nav-link ${page === item.id ? "nav-active" : ""}`} key={item.id} onClick={() => { setPage(item.id); setSidebarOpen(false); }}>
              <Icon name={item.icon} size={18} /><span>{item.label}</span>
              {item.id === "notifications" && unreadCount > 0 && <span className="nav-count">{unreadCount}</span>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="campus-card"><div className="campus-dot" /><div><strong>Main Campus</strong><span>ICT support system</span></div></div>
          <div className="sidebar-profile">
            <span className="avatar">{initials(user.fullName)}</span>
            <span className="profile-copy"><strong>{user.fullName}</strong><small>{ROLE_LABELS[user.role]}</small></span>
            <button className="icon-button profile-menu-trigger" aria-label="Open profile menu" onClick={() => setProfileOpen((current) => !current)}><Icon name="menu" size={17} /></button>
            {profileOpen && <div className="profile-menu"><button onClick={() => { setPage("settings"); setProfileOpen(false); }}>Account settings</button><button className="profile-logout" onClick={onLogout}><Icon name="logout" size={15} /> Sign out</button></div>}
          </div>
        </div>
      </aside>
      {sidebarOpen && <button className="sidebar-scrim" aria-label="Close navigation" onClick={() => setSidebarOpen(false)} />}
      <div className="main-column">
        <header className="topbar">
          <button className="icon-button mobile-menu" aria-label="Open navigation" onClick={() => setSidebarOpen(true)}><Icon name="menu" /></button>
          <div className="breadcrumbs"><span>RequestHub</span><Icon name="chevron" size={14} /><strong>{pageTitle}</strong></div>
          <div className="topbar-right">
            <div className="campus-indicator"><span className="campus-dot" /> Main Campus</div>
            <NotificationBell notifications={notifications} unreadCount={unreadCount} onRefresh={refreshNotifications} onNavigate={(requestId) => {
              setPage(requestId === "all" ? "notifications" : "requests");
              if (requestId !== "all") onOpenRequest(requestId);
            }} />
            <button className="topbar-user" onClick={() => setProfileOpen((current) => !current)}><span className="avatar avatar-small">{initials(user.fullName)}</span><span>{user.fullName.split(" ")[0]}</span><Icon name="chevron" size={14} /></button>
            {profileOpen && <div className="topbar-profile-menu"><span>{ROLE_LABELS[user.role]}</span><button onClick={() => { setPage("settings"); setProfileOpen(false); }}>Account settings</button><button onClick={onLogout}>Sign out</button></div>}
          </div>
        </header>
        <main className="content-area">{children}</main>
        <footer className="app-footer">RequestHub <span>·</span> ICT Services <span>·</span> Liceo de Cagayan University Main Campus</footer>
      </div>
    </div>
  );
}

function RequestTable({ requests, loading, error, emptyTitle, onOpen, onPage, page, total, limit, currentUser }) {
  if (loading) return <Loading label="Loading support requests…" />;
  if (error) return <ErrorMessage>{error}</ErrorMessage>;
  if (!requests.length) return <EmptyState icon="file" title={emptyTitle || "No requests found"} detail="Try adjusting your filters, or submit a new ICT support request." />;
  const pageCount = Math.max(1, Math.ceil(total / limit));
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead><tr><th>Request</th>{currentUser !== "faculty_staff" && <th>Requester</th>}<th>Category</th><th>Priority</th><th>Status</th><th>Submitted</th><th /></tr></thead>
        <tbody>{requests.map((request) => (
          <tr key={request.id} onClick={() => onOpen(request.id)} className="click-row">
            <td><strong className="request-number">{request.requestNumber}</strong><span className="table-secondary">{request.title}</span></td>
            {currentUser !== "faculty_staff" && <td><strong className="table-primary">{request.requesterName}</strong><span className="table-secondary">{request.departmentName || "No department"}</span></td>}
            <td><span className="table-primary">{request.categoryName}</span></td>
            <td><PriorityBadge priority={request.priority} /></td>
            <td><StatusBadge status={request.status} /></td>
            <td><span className="table-date">{dateTime(request.submittedAt)}</span></td>
            <td><button className="icon-button row-open" aria-label={`Open ${request.requestNumber}`} onClick={(event) => { event.stopPropagation(); onOpen(request.id); }}><Icon name="chevron" /></button></td>
          </tr>
        ))}</tbody>
      </table>
      <div className="table-pagination"><span>Showing {Math.min((page - 1) * limit + 1, total)}–{Math.min(page * limit, total)} of {total}</span><div><Button variant="secondary" disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</Button><span className="page-indicator">{page} / {pageCount}</span><Button variant="secondary" disabled={page >= pageCount} onClick={() => onPage(page + 1)}>Next</Button></div></div>
    </div>
  );
}

function useCatalog() {
  const [catalog, setCatalog] = useState({ categories: [], departments: [] });
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    Promise.all([
      api("/api/catalog/categories"),
      api("/api/catalog/departments"),
    ]).then(([categories, departments]) => {
      if (active) setCatalog({ categories: categories.categories, departments: departments.departments });
    }).catch((requestError) => { if (active) setError(requestError.message); });
    return () => { active = false; };
  }, []);
  return { ...catalog, error };
}

function RequestFilters({ filters, onChange, role, catalog, assignees }) {
  return (
    <div className="filter-bar">
      <label className="search-field"><Icon name="search" size={17} /><input aria-label="Search requests" placeholder="Search requests…" value={filters.search} onChange={(event) => onChange("search", event.target.value)} /></label>
      <select aria-label="Filter by status" value={filters.status} onChange={(event) => onChange("status", event.target.value)}><option value="">All statuses</option>{Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
      <select aria-label="Filter by priority" value={filters.priority} onChange={(event) => onChange("priority", event.target.value)}><option value="">All priorities</option>{Object.entries(PRIORITY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
      <select aria-label="Filter by category" value={filters.categoryId} onChange={(event) => onChange("categoryId", event.target.value)}><option value="">All categories</option>{catalog.categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
      {role !== "faculty_staff" && <select aria-label="Filter by department" value={filters.departmentId} onChange={(event) => onChange("departmentId", event.target.value)}><option value="">All departments</option>{catalog.departments.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>}
      {role === "administrator" && <select aria-label="Filter by MIS assignee" value={filters.assignedMisId} onChange={(event) => onChange("assignedMisId", event.target.value)}><option value="">All MIS personnel</option>{assignees.map((item) => <option key={item.id} value={item.id}>{item.fullName}</option>)}</select>}
      <label className="date-filter"><span>From</span><input type="date" aria-label="Submission date from" value={filters.submittedFrom} onChange={(event) => onChange("submittedFrom", event.target.value)} /></label>
      <label className="date-filter"><span>To</span><input type="date" aria-label="Submission date to" value={filters.submittedTo} onChange={(event) => onChange("submittedTo", event.target.value)} /></label>
    </div>
  );
}

const DEFAULT_FILTERS = { search: "", status: "", priority: "", categoryId: "", departmentId: "", submittedFrom: "", submittedTo: "" };

function RequestList({ role, onOpen, onCreate }) {
  const catalog = useCatalog();
  const [filters, setFilters] = useState({ ...DEFAULT_FILTERS, assignedMisId: "" });
  const [page, setPage] = useState(1);
  const [result, setResult] = useState({ requests: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sort, setSort] = useState("submitted");
  const [direction, setDirection] = useState("desc");
  const [assignees, setAssignees] = useState([]);
  const query = useMemo(() => ({ ...filters, page, limit: 25, sort, direction }), [filters, page, sort, direction]);
  useEffect(() => {
    if (role !== "administrator") return;
    api("/api/mis/assignees").then((result) => setAssignees(result.users)).catch((requestError) => setError(requestError.message));
  }, [role]);

  const loadRequests = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await api(`/api/requests${queryString(query)}`);
      setResult(response);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }, [query]);
  useEffect(() => { loadRequests(); }, [loadRequests]);

  function changeFilter(key, value) {
    setPage(1);
    setFilters((current) => ({ ...current, [key]: value }));
  }

  function exportCurrentPage() {
    exportCsv("requesthub-requests.csv", result.requests.map((item) => ({
      "Request number": item.requestNumber,
      Title: item.title,
      Requester: item.requesterName,
      Department: item.departmentName,
      Category: item.categoryName,
      Priority: PRIORITY_LABELS[item.priority],
      Status: STATUS_LABELS[item.status],
      "Assigned MIS": item.assignedMisName,
      Location: item.location,
      Submitted: dateTime(item.submittedAt),
    })));
  }

  return (
    <>
      <PageHeading eyebrow={role === "faculty_staff" ? "YOUR SUPPORT" : role === "mis" ? "ICT OPERATIONS" : "CAMPUS-WIDE"} title={role === "faculty_staff" ? "My requests" : role === "mis" ? "Request queue" : "ICT requests"} description={role === "faculty_staff" ? "Follow the progress of every ICT request you have submitted." : "Search, filter, and manage support requests from the Main Campus."} action={role === "faculty_staff" && <Button icon="plus" onClick={onCreate}>New request</Button>} />
      <section className="panel request-panel">
        <div className="panel-toolbar">
          <div><h2>All requests</h2><p>{result.total} total {result.total === 1 ? "request" : "requests"}</p></div>
          <Button variant="secondary" icon="download" onClick={exportCurrentPage} disabled={!result.requests.length}>Export CSV</Button>
        </div>
        <ErrorMessage>{catalog.error}</ErrorMessage>
        <RequestFilters filters={filters} onChange={changeFilter} role={role} catalog={catalog} assignees={assignees} />
        <div className="table-sort"><span><Icon name="filter" size={15} /> Sort by</span><select aria-label="Sort requests by" value={`${sort}:${direction}`} onChange={(event) => { const [nextSort, nextDirection] = event.target.value.split(":"); setSort(nextSort); setDirection(nextDirection); }}><option value="submitted:desc">Submission date · newest</option><option value="submitted:asc">Submission date · oldest</option><option value="requestNumber:asc">Request number · ascending</option><option value="requestNumber:desc">Request number · descending</option><option value="requester:asc">Requester · A–Z</option><option value="department:asc">Department · A–Z</option><option value="category:asc">Category · A–Z</option><option value="priority:desc">Priority · highest</option><option value="status:asc">Status · A–Z</option><option value="assignedMis:asc">MIS assignee · A–Z</option></select></div>
        <RequestTable requests={result.requests} loading={loading} error={error} emptyTitle="No requests match" onOpen={onOpen} page={page} onPage={setPage} total={result.total} limit={25} currentUser={role} />
      </section>
    </>
  );
}

function NewRequest({ user, onCreated, onCancel }) {
  const { categories, departments, error: catalogError } = useCatalog();
  const [form, setForm] = useState({ title: "", categoryId: "", departmentId: user.departmentId || "", location: "", priority: "normal", description: "" });
  const [files, setFiles] = useState([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setError("");
    setBusy(true);
    const data = new FormData();
    for (const [key, value] of Object.entries(form)) data.append(key, value);
    for (const file of files) data.append("attachments", file);
    try {
      const result = await api("/api/requests", { method: "POST", body: data });
      onCreated(result);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeading eyebrow="SUPPORT REQUEST" title="Create a new request" description="Tell us what you need help with. Our ICT team will follow up." />
      <section className="panel form-panel">
        <form className="form-stack" onSubmit={submit}>
          <ErrorMessage>{error}</ErrorMessage>
          <ErrorMessage>{catalogError}</ErrorMessage>
          {departments.length === 0 && <Notice tone="warning">Your administrator needs to add a department before requests can be submitted.</Notice>}
          <div className="form-grid">
            <label>Request title<input value={form.title} maxLength={180} required placeholder="A short summary of the issue" onChange={(event) => setForm({ ...form, title: event.target.value })} /></label>
            <label>Request category<select value={form.categoryId} required onChange={(event) => setForm({ ...form, categoryId: event.target.value })}><option value="">Select a category</option>{categories.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
            <label>Department / office<select value={form.departmentId} required onChange={(event) => setForm({ ...form, departmentId: event.target.value })}><option value="">Select your department</option>{departments.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
            <label>Campus location<input value={form.location} maxLength={180} required placeholder="Building, room, or area" onChange={(event) => setForm({ ...form, location: event.target.value })} /></label>
            <label>Priority<select value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value })}>{Object.entries(PRIORITY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          </div>
          <label>Describe the issue<textarea value={form.description} minLength={10} maxLength={10000} required rows={5} placeholder="What happened? What were you trying to do? Include any error messages that will help our team." onChange={(event) => setForm({ ...form, description: event.target.value })} /></label>
          <label className="upload-field"><span><Icon name="file" size={18} /><span><strong>Attach screenshots or files</strong><small>PDF, PNG, JPEG, WebP, or TXT · up to 3 files · 5 MB each</small></span></span><input type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.webp,.txt" onChange={(event) => setFiles([...event.target.files].slice(0, 3))} />{files.length > 0 && <small>{files.map((file) => file.name).join(", ")}</small>}</label>
          <div className="form-actions"><Button variant="secondary" type="button" onClick={onCancel}>Cancel</Button><Button type="submit" disabled={busy || !departments.length}>{busy ? "Submitting…" : "Submit support request"} <Icon name="chevron" size={16} /></Button></div>
        </form>
      </section>
    </>
  );
}

function RequestDetail({ requestId, role, user, onClose, onChanged }) {
  const [details, setDetails] = useState(null);
  const [assignees, setAssignees] = useState([]);
  const [technicians, setTechnicians] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const [busy, setBusy] = useState(false);
  const [management, setManagement] = useState({});
  const [rating, setRating] = useState(5);
  const [ratingComment, setRatingComment] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await api(`/api/requests/${requestId}`);
      setDetails(result);
      setManagement({
        assignedMisId: result.request.assignedMisId || (role === "mis" ? user.id : ""),
        assignedTechnicianId: result.request.assignedTechnicianId || "",
        assessmentNote: result.request.assessmentNote || "",
        resolutionNote: result.request.resolutionNote || "",
        status: result.request.status,
      });
      if (role !== "faculty_staff") {
        const [people, directory] = await Promise.all([
          api("/api/mis/assignees"),
          api(role === "administrator" ? "/api/admin/technicians" : "/api/mis/technicians"),
        ]);
        setAssignees(people.users);
        const availableTechnicians = directory.technicians;
        if (result.request.assignedTechnicianId && !availableTechnicians.some((item) => Number(item.id) === Number(result.request.assignedTechnicianId))) {
          availableTechnicians.push({
            id: result.request.assignedTechnicianId,
            name: result.request.assignedTechnicianName,
            availability: result.request.assignedTechnicianAvailability,
            isActive: Boolean(result.request.assignedTechnicianActive),
          });
        }
        setTechnicians(availableTechnicians);
      }
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }, [requestId, role, user.id]);
  useEffect(() => { load(); }, [load]);

  async function saveUpdates() {
    setBusy(true);
    setError("");
    setSaved("");
    try {
      const current = details.request;
      const body = {};
      if (String(management.assignedMisId || "") !== String(current.assignedMisId || "")) body.assignedMisId = management.assignedMisId || null;
      if (String(management.assignedTechnicianId || "") !== String(current.assignedTechnicianId || "")) body.assignedTechnicianId = management.assignedTechnicianId || null;
      if (management.status !== current.status) body.status = management.status;
      if (management.assessmentNote !== (current.assessmentNote || "")) body.assessmentNote = management.assessmentNote || null;
      if (management.resolutionNote !== (current.resolutionNote || "")) body.resolutionNote = management.resolutionNote || null;
      if (!Object.keys(body).length) {
        setSaved("No changes to save.");
        return;
      }
      await api(`/api/requests/${requestId}`, { method: "PATCH", body: JSON.stringify(body) });
      setSaved("Request updated successfully.");
      await load();
      onChanged();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  async function submitRating(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api(`/api/requests/${requestId}/rating`, { method: "POST", body: JSON.stringify({ rating, comment: ratingComment || null }) });
      setSaved("Thank you for your feedback.");
      await load();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  async function downloadAttachment(attachment) {
    setError("");
    try {
      const response = await fetch(`/api/attachments/${attachment.id}`, { credentials: "include" });
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(result.error || "Could not download attachment.");
      }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = attachment.filename;
      link.click();
      URL.revokeObjectURL(url);
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  const request = details?.request;
  const statuses = {
    new: ["new", "in_progress"],
    in_progress: ["in_progress", "waiting_on_requester", "resolved"],
    waiting_on_requester: ["waiting_on_requester", "in_progress", "resolved"],
    resolved: ["resolved", "in_progress", "closed"],
    closed: ["closed"],
  };

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="request-detail-modal" role="dialog" aria-modal="true" aria-labelledby="request-detail-title">
        <header className="detail-header"><div><p className="eyebrow">REQUEST DETAILS</p><h2 id="request-detail-title">{request?.requestNumber || "Support request"}</h2></div><button className="icon-button" aria-label="Close details" onClick={onClose}><Icon name="close" /></button></header>
        {loading ? <Loading label="Loading request details…" /> : error && !request ? <ErrorMessage>{error}</ErrorMessage> : request && (
          <div className="detail-content">
            <ErrorMessage>{error}</ErrorMessage><Notice>{saved}</Notice>
            <div className="detail-title-row"><div><h3>{request.title}</h3><p>Submitted {dateTime(request.submittedAt)}</p></div><StatusBadge status={request.status} /></div>
            <div className="detail-facts"><div><span>Requester</span><strong>{request.requesterName}</strong><small>{request.requesterEmail}</small></div><div><span>Department</span><strong>{request.departmentName || "Not specified"}</strong></div><div><span>Location</span><strong>{request.location || "Not specified"}</strong></div><div><span>Category & priority</span><strong>{request.categoryName} · {PRIORITY_LABELS[request.priority]}</strong></div><div><span>Assigned MIS personnel</span><strong>{request.assignedMisName || "Unassigned"}</strong></div><div><span>Assigned technician</span><strong>{request.assignedTechnicianName || "Unassigned"}</strong></div><div><span>First response</span><strong>{dateTime(request.firstResponseAt)}</strong></div></div>
            <div className="detail-section"><h4>Issue description</h4><p className="detail-body">{request.description}</p></div>
            {request.assessmentNote && <div className="detail-section"><h4>Assessment</h4><p className="detail-body">{request.assessmentNote}</p></div>}
            {request.resolutionNote && <div className="detail-section"><h4>Resolution</h4><p className="detail-body">{request.resolutionNote}</p><small>Resolved {dateTime(request.resolvedAt)}</small></div>}
            {!!details.attachments.length && <div className="detail-section"><h4>Attachments</h4><div className="attachment-list">{details.attachments.map((attachment) => <button key={attachment.id} className="attachment-link" onClick={() => downloadAttachment(attachment)}><Icon name="file" size={17} /><span>{attachment.filename}<small>{Math.max(1, Math.ceil(attachment.byteSize / 1024))} KB</small></span><Icon name="download" size={16} /></button>)}</div></div>}
            {role === "faculty_staff" && request.status === "resolved" && !details.rating && <form className="rating-box" onSubmit={submitRating}><h4>How was your support experience?</h4><label>Rating<select value={rating} onChange={(event) => setRating(Number(event.target.value))}><option value={5}>5 — Excellent</option><option value={4}>4 — Good</option><option value={3}>3 — Satisfactory</option><option value={2}>2 — Needs improvement</option><option value={1}>1 — Poor</option></select></label><label>Feedback (optional)<textarea maxLength={1000} value={ratingComment} onChange={(event) => setRatingComment(event.target.value)} placeholder="Share a brief note about your experience" /></label><Button type="submit" disabled={busy}>Submit feedback</Button></form>}
            {details.rating && <div className="rating-display"><strong>Your rating: {"★".repeat(details.rating.rating)}{"☆".repeat(5 - details.rating.rating)}</strong>{details.rating.comment && <p>{details.rating.comment}</p>}</div>}
            {(role === "mis" || role === "administrator") && <div className="detail-section management-section"><h4>Manage request</h4><div className="form-grid"><label>Assigned MIS personnel<select value={management.assignedMisId || ""} onChange={(event) => setManagement({ ...management, assignedMisId: event.target.value })}><option value="">Unassigned</option>{assignees.map((person) => <option key={person.id} value={person.id}>{person.fullName}{Number(person.id) === Number(user.id) ? " (you)" : ""}</option>)}</select></label><label>Assigned technician<select value={management.assignedTechnicianId || ""} onChange={(event) => setManagement({ ...management, assignedTechnicianId: event.target.value })}><option value="">Unassigned</option>{technicians.map((person) => <option key={person.id} value={person.id} disabled={Number(person.id) !== Number(request.assignedTechnicianId) && (!person.isActive || person.availability !== "Available")}>{person.name}{!person.isActive ? " (removed)" : person.availability !== "Available" ? " (unavailable)" : ""}</option>)}</select></label><label>Status<select value={management.status} onChange={(event) => setManagement({ ...management, status: event.target.value })}>{(statuses[request.status] || [request.status]).map((value) => <option value={value} key={value}>{STATUS_LABELS[value]}</option>)}</select></label></div><label>Assessment / work notes<textarea rows={3} maxLength={10000} value={management.assessmentNote} onChange={(event) => setManagement({ ...management, assessmentNote: event.target.value })} placeholder="Assessment, troubleshooting, or a progress update" /></label><label>Resolution notes<textarea rows={3} maxLength={10000} value={management.resolutionNote} onChange={(event) => setManagement({ ...management, resolutionNote: event.target.value })} placeholder="Required to resolve a request" /></label><Button disabled={busy} onClick={saveUpdates}>{busy ? "Saving…" : "Save updates"}</Button></div>}
            <div className="detail-section timeline-section"><h4>Status history</h4>{!details.history.length ? <p>No history recorded.</p> : <div className="timeline">{details.history.map((item, index) => <div className="timeline-row" key={`${item.createdAt}-${index}`}><span className="timeline-dot"><Icon name={item.action === "submitted" ? "plus" : item.action === "status_changed" ? "activity" : "check"} size={13} /></span><div><strong>{item.action === "submitted" ? "Request submitted" : item.action === "status_changed" ? `${STATUS_LABELS[item.oldStatus] || item.oldStatus} → ${STATUS_LABELS[item.newStatus] || item.newStatus}` : item.action === "reassigned" && (item.oldTechnicianId || item.newTechnicianId) ? `Technician assignment: ${item.oldTechnicianName || "Unassigned"} → ${item.newTechnicianName || "Unassigned"}` : item.action === "reassigned" ? "MIS assignment updated" : item.action === "assessment_updated" ? "Assessment updated" : "Request updated"}</strong><small>{item.actorName || "System"} · {dateTime(item.createdAt)}</small></div></div>)}</div>}</div>
          </div>
        )}
      </section>
    </div>
  );
}

function Overview({ role, user, onPage, onOpen }) {
  const [dashboard, setDashboard] = useState(null);
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const apiPath = role === "administrator" ? "/api/admin/dashboard" : "/api/requests?limit=5";

  useEffect(() => {
    let active = true;
    Promise.all([api(apiPath), api("/api/requests?limit=5")]).then(([summary, latest]) => {
      if (active) {
        setDashboard(summary);
        setRequests(latest.requests);
      }
    }).catch((requestError) => { if (active) setError(requestError.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [apiPath]);

  const statusCounts = useMemo(() => ({
    new: requests.filter((item) => item.status === "new").length,
    active: requests.filter((item) => ["in_progress", "waiting_on_requester"].includes(item.status)).length,
    resolved: requests.filter((item) => ["resolved", "closed"].includes(item.status)).length,
  }), [requests]);

  if (loading) return <Loading />;
  return (
    <>
      <PageHeading eyebrow={ROLE_LABELS[role]?.toUpperCase()} title={`Good day, ${user.fullName.split(" ")[0]}`} description={role === "administrator" ? "Here's the current support activity." : role === "mis" ? "Here’s your current ICT support workload." : "Here’s an overview of your ICT support requests."} action={role === "faculty_staff" && <Button icon="plus" onClick={() => onPage("new-request")}>New request</Button>} />
      <ErrorMessage>{error}</ErrorMessage>
      {role === "administrator" && dashboard ? <div className="stat-grid stat-grid-seven"><StatCard label="All requests" value={dashboard.requests.total} icon="file" tone="blue" /><StatCard label="New requests" value={dashboard.requests.new_requests} icon="plus" tone="orange" /><StatCard label="In progress" value={dashboard.requests.in_progress} icon="clock" tone="purple" /><StatCard label="Resolved" value={dashboard.requests.resolved} icon="check" tone="green" /><StatCard label="Registered users" value={dashboard.users.total} icon="users" tone="blue" /><StatCard label="Faculty & staff" value={dashboard.users.faculty_staff} icon="users" tone="orange" /><StatCard label="MIS personnel" value={dashboard.users.mis_personnel} icon="briefcase" tone="purple" /></div>
        : <div className="stat-grid"><StatCard label={role === "faculty_staff" ? "My requests" : "Campus requests"} value={role === "faculty_staff" ? dashboard.total : requests.length} detail={role === "mis" ? "Showing latest assignments" : "All your support requests"} icon="file" tone="blue" /><StatCard label="New" value={statusCounts.new} icon="plus" tone="orange" /><StatCard label="In progress" value={statusCounts.active} icon="clock" tone="purple" /><StatCard label="Resolved" value={statusCounts.resolved} icon="check" tone="green" /></div>}
      <div className="overview-layout">
        <section className="panel overview-requests"><div className="panel-toolbar"><div><h2>{role === "faculty_staff" ? "Recent requests" : "Latest requests"}</h2><p>Most recent ICT support activity</p></div><button className="text-button" onClick={() => onPage("requests")}>View all <Icon name="chevron" size={14} /></button></div>{requests.length ? <div className="recent-list">{requests.slice(0, 5).map((item) => <button className="recent-item" key={item.id} onClick={() => onOpen(item.id)}><span className={`recent-icon recent-${item.status}`}><Icon name="file" size={17} /></span><span className="recent-copy"><strong>{item.title}</strong><small>{item.requestNumber} · {item.categoryName} · {dateTime(item.submittedAt)}</small></span><StatusBadge status={item.status} /><Icon name="chevron" className="recent-chevron" /></button>)}</div> : <EmptyState title="Nothing here yet" detail={role === "faculty_staff" ? "Your submitted requests will appear here." : "New campus support requests will appear here."} action={role === "faculty_staff" && <Button icon="plus" onClick={() => onPage("new-request")}>Submit a request</Button>} />}</section>
        <aside className="overview-aside"><section className="welcome-card"><div className="welcome-art"><span className="welcome-orbit" /><span className="welcome-screen"><Icon name="briefcase" size={29} /></span></div><span className="eyebrow">HERE TO HELP</span><h3>Campus ICT support, all in one place.</h3><p>Submit your issue and follow updates from your dedicated support team.</p>{role === "faculty_staff" && <Button variant="light" onClick={() => onPage("new-request")}>Create a request <Icon name="chevron" size={15} /></Button>}{role === "administrator" && <Button variant="light" onClick={() => onPage("reports")}>View analytics <Icon name="chevron" size={15} /></Button>}</section><section className="quick-help"><span className="quick-help-icon"><Icon name="help" size={19} /></span><div><strong>Need a little help?</strong><p>Your request history and updates are available at any time.</p></div></section></aside>
      </div>
    </>
  );
}

function NotificationsPage({ notifications, refresh, onOpen }) {
  const [error, setError] = useState("");
  async function markRead() {
    try {
      await api("/api/notifications/read-all", { method: "PATCH", body: JSON.stringify({}) });
      refresh();
    } catch (requestError) { setError(requestError.message); }
  }
  return (
    <>
      <PageHeading eyebrow="UPDATES" title="Notifications" description="Stay up to date on changes to your support requests." action={!!notifications.length && <Button variant="secondary" onClick={markRead}>Mark all as read</Button>} />
      <ErrorMessage>{error}</ErrorMessage>
      <section className="panel notification-list-panel">{notifications.length ? notifications.map((item) => <button className={`full-notification ${!item.readAt ? "notification-unread" : ""}`} key={item.id} onClick={() => onOpen(item.requestId)}><span className="notification-item-icon"><Icon name={item.kind === "new_request" ? "plus" : "activity"} /></span><span className="notification-main"><strong>{item.title}</strong><span>{item.message}</span><time>{dateTime(item.createdAt)}</time></span>{!item.readAt && <span className="unread-label">New</span>}</button>) : <EmptyState icon="bell" title="No notifications yet" detail="We’ll let you know when something changes." />}</section>
    </>
  );
}

function UsersPage({ user }) {
  const [users, setUsers] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({});
  const [busy, setBusy] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [results, departmentResults] = await Promise.all([
        api(`/api/admin/users${queryString({ search, role: roleFilter, page, limit: 25 })}`),
        api("/api/admin/departments"),
      ]);
      setUsers(results.users);
      setTotal(results.total);
      setDepartments(departmentResults.records);
    } catch (requestError) { setError(requestError.message); }
    finally { setLoading(false); }
  }, [search, roleFilter, page]);
  useEffect(() => { load(); }, [load]);

  function openForm(record = null) {
    setEditing(record || "new");
    setForm(record ? {
      fullName: record.fullName,
      email: record.email,
      role: record.role,
      departmentId: record.departmentId || "",
      isActive: Boolean(record.isActive),
      password: "",
    } : { fullName: "", email: "", role: "faculty_staff", departmentId: "", password: "", isActive: true });
    setError("");
    setNotice("");
  }

  async function saveUser(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (editing === "new") {
        await api("/api/admin/users", { method: "POST", body: JSON.stringify(form) });
      } else {
        const body = { fullName: form.fullName, email: form.email, role: form.role, departmentId: form.departmentId || null };
        if (form.password) body.password = form.password;
        if (Boolean(form.isActive) !== Boolean(editing.isActive)) body.isActive = Boolean(form.isActive);
        await api(`/api/admin/users/${editing.id}`, { method: "PATCH", body: JSON.stringify(body) });
      }
      setEditing(null);
      setNotice("User account saved.");
      await load();
    } catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  }

  async function toggleActive(record) {
    const action = record.isActive ? "deactivate" : "activate";
    if (!window.confirm(`Are you sure you want to ${action} ${record.fullName}'s account?`)) return;
    setError("");
    try {
      await api(`/api/admin/users/${record.id}`, { method: "PATCH", body: JSON.stringify({ isActive: !record.isActive }) });
      setNotice(`Account ${action}d.`);
      await load();
    } catch (requestError) { setError(requestError.message); }
  }

  return (
    <>
      <PageHeading eyebrow="ADMINISTRATION" title="User management" description="Manage campus accounts, roles, and department assignments." action={<Button icon="plus" onClick={() => openForm()}>Add user</Button>} />
      <Notice>{notice}</Notice><ErrorMessage>{error}</ErrorMessage>
      <section className="panel data-panel">
        <div className="panel-toolbar"><div><h2>Registered users</h2><p>{total} accounts</p></div><div className="inline-filters"><label className="search-field"><Icon name="search" size={16} /><input placeholder="Search name or email" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} /></label><select aria-label="Filter by role" value={roleFilter} onChange={(event) => { setRoleFilter(event.target.value); setPage(1); }}><option value="">All roles</option>{Object.entries(ROLE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div></div>
        {loading ? <Loading label="Loading user accounts…" /> : !users.length ? <EmptyState icon="users" title="No users found" detail="Add a user account to start granting access to RequestHub." /> : <div className="table-wrap"><table className="data-table user-table"><thead><tr><th>User</th><th>Role</th><th>Department / office</th><th>Status</th><th>Created</th><th>Actions</th></tr></thead><tbody>{users.map((record) => <tr key={record.id}><td><span className="user-cell"><span className="avatar avatar-small">{initials(record.fullName)}</span><span><strong>{record.fullName}</strong><small>{record.email}</small></span></span></td><td>{ROLE_LABELS[record.role]}</td><td>{record.departmentName || "—"}</td><td><span className={`account-state ${record.isActive ? "account-active" : "account-inactive"}`}>{record.isActive ? "Active" : "Inactive"}</span></td><td>{dateTime(record.createdAt)}</td><td><div className="row-actions"><button className="text-button" onClick={() => openForm(record)}>Edit</button>{record.id !== user.id && <button className="text-button" onClick={() => toggleActive(record)}>{record.isActive ? "Deactivate" : "Activate"}</button>}</div></td></tr>)}</tbody></table><div className="table-pagination"><span>{total} accounts</span><div><Button variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button><span className="page-indicator">{page} / {Math.max(1, Math.ceil(total / 25))}</span><Button variant="secondary" disabled={page * 25 >= total} onClick={() => setPage(page + 1)}>Next</Button></div></div></div>}
      </section>
      {editing && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditing(null); }}><section className="simple-modal" role="dialog" aria-modal="true" aria-labelledby="user-form-title"><header className="detail-header"><div><p className="eyebrow">ACCOUNT ADMINISTRATION</p><h2 id="user-form-title">{editing === "new" ? "Add a user" : "Edit user"}</h2></div><button className="icon-button" onClick={() => setEditing(null)} aria-label="Close"><Icon name="close" /></button></header><form className="form-stack" onSubmit={saveUser}><ErrorMessage>{error}</ErrorMessage><label>Full name<input required maxLength={160} value={form.fullName} onChange={(event) => setForm({ ...form, fullName: event.target.value })} /></label><label>Institutional email<input type="email" required maxLength={254} value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></label><label>Role<select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })}>{Object.entries(ROLE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>Department / office<select value={form.departmentId} onChange={(event) => setForm({ ...form, departmentId: event.target.value })}><option value="">No department</option>{departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}</select></label><label>{editing === "new" ? "Temporary password (14+ characters)" : "Reset password (optional)"}<input required={editing === "new"} type="password" minLength={14} maxLength={72} autoComplete="new-password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} /></label>{editing !== "new" && <label className="checkbox-label"><input type="checkbox" checked={Boolean(form.isActive)} onChange={(event) => setForm({ ...form, isActive: event.target.checked })} /> Account active</label>}<div className="form-actions"><Button variant="secondary" type="button" onClick={() => setEditing(null)}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save account"}</Button></div></form></section></div>}
    </>
  );
}

function CatalogPage({ type }) {
  const departmentMode = type === "departments";
  const endpoint = `/api/admin/${type}`;
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [description, setDescription] = useState("");
  const [editing, setEditing] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try { const result = await api(endpoint); setRecords(result.records); }
    catch (requestError) { setError(requestError.message); }
    finally { setLoading(false); }
  }, [endpoint]);
  useEffect(() => { load(); }, [load]);

  function editRecord(record) {
    setEditing(record);
    setName(record.name);
    setCode(record.code || "");
    setDescription(record.description || "");
    setError("");
    setNotice("");
  }

  async function saveRecord(event) {
    event.preventDefault();
    setError(""); setNotice("");
    try {
      const body = departmentMode
        ? { name, code }
        : { name, ...(description.trim() ? { description: description.trim() } : editing ? { description: null } : {}) };
      await api(editing ? `${endpoint}/${editing.id}` : endpoint, {
        method: editing ? "PATCH" : "POST",
        body: JSON.stringify(body),
      });
      setEditing(null);
      setName("");
      setCode("");
      setDescription("");
      setNotice(`${departmentMode ? "Department" : "Category"} ${editing ? "updated" : "added"}.`);
      await load();
    } catch (requestError) { setError(requestError.message); }
  }

  async function toggle(record) {
    const action = record.is_active ? "deactivate" : "activate";
    if (!window.confirm(`${action === "deactivate" ? "Deactivate" : "Activate"} ${record.name}? Historical requests will be preserved.`)) return;
    setError(""); setNotice("");
    try {
      await api(`${endpoint}/${record.id}`, { method: "PATCH", body: JSON.stringify({ isActive: !record.is_active }) });
      setNotice(`${record.name} ${action}d.`); await load();
    } catch (requestError) { setError(requestError.message); }
  }

  const title = departmentMode ? "Departments & offices" : "Request categories";
  return (
    <>
      <PageHeading eyebrow="CONFIGURATION" title={title} description={departmentMode ? "Manage the departments and offices served by Main Campus ICT." : "Maintain the types of support requests available to campus users."} />
      <Notice>{notice}</Notice><ErrorMessage>{error}</ErrorMessage>
      <div className="catalog-layout"><section className="panel catalog-form-panel"><div className="panel-toolbar"><div><h2>{editing ? "Edit" : "Add"} {departmentMode ? "department" : "category"}</h2><p>Records can be deactivated without removing request history.</p></div></div><form className="form-stack" onSubmit={saveRecord}><label>{departmentMode ? "Department or office name" : "Category name"}<input required maxLength={departmentMode ? 160 : 120} value={name} onChange={(event) => setName(event.target.value)} /></label>{departmentMode ? <label>Department code<input required maxLength={32} pattern="[A-Za-z0-9_-]+" value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} placeholder="e.g. CBA" /></label> : <label>Description (optional)<textarea maxLength={500} rows={3} value={description} onChange={(event) => setDescription(event.target.value)} /></label>}<div className="form-actions">{editing && <Button type="button" variant="secondary" onClick={() => { setEditing(null); setName(""); setCode(""); setDescription(""); }}>Cancel</Button>}<Button type="submit">{editing ? "Save changes" : `Add ${departmentMode ? "department" : "category"}`} {!editing && <Icon name="plus" size={16} />}</Button></div></form></section><section className="panel catalog-list-panel"><div className="panel-toolbar"><div><h2>Current records</h2><p>{records.length} {departmentMode ? "departments" : "categories"}</p></div></div>{loading ? <Loading /> : !records.length ? <EmptyState icon={departmentMode ? "building" : "grid"} title="No records yet" detail={`Add a ${departmentMode ? "department" : "category"} to get started.`} /> : <div className="catalog-list">{records.map((record) => <div className="catalog-row" key={record.id}><span className="catalog-icon"><Icon name={departmentMode ? "building" : "grid"} size={17} /></span><span className="catalog-copy"><strong>{record.name}</strong><small>{departmentMode ? record.code : record.description || "ICT support category"}</small></span><span className={`account-state ${record.is_active ? "account-active" : "account-inactive"}`}>{record.is_active ? "Active" : "Inactive"}</span><div className="row-actions"><button className="text-button" onClick={() => editRecord(record)}>Edit</button><button className="text-button" onClick={() => toggle(record)}>{record.is_active ? "Deactivate" : "Activate"}</button></div></div>)}</div>}</section></div>
    </>
  );
}

function ReportsPage() {
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { setReport(await api(`/api/admin/reports${queryString({ from: dateFrom, to: dateTo })}`)); }
    catch (requestError) { setError(requestError.message); }
    finally { setLoading(false); }
  }, [dateFrom, dateTo]);
  useEffect(() => { load(); }, [load]);
  function exportReport() {
    if (!report) return;
    const rows = [
      ...report.byStatus.map((item) => ({ report: "Requests by status", category: item.status, total: item.total })),
      ...report.byCategory.map((item) => ({ report: "Requests by category", category: item.name, total: item.total })),
      ...report.byDepartment.map((item) => ({ report: "Requests by department", category: item.name, total: item.total })),
      ...report.weeklyMonthly.map((item) => ({ report: "Volume", week: item.week, month: item.month, total: item.total })),
      ...report.workload.map((item) => ({ report: "MIS workload", staff: item.misName, openRequests: item.openRequests, total: item.totalRequests })),
      { report: "Service timing and satisfaction", averageResponseMinutes: report.timings.averageResponseMinutes, averageResolutionMinutes: report.timings.averageResolutionMinutes, averageRating: report.satisfaction.averageRating, ratingCount: report.satisfaction.ratingCount },
    ];
    exportCsv("requesthub-analytics.csv", rows);
  }
  if (loading) return <Loading label="Loading campus reports…" />;
  const maxCount = (items) => Math.max(1, ...items.map((item) => Number(item.total) || 0));
  const BarList = ({ items, nameKey = "name", color = "" }) => items.length ? <div className="bar-list">{items.map((item, index) => <div className="bar-item" key={`${item[nameKey]}-${index}`}><div className="bar-label"><span>{item[nameKey]}</span><strong>{item.total}</strong></div><div className="bar-track"><span className={`bar-fill ${color}`} style={{ width: `${Math.max(2, Number(item.total) / maxCount(items) * 100)}%` }} /></div></div>)}</div> : <p className="muted">No requests for this period.</p>;
  return (
    <>
      <PageHeading eyebrow="CAMPUS INSIGHTS" title="Reports & analytics" description="Live reports calculated from RequestHub records." action={<Button variant="secondary" icon="download" onClick={exportReport} disabled={!report}>Export CSV</Button>} />
      <ErrorMessage>{error}</ErrorMessage>
      <section className="panel report-filters"><span><Icon name="filter" /> Reporting period</span><label>From<input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} /></label><label>To<input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} /></label><Button variant="secondary" onClick={load}>Apply filters</Button></section>
      {report && <><div className="stat-grid report-stats"><StatCard label="Avg. first response" value={report.timings.averageResponseMinutes === null ? "—" : `${Math.round(report.timings.averageResponseMinutes)} min`} icon="clock" tone="blue" /><StatCard label="Avg. resolution time" value={report.timings.averageResolutionMinutes === null ? "—" : `${(report.timings.averageResolutionMinutes / 60).toFixed(1)} hrs`} icon="check" tone="green" /><StatCard label="Service satisfaction" value={report.satisfaction.averageRating === null ? "—" : `${Number(report.satisfaction.averageRating).toFixed(1)} / 5`} detail={`${report.satisfaction.ratingCount} ratings`} icon="activity" tone="orange" /></div><div className="report-grid"><section className="panel chart-panel"><div className="panel-toolbar"><div><h2>Requests by status</h2><p>Current workflow stages</p></div></div><BarList items={report.byStatus.map((item) => ({ ...item, name: STATUS_LABELS[item.status] }))} color="bar-blue" /></section><section className="panel chart-panel"><div className="panel-toolbar"><div><h2>Requests by category</h2><p>Support areas requested</p></div></div><BarList items={report.byCategory} color="bar-purple" /></section><section className="panel chart-panel"><div className="panel-toolbar"><div><h2>Requests by department</h2><p>Campus office distribution</p></div></div><BarList items={report.byDepartment} color="bar-orange" /></section><section className="panel chart-panel"><div className="panel-toolbar"><div><h2>MIS team workload</h2><p>Active and all-time assigned volume</p></div></div>{report.workload.length ? <div className="workload-list">{report.workload.map((person) => <div className="workload-item" key={person.id}><span className="avatar avatar-small">{initials(person.misName)}</span><span className="workload-name"><strong>{person.misName}</strong><small>{person.openRequests} open · {person.totalRequests} total</small></span><span className="workload-count">{person.openRequests}</span></div>)}</div> : <p className="muted">No MIS accounts found.</p>}</section><section className="panel chart-panel chart-wide"><div className="panel-toolbar"><div><h2>Request volume</h2><p>Weekly and monthly submission periods</p></div></div>{report.weeklyMonthly.length ? <div className="volume-chart">{report.weeklyMonthly.slice(-16).map((item, index) => <div className="volume-bar-wrap" key={`${item.week}-${index}`} title={`${item.month} · ${item.week}: ${item.total} requests`}><span style={{ height: `${Math.max(5, Number(item.total) / maxCount(report.weeklyMonthly) * 100)}%` }} className="volume-bar" /><small>{item.month?.slice(5)}</small></div>)}</div> : <p className="muted">No request volume for this period.</p>}</section></div></>}
    </>
  );
}

function ActivityPage() {
  const [activity, setActivity] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    api("/api/admin/activity?limit=100").then((result) => { if (active) setActivity(result.activity); }).catch((requestError) => { if (active) setError(requestError.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  return (
    <>
      <PageHeading eyebrow="ADMINISTRATION" title="Activity log" description="Recent administrative and request actions recorded in the system." />
      <ErrorMessage>{error}</ErrorMessage>
      <section className="panel activity-panel">{loading ? <Loading /> : !activity.length ? <EmptyState icon="activity" title="No activity recorded" detail="Important account and request actions will appear here." /> : <div className="table-wrap"><table className="data-table"><thead><tr><th>Action</th><th>Actor</th><th>Record</th><th>Details</th><th>Time</th></tr></thead><tbody>{activity.map((item) => <tr key={item.id}><td><span className="activity-action">{item.action.replaceAll("_", " ")}</span></td><td><strong>{item.actorName || "System"}</strong><span className="table-secondary">{item.actorEmail}</span></td><td>{item.recordType}{item.recordId ? ` #${item.recordId}` : ""}</td><td className="activity-details">{item.details ? JSON.stringify(typeof item.details === "string" ? JSON.parse(item.details) : item.details) : "—"}</td><td>{dateTime(item.createdAt)}</td></tr>)}</tbody></table></div>}</section>
    </>
  );
}

const EMPTY_TECHNICIAN = {
  name: "",
  description: "",
  gender: "",
  specialization: "",
  experienceYears: "0",
  contact: "",
  availability: "Available",
};

function TechniciansPage({ role }) {
  const canManage = role === "administrator";
  const [technicians, setTechnicians] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_TECHNICIAN);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await api(canManage ? "/api/admin/technicians" : "/api/mis/technicians");
      setTechnicians(result.technicians);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }, [canManage]);
  useEffect(() => { load(); }, [load]);

  function openForm(record = null) {
    setEditing(record || "new");
    setForm(record ? {
      name: record.name,
      description: record.description,
      gender: record.gender,
      specialization: record.specialization,
      experienceYears: String(record.experienceYears),
      contact: record.contact,
      availability: record.availability,
    } : EMPTY_TECHNICIAN);
    setError("");
    setNotice("");
  }

  async function save(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    const body = { ...form, experienceYears: Number(form.experienceYears) };
    try {
      await api(editing === "new" ? "/api/admin/technicians" : `/api/admin/technicians/${editing.id}`, {
        method: editing === "new" ? "POST" : "PATCH",
        body: JSON.stringify(body),
      });
      setEditing(null);
      setNotice(`Technician ${editing === "new" ? "added" : "updated"} successfully.`);
      await load();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(record) {
    const action = record.isActive ? "remove" : "restore";
    if (!window.confirm(`Are you sure you want to ${action} ${record.name}${record.isActive ? "? This profile can be restored later." : "?"}`)) return;
    setError("");
    setNotice("");
    try {
      await api(`/api/admin/technicians/${record.id}`, {
        method: "PATCH",
        body: JSON.stringify({ isActive: !record.isActive }),
      });
      setNotice(`Technician ${record.isActive ? "removed" : "restored"}.`);
      await load();
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  const filtered = technicians.filter((record) => (
    `${record.name} ${record.specialization} ${record.description} ${record.contact}`.toLowerCase().includes(search.toLowerCase())
  ));
  const activeCount = technicians.filter((record) => record.isActive).length;

  return (
    <>
      <PageHeading eyebrow={canManage ? "ADMINISTRATION" : "MIS WORKSPACE"} title="Technicians" description={canManage ? "Manage technician profiles shown in the RequestHub directory." : "View available technician profiles and choose an available technician when managing a request."} action={canManage && <Button icon="plus" onClick={() => openForm()}>Add technician</Button>} />
      <Notice>{notice}</Notice><ErrorMessage>{error}</ErrorMessage>
      <section className="panel data-panel">
        <div className="panel-toolbar">
          <div><h2>Technician directory</h2><p>{canManage ? `${activeCount} active profiles · ${technicians.length - activeCount} removed` : `${technicians.length} active profiles`}</p></div>
          <label className="search-field"><Icon name="search" size={16} /><input aria-label="Search technicians" placeholder="Search technicians…" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
        </div>
        {loading ? <Loading label="Loading technician profiles…" /> : !filtered.length ? <EmptyState icon="briefcase" title={technicians.length ? "No technicians match" : "No technicians yet"} detail={technicians.length ? "Try another name, specialization, or contact search." : canManage ? "Add a technician profile to start the directory." : "Ask an administrator to add technician profiles."} /> : (
          <div className="technician-grid">
            {filtered.map((record) => (
              <article className={`technician-card${record.isActive ? "" : " technician-inactive"}`} key={record.id}>
                <div className="technician-card-head">
                  <span className="avatar avatar-large">{initials(record.name)}</span>
                  <div className="technician-card-title"><h3>{record.name}</h3><span className={`account-state ${record.isActive ? "account-active" : "account-inactive"}`}>{record.isActive ? record.availability : "Removed"}</span></div>
                </div>
                {record.isPlaceholder && <span className="technician-sample">Sample placeholder</span>}
                <p className="technician-description">{record.description}</p>
                <div className="technician-facts">
                  <span><strong>Specialization</strong>{record.specialization}</span>
                  <span><strong>Experience</strong>{record.experienceYears} {record.experienceYears === 1 ? "year" : "years"}</span>
                  <span><strong>Gender</strong>{record.gender}</span>
                  <span><strong>Contact</strong><a href={`tel:${record.contact.replace(/[^\d+]/g, "")}`}>{record.contact}</a></span>
                </div>
                {canManage && <div className="technician-actions"><button className="text-button" onClick={() => openForm(record)}>Edit</button><button className="text-button" onClick={() => toggleActive(record)}>{record.isActive ? "Remove" : "Restore"}</button></div>}
              </article>
            ))}
          </div>
        )}
      </section>
      {canManage && editing && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setEditing(null); }}><section className="simple-modal" role="dialog" aria-modal="true" aria-labelledby="technician-form-title"><header className="detail-header"><div><p className="eyebrow">TECHNICIAN DIRECTORY</p><h2 id="technician-form-title">{editing === "new" ? "Add a technician" : "Edit technician"}</h2></div><button className="icon-button" onClick={() => setEditing(null)} aria-label="Close" disabled={busy}><Icon name="close" /></button></header><form className="form-stack" onSubmit={save}><ErrorMessage>{error}</ErrorMessage><label>Name<input required maxLength={120} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label><label>Description<textarea required maxLength={1000} rows={3} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label><div className="form-grid"><label>Gender<input required maxLength={40} value={form.gender} onChange={(event) => setForm({ ...form, gender: event.target.value })} /></label><label>Specialization<input required maxLength={100} value={form.specialization} onChange={(event) => setForm({ ...form, specialization: event.target.value })} /></label><label>Years of experience<input type="number" required min="0" max="60" step="1" value={form.experienceYears} onChange={(event) => setForm({ ...form, experienceYears: event.target.value })} /></label><label>Contact number<input type="tel" required maxLength={32} pattern="[0-9]{7,32}" value={form.contact} onChange={(event) => setForm({ ...form, contact: event.target.value })} /></label><label>Availability<select value={form.availability} onChange={(event) => setForm({ ...form, availability: event.target.value })}><option>Available</option><option>Unavailable</option></select></label></div><div className="form-actions"><Button variant="secondary" type="button" disabled={busy} onClick={() => setEditing(null)}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save technician"}</Button></div></form></section></div>}
    </>
  );
}

function SettingsPage({ user, onLogout }) {
  return (
    <>
      <PageHeading eyebrow="YOUR ACCOUNT" title="Account settings" description="Your RequestHub profile and secure session." />
      <section className="panel settings-panel"><div className="settings-profile"><span className="avatar avatar-large">{initials(user.fullName)}</span><div><h2>{user.fullName}</h2><p>{ROLE_LABELS[user.role]}</p></div></div><div className="detail-facts settings-facts"><div><span>Institutional email</span><strong>{user.email}</strong></div><div><span>Account role</span><strong>{ROLE_LABELS[user.role]}</strong></div><div><span>Department ID</span><strong>{user.departmentId || "Not assigned"}</strong></div><div><span>Session security</span><strong>Protected sign-in · secure logout</strong></div></div><div className="form-actions"><Button variant="danger" icon="logout" onClick={onLogout}>Sign out of RequestHub</Button></div><p className="settings-note">For a password reset or changes to your profile, contact your RequestHub administrator.</p></section>
    </>
  );
}

export default function App() {
  const [user, setUser] = useState(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [sessionError, setSessionError] = useState("");
  const [page, setPage] = useState("overview");
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [openRequestId, setOpenRequestId] = useState(null);
  const [toast, setToast] = useState("");
  const [globalError, setGlobalError] = useState("");

  const loadNotifications = useCallback(async (errorMessage = "") => {
    try {
      const result = await api("/api/notifications");
      setNotifications(result.notifications);
      setUnreadCount(result.unreadCount);
      setGlobalError(errorMessage);
    } catch (error) {
      setGlobalError(errorMessage || error.message);
    }
  }, []);

  useEffect(() => {
    let active = true;
    api("/api/auth/me").then((result) => { if (active) setUser(result.user); }).catch((error) => {
      if (active && error.status !== 401) setSessionError("Unable to verify your session. Check your connection and try again.");
    }).finally(() => { if (active) setCheckingSession(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!user) return undefined;
    loadNotifications();
    const interval = window.setInterval(loadNotifications, 30000);
    return () => window.clearInterval(interval);
  }, [user, loadNotifications]);

  useEffect(() => {
    if (!toast) return undefined;
    const timeout = window.setTimeout(() => setToast(""), 4500);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  async function logout() {
    try { await api("/api/auth/logout", { method: "POST", body: JSON.stringify({}) }); }
    catch {
      setToast("Could not reach the server to end your session. Please retry.");
      return;
    }
    setUser(null);
    setNotifications([]);
    setUnreadCount(0);
    setPage("overview");
  }

  function notify(message) {
    setToast(message);
    loadNotifications();
  }

  if (checkingSession) return <div className="boot-screen"><Loading label="Connecting securely to RequestHub…" /></div>;
  if (!user) return <Login initialError={sessionError} onLogin={(account) => { setUser(account); setPage("overview"); }} />;

  const navigation = NAVIGATION[user.role] || NAVIGATION.faculty_staff;
  function renderPage() {
    switch (page) {
      case "requests":
        return <RequestList role={user.role} onOpen={(id) => setOpenRequestId(id)} onCreate={() => setPage("new-request")} />;
      case "new-request":
        return <NewRequest user={user} onCancel={() => setPage("requests")} onCreated={(request) => { setPage("requests"); setOpenRequestId(request.id); notify(`Request ${request.requestNumber} submitted successfully.`); }} />;
      case "notifications":
        return <NotificationsPage notifications={notifications} refresh={loadNotifications} onOpen={(id) => { setPage("requests"); setOpenRequestId(id); }} />;
      case "users":
        return <UsersPage user={user} />;
      case "departments":
        return <CatalogPage type="departments" />;
      case "categories":
        return <CatalogPage type="categories" />;
      case "reports":
        return <ReportsPage />;
      case "activity":
        return <ActivityPage />;
      case "technicians":
        return user.role === "administrator" || user.role === "mis" ? <TechniciansPage role={user.role} /> : <Overview role={user.role} user={user} onPage={setPage} onOpen={setOpenRequestId} />;
      case "settings":
        return <SettingsPage user={user} onLogout={logout} />;
      default:
        return <Overview role={user.role} user={user} onPage={setPage} onOpen={setOpenRequestId} />;
    }
  }

  return (
    <AppShell user={user} onLogout={logout} navigation={navigation} page={page} setPage={setPage} notifications={notifications} unreadCount={unreadCount} refreshNotifications={loadNotifications} onOpenRequest={setOpenRequestId}>
      {globalError && <div className="global-error"><ErrorMessage>{globalError}</ErrorMessage><button className="icon-button" onClick={() => setGlobalError("")} aria-label="Dismiss error"><Icon name="close" size={15} /></button></div>}
      {renderPage()}
      {openRequestId && <RequestDetail requestId={openRequestId} role={user.role} user={user} onClose={() => setOpenRequestId(null)} onChanged={() => { loadNotifications(); }} />}
      {toast && <div className="toast" role="status"><Icon name="check" size={16} />{toast}<button className="icon-button" onClick={() => setToast("")} aria-label="Dismiss message"><Icon name="close" size={15} /></button></div>}
    </AppShell>
  );
}
