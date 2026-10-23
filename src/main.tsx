import React, { useState, useEffect, useCallback } from "react";
import { createRoot } from "react-dom/client";
import {
  Activity,
  ArrowUpLeft,
  ArrowLeft,
  Check,
  ChevronLeft,
  Cloud,
  Code2,
  ExternalLink,
  FileCode2,
  GitBranch,
  Globe,
  History,
  LayoutDashboard,
  LoaderCircle,
  LockKeyhole,
  LogOut,
  MessageSquare,
  Plus,
  Radio,
  RefreshCw,
  Search,
  Send,
  Server,
  Settings2,
  ShieldCheck,
  Sparkles,
  Terminal,
  TriangleAlert,
  X,
} from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";
import { cva } from "class-variance-authority";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import "./style.css";
import { routeMessage, diagnosticTargets } from "./intent.ts";
let csrf = "";
async function api(path: string, body?: any) {
  const r = await fetch("/api" + path, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      Accept: "application/json",
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(csrf ? { "X-CSRF-Token": csrf } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: "include",
  });
  const d = (await r.json().catch(() => ({}))) as any;
  if (r.status === 401) {
    csrf = "";
    throw new Error("نشست شما منقضی شده است؛ دوباره وارد شوید.");
  }
  if (!r.ok) throw new Error(d.error || `پاسخ نامعتبر از سرور (HTTP ${r.status})`);
  return d;
}
const buttonStyles = cva("btn", {
  variants: {
    variant: {
      default: "primary",
      secondary: "secondary",
      ghost: "ghost",
      danger: "danger",
    },
  },
  defaultVariants: { variant: "default" },
});
function Button({ variant = "default", className, children, ...p }: any) {
  return (
    <button
      className={twMerge(clsx(buttonStyles({ variant }), className))}
      {...p}
    >
      {children}
    </button>
  );
}
const fa = (n: number) => new Intl.NumberFormat("fa-IR").format(n);
const toman = (n: number) => `${fa(Math.round(n))} تومان`;
const date = (n: number) =>
  new Date(n).toLocaleString("fa-IR", { hour: "2-digit", minute: "2-digit" });
const states: Record<string, string> = {
  awaiting_approval: "منتظر تأیید شما",
  running: "در حال اجرا",
  succeeded: "بررسی موفق",
  failed: "نیاز به بررسی",
  rejected: "رد شده",
  waiting_tests: "در انتظار نتیجه تست",
  failed_tests: "تست رفتار ناموفق بود",
  needs_review: "نیازمند تطبیق وضعیت",
};
function Badge({ children, tone = "" }: any) {
  return (
    <span className={"badge " + tone}>
      <i />
      {children}
    </span>
  );
}
function Json({ data }: any) {
  return <pre className="code">{JSON.stringify(data, null, 2)}</pre>;
}
function PlanPrice({ plan, taxRate }: { plan: any; taxRate: number | null }) {
  const valid = (n: unknown) => typeof n === "number" && Number.isFinite(n) && n >= 0;
  const monthlyReady = valid(plan.resourceMonthly) && valid(plan.bundleMonthly);
  const hourlyReady = valid(plan.resourceHourly) && valid(plan.bundleHourly);
  const taxReady = valid(taxRate) && (taxRate as number) <= 1;
  const monthlyBase = monthlyReady ? plan.resourceMonthly + plan.bundleMonthly : null;
  const hourlyBase = hourlyReady ? plan.resourceHourly + plan.bundleHourly : null;
  const bundleNames: Record<string, string> = { basic: "برنزی", standard: "نقره‌ای", pro: "طلایی" };
  return <div className="price-card">
    <div className="price-heading"><strong>برآورد پلن انتخاب‌شده</strong><Badge tone="amber">پیش از اجرا دوباره بررسی می‌شود</Badge></div>
    <p>{plan.planID} · بسته {bundleNames[plan.bundlePlanID] || plan.bundlePlanID} · {plan.ram} RAM · {plan.cpu} CPU · {plan.disk} دیسک</p>
    <dl>
      <div><dt>منابع در ماه</dt><dd>{monthlyReady ? toman(plan.resourceMonthly) : "نامشخص"}</dd></div>
      <div><dt>بسته امکانات در ماه</dt><dd>{monthlyReady ? toman(plan.bundleMonthly) : "نامشخص"}</dd></div>
      <div><dt>جمع پایه ماهانه</dt><dd>{monthlyBase === null ? "نامشخص" : toman(monthlyBase)}</dd></div>
      <div><dt>مالیات برآوردی</dt><dd>{taxReady && monthlyBase !== null ? `${fa(taxRate! * 100)}٪ · ${toman(monthlyBase * taxRate!)}` : "نامشخص"}</dd></div>
      <div className="price-total"><dt>جمع برآوردی ماهانه با مالیات</dt><dd>{taxReady && monthlyBase !== null ? toman(monthlyBase * (1 + taxRate!)) : "نامشخص"}</dd></div>
    </dl>
    <small>نرخ ساعتی با مالیات: {taxReady && hourlyBase !== null ? `${toman(hourlyBase * (1 + taxRate!))} / ساعت` : "نامشخص"}. مبلغ ماهانه از قیمت نمایشی API و نرخ ساعتی از قیمت مصرفی API محاسبه شده‌اند؛ صورتحساب واقعی ممکن است متفاوت باشد.</small>
  </div>;
}
function App() {
  const [session, setSession] = useState<any>(null),
    [password, setPassword] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState("");
  const [tab, setTab] = useState("overview"),
    [projects, setProjects] = useState<any[]>([]),
    [selected, setSelected] = useState(""),
    [ops, setOps] = useState<any[]>([]),
    [incidents, setIncidents] = useState<any[]>([]),
    [status, setStatus] = useState<any>(null),
    [storage, setStorage] = useState<any>(null),
    [health, setHealth] = useState<any[]>([]),
    [account, setAccount] = useState<any>(null),
    [recommendation, setRecommendation] = useState<any>(null),
    [ev, setEv] = useState<any>(null),
    [inspection, setInspection] = useState<any>(null);
  const [open, setOpen] = useState(false),
    [sourceRef, setSourceRef] = useState(""),
    [form, setForm] = useState({
      name: "فروشگاه من",
      repo: "",
      ref: "HEAD",
      app: "",
      port: 3100,
    }),
    [message, setMessage] = useState(""),
    [chooseTarget, setChooseTarget] = useState(false),
    [chat, setChat] = useState<{ role: string; text: string }[]>([]),
    [domain, setDomain] = useState(""),
    [domains, setDomains] = useState<any>(null),
    [envName, setEnvName] = useState("DEMO_PAYMENT_MODE"),
    [envValue, setEnvValue] = useState("sandbox"),
    [choice, setChoice] = useState("");
  const project = projects.find((p) => p.id === selected),
    ownOps = ops.filter((o) => o.projectId === selected),
    ownIncidents = incidents.filter((i) => i.projectId === selected),
    pending = ownOps.filter((o) => o.status === "awaiting_approval");
  const task = async (name: string, fn: () => Promise<any>) => {
    setBusy(name);
    setError("");
    try {
      return await fn();
    } catch (e: any) {
      if (/نشست.*منقضی|ابتدا وارد شوید/.test(String(e?.message)))
        setSession({ authenticated: false, setupRequired: false });
      setError(e.message);
    } finally {
      setBusy("");
    }
  };
  const reload = useCallback(async () => {
    const [p, o, i, s, st, h] = await Promise.all([
      api("/projects"),
      api("/operations"),
      api("/incidents"),
      api("/status"),
      api("/storage"),
      api("/health"),
    ]);
    setProjects(p);
    setOps(o);
    setIncidents(i);
    setStatus(s);
    setStorage(st);
    setHealth(h);
    setSelected((current) => current || p[0]?.id || "");
  }, []);
  useEffect(() => {
    api("/session")
      .then((s) => {
        csrf = s.csrf || "";
        setSession(s);
      })
      .catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    if (session?.authenticated) {
      reload().catch((e) => {
        if (/نشست.*منقضی|ابتدا وارد شوید/.test(String(e?.message)))
          setSession({ authenticated: false, setupRequired: false });
        setError(e.message);
      });
      const t = setInterval(() =>
        reload().catch((e) => {
          if (/نشست.*منقضی|ابتدا وارد شوید/.test(String(e?.message)))
            setSession({ authenticated: false, setupRequired: false });
        }), 10000);
      return () => clearInterval(t);
    }
  }, [session?.authenticated, reload]);
  useEffect(() => {
    const running = ops.filter((o) => o.status === "running");
    const sources = running.map((o) => {
      const s = new EventSource("/api/operations/" + o.id + "/events");
      s.addEventListener("operation", (event) => {
        const updated = JSON.parse((event as MessageEvent).data);
        setOps((previous) =>
          previous.map((x) => (x.id === updated.id ? updated : x)),
        );
      });
      return s;
    });
    return () => sources.forEach((s) => s.close());
  }, [
    ops
      .filter((o) => o.status === "running")
      .map((o) => o.id)
      .join(","),
  ]);
  const proposal = (kind: string, extra: any = {}) =>
    task(kind, async () => {
      if (!project) throw new Error("ابتدا پروژه را معرفی کنید.");
      const op = await api(`/projects/${project.id}/proposals`, {
        kind,
        ...extra,
      });
      await reload();
      setTab("operations");
      return op;
    });
  const investigate = (path: string, method = "GET", body?: any) =>
    task("investigate", async () => {
      if (!project) throw new Error("ابتدا پروژه را معرفی کنید.");
      const incident = await api(`/projects/${project.id}/investigate`, {
        path,
        method,
        body,
      });
      await reload();
      setEv(incident.evidence);
      setTab("incidents");
    });
  const sendMessage = async () => {
    if (!message.trim()) return;
    const text = message;
    setMessage("");
    setChat((c) => [...c, { role: "user", text }]);
    const intent = routeMessage(text);
    setChooseTarget(false);
    if (intent.kind === "investigate") {
      setChat((c) => [
        ...c,
        {
          role: "assistant",
          text: `بررسی «${intent.target.label}» را با درخواست آزمایشی شروع می‌کنم.`,
        },
      ]);
      await investigate(intent.target.path, intent.target.method, "body" in intent.target ? intent.target.body : undefined);
    } else if (intent.kind === "choose") {
      setChooseTarget(true);
      setChat((c) => [...c, { role: "assistant", text: "مشکل را در کدام بخش می‌بینید؟ یک بخش را انتخاب کنید تا شواهد همان درخواست بررسی شود. این گزینه‌ها مربوط به فروشگاه نمونه‌اند." }]);
    } else if (intent.kind === "deploy") {
      setTab("deploy");
      setChat((c) => [
        ...c,
        {
          role: "assistant",
          text: "در بخش انتشار، نسخه پروژه و پلن را بررسی کنید. اجرای انتشار فقط پس از تأیید کارت عملیات انجام می‌شود.",
        },
      ]);
    } else
      setChat((c) => [
        ...c,
        {
          role: "assistant",
          text: "می‌توانم پروژه را برای انتشار بررسی کنم، خطای ۵۰۰ یا کندی را تحلیل کنم. این راهنمای مسیر است؛ تحلیل هوشمند پس از جمع‌آوری شواهد و اتصال مدل انجام می‌شود.",
        },
      ]);
  };
  if (!session)
    return (
      <div className="loading">
        <LoaderCircle className="spin" /> در حال آماده‌سازی…
      </div>
    );
  if (!session.authenticated)
    return (
      <div className="login-page">
        <div className="login-brand">
          <div className="brand-symbol">
            <Cloud size={34} />
          </div>
          <span>همیار لیارا</span>
          <Badge tone="mint">همکار فنی سایت شما</Badge>
        </div>
        <div className="login-panel">
          <div className="eyebrow">DEPLOY. OBSERVE. RESOLVE.</div>
          <h1>
            از اولین انتشار،
            <br />
            تا خیالِ راحت.
          </h1>
          <p>
            پروژه‌تان را منتشر کنید، دلیل خطاها را بفهمید
            <br />و تغییرها را با اطمینان تأیید کنید.
          </p>
          <div className="login-trust">
            <ShieldCheck /> هر تغییر مهم، با اجازه شما
          </div>
        </div>
        <form
          className="login-card"
          onSubmit={(e) => {
            e.preventDefault();
            task("login", async () => {
              const s = await api("/login", { password });
              csrf = s.csrf;
              setSession(s);
              setPassword("");
            });
          }}
        >
          <LockKeyhole size={28} />
          <h2>ورود به فضای کار</h2>
          <p>این فضای کار مخصوص مالک پروژه است.</p>
          <label>
            رمز ورود مالک
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          {session.setupRequired && (
            <div className="notice">
              ابتدا دستور npm run setup را اجرا کنید. راهنمای اتصال در README
              است.
            </div>
          )}
          {error && (
            <div role="alert" className="error">
              {error}
            </div>
          )}
          <Button disabled={!!busy}>
            {busy ? <LoaderCircle className="spin" /> : <ArrowLeft />} ورود امن
          </Button>
          <small>کلید API لیارا را در این فرم وارد نکنید.</small>
        </form>
        <footer>کنترل در دست شماست. اجرا با همیار.</footer>
      </div>
    );
  const nav = [
    ["overview", LayoutDashboard, "نمای کلی"],
    ["deploy", Cloud, "انتشار پروژه"],
    ["incidents", Activity, "بررسی مشکلات"],
    ["operations", History, "عملیات و تأییدها"],
    ["domains", Globe, "دامنه و SSL"],
    ["settings", Settings2, "اتصال‌ها"],
  ];
  return (
    <div className="shell">
      <aside className="sidebar">
        <a className="brand" onClick={() => setTab("overview")}>
          <div className="brand-symbol">
            <Cloud />
          </div>
          <div>
            همیار لیارا<small>همکار فنی سایت شما</small>
          </div>
        </a>
        <div className="workspace-label">
          فضای کار شخصی <LockKeyhole size={13} />
        </div>
        <div className="project-select">
          <Server size={19} />
          <select
            aria-label="پروژه انتخاب‌شده"
            value={selected}
            onChange={(e) => {
              setSelected(e.target.value);
              setEv(null);
              setInspection(null);
            }}
          >
            <option value="">انتخاب پروژه</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <nav>
          {nav.map(([key, Icon, label]: any) => (
            <button
              key={key}
              className={tab === key ? "active" : ""}
              onClick={() => setTab(key)}
            >
              <Icon size={19} />
              {label}
              {key === "operations" && pending.length > 0 && (
                <b>{fa(pending.length)}</b>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-note">
          <ShieldCheck size={24} />
          <strong>اول شفافیت، بعد اجرا</strong>
          <p>عملیات حساس بدون تأیید شما انجام نمی‌شوند.</p>
        </div>
        <button
          className="logout"
          onClick={() =>
            task("logout", async () => {
              await api("/logout", {});
              setSession({ authenticated: false });
            })
          }
        >
          <LogOut size={17} /> خروج از فضای کار
        </button>
      </aside>
      <div className="main">
        <header>
          <div className="breadcrumbs">
            فضای کار <ChevronLeft size={14} />{" "}
            {nav.find((x) => x[0] === tab)?.[2] as string}
          </div>
          <div className="header-end">
            <Badge tone={status?.connections.liara ? "mint" : "amber"}>
              {status?.connections.liara
                ? "کلید لیارا تنظیم شده"
                : "لیارا متصل نشده"}
            </Badge>
            <div className="avatar">م</div>
          </div>
        </header>
        <main>
          <div className="page-heading">
            <div className="eyebrow">YOUR DEPLOYMENT COMPANION</div>
            <div className="heading-row">
              <div>
                <h1>
                  {tab === "overview"
                    ? "یک نگاه، به همه‌چیز."
                    : (nav.find((x) => x[0] === tab)?.[2] as string)}
                </h1>
                <p>
                  {project
                    ? `${project.name} · قدم بعدی را با اطمینان بردارید.`
                    : "پروژه‌تان را معرفی کنید؛ مسیر انتشار را با هم پیش می‌بریم."}
                </p>
              </div>
              <Button variant="secondary" onClick={() => setOpen(true)}>
                <Plus size={18} /> پروژه جدید
              </Button>
            </div>
          </div>
          {error && (
            <div className="error" role="alert">
              <TriangleAlert size={18} />
              <span>{error}</span>
              <button onClick={() => setError("")} aria-label="بستن خطا">
                <X size={16} />
              </button>
            </div>
          )}
          {busy && (
            <div className="working" role="status">
              <LoaderCircle className="spin" size={16} /> در حال دریافت اطلاعات
              و بررسی…
            </div>
          )}
          {tab === "overview" && (
            <>
              <section className="hero">
                <div>
                  <Badge tone="light">
                    <Sparkles size={13} /> از کد تا سایت، با همراهی همیار
                  </Badge>
                  <h2>
                    شما محصول را بسازید؛
                    <br />
                    انتشارش را با هم پیش می‌بریم.
                  </h2>
                  <p>
                    یک مسیر روشن برای دیپلوی، پایش و رفع خطا.
                    <br />
                    با توضیح هر قدم و تأیید شما برای تغییرهای مهم.
                  </p>
                  <Button
                    onClick={() => (project ? setTab("deploy") : setOpen(true))}
                  >
                    شروع انتشار <ArrowUpLeft size={19} />
                  </Button>
                </div>
                <div className="hero-visual" aria-hidden="true">
                  <div className="orbit" />
                  <div className="float-card card-code">
                    <FileCode2 />
                    <span>
                      پروژه شما<small>Node.js application</small>
                    </span>
                    <Check size={16} />
                  </div>
                  <div className="link-line" />
                  <div className="cloud-core">
                    <Cloud size={62} />
                  </div>
                  <div className="float-card card-shield">
                    <ShieldCheck />
                    <span>
                      تصمیم با شما<small>اجرا با همیار</small>
                    </span>
                  </div>
                  <span className="dot-grid">
                    ······
                    <br />
                    ······
                    <br />
                    ······
                  </span>
                </div>
              </section>
              <div className="stats">
                <Metric
                  title="سلامت فرایند"
                  icon={<Activity />}
                  value={
                    health.find((h) => h.projectId === selected)?.ok ===
                    undefined
                      ? "نامشخص"
                      : health.find((h) => h.projectId === selected)?.ok
                        ? "پاسخ‌گو"
                        : "اختلال"
                  }
                  sub={
                    health.find((h) => h.projectId === selected)?.at
                      ? `آخرین بررسی ${date(health.find((h) => h.projectId === selected).at)}`
                      : "پس از فعال‌سازی پایش بررسی می‌شود"
                  }
                />
                <Metric
                  title="پروژه‌ها"
                  value={fa(projects.length)}
                  icon={<Server />}
                  sub="پروژه معرفی‌شده به دستیار"
                />
                <Metric
                  title="انتشار تأییدشده"
                  value={fa(
                    ownOps.filter(
                      (o) =>
                        o.status === "succeeded" && o.kind.includes("deploy"),
                    ).length,
                  )}
                  icon={<Cloud />}
                  sub="براساس نتیجه ثبت‌شده"
                />
                <Metric
                  title="مصرف منابع"
                  value={ev?.summary?.available ? "دریافت شده" : "نامشخص"}
                  icon={<Activity />}
                  sub={
                    ev ? "جزئیات در گزارش شواهد" : "هنوز داده زنده دریافت نشده"
                  }
                />
                <Metric
                  title="تأییدهای منتظر"
                  value={fa(pending.length)}
                  icon={<ShieldCheck />}
                  sub="کنترل تغییرها در دست شماست"
                />
              </div>
              <div className="content-grid">
                <section className="panel">
                  <div className="section-title">
                    <h3>قدم بعدی شما</h3>
                    <span className="muted">ساده و قابل پیگیری</span>
                  </div>
                  <Action
                    icon={<GitBranch />}
                    title="پروژه‌ام را منتشر کن"
                    text="بررسی کد، پیشنهاد پلن و انتشار با تأیید شما"
                    onClick={() => setTab("deploy")}
                  />
                  <Action
                    icon={<Search />}
                    title="سایتم مشکل دارد"
                    text="جمع‌آوری لاگ، بررسی منابع و پیدا کردن علت"
                    onClick={() => setTab("incidents")}
                  />
                  <Action
                    icon={<Globe />}
                    title="دامنه‌ام را وصل کن"
                    text="راهنمای DNS و بررسی اتصال امن"
                    onClick={() => setTab("domains")}
                  />
                </section>
                <section className="panel chat-panel">
                  <div className="section-title">
                    <h3>
                      <Sparkles size={18} /> گفتگو با همیار
                    </h3>
                    <Badge>راهنمای مسیر</Badge>
                  </div>
                  <div className="chat-history">
                    {chat.length ? (
                      chat.map((m, i) => (
                        <div key={i} className={"bubble " + m.role}>
                          {m.text}
                        </div>
                      ))
                    ) : (
                      <div className="bubble assistant">
                        سلام! آماده‌ام کمک کنم پروژه‌ات را منتشر کنی یا دلیل
                        مشکل سایتت را بررسی کنیم. از کجا شروع کنیم؟
                      </div>
                    )}
                  </div>
                  {chooseTarget && (
                    <div role="group" aria-label="انتخاب بخش دارای مشکل" className="actions">
                      {diagnosticTargets.map((target) => (
                        <Button key={target.id} variant="secondary" disabled={!!busy || !project}
                          onClick={async () => {
                            setChooseTarget(false);
                            setChat((c) => [...c, { role: "user", text: target.label }]);
                            await investigate(target.path, target.method, "body" in target ? target.body : undefined);
                          }}>
                          {target.label}
                        </Button>
                      ))}
                    </div>
                  )}
                  <form
                    className="composer"
                    onSubmit={(e) => {
                      e.preventDefault();
                      sendMessage();
                    }}
                  >
                    <input
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      placeholder="مثلاً: سایتم خطای ۵۰۰ می‌دهد"
                    />
                    <button aria-label="ارسال" disabled={!!busy}>
                      <Send size={18} />
                    </button>
                  </form>
                </section>
              </div>
              <section className="panel">
                <div className="section-title">
                  <h3>آخرین فعالیت‌ها</h3>
                  <button
                    className="text-link"
                    onClick={() => setTab("operations")}
                  >
                    مشاهده همه <ArrowLeft size={15} />
                  </button>
                </div>
                {ownOps.length ? (
                  ownOps.slice(0, 3).map((o) => (
                    <div className="activity-row" key={o.id}>
                      <div className="activity-icon">
                        <History size={18} />
                      </div>
                      <strong>{o.proposal.title}</strong>
                      <Badge tone={o.status === "succeeded" ? "mint" : "amber"}>
                        {states[o.status]}
                      </Badge>
                      <time>{date(o.createdAt)}</time>
                    </div>
                  ))
                ) : (
                  <Empty
                    title="هنوز عملیاتی ثبت نشده"
                    text="اولین پروژه را معرفی کنید؛ مراحل و نتیجه هر عملیات اینجا ثبت می‌شود."
                  />
                )}
              </section>
            </>
          )}
          {tab === "deploy" && (
            <div className="content-grid">
              <section className="panel">
                <h3>۱. بررسی پروژه</h3>
                {project ? (
                  <>
                    <div className="repo-line">
                      <GitBranch />
                      <code>{project.repo}</code>
                    </div>
                    <p>
                      شاخه: <code>{project.ref}</code> · پورت:{" "}
                      {fa(project.port)}
                    </p>
                    <label>
                      شاخه یا commit برای انتشار بعدی
                      <input
                        dir="ltr"
                        value={sourceRef}
                        onChange={(e) => setSourceRef(e.target.value)}
                        placeholder={project.ref}
                      />
                    </label>
                    <Button
                      variant="ghost"
                      disabled={!sourceRef || !!busy}
                      onClick={() =>
                        task("source", async () => {
                          await api(`/projects/${selected}/source`, {
                            ref: sourceRef,
                          });
                          setInspection(null);
                          setSourceRef("");
                          await reload();
                        })
                      }
                    >
                      ثبت نسخه ورودی
                    </Button>
                    <Button
                      variant="secondary"
                      disabled={!!busy}
                      onClick={() =>
                        task("inspect", async () =>
                          setInspection(
                            await api(`/projects/${selected}/inspection`),
                          ),
                        )
                      }
                    >
                      بررسی commit و بسته‌بندی
                    </Button>
                    {inspection && (
                      <>
                        <Badge tone="mint">سورس بررسی شد</Badge>
                        <Json data={inspection} />
                      </>
                    )}
                  </>
                ) : (
                  <Empty
                    title="پروژه‌ای انتخاب نشده"
                    text="با دکمه پروژه جدید، لینک مخزن را وارد کنید."
                  />
                )}
                <hr />
                <h3>۲. دریافت پلن‌های واقعی</h3>
                <p>منابع و بسته امکانات از حساب لیارا خوانده می‌شوند.</p>
                <Button
                  variant="secondary"
                  disabled={!!busy}
                  onClick={() =>
                    task("account", async () =>
                      setAccount(await api("/account")),
                    )
                  }
                >
                  <RefreshCw size={16} /> دریافت از لیارا
                </Button>
                {account && (
                  <>
                    <Button
                      variant="ghost"
                      disabled={!project || !!busy}
                      onClick={() =>
                        task("recommendation", async () => {
                          const r = await api(
                            `/projects/${selected}/recommendation`,
                          );
                          setRecommendation(r);
                          if (r.available) {
                            const i = account.choices.findIndex(
                              (c: any) =>
                                c.planID === r.planID &&
                                c.bundlePlanID === r.bundlePlanID,
                            );
                            if (i >= 0) setChoice(String(i));
                          }
                        })
                      }
                    >
                      پیشنهاد پلن برای این پروژه
                    </Button>
                    {recommendation && (
                      <div className="notice">{recommendation.reason}</div>
                    )}
                    <select
                      className="field"
                      value={choice}
                      onChange={(e) => setChoice(e.target.value)}
                    >
                      <option value="">انتخاب پلن و بسته</option>
                      {account.choices?.map((c: any, i: number) => (
                        <option value={i} key={i}>
                          {c.planID} / {c.bundlePlanID} —{" "}
                          {c.verified
                            ? "قرارداد بررسی‌شده"
                            : "قیمت نیازمند تأیید"}
                        </option>
                      ))}
                    </select>
                    {choice !== "" && account.choices?.[Number(choice)] && (
                      <>
                        <PlanPrice plan={account.choices[Number(choice)]} taxRate={status?.pricing?.taxRate ?? null} />
                        {project?.app && (
                          <>
                            <Button
                              variant="secondary"
                              disabled={!!busy}
                              onClick={() => proposal("resize", account.choices[Number(choice)])}
                            >
                              پیشنهاد تغییر منابع همین برنامه
                            </Button>
                            <p className="muted">تغییر منابع هزینه و احتمال وقفه دارد؛ ابتدا پیشنهاد ساخته می‌شود و فقط پس از تأیید شما به لیارا ارسال خواهد شد. بسته امکانات باید با بسته فعلی برنامه یکسان باشد.</p>
                          </>
                        )}
                        <details><summary>جزئیات خام پلن</summary><Json data={account.choices[Number(choice)]} /></details>
                      </>
                    )}
                    <details>
                      <summary>اطلاعات اتصال و محدودیت‌ها</summary>
                      <Json
                        data={{
                          billing: account.billing,
                          errors: account.errors,
                        }}
                      />
                    </details>
                  </>
                )}
              </section>
              <section className="panel">
                <h3>۳. پیشنهاد انتشار</h3>
                <p>
                  ایجاد پیشنهاد، سرویس را تغییر نمی‌دهد. پیش از اجرا یک کارت
                  تأیید جداگانه می‌بینید.
                </p>
                <div className="notice">
                  <ShieldCheck /> هزینه ساخت فقط پس از دریافت قرارداد معتبر قیمت
                  قابل تأیید است. انتشار نسخه جدید روی برنامه موجود، هزینه جاری
                  آن را متوقف نمی‌کند.
                </div>
                <Button
                  disabled={!project || !!busy || choice === ""}
                  onClick={() =>
                    proposal("create-deploy", {
                      ...account.choices[Number(choice)],
                      envs: envName && envValue ? { [envName]: envValue } : {},
                    })
                  }
                >
                  پیشنهاد ساخت و انتشار <ArrowLeft size={17} />
                </Button>
                <Button
                  variant="secondary"
                  disabled={!project || !!busy}
                  onClick={() => proposal("deploy")}
                >
                  انتشار روی برنامه موجود
                </Button>
                <p className="muted">
                  در ساخت اولیه، متغیر واردشده در فرم پایین نیز در پیشنهاد قرار
                  می‌گیرد.
                </p>
                <Button
                  variant="ghost"
                  disabled={!project?.lastGoodCommit || !!busy}
                  onClick={() => proposal("restore")}
                >
                  بازیابی کد نسخه سالم
                </Button>
                <hr />
                <h3>متغیرهای محیطی</h3>
                <label>
                  نام متغیر
                  <input
                    dir="ltr"
                    value={envName}
                    onChange={(e) => setEnvName(e.target.value)}
                  />
                </label>
                <label>
                  مقدار محرمانه
                  <input
                    type="password"
                    value={envValue}
                    onChange={(e) => setEnvValue(e.target.value)}
                  />
                </label>
                <Button
                  variant="secondary"
                  disabled={!project || !!busy}
                  onClick={() =>
                    proposal("env", {
                      envs: { [envName]: envValue },
                      verifyPath: "/api/payment-status",
                    })
                  }
                >
                  پیشنهاد تغییر تنظیمات
                </Button>
              </section>
            </div>
          )}
          {tab === "operations" && (
            <>
              <div className="toolbar">
                <Badge>{fa(ownOps.length)} عملیات ثبت‌شده</Badge>
                <Button variant="ghost" onClick={() => task("reload", reload)}>
                  <RefreshCw size={16} /> به‌روزرسانی
                </Button>
              </div>
              {!ownOps.length && (
                <section className="panel">
                  <Empty
                    title="عملیاتی برای بررسی نیست"
                    text="از صفحه انتشار یا عیب‌یابی یک پیشنهاد ایجاد کنید."
                  />
                </section>
              )}
              {ownOps.map((o) => (
                <section className="panel operation" key={o.id}>
                  <div className="section-title">
                    <h3>{o.proposal.title}</h3>
                    <Badge
                      tone={
                        o.status === "succeeded"
                          ? "mint"
                          : o.status === "failed"
                            ? "red"
                            : "amber"
                      }
                    >
                      {states[o.status] || o.status}
                    </Badge>
                  </div>
                  <p>{o.proposal.description}</p>
                  {o.proposal.risk && (
                    <div className="notice">{o.proposal.risk}</div>
                  )}
                  {o.proposal.sha && (
                    <code className="commit">{o.proposal.sha}</code>
                  )}
                  {o.proposal.quote && <Json data={o.proposal.quote} />}
                  <p>{o.proposal.envKeys?.join("، ")}</p>
                  {o.proposal.diff && (
                    <pre className="code diff">{o.proposal.diff}</pre>
                  )}
                  {o.status === "awaiting_approval" && (
                    <div className="approval">
                      <small>
                        اعتبار تأیید: ۱۰ دقیقه · مقصد: {o.parameters.app}
                      </small>
                      <Button
                        disabled={!!busy}
                        onClick={() =>
                          task("approve", async () => {
                            await api(`/operations/${o.id}/approve`, {});
                            await reload();
                          })
                        }
                      >
                        <ShieldCheck size={18} /> تأیید همین تغییر
                      </Button>
                      <Button
                        variant="ghost"
                        disabled={!!busy}
                        onClick={() =>
                          task("reject", async () => {
                            await api(`/operations/${o.id}/reject`, {});
                            await reload();
                          })
                        }
                      >
                        رد پیشنهاد
                      </Button>
                    </div>
                  )}
                  <ol className="timeline">
                    {o.events.map((e: any, i: number) => (
                      <li key={i}>
                        <span />
                        <div>
                          {e.message}
                          <small>{date(e.at)}</small>
                          {e.detail && (
                            <details>
                              <summary>جزئیات</summary>
                              <Json data={e.detail} />
                            </details>
                          )}
                        </div>
                      </li>
                    ))}
                  </ol>
                  {o.error && <div className="error">{o.error}</div>}
                  {o.result && (
                    <details>
                      <summary>نتیجه ثبت‌شده</summary>
                      <Json data={o.result} />
                    </details>
                  )}
                  {['failed','needs_review'].includes(o.status) && o.parameters?.releaseID && (
                    <Button variant="secondary" onClick={()=>task('reverify',async()=>{
                      await api(`/operations/${o.id}/reverify`,{});await reload();
                    })}>بررسی مجدد انتشار فعال</Button>
                  )}
                  {o.kind === "repair-test" && o.result?.sha && (
                    <Button
                      variant="secondary"
                      onClick={() =>
                        task("repair-deploy", async () => {
                          await api(`/projects/${selected}/repair-deploy`, {
                            operationId: o.id,
                          });
                          await reload();
                        })
                      }
                    >
                      بررسی تست و پیشنهاد انتشار اصلاح
                    </Button>
                  )}
                </section>
              ))}
            </>
          )}
          {tab === "incidents" && (
            <>
              <section className="panel">
                <div className="section-title">
                  <h3>بررسی از روی شواهد</h3>
                  <Badge tone="mint">داده واقعی</Badge>
                </div>
                <p>
                  مسیر معیوب را انتخاب کنید. لاگ‌ها، انتشارها، HTTP و منابع با
                  هم جمع‌آوری می‌شوند.
                </p>
                <div className="actions">
                  <Button
                    disabled={!project || !!busy}
                    onClick={() => investigate("/api/payment-status")}
                  >
                    خطای پرداخت / تنظیمات
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={!project || !!busy}
                    onClick={() =>
                      investigate("/api/checkout", "POST", {
                        amount: 10000,
                        user: {},
                      })
                    }
                  >
                    بررسی checkout
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={!project || !!busy}
                    onClick={() => investigate("/api/heavy-report")}
                  >
                    بررسی کندی
                  </Button>
                  <Button
                    variant="ghost"
                    disabled={!project || !!busy}
                    onClick={() => investigate("/health/live")}
                  >
                    سلامت فرایند
                  </Button>
                </div>
                <div className="monitor">
                  <Radio size={17} />
                  <span>پایش سبک هر ۶۰ ثانیه</span>
                  <input
                    aria-label="فعال‌سازی پایش"
                    type="checkbox"
                    checked={project?.monitor || false}
                    disabled={!project || !!busy}
                    onChange={(e) =>
                      task("monitor", async () => {
                        await api(`/projects/${selected}/monitor`, {
                          enabled: e.target.checked,
                        });
                        await reload();
                      })
                    }
                  />
                </div>
              </section>
              {ownIncidents.length ? (
                ownIncidents.map((i) => (
                  <section className="panel" key={i.id}>
                    <div className="section-title">
                      <h3>
                        {i.analysis?.summary ||
                          "شواهد جمع‌آوری شد؛ تحلیل مدل آماده نیست"}
                      </h3>
                      <time>{date(i.at)}</time>
                    </div>
                    <code>
                      {i.method} {i.path}
                    </code>
                    {i.analysisError && (
                      <div className="notice">{i.analysisError}</div>
                    )}
                    {i.analysis?.hypotheses?.map((h: any, n: number) => (
                      <div className="hypothesis" key={n}>
                        <strong>
                          {n + 1}. {h.cause}
                        </strong>
                        <Badge>{h.confidence}</Badge>
                        <ul>
                          {h.evidence.map((s: string, k: number) => (
                            <li key={k}>{s}</li>
                          ))}
                        </ul>
                      </div>
                    ))}
                    {i.analysis && (
                      <>
                        <p>
                          <strong>پیشنهاد: </strong>
                          {i.analysis.recommendation}
                        </p>
                        <p className="muted">
                          {i.analysis.limitations.join(" · ")}
                        </p>
                      </>
                    )}
                    <Evidence data={i.evidence} />
                    <details>
                      <summary>همه شواهد و زمان دریافت</summary>
                      <Json data={i.evidence} />
                    </details>
                    {i.status === "resolved" && <Badge tone="mint">رفع شد و نتیجه بررسی شد</Badge>}
                    {i.analysis?.category === "configuration" && i.path === "/api/payment-status" && i.status !== "resolved" && (
                      <Button disabled={!!busy} onClick={() => task("env-repair", async () => {
                        await api(`/projects/${selected}/proposals`, { kind: "env", envs: { DEMO_PAYMENT_MODE: "sandbox" }, verifyPath: i.path, incidentId: i.id });
                        await reload(); setTab("operations");
                      })}>پیشنهاد اصلاح پرداخت نمایشی</Button>
                    )}
                    {i.analysis?.category === "code" && i.path === "/api/checkout" && i.status !== "resolved" && <Button
                      variant="secondary"
                      disabled={!!busy}
                      onClick={() =>
                        task("repair", async () => {
                          await api(`/projects/${selected}/repair`, {
                            incidentId: i.id,
                          });
                          await reload();
                          setTab("operations");
                        })
                      }
                    >
                      <Code2 size={17} /> پیشنهاد اصلاح کد
                    </Button>}
                  </section>
                ))
              ) : (
                <section className="panel">
                  <Empty
                    title="گزارش حادثه‌ای نداریم"
                    text="یک بررسی آغاز کنید؛ شواهد و محدودیت‌ها در این بخش ثبت می‌شوند."
                  />
                </section>
              )}
              <section className="panel">
                <h3>آزمایش کنترل‌شده و عملیات سرویس</h3>
                <p>
                  این کنترل‌ها فقط برای مخزن نمونه تنظیم‌شده هستند. هر تغییر
                  تأیید جدا دارد.
                </p>
                <div className="actions">
                  <Button
                    variant="secondary"
                    onClick={() => proposal("demo", { scenario: "resources" })}
                  >
                    پیشنهاد سناریوی کندی
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => proposal("demo", { scenario: "reset" })}
                  >
                    بازنشانی دمو
                  </Button>
                  <Button variant="ghost" onClick={() => proposal("restart")}>
                    پیشنهاد ری‌استارت
                  </Button>
                </div>
              </section>
            </>
          )}
          {tab === "domains" && (
            <section className="panel">
              <div className="section-title">
                <h3>از آدرس آزمایشی تا دامنه شما</h3>
                <Globe />
              </div>
              <div className="notice">
                آدرس موقت liara.run طبق پنل تا ۷ روز پس از اولین استقرار فعال
                است. برای دسترسی پایدار، دامنه خودتان را وصل کنید.
              </div>
              <label>
                نام دامنه
                <input
                  dir="ltr"
                  placeholder="app.example.com"
                  value={domain}
                  onChange={(e) => setDomain(e.target.value)}
                />
              </label>
              <div className="actions">
                <Button
                  disabled={!project || !domain || !!busy}
                  onClick={() => proposal("domain", { domain })}
                >
                  پیشنهاد اتصال دامنه
                </Button>
                <Button
                  variant="secondary"
                  disabled={!project || !!busy}
                  onClick={() =>
                    task("domains", async () =>
                      setDomains(await api(`/projects/${selected}/domains`)),
                    )
                  }
                >
                  بررسی دامنه‌ها
                </Button>
              </div>
              <ol className="guide">
                <li>دامنه را به برنامه لیارا اضافه کنید.</li>
                <li>
                  رکورد موردنیاز را از پنل لیارا دریافت کنید؛ IP حدس زده
                  نمی‌شود.
                </li>
                <li>
                  اگر تغییر nameserver لازم بود، در پنل ثبت‌کننده مثل ایرنیک
                  انجام دهید.
                </li>
                <li>بعد از انتشار DNS، درخواست SSL را تأیید کنید.</li>
              </ol>
              {domains && (
                <>
                  <p>{domains.instructions}</p>
                  {domains.domains.map((d: any) => (
                    <div className="activity-row" key={d._id}>
                      <code>{d.name}</code>
                      <Button
                        variant="secondary"
                        onClick={() => proposal("ssl", { domainId: d._id })}
                      >
                        پیشنهاد SSL
                      </Button>
                    </div>
                  ))}
                </>
              )}
            </section>
          )}
          {tab === "settings" && (
            <section className="panel">
              <h3>وضعیت اتصال‌ها</h3>
              <p>
                کلیدها فقط در تنظیمات سرور ذخیره می‌شوند. این صفحه هیچ کلیدی
                نمایش نمی‌دهد.
              </p>
              {[
                ["liara", "زیرساخت لیارا"],
                ["ai", "مدل هوش مصنوعی"],
                ["github", "GitHub"],
                ["repair", "مخزن مجاز اصلاح"],
                ["prices", "قرارداد قیمت"],
              ].map(([k, label]) => (
                <div className="activity-row" key={k}>
                  <strong>{label}</strong>
                  <Badge tone={status?.connections[k] ? "mint" : "amber"}>
                    {status?.connections[k] ? "تنظیم شده" : "نیازمند تنظیم"}
                  </Badge>
                </div>
              ))}
              <div className="notice">
                تنظیم کلید به معنی موفقیت اتصال نیست. برای بررسی عملی، اطلاعات
                حساب را دریافت کنید.
              </div>
              <Button
                onClick={() =>
                  task("account", async () => setAccount(await api("/account")))
                }
              >
                بررسی خواندنی اتصال لیارا
              </Button>
              {account && (
                <Json
                  data={{
                    errors: account.errors,
                    billing: account.billing,
                    plansCount: account.choices?.length,
                    source: account.source,
                  }}
                />
              )}
              <hr />
              <div className="section-title">
                <h3>ذخیره‌سازی پایدار دستیار</h3>
                <Badge tone={storage?.available ? "mint" : "amber"}>
                  {storage?.available ? "دریافت زنده از لیارا" : "نامشخص"}
                </Badge>
              </div>
              {storage?.available ? (
                <div className="storage-summary">
                  <p>
                    برنامهٔ آنلاین <code>{storage.app}</code> روی پلن{" "}
                    <code>{storage.planID}</code> /{" "}
                    <code>{storage.bundlePlanID}</code> اجرا می‌شود.
                  </p>
                  <div className="storage-grid">
                    {storage.disks?.map((disk: any) => {
                      const mount = storage.mounts?.find((m: any) => m.name === disk.name);
                      return (
                        <div className="storage-item" key={disk.name}>
                          <strong>{disk.name}</strong>
                          <span>{disk.size} گیگابایت</span>
                          <small>مسیر: {mount?.mountedTo || "نامشخص"}</small>
                        </div>
                      );
                    })}
                  </div>
                  <div className="notice">{storage.persistence}</div>
                </div>
              ) : (
                <div className="notice">
                  وضعیت دیسک پایدار از API لیارا دریافت نشد؛ دادهٔ ناموجود به‌صورت صفر نمایش داده نمی‌شود.
                  {storage?.message ? " " + storage.message : ""}
                </div>
              )}
              <hr />
              <h3>محدودیت‌های شفاف</h3>
              <ul className="guide">
                {status?.limitations.map((s: string) => (
                  <li key={s}>{s}</li>
                ))}
                <li>
                  اصلاح خودکار کد فقط در مخزن نمونه و فایل checkout مجاز است.
                </li>
                <li>
                  تست کد روی GitHub اجرا می‌شود؛ انتظار یا شکست تست، انتشار را
                  مسدود می‌کند.
                </li>
                <li>
                  اطلاعاتی که هنوز دریافت نشده با «نامشخص» نمایش داده می‌شوند.
                </li>
              </ul>
            </section>
          )}
          <footer className="main-footer">
            <span>
              <ShieldCheck size={14} /> هر تغییر، قابل مشاهده و قابل تأیید
            </span>
            <span>همیار لیارا · نسخه مسابقه</span>
          </footer>
        </main>
      </div>
      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="modal-overlay" />
          <Dialog.Content className="modal">
            <Dialog.Title>معرفی پروژه جدید</Dialog.Title>
            <Dialog.Description>
              مخزن Node.js با package.json در ریشه. این مرحله سرویسی در لیارا
              نمی‌سازد.
            </Dialog.Description>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                task("project", async () => {
                  const p = await api("/projects", form);
                  await reload();
                  setSelected(p.id);
                  setOpen(false);
                  setTab("deploy");
                });
              }}
            >
              {[
                ["name", "نام پروژه"],
                ["repo", "لینک مخزن GitHub"],
                ["ref", "شاخه یا commit"],
                ["app", "شناسه برنامه در لیارا"],
              ].map(([k, label]) => (
                <label key={k}>
                  {label}
                  <input
                    required
                    dir={k === "name" ? "rtl" : "ltr"}
                    value={(form as any)[k]}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, [k]: e.target.value }))
                    }
                    placeholder={
                      k === "repo" ? "https://github.com/owner/repository" : ""
                    }
                  />
                </label>
              ))}
              <label>
                پورت اجرا
                <input
                  type="number"
                  value={form.port}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, port: Number(e.target.value) }))
                  }
                />
              </label>
              <Button disabled={!!busy}>ثبت پروژه</Button>
              <Dialog.Close asChild>
                <Button type="button" variant="ghost">
                  انصراف
                </Button>
              </Dialog.Close>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
function Metric({ title, value, icon, sub }: any) {
  return (
    <section className="metric">
      <div>
        {title}
        {icon}
      </div>
      <strong>{value}</strong>
      <small>{sub}</small>
    </section>
  );
}
function Action({ icon, title, text, onClick }: any) {
  return (
    <button className="action" onClick={onClick}>
      <span className="action-icon">{icon}</span>
      <span>
        <strong>{title}</strong>
        <small>{text}</small>
      </span>
      <ArrowUpLeft size={18} />
    </button>
  );
}
function Empty({ title, text }: any) {
  return (
    <div className="empty">
      <Cloud size={30} />
      <strong>{title}</strong>
      <p>{text}</p>
    </div>
  );
}
function Evidence({ data }: any) {
  return (
    <div className="evidence-grid">
      {[
        ["HTTP", data.http?.status ?? "نامشخص"],
        [
          "زمان پاسخ",
          data.http?.latencyMs !== undefined
            ? `${data.http.latencyMs} ms`
            : "نامشخص",
        ],
        [
          "CPU",
          data.cpu?.available ? (data.units?.source === 'user-assumption' ? "درصد؛ فرض کاربر" : "دریافت شد؛ واحد در شواهد") : "در دسترس نیست",
        ],
        [
          "RAM",
          data.memory?.available ? (data.units?.source === 'user-assumption' ? "بایت؛ فرض کاربر" : "دریافت شد؛ واحد در شواهد") : "در دسترس نیست",
        ],
      ].map(([k, v]) => (
        <div key={k}>
          <small>{k}</small>
          <strong>{v}</strong>
        </div>
      ))}
    </div>
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
