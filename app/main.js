const STORAGE_KEY = "trainingSherpa.journeys.v1";
const STORAGE_LAST_EXPORT_KEY = "trainingSherpa.lastExportAt";

function recordBackupExportTimestamp() {
  try {
    localStorage.setItem(STORAGE_LAST_EXPORT_KEY, new Date().toISOString());
  } catch {
    /* ignore quota / private mode */
  }
}

function getLastBackupExportLabel() {
  try {
    const raw = localStorage.getItem(STORAGE_LAST_EXPORT_KEY);
    if (!raw) return "Never. Export from the home screen.";
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return "Unknown";
    return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return "-";
  }
}

let appConfirmAbort = null;
let appConfirmPendingResolve = null;

/**
 * In-app confirmation (replaces window.confirm). Resolves true if confirmed.
 * @param {{ title?: string; message: string; confirmLabel?: string; cancelLabel?: string; variant?: "primary" | "danger" }} opts
 */
function showAppConfirm(opts) {
  const title = opts.title ?? "Are you sure?";
  const { message } = opts;
  const confirmLabel = opts.confirmLabel ?? "Confirm";
  const cancelLabel = opts.cancelLabel ?? "Cancel";
  const variant = opts.variant ?? "primary";

  return new Promise((resolve) => {
    appConfirmAbort?.abort();
    if (appConfirmPendingResolve) appConfirmPendingResolve(false);
    appConfirmPendingResolve = null;
    document.querySelector(".app-confirm-backdrop")?.remove();
    document.body.style.overflow = "";

    const prevFocus = document.activeElement;
    appConfirmPendingResolve = resolve;
    const ac = new AbortController();
    appConfirmAbort = ac;

    const backdrop = document.createElement("div");
    backdrop.className = "app-confirm-backdrop";

    const panel = document.createElement("div");
    panel.className = "app-confirm-panel";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "true");
    panel.setAttribute("aria-labelledby", "app-confirm-title");
    panel.setAttribute("aria-describedby", "app-confirm-desc");

    const h = document.createElement("h2");
    h.id = "app-confirm-title";
    h.className = "app-confirm-title";
    h.textContent = title;

    const p = document.createElement("p");
    p.id = "app-confirm-desc";
    p.className = "app-confirm-message";
    p.textContent = message;

    const actions = document.createElement("div");
    actions.className = "app-confirm-actions";

    const btnCancel = document.createElement("button");
    btnCancel.type = "button";
    btnCancel.className = "btn btn-ghost btn-small app-confirm-btn-cancel";
    btnCancel.textContent = cancelLabel;

    const btnOk = document.createElement("button");
    btnOk.type = "button";
    btnOk.className =
      variant === "danger"
        ? "btn btn-danger btn-small app-confirm-btn-ok"
        : "btn btn-primary btn-small app-confirm-btn-ok";
    btnOk.textContent = confirmLabel;

    let settled = false;
    function close(result) {
      if (settled) return;
      settled = true;
      ac.abort();
      if (appConfirmPendingResolve === resolve) appConfirmPendingResolve = null;
      appConfirmAbort = null;
      document.body.style.overflow = "";
      backdrop.remove();
      resolve(result);
      try {
        if (prevFocus && typeof prevFocus.focus === "function" && document.body.contains(prevFocus)) {
          prevFocus.focus();
        }
      } catch {
        /* ignore */
      }
    }

    function onDocKeydown(e) {
      if (e.key === "Escape") {
        e.preventDefault();
        close(false);
      }
    }

    panel.addEventListener("keydown", (e) => {
      if (e.key !== "Tab") return;
      const focusables = [...panel.querySelectorAll("button")];
      if (focusables.length === 0) return;
      const i = focusables.indexOf(document.activeElement);
      if (i === -1) return;
      if (e.shiftKey) {
        if (i === 0) {
          e.preventDefault();
          focusables[focusables.length - 1].focus();
        }
      } else if (i === focusables.length - 1) {
        e.preventDefault();
        focusables[0].focus();
      }
    });

    btnCancel.addEventListener("click", () => close(false));
    btnOk.addEventListener("click", () => close(true));
    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) close(false);
    });

    actions.append(btnCancel, btnOk);
    panel.append(h, p, actions);
    backdrop.append(panel);
    document.body.append(backdrop);
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onDocKeydown, { capture: true, signal: ac.signal });

    requestAnimationFrame(() => {
      btnCancel.focus();
    });
  });
}

function moduleShowsFormalTitle(m) {
  const t = (m.title || "").trim();
  const top = (m.topic || "").trim();
  if (!t || !top) return false;
  return t.toLowerCase() !== top.toLowerCase();
}

function newId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/** Sequential M01–M17 (M11–M14 Reviews / Referrals / Campaigns / Website). `moduleIdSchemeVersion`: 4 = pre-marketing-split, 5 = current. */
const MODULE_ID_SCHEME_VERSION = 5;

/** Old id → new id (v1 → v2). Permutation: Request form M13→M07, Schedule M07→M08, … AI M14→M12, Integrations M12→M14. */
const LEGACY_MODULE_ID_MAP = {
  M07: "M08",
  M08: "M09",
  M09: "M10",
  M10: "M11",
  M11: "M13",
  M12: "M14",
  M13: "M07",
  M14: "M12",
};

const MODULES = [
  {
    id: "M01",
    topic: "Discovery",
    title: "Discovery (Kickoff)",
    blurb: "Frame the business, goals, and how you’ll run training before touching deep setup.",
    optional: false,
    scopeIn: "Stakeholders, success picture, cadence, and what Jobber will (and won’t) cover in onboarding.",
    scopeOut: "Detailed configuration of each product area; that’s the later modules.",
  },
  {
    id: "M02",
    topic: "Basic Setup",
    title: "Basic Setup",
    blurb: "Company shell: profile, taxes, billing identity, and defaults; not payouts and fees.",
    optional: false,
    scopeIn: "Profile, branding basics, tax/rate defaults, billing contact, subscription owner.",
    scopeOut: "Jobber Payments payouts, fees, and bank connection; that’s M03.",
  },
  {
    id: "M03",
    topic: "Jobber Payments",
    title: "Jobber Payments",
    blurb: "How money moves: bank link, payouts, fees, and what the account already has live.",
    optional: false,
    scopeIn: "Payouts, pricing awareness, reconciliation habits, and alignment with Account → Payments status.",
    scopeOut: "General company setup and non-payment billing settings; that’s M02.",
  },
  {
    id: "M04",
    topic: "Dedicated Phone Number (DPN)",
    title: "Dedicated Phone Number (DPN)",
    blurb: "Business line in Jobber, compliance docs, and realistic timelines for activation.",
    optional: true,
    scopeIn: "Provisioning path, privacy/terms expectations, call/text routing into the workflow.",
    scopeOut: "Full telco vendor management or custom IVR design outside Jobber.",
  },
  {
    id: "M05",
    topic: "Core Workflow",
    title: "Core Workflow",
    blurb: "The operating loop: lead → quote → job → invoice → paid, and where work should live.",
    optional: false,
    scopeIn: "Stage definitions, handoffs, exceptions (credits, partials), and day-to-day habits.",
    scopeOut: "Deep dives in marketing (M11–M14), website (M14), or integrations (M17) unless you’re tying them to the loop.",
  },
  {
    id: "M06",
    topic: "Products & Services",
    title: "Products & Services",
    blurb: "What they sell on quotes and jobs: line items, pricing, and optional costing awareness.",
    optional: false,
    scopeIn: "Catalog structure, bundles, discounts, taxes on services, margin signals if they care.",
    scopeOut: "Full accounting close or external inventory systems, flag M17 if needed.",
  },
  {
    id: "M07",
    topic: "Request Form",
    title: "Request Form",
    blurb: "Public intake: fields, branding, and where submissions land (request vs. quote).",
    optional: false,
    scopeIn: "Field mapping, trust/copy on the form, notifications and assignment.",
    scopeOut: "Back-office workflow after intake; that’s M05 and related modules.",
  },
  {
    id: "M08",
    topic: "Schedule",
    title: "Schedule",
    blurb: "Time on the calendar: dispatch, recurring work, and who moves work.",
    optional: false,
    scopeIn: "Calendar model, dispatch board habits, recurring and seasonal patterns.",
    scopeOut: "Marketing sends and campaigns; that’s M10/M13.",
  },
  {
    id: "M09",
    topic: "Team",
    title: "Team",
    blurb: "People in Jobber: invites, roles, and what field vs. office should see.",
    optional: false,
    scopeIn: "Roles, permissions, MFA/device expectations, Client Hub visibility by role.",
    scopeOut: "HR, payroll, or tools outside Jobber.",
  },
  {
    id: "M10",
    topic: "Client Communications",
    title: "Client Communications",
    blurb: "Outreach to clients: templates, automations, and Client Hub self-serve.",
    optional: false,
    scopeIn: "Core templates, automations that match their response speed, SMS/plan limits.",
    scopeOut: "Campaign audiences and email marketing programs; that’s M13.",
  },
  {
    id: "M11",
    topic: "Reviews",
    title: "Reviews",
    blurb: "Ask, show, and respond to reviews in context of jobs and Client Hub.",
    optional: true,
    scopeIn: "Timing of asks, where reviews surface, basic reputation handling.",
    scopeOut: "Paid ads, full marketing strategy, or campaigns; that’s M13.",
  },
  {
    id: "M12",
    topic: "Referrals",
    title: "Referrals",
    blurb: "Referral offers, tracking, and tying referrals back into quotes and jobs.",
    optional: true,
    scopeIn: "Program design, tracking, fulfillment, handoff to sales workflow.",
    scopeOut: "General brand campaigns; that’s M13.",
  },
  {
    id: "M13",
    topic: "Campaigns",
    title: "Campaigns",
    blurb: "Email and audiences: consent, simple journeys, and realistic metrics.",
    optional: true,
    scopeIn: "Lists, consent, first journeys vs. blasts, light attribution expectations.",
    scopeOut: "Non-email channels or tools outside Jobber’s campaign scope.",
  },
  {
    id: "M14",
    topic: "Website",
    title: "Website",
    blurb: "Web presence tied to trust and leads: capture path into Jobber.",
    optional: false,
    scopeIn: "Lead capture into requests/quotes, brand consistency, domain/DNS ownership.",
    scopeOut: "Full site design agency process or non-Jobber site builders unless connected.",
  },
  {
    id: "M15",
    topic: "AI Receptionist",
    title: "AI Receptionist",
    blurb: "Voice AI on the DPN: greeting, intent, handoff, and testing before go-live.",
    optional: true,
    scopeIn: "Flows, DPN dependency, human fallback, realistic expectations.",
    scopeOut: "Enterprise call-center design outside the product’s scope.",
  },
  {
    id: "M16",
    topic: "Reports",
    title: "Reports",
    blurb: "Operational and money views inside Jobber: what to watch weekly.",
    optional: false,
    scopeIn: "AR, cash, utilization if relevant, pipeline health from Jobber data.",
    scopeOut: "External BI, custom data warehouses, or non-Jobber reporting.",
  },
  {
    id: "M17",
    topic: "Integrations",
    title: "Integrations",
    blurb: "Connections beyond core Jobber: accounting sync and the rest of the stack.",
    optional: false,
    scopeIn: "Accounting direction and reconciliation, other tools, failure visibility.",
    scopeOut: "Custom software projects, scope as “hand off to specialist.”",
  },
];

/**
 * Coverage checklist: grouped items per module. `id` and `abbr` persist on journeys; never rename.
 * Each item uses `topic` (short, 1–3 words) for related-resource headings plus `detail` (clarification on the checklist line).
 */
const MODULE_GUIDE_DEFS = {
  M01: [
    {
      title: "Kickoff framing",
      items: [
        { id: "biz-context", abbr: "biz", topic: "Success picture", detail: "Business type, size, first 90 days" },
        { id: "stakeholders", abbr: "stake", topic: "Decision owners", detail: "Day-to-day Jobber vs. spend and sensitive settings" },
        { id: "prior-tools", abbr: "prior", topic: "Prior tools", detail: "Legacy data and habits to keep from before Jobber" },
      ],
    },
    {
      title: "Expectations",
      items: [
        { id: "cadence", abbr: "cadence", topic: "Cadence & homework", detail: "Session rhythm and between-training communication" },
        { id: "scope", abbr: "scope", topic: "Scope boundaries", detail: "What Jobber covers on this account vs. not" },
      ],
    },
  ],
  M02: [
    {
      title: "Account shell",
      items: [
        { id: "company-profile", abbr: "profile", topic: "Company profile", detail: "Branding and service area in settings" },
        { id: "taxes-rates", abbr: "tax", topic: "Tax defaults", detail: "How tax shows on quotes and invoices" },
        { id: "billing-account", abbr: "billing", topic: "Billing & ownership", detail: "Subscription, renewal, contact, account owner" },
      ],
    },
  ],
  M03: [
    {
      title: "Money movement",
      items: [
        { id: "payouts", abbr: "payout", topic: "Payouts", detail: "Bank connection, timing, who can see payouts" },
        { id: "fees", abbr: "fees", topic: "Fees & methods", detail: "Client payment types, processor fees, chargebacks" },
        { id: "reconciliation", abbr: "recon", topic: "Reconciliation", detail: "Payments and payouts in reports and exports" },
      ],
    },
  ],
  M04: [
    {
      title: "DPN setup",
      items: [
        { id: "number-provision", abbr: "prov", topic: "Number setup", detail: "Selection, provisioning timeline, verification recipients" },
        { id: "compliance", abbr: "comply", topic: "Carrier compliance", detail: "Privacy policy and terms for registration" },
        { id: "routing", abbr: "route", topic: "Call & text routing", detail: "Getting messages to the right people in Jobber" },
      ],
    },
  ],
  M05: [
    {
      title: "Lead → cash",
      items: [
        { id: "request-quote", abbr: "rq", topic: "Lead to quote", detail: "Intake, follow-up, approvals" },
        { id: "job-delivery", abbr: "job", topic: "Field delivery", detail: "Scheduling visits through job completion" },
        {
          id: "invoice-paid",
          abbr: "inv",
          topic: "Invoicing & payment",
          detail: "Reminders, collecting payment, Client Hub pay",
        },
      ],
    },
    {
      title: "Habits",
      items: [
        {
          id: "pipeline",
          abbr: "pipe",
          topic: "System of record",
          detail: "One place per stage; no shadow spreadsheets or side inboxes",
        },
        {
          id: "exceptions",
          abbr: "ex",
          topic: "Exceptions",
          detail: "Rework, credits, partials after quote or invoice",
        },
      ],
    },
  ],
  M06: [
    {
      title: "Catalog",
      items: [
        { id: "line-items", abbr: "lines", topic: "Line items", detail: "Catalog on quotes: bundles, optional add-ons" },
        { id: "pricing", abbr: "price", topic: "Pricing on quotes", detail: "Models, discounts, markups" },
        { id: "costing", abbr: "cost", topic: "Job costing", detail: "Labor and materials, margin signals if used" },
      ],
    },
  ],
  M07: [
    {
      title: "Client intake",
      items: [
        { id: "fields", abbr: "fields", topic: "Field mapping", detail: "Requests vs. quotes, required data" },
        { id: "branding", abbr: "brand", topic: "Client-facing brand", detail: "Form copy, photos, trust cues" },
        { id: "routing-rules", abbr: "rules", topic: "Intake routing", detail: "Notifications, assignment, spam, duplicates" },
      ],
    },
  ],
  M08: [
    {
      title: "Scheduling",
      items: [
        { id: "calendar-model", abbr: "cal", topic: "Calendar views", detail: "Teams, territories, how time shows" },
        { id: "dispatch", abbr: "disp", topic: "Dispatch board", detail: "Who moves work and daily habits" },
        { id: "recurring", abbr: "recur", topic: "Recurring work", detail: "Seasonal patterns, bulk schedule edits" },
      ],
    },
  ],
  M09: [
    {
      title: "People & access",
      items: [
        { id: "roles", abbr: "roles", topic: "Roles & access", detail: "Presets and what each level can open" },
        { id: "onboarding-users", abbr: "users", topic: "Team onboarding", detail: "Invites, MFA, passwords, devices" },
        { id: "visibility", abbr: "vis", topic: "Visibility", detail: "Client Hub vs. staff views on jobs" },
      ],
    },
  ],
  M10: [
    {
      title: "Communications",
      items: [
        { id: "templates", abbr: "tmpl", topic: "Templates", detail: "Quotes, jobs, invoices, reminders" },
        { id: "automations", abbr: "auto", topic: "Automations", detail: "Triggers and send schedules" },
        { id: "client-hub", abbr: "hub", topic: "Client Hub", detail: "Self-serve options for clients" },
      ],
    },
    {
      title: "SMS / email limits",
      items: [
        { id: "plan-sms", abbr: "sms", topic: "SMS limits", detail: "Plan caps, automation limits, workarounds" },
      ],
    },
  ],
  M11: [
    {
      title: "Reviews",
      items: [
        { id: "timing", abbr: "time", topic: "Review timing", detail: "When requests send vs. job completion" },
        { id: "showcase", abbr: "show", topic: "Showcasing reviews", detail: "Where they appear publicly, light moderation" },
        { id: "reputation", abbr: "rep", topic: "Tough reviews", detail: "Respond, resolve, learn" },
      ],
    },
  ],
  M12: [
    {
      title: "Referrals",
      items: [
        { id: "program-design", abbr: "prog", topic: "Referral offer", detail: "Eligibility, reward, fulfillment" },
        { id: "tracking", abbr: "track", topic: "Referral tracking", detail: "Links, codes, who follows up internally" },
        { id: "nurture", abbr: "nur", topic: "Referred leads", detail: "From intake to quotes and jobs" },
      ],
    },
  ],
  M13: [
    {
      title: "Campaigns",
      items: [
        { id: "audiences", abbr: "aud", topic: "Audiences", detail: "Consent, segments, list hygiene" },
        { id: "journeys", abbr: "jour", topic: "Journeys", detail: "Vs. one-off sends; what to run first" },
        { id: "metrics", abbr: "met", topic: "Campaign metrics", detail: "Opens, clicks, booking signals after send" },
      ],
    },
  ],
  M14: [
    {
      title: "Web presence",
      items: [
        { id: "lead-capture", abbr: "lead", topic: "Web leads", detail: "Visitors to Jobber requests or quotes" },
        { id: "brand-trust", abbr: "trust", topic: "Brand consistency", detail: "Web, quotes, and Client Hub" },
        { id: "domain", abbr: "dns", topic: "Domain & DNS", detail: "Who maintains the site" },
      ],
    },
  ],
  M15: [
    {
      title: "AI Receptionist",
      items: [
        { id: "greeting-intent", abbr: "greet", topic: "Greeting & booking", detail: "Hours; booked vs. handed off" },
        { id: "dpn-link", abbr: "dpn", topic: "DPN readiness", detail: "Provisioning and test calls before go-live" },
        { id: "fallback", abbr: "fall", topic: "Fallbacks", detail: "Voicemail, escalation, after hours" },
      ],
    },
  ],
  M16: [
    {
      title: "Reporting",
      items: [
        { id: "ar-cash", abbr: "ar", topic: "AR & cash", detail: "Receivables, collected cash, aging" },
        { id: "utilization", abbr: "util", topic: "Utilization", detail: "Team time and capacity if relevant" },
        { id: "sales-funnel", abbr: "funnel", topic: "Pipeline volume", detail: "Request through quote to job" },
      ],
    },
  ],
  M17: [
    {
      title: "Integrations",
      items: [
        { id: "accounting", abbr: "acct", topic: "Accounting sync", detail: "Direction, timing, reconciliation (e.g. QBO/Xero)" },
        { id: "stack", abbr: "stack", topic: "Other apps", detail: "Integrations and a named owner each" },
        { id: "failure-modes", abbr: "fail", topic: "When sync breaks", detail: "Noticing and responding quickly" },
      ],
    },
  ],
};

/**
 * Legacy: Help articles were keyed by checklist item. Used only to build `MODULE_RESOURCES`
 * (deduped per module, flowing link + paragraph). URLs under https://help.getjobber.com/hc/.
 */
const LEGACY_MODULE_GUIDE_RESOURCES_BY_ITEM = {
  "M01:biz-context": [
    {
      beforeLink: "Start with ",
      linkText: "First Steps: Basic Account Set Up",
      afterLink:
        " for a structured overview of the essentials. A short read early on reduces basic navigation questions and shows how Jobber is organized.",
      url: "https://help.getjobber.com/hc/en-us/articles/360042653674-First-Steps-Basic-Account-Set-Up",
    },
  ],
  "M01:stakeholders": [
    {
      beforeLink: "Read ",
      linkText: "how owner and admin roles work in Jobber",
      afterLink:
        " so billing ownership and day-to-day operations stay aligned, with clear accountability in the account.",
      url: "https://help.getjobber.com/hc/en-us/articles/7296979846679-Company-Owner-or-Admin-How-Jobber-Works-for-Different-Roles-in-a-Company",
    },
  ],
  "M01:prior-tools": [
    {
      beforeLink: "If something’s acting up, ",
      linkText: "this troubleshooting guide",
      afterLink:
        " helps you describe symptoms clearly so support can respond efficiently. Specific details shorten resolution time.",
      url: "https://help.getjobber.com/hc/en-us/articles/360037203234-Troubleshooting-Tips-How-to-Help-Us-Help-You",
    },
  ],
  "M01:cadence": [
    {
      beforeLink: "Try ",
      linkText: "the five-minute getting-started guide",
      afterLink:
        " when you want a concise mental map of Jobber; it is short enough to fit around the rest of your day.",
      url: "https://help.getjobber.com/hc/en-us/articles/360056046054-The-Five-Minute-Guide-to-Getting-Set-Up-with-Jobber",
    },
  ],
  "M01:scope": [
    {
      beforeLink: "When in-scope vs. out-of-scope feels fuzzy, skim ",
      linkText: "the FAQ",
      afterLink:
        " for what Jobber supports well and what falls outside typical scope. Review at whatever pace fits your business.",
      url: "https://help.getjobber.com/hc/en-us/articles/360033679173-FAQ-Frequently-Asked-Questions",
    },
  ],
  "M02:company-profile": [
    {
      beforeLink: "Walk through ",
      linkText: "First Steps: Basic Account Set Up",
      afterLink:
        " and note what to mirror in the live account: logo, service area, and core profile fields. Solid setup here simplifies downstream configuration.",
      url: "https://help.getjobber.com/hc/en-us/articles/360042653674-First-Steps-Basic-Account-Set-Up",
    },
  ],
  "M02:taxes-rates": [
    {
      beforeLink: "Get comfortable with ",
      linkText: "the taxation report",
      afterLink:
        " so year-end tax discussions are easier to prepare for. Locating figures in the report is often sufficient for early planning.",
      url: "https://help.getjobber.com/hc/en-us/articles/115015769907-Taxation-Report",
    },
  ],
  "M02:billing-account": [
    {
      beforeLink: "For subscription, renewal, billing contact, and account ownership, start from ",
      linkText: "the FAQ",
      afterLink:
        " and search within Help when a specific billing or subscription question comes up.",
      url: "https://help.getjobber.com/hc/en-us/articles/360033679173-FAQ-Frequently-Asked-Questions",
    },
  ],
  "M03:payouts": [
    {
      beforeLink: "Read ",
      linkText: "Jobber Payments basics",
      afterLink:
        " for payout timing, bank connection, and how funds move through Jobber. The article stands on its own whether you take occasional payments or run steady volume.",
      url: "https://help.getjobber.com/hc/en-us/articles/115009571387-Jobber-Payments-Basics",
    },
  ],
  "M03:fees": [
    {
      beforeLink: "Skim ",
      linkText: "Jobber Payments basics",
      afterLink:
        " with fees and client payment methods in mind; Jobber explains costs in plain language in this article.",
      url: "https://help.getjobber.com/hc/en-us/articles/115009571387-Jobber-Payments-Basics",
    },
  ],
  "M03:reconciliation": [
    {
      beforeLink: "Open ",
      linkText: "Jobber Payments reports",
      afterLink:
        " to see how payouts and payments are represented in Jobber and how those entries relate to activity at your bank.",
      url: "https://help.getjobber.com/hc/en-us/articles/115009611927-Jobber-Payments-Reports",
    },
  ],
  "M04:number-provision": [
    {
      beforeLink: "Start with ",
      linkText: "Dedicated Phone Number",
      afterLink:
        " for provisioning, timelines, and verification. Carrier lead times vary; extended waits are common and do not indicate an error on your side.",
      url: "https://help.getjobber.com/hc/en-us/articles/360047029094-Dedicated-Phone-Number",
    },
  ],
  "M04:compliance": [
    {
      beforeLink: "Read ",
      linkText: "privacy policy requirements for DPN",
      afterLink:
        " so privacy policy and terms expectations for carrier registration are clear. The article’s bullet sections support a quick scan when time is limited.",
      url: "https://help.getjobber.com/hc/en-us/articles/34842183031959-Privacy-Policy-Requirements-for-your-Dedicated-Phone-Number-Application",
    },
  ],
  "M04:routing": [
    {
      beforeLink: "Explore ",
      linkText: "two-way text messaging",
      afterLink:
        " for how calls and texts route and how client replies flow back into Jobber.",
      url: "https://help.getjobber.com/hc/en-us/articles/360051087154-Two-Way-Text-Messaging",
    },
  ],
  "M05:request-quote": [
    {
      beforeLink: "Read ",
      linkText: "request basics",
      afterLink:
        " for how leads arrive and how requests connect to quotes and jobs. Use one example lead to trace the full path.",
      url: "https://help.getjobber.com/hc/en-us/articles/115009737048-Request-Basics",
    },
  ],
  "M05:job-delivery": [
    {
      beforeLink: "Walk through ",
      linkText: "job basics",
      afterLink:
        " by following one example job from scheduled through complete; it illustrates how work is tracked in Jobber.",
      url: "https://help.getjobber.com/hc/en-us/articles/115009379027-Job-Basics",
    },
  ],
  "M05:invoice-paid": [
    {
      beforeLink: "Read ",
      linkText: "invoice basics",
      afterLink:
        " for sending invoices, reminders, and collecting payment (including what clients see when they pay).",
      url: "https://help.getjobber.com/hc/en-us/articles/115009685047-Invoice-Basics",
    },
  ],
  "M05:pipeline": [
    {
      beforeLink: "Use ",
      linkText: "the requests report",
      afterLink:
        " for a consolidated view of intake volume and stage so client work stays centralized in Jobber.",
      url: "https://help.getjobber.com/hc/en-us/articles/17330334116503-Requests-Report",
    },
  ],
  "M05:exceptions": [
    {
      beforeLink: "Review ",
      linkText: "quote approvals",
      afterLink:
        " for rewrites, approvals, and how exceptions are handled before billing and invoicing move forward.",
      url: "https://help.getjobber.com/hc/en-us/articles/115012715008-Quote-Approvals",
    },
  ],
  "M06:line-items": [
    {
      beforeLink: "Build your catalog with ",
      linkText: "products & services",
      afterLink:
        ": line items, bundles, and optional add-ons on quotes all start here.",
      url: "https://help.getjobber.com/hc/en-us/articles/115009735848-Products-Services-List",
    },
  ],
  "M06:pricing": [
    {
      beforeLink: "Understand ",
      linkText: "markups on quotes",
      afterLink:
        " for discounts, markups, and how pricing reads on quotes.",
      url: "https://help.getjobber.com/hc/en-us/articles/1500012369781-Markups-on-Quotes",
    },
  ],
  "M06:costing": [
    {
      beforeLink: "Dig into ",
      linkText: "job costing",
      afterLink:
        " for labor and materials signals and margin context when your business uses them.",
      url: "https://help.getjobber.com/hc/en-us/articles/14343244961175-Job-Costing",
    },
  ],
  "M07:fields": [
    {
      beforeLink: "Customize fields and sharing via ",
      linkText: "request basics",
      afterLink:
        ": how the public request form collects property and job details (and how it differs from quotes). Fields can be refined over time as intake patterns become clear.",
      url: "https://help.getjobber.com/hc/en-us/articles/115009737048-Request-Basics",
    },
  ],
  "M07:branding": [
    {
      beforeLink: "Polish public-facing copy and visuals in ",
      linkText: "online booking",
      afterLink:
        ": photos, copy, and trust cues on the client-facing side.",
      url: "https://help.getjobber.com/hc/en-us/articles/13808363916951-Online-Booking",
    },
  ],
  "M07:routing-rules": [
    {
      beforeLink: "Tune notifications and client self-serve in ",
      linkText: "Client Hub settings",
      afterLink:
        " so assignment, client actions, and response expectations match day-to-day operations.",
      url: "https://help.getjobber.com/hc/en-us/articles/115009571307-Client-Hub-Settings",
    },
  ],
  "M08:calendar-model": [
    {
      beforeLink: "Explore ",
      linkText: "the new schedule",
      afterLink:
        " for month, week, and day views, optional team or territory groupings, and how time appears on the board.",
      url: "https://help.getjobber.com/hc/en-us/articles/29840886387351-New-Schedule",
    },
  ],
  "M08:dispatch": [
    {
      beforeLink: "Practice dispatch habits with ",
      linkText: "schedule in the Jobber app",
      afterLink:
        ": who moves work, who gets notified, and what “done” looks like in the field.",
      url: "https://help.getjobber.com/hc/en-us/articles/6766253760279-Schedule-in-the-Jobber-App",
    },
  ],
  "M08:recurring": [
    {
      beforeLink: "Learn ",
      linkText: "how to create a recurring job",
      afterLink:
        " for repeat work, seasonal patterns, and bulk edits without retyping every visit.",
      url: "https://help.getjobber.com/hc/en-us/articles/115009542848-Create-a-Recurring-Job",
    },
  ],
  "M09:roles": [
    {
      beforeLink: "Study ",
      linkText: "user permissions",
      afterLink:
        " for who can see and edit pricing, jobs, and settings across mobile, office, or blended roles.",
      url: "https://help.getjobber.com/hc/en-us/articles/115009568687-User-Permissions",
    },
  ],
  "M09:onboarding-users": [
    {
      beforeLink: "Follow ",
      linkText: "managing team members",
      afterLink:
        " for invites, deactivation, and day-to-day user management.",
      url: "https://help.getjobber.com/hc/en-us/articles/115009568647-Manage-Team-How-to-Add-Manage-and-Deactivate-Team-Members",
    },
  ],
  "M09:visibility": [
    {
      beforeLink: "Review ",
      linkText: "what clients see in Client Hub",
      afterLink:
        " for quotes, invoices, reminders, and self-serve actions from the client’s perspective.",
      url: "https://help.getjobber.com/hc/en-us/articles/1500011237822-What-Do-Your-Clients-See-in-Client-Hub",
    },
  ],
  "M10:templates": [
    {
      beforeLink: "Warm up templates in ",
      linkText: "emails and text message settings",
      afterLink:
        ": tone, branding, and what clients receive by default.",
      url: "https://help.getjobber.com/hc/en-us/articles/9335574672151-Emails-and-Text-Messages-Settings",
    },
  ],
  "M10:automations": [
    {
      beforeLink: "Center on ",
      linkText: "automations",
      afterLink:
        " for triggers, follow-ups, and automated client messages.",
      url: "https://help.getjobber.com/hc/en-us/articles/24244124296471-Automations",
    },
  ],
  "M10:client-hub": [
    {
      beforeLink: "Tune ",
      linkText: "Client Hub settings",
      afterLink:
        " for what clients can self-serve and how Client Hub reflects your brand and the experience you want them to have.",
      url: "https://help.getjobber.com/hc/en-us/articles/115009571307-Client-Hub-Settings",
    },
  ],
  "M10:plan-sms": [
    {
      beforeLink: "Read ",
      linkText: "the two-way SMS FAQ",
      afterLink:
        " for plan limits, compliance guardrails, and practical workarounds with SMS.",
      url: "https://help.getjobber.com/hc/en-us/articles/14711336911383-Two-Way-Text-Messaging-FAQ",
    },
  ],
  "M11:timing": [
    {
      beforeLink: "Use ",
      linkText: "Reviews (Marketing Tools)",
      afterLink:
        " for when review requests send and how they relate to job completion.",
      url: "https://help.getjobber.com/hc/en-us/articles/20621046897559-Reviews-Marketing-Tools",
    },
  ],
  "M11:showcase": [
    {
      beforeLink: "See where social proof shows up in ",
      linkText: "Website (Marketing Tools)",
      afterLink:
        " and how it ties to reviews and trust on the public site.",
      url: "https://help.getjobber.com/hc/en-us/articles/25620058162455-Website-Marketing-Tools",
    },
  ],
  "M11:reputation": [
    {
      beforeLink: "Work negative feedback with ",
      linkText: "Reviews (Marketing Tools)",
      afterLink:
        ": responding, resolving issues, and improving service quality without over-focusing on perfect ratings.",
      url: "https://help.getjobber.com/hc/en-us/articles/20621046897559-Reviews-Marketing-Tools",
    },
  ],
  "M12:program-design": [
    {
      beforeLink: "Design the offer in ",
      linkText: "referrals in Client Hub",
      afterLink:
        ": eligibility, reward, and how fulfillment works for referrers and friends.",
      url: "https://help.getjobber.com/hc/en-us/articles/14632154847767-Referrals-in-Client-Hub",
    },
  ],
  "M12:tracking": [
    {
      beforeLink: "Track attribution in ",
      linkText: "referrals in Client Hub",
      afterLink:
        " for links, codes, and how referred requests tie back in Jobber.",
      url: "https://help.getjobber.com/hc/en-us/articles/14632154847767-Referrals-in-Client-Hub",
    },
  ],
  "M12:nurture": [
    {
      beforeLink: "Move referred leads forward with ",
      linkText: "converting a request to a quote or job",
      afterLink:
        " so intake converts into quotes and jobs instead of stalling in the pipeline.",
      url: "https://help.getjobber.com/hc/en-us/articles/360056871013-Converting-a-Request-to-a-Quote-or-Job",
    },
  ],
  "M13:audiences": [
    {
      beforeLink: "Ground consent and list hygiene in ",
      linkText: "the deliverability checklist",
      afterLink:
        " before increasing message volume: consent, reputation, and factors that affect inbox placement.",
      url: "https://help.getjobber.com/hc/en-us/articles/14333781009815-Text-Message-and-Email-Deliverability-Checklist",
    },
  ],
  "M13:journeys": [
    {
      beforeLink: "Map journeys in ",
      linkText: "automations",
      afterLink:
        " for triggers, sequences, and starting small before you add complexity.",
      url: "https://help.getjobber.com/hc/en-us/articles/24244124296471-Automations",
    },
  ],
  "M13:metrics": [
    {
      beforeLink: "Orient with ",
      linkText: "reports basics",
      afterLink:
        " so campaign and communications metrics in Jobber are easier to read when you review results or plan next steps.",
      url: "https://help.getjobber.com/hc/en-us/articles/115009784848-Reports-Basics",
    },
  ],
  "M14:lead-capture": [
    {
      beforeLink: "Trace web leads in ",
      linkText: "Website (Marketing Tools)",
      afterLink:
        " from visitors to requests or quotes in Jobber.",
      url: "https://help.getjobber.com/hc/en-us/articles/25620058162455-Website-Marketing-Tools",
    },
  ],
  "M14:brand-trust": [
    {
      beforeLink: "Align web, quotes, and Hub using ",
      linkText: "Website (Marketing Tools)",
      afterLink:
        " so visual and voice stay consistent wherever clients meet you.",
      url: "https://help.getjobber.com/hc/en-us/articles/25620058162455-Website-Marketing-Tools",
    },
  ],
  "M14:domain": [
    {
      beforeLink: "Clarify domain and DNS ownership in ",
      linkText: "Website (Marketing Tools)",
      afterLink:
        " so ownership of the site is clear and DNS changes are understood before they affect availability.",
      url: "https://help.getjobber.com/hc/en-us/articles/25620058162455-Website-Marketing-Tools",
    },
  ],
  "M15:greeting-intent": [
    {
      beforeLink: "Define greeting and booking intent in ",
      linkText: "AI Receptionist",
      afterLink:
        ": hours, what counts as booked vs. handed off, and how callers experience the front door.",
      url: "https://help.getjobber.com/hc/en-us/articles/25315927533847-AI-Receptionist-Beta",
    },
  ],
  "M15:dpn-link": [
    {
      beforeLink: "Run provisioning and test calls against ",
      linkText: "Dedicated Phone Number",
      afterLink:
        " before client-facing go-live: timelines, verification, and what readiness looks like in practice.",
      url: "https://help.getjobber.com/hc/en-us/articles/360047029094-Dedicated-Phone-Number",
    },
  ],
  "M15:fallback": [
    {
      beforeLink: "Plan voicemail and escalation in ",
      linkText: "AI Receptionist",
      afterLink:
        " so after-hours coverage and live handoffs are defined, documented, and deliberate.",
      url: "https://help.getjobber.com/hc/en-us/articles/25315927533847-AI-Receptionist-Beta",
    },
  ],
  "M16:ar-cash": [
    {
      beforeLink: "Read ",
      linkText: "invoice and payment reports",
      afterLink:
        " for receivables, cash collected, and aging in one place.",
      url: "https://help.getjobber.com/hc/en-us/articles/115015294767-Invoice-and-Payment-Reports",
    },
  ],
  "M16:utilization": [
    {
      beforeLink: "Find time and capacity signals in ",
      linkText: "reports basics",
      afterLink:
        ", including work and timesheet-style views when you track time, crews, or sold hours.",
      url: "https://help.getjobber.com/hc/en-us/articles/115009784848-Reports-Basics",
    },
  ],
  "M16:sales-funnel": [
    {
      beforeLink: "Watch funnel volume in ",
      linkText: "the requests report",
      afterLink:
        " from request volume through downstream stages.",
      url: "https://help.getjobber.com/hc/en-us/articles/17330334116503-Requests-Report",
    },
  ],
  "M17:accounting": [
    {
      beforeLink: "Start accounting sync with ",
      linkText: "connecting Jobber and QuickBooks Online",
      afterLink:
        ": direction, timing, and what to expect before you connect.",
      url: "https://help.getjobber.com/hc/en-us/articles/10485704193687-How-to-Connect-Jobber-and-QuickBooks-Online-NEW-QuickBooks-Integration",
    },
  ],
  "M17:stack": [
    {
      beforeLink: "Browse the ",
      linkText: "App Marketplace",
      afterLink:
        " for non-QBO integrations and how to document who maintains each connection.",
      url: "https://help.getjobber.com/hc/en-us/articles/360062128653-App-Marketplace",
    },
  ],
  "M17:failure-modes": [
    {
      beforeLink: "When sync breaks, use ",
      linkText: "common QuickBooks sync errors",
      afterLink:
        " as an initial structured review before involving Jobber support, your accountant, or other advisors.",
      url: "https://help.getjobber.com/hc/en-us/articles/10466688449431-Common-QuickBooks-Sync-Errors-and-How-to-Fix-Them-NEW-QuickBooks-Integration",
    },
  ],
};

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function resourceIdFromArticleUrl(url) {
  try {
    const pathname = new URL(url).pathname;
    const seg = pathname.split("/").filter(Boolean).pop();
    return seg && seg.length ? seg.slice(0, 120) : String(url).slice(-80);
  } catch {
    return String(url).replace(/\s+/g, "").slice(-80);
  }
}

const LEGACY_BEFORE_OPENERS =
  /^(Read|Skim|Open|Try|Browse|Watch|Explore|Study|Review|Use|Submit|Place|Edit|Configure|Invite|Map|Run|Build|Adjust|Turn|Draft|List|Complete|Verify|Learn|Follow|Work\s+negative\s+feedback\s+with|Design\s+the\s+offer\s+in|Track\s+attribution\s+in|Move\s+referred\s+leads\s+forward\s+with|Ground\s+consent\s+and\s+list\s+hygiene\s+in|Map\s+journeys\s+in|Orient\s+with|Trace\s+web\s+leads\s+in|Align\s+web|Clarify\s+domain|Define\s+greeting|Run\s+provisioning|Plan\s+voicemail|Find\s+time|Warm\s+up\s+templates\s+in|Center\s+on|See\s+where\s+social\s+proof\s+shows\s+up\s+in|Start\s+with|Start\s+from|Start\s+accounting\s+sync\s+with|Walk\s+through|Walk\s+through\s+the|Get\s+comfortable\s+with|Build\s+your\s+catalog\s+with|Understand|Dig\s+into|Customize\s+fields\s+and\s+sharing\s+via|Polish\s+public-facing\s+copy\s+and\s+visuals\s+in|Practice\s+dispatch\s+habits\s+with|Tune\s+|If\s+something's\s+acting\s+up,?\s*|When\s+in-scope[^.]*\.\s*Skim\s*|When\s+sync\s+breaks,?\s*use\s*|For\s+subscription[^.]*\s+start\s+from\s+)\s*/i;

function stripLegacyBeforeOpeners(s) {
  let t = (s || "").trim();
  for (let i = 0; i < 6; i++) {
    const next = t.replace(LEGACY_BEFORE_OPENERS, "").trim();
    if (next === t) break;
    t = next;
  }
  return t;
}

function flowLegacyAfterLink(afterRaw) {
  let p = (afterRaw || "").trim();
  if (!p) return "";
  const hadColonLead = /^[:,;]/.test(p);
  p = p.replace(/^[:,;]\s*/, "");
  if (/^for\s+how\b/i.test(p)) p = p.replace(/^for\s+how\s+/i, "explains how ");
  else if (/^for\s+what\b/i.test(p)) p = p.replace(/^for\s+what\s+/i, "explains what ");
  else if (/^for\s+a\s+/i.test(p)) p = p.replace(/^for\s+a\s+/i, "offers a ");
  else if (/^for\s+the\b/i.test(p)) p = p.replace(/^for\s+the\s+/i, "covers the ");
  else if (/^for\s+/i.test(p)) p = p.replace(/^for\s+/i, "covers ");
  p = p.trim();
  if (hadColonLead && p.length && !/^includes\b/i.test(p)) {
    p = `includes ${p.charAt(0) === p.charAt(0).toLowerCase() ? p : p.charAt(0).toLowerCase() + p.slice(1)}`;
  }
  if (!p) return "";
  const c0 = p.charAt(0);
  if (/[A-Z]/.test(c0) && !/^[A-Z]{2,}\b/.test(p)) {
    p = c0.toLowerCase() + p.slice(1);
  }
  return p;
}

function normalizeLegacyResourceRow(r) {
  const url = r.url;
  const linkText = (r.linkText || "").trim() || "this article";
  let paragraph = flowLegacyAfterLink(r.afterLink || "");
  if (!paragraph) {
    let b = stripLegacyBeforeOpeners(r.beforeLink || "");
    const re = new RegExp(`^${escapeRegex(linkText)}\\s*`, "i");
    b = b.replace(re, "").replace(/^[:,;]\s*/, "").trim();
    paragraph = flowLegacyAfterLink(b);
  }
  if (!paragraph) {
    paragraph = "is a concise Jobber Help overview that applies at any stage of adoption.";
  }
  return {
    id: resourceIdFromArticleUrl(url),
    linkText,
    paragraph,
    url,
  };
}

const JOBBER_HELP_HC_PREFIX = "https://help.getjobber.com/hc/";
const MAX_RESOURCE_LINK_TEXT = 120;
const MAX_RESOURCE_BEFORE = 400;
const MAX_RESOURCE_AFTER = 900;

function sanitizeGuideItemResources(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const r of raw) {
    if (!r || typeof r !== "object") continue;
    const url = typeof r.url === "string" ? r.url.trim() : "";
    if (!url) continue;
    const u = url.toLowerCase();
    if (!u.startsWith("https://") || !u.startsWith(JOBBER_HELP_HC_PREFIX.toLowerCase())) continue;

    let linkText = typeof r.linkText === "string" ? r.linkText.trim().slice(0, MAX_RESOURCE_LINK_TEXT) : "";
    let beforeLink = typeof r.beforeLink === "string" ? r.beforeLink.trim().slice(0, MAX_RESOURCE_BEFORE) : "";
    let afterLink = typeof r.afterLink === "string" ? r.afterLink.trim().slice(0, MAX_RESOURCE_AFTER) : "";
    const labelLegacy = typeof r.label === "string" ? r.label.trim() : "";

    if (!linkText && labelLegacy) {
      linkText = labelLegacy.slice(0, MAX_RESOURCE_LINK_TEXT);
      beforeLink = "When you have a few minutes, browse ";
      afterLink =
        " in the Help Center. A partial read still adds useful context as you continue using Jobber.";
    }
    if (!linkText) continue;

    out.push({ beforeLink, linkText, afterLink, url });
  }
  return out;
}

function dedupeLegacyModuleResources(legacy) {
  const allowedMods = new Set(MODULES.map((m) => m.id));
  const byMod = new Map();
  for (const key of Object.keys(legacy)) {
    const colon = key.indexOf(":");
    if (colon < 0) continue;
    const modId = key.slice(0, colon);
    if (!allowedMods.has(modId)) continue;
    if (!byMod.has(modId)) byMod.set(modId, new Map());
    const urlMap = byMod.get(modId);
    const list = sanitizeGuideItemResources(legacy[key]);
    for (const raw of list) {
      if (urlMap.has(raw.url)) continue;
      urlMap.set(raw.url, normalizeLegacyResourceRow(raw));
    }
  }
  const out = {};
  for (const [modId, urlMap] of byMod) {
    out[modId] = [...urlMap.values()];
  }
  return out;
}

/** Per module: deduped Help articles, independent of the coverage checklist. */
const MODULE_RESOURCES = dedupeLegacyModuleResources(LEGACY_MODULE_GUIDE_RESOURCES_BY_ITEM);

function getModuleResources(moduleId) {
  const list = MODULE_RESOURCES[moduleId];
  return Array.isArray(list) ? list : [];
}

function sanitizeModuleResourcesChecked(moduleId, raw) {
  const valid = new Set(getModuleResources(moduleId).map((r) => r.id));
  if (!valid.size) return {};
  const out = {};
  if (raw && typeof raw === "object") {
    for (const k of Object.keys(raw)) {
      if (valid.has(k) && raw[k]) out[k] = true;
    }
  }
  return out;
}

/** Capitalizes the first letter of each word (hyphens/underscores become spaces first). */
function titleCaseEachWord(str) {
  if (!str || typeof str !== "string") return "";
  return str
    .trim()
    .replace(/[-_]+/g, " ")
    .split(/\s+/)
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : ""))
    .filter(Boolean)
    .join(" ");
}

/** Checklist row: bold short topic plus clarifying detail (legacy `label` if no topic). */
function renderGuideItemChecklistLabel(it) {
  const topic = typeof it.topic === "string" ? it.topic.trim() : "";
  const detail = typeof it.detail === "string" ? it.detail.trim() : "";
  const legacy = typeof it.label === "string" ? it.label.trim() : "";
  if (topic && detail) {
    return `<span class="module-guide-item-label"><span class="module-guide-item-topic">${escapeHtml(topic)}</span><span class="module-guide-item-detail">${escapeHtml(`: ${detail}`)}</span></span>`;
  }
  if (topic) {
    return `<span class="module-guide-item-label"><span class="module-guide-item-topic">${escapeHtml(topic)}</span></span>`;
  }
  return `<span class="module-guide-item-label">${escapeHtml(legacy || (it.abbr || it.id || "").trim() || "Topic")}</span>`;
}

function formatModuleResourcePlainText(r) {
  const lt = titleCaseEachWord(r.linkText || "").trim();
  const p = typeof r.paragraph === "string" ? r.paragraph.trim() : "";
  const line = p ? `${lt} ${p}`.replace(/\s+/g, " ").trim() : lt;
  return `${line}\n\n${r.url}`;
}

/** Copy button: new `{ paragraph }` shape or legacy `{ beforeLink, afterLink }`. */
function formatResourceCopyPlainText(p) {
  if (!p || typeof p !== "object") return "";
  const url = typeof p.url === "string" ? p.url : "";
  if (typeof p.paragraph === "string" && url) {
    return formatModuleResourcePlainText(p);
  }
  if (typeof p.beforeLink === "string" || typeof p.afterLink === "string") {
    const beforeTrim = typeof p.beforeLink === "string" ? p.beforeLink.replace(/\s+$/, "") : "";
    const afterTrim = typeof p.afterLink === "string" ? p.afterLink.replace(/^\s+/, "") : "";
    const lt = titleCaseEachWord(p.linkText || "");
    const afterFirst = afterTrim[0];
    const needsSpaceAfterLink =
      afterTrim.length > 0 &&
      afterFirst !== undefined &&
      (/[A-Za-z0-9]/.test(afterFirst) || afterFirst === "\u2013");
    const afterPart = needsSpaceAfterLink ? ` ${afterTrim}` : afterTrim;
    const sentence = `${beforeTrim ? `${beforeTrim} ` : ""}${lt}${afterPart}`.replace(/\s+/g, " ").trim();
    return url ? `${sentence}\n\n${url}` : sentence;
  }
  return "";
}

function renderModuleResourceBlurb(r) {
  const linkDisplay = titleCaseEachWord(r.linkText || "");
  const aria = `Jobber Help Center: ${linkDisplay}`;
  const p = typeof r.paragraph === "string" ? r.paragraph.trim() : "";
  const space = p ? " " : "";
  return `<p class="module-related-resource-blurb"><a class="module-related-resource-link" href="${escapeHtml(r.url)}" target="_blank" rel="noopener noreferrer" aria-label="${escapeHtml(aria)}">${escapeHtml(linkDisplay)}</a>${space}${escapeHtml(p)}</p>`;
}

/** Plain JSON payloads for Copy (multiple articles in one row). */
function encodeResourceBlurbPayloads(resources) {
  return encodeURIComponent(
    JSON.stringify(
      resources.map((r) => ({
        linkText: r.linkText,
        paragraph: r.paragraph,
        url: r.url,
      }))
    )
  );
}

/** Two trainer-suggested homework ideas per module (SP practice before next touchpoint). */
const MODULE_HOMEWORK_SUGGESTIONS = {
  M01: [
    "Draft a one-page success picture for this account (goals, owners, first 90 days).",
    "List stakeholders and who owns day-to-day vs money decisions in Jobber.",
  ],
  M02: [
    "Complete company profile, branding basics, and service area in a sandbox or staging account.",
    "Confirm tax defaults and how quotes/invoices should read to clients.",
  ],
  M03: [
    "Walk through payout timing and where fees appear on a sample paid invoice.",
    "Verify who can see payouts and how they’ll reconcile to the bank.",
  ],
  M04: [
    "Start DPN provisioning and capture expected verification timeline for the SP.",
    "Map call/text routing: who answers, voicemail, and handoff to office staff.",
  ],
  M05: [
    "Run one lead from request → quote → job → invoice in a test workflow.",
    "Identify one exception case (rework, partial pay) and how they’ll handle it in Jobber.",
  ],
  M06: [
    "Build a small catalog (3–5 line items) that matches how they price in the field.",
    "Review one quote template with taxes/discounts turned on as they’d use live.",
  ],
  M07: [
    "Submit a test request through their public form and trace where it lands in Jobber.",
    "Adjust notifications or assignment rules for one realistic intake scenario.",
  ],
  M08: [
    "Place three jobs on the calendar (one-off, recurring, multi-day) with realistic times.",
    "Confirm who moves work on the dispatch board and how conflicts are resolved.",
  ],
  M09: [
    "Invite a second user with the right role and verify what they can/can’t see.",
    "Document MFA and device expectations for field vs office staff.",
  ],
  M10: [
    "Edit two core templates (quote + job) to match their voice and timing.",
    "Turn one automation on (or plan one) that matches how fast they actually respond.",
  ],
  M11: [
    "Configure when reviews send and who gets the internal notification.",
    "Draft a short response playbook for a negative review.",
  ],
  M12: [
    "Write the referral offer in plain language and who fulfills it.",
    "Create a tracking link or code and assign an owner for follow-up.",
  ],
  M13: [
    "Build a simple audience segment they’d actually mail first (with consent noted).",
    "Sketch one journey or blast with success metric they’ll watch.",
  ],
  M14: [
    "Trace lead capture from site → Jobber request/quote on desktop and mobile.",
    "Confirm who owns domain/DNS and where branding matches quotes/Hub.",
  ],
  M15: [
    "Run two test calls through AI Receptionist (happy path + handoff).",
    "Document human fallback: who gets escalations and after how many rings.",
  ],
  M16: [
    "Pull AR aging and cash-collected views for a sample week and sanity-check numbers.",
    "Identify one pipeline report they’ll review weekly (request → quote → job).",
  ],
  M17: [
    "Confirm accounting sync direction and who reconciles when numbers don’t match.",
    "List top three non-Jobber tools and who owns each integration when something breaks.",
  ],
};

const MAX_HOMEWORK_CUSTOM_LEN = 500;

function moduleGuideGroups(moduleId) {
  return MODULE_GUIDE_DEFS[moduleId] || [];
}

function moduleGuideItemMeta(moduleId) {
  const list = [];
  for (const g of moduleGuideGroups(moduleId)) {
    for (const it of g.items) list.push({ groupTitle: g.title, ...it });
  }
  return list;
}

function sanitizeHomeworkCustom(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const t = typeof row.text === "string" ? row.text.trim().slice(0, MAX_HOMEWORK_CUSTOM_LEN) : "";
    if (!t) continue;
    const rid = typeof row.id === "string" ? row.id.trim().slice(0, 80) : "";
    const id = rid || newId();
    const checked = row.checked === true;
    out.push({ id, text: t, checked });
  }
  return out;
}

/** Which of the two fixed recommended lines are selected for assign / export (defaults both off). */
function sanitizeHomeworkRecommendedChecked(raw) {
  const a = Array.isArray(raw) ? raw : [];
  return [a[0] === true, a[1] === true];
}

function getModuleHomeworkDefaults(moduleId) {
  const pair = MODULE_HOMEWORK_SUGGESTIONS[moduleId];
  if (Array.isArray(pair) && pair.length >= 2) return [pair[0], pair[1]];
  if (Array.isArray(pair) && pair.length === 1) return [pair[0], "Review related Help Center articles and try one workflow in sandbox."];
  return [
    "Apply this module in sandbox with a realistic client scenario.",
    "Note two questions to bring to the next live session.",
  ];
}

function sanitizeModuleGuideHighlights(moduleId, raw) {
  const valid = new Set(moduleGuideItemMeta(moduleId).map((x) => x.id));
  if (!valid.size) return {};
  const out = {};
  if (raw && typeof raw === "object") {
    for (const k of Object.keys(raw)) {
      if (valid.has(k) && raw[k]) out[k] = true;
    }
  }
  return out;
}

/** Per checklist item: session ids where the item was checked while “recording” was on for that session. */
function sanitizeGuideHighlightSessions(moduleId, raw) {
  const valid = new Set(moduleGuideItemMeta(moduleId).map((x) => x.id));
  if (!valid.size) return {};
  const out = {};
  if (raw && typeof raw === "object") {
    for (const k of Object.keys(raw)) {
      if (!valid.has(k)) continue;
      const arr = Array.isArray(raw[k]) ? raw[k].filter((x) => typeof x === "string" && x) : [];
      const uniq = [...new Set(arr)];
      if (uniq.length) out[k] = uniq;
    }
  }
  return out;
}

function checkedGuideItemIds(moduleId, entry) {
  const valid = new Set(moduleGuideItemMeta(moduleId).map((x) => x.id));
  const done = new Set();
  const gh = entry.guideHighlights;
  if (gh && typeof gh === "object") {
    for (const k of Object.keys(gh)) {
      if (valid.has(k) && gh[k]) done.add(k);
    }
  }
  const gs = sanitizeGuideHighlightSessions(moduleId, entry.guideHighlightSessions);
  for (const k of Object.keys(gs)) {
    if (gs[k].length) done.add(k);
  }
  return done;
}

function countModuleGuideProgress(moduleId, entry, filterSessionId = null) {
  const meta = moduleGuideItemMeta(moduleId);
  const total = meta.length;
  if (!total) return { done: 0, total: 0 };
  if (filterSessionId) {
    const gs = sanitizeGuideHighlightSessions(moduleId, entry.guideHighlightSessions);
    let done = 0;
    for (const it of meta) {
      if ((gs[it.id] || []).includes(filterSessionId)) done++;
    }
    return { done, total };
  }
  const set = checkedGuideItemIds(moduleId, entry);
  let done = 0;
  for (const it of meta) {
    if (set.has(it.id)) done++;
  }
  return { done, total };
}

/** Coverage line checked for a specific session (multi-session uses per-item session tags). */
function guideItemCheckedForSession(j, moduleId, itemId, sessionId) {
  const entry = getModuleEntry(j, moduleId);
  const ids = sessionIdsContainingModule(j, moduleId);
  if (!ids.includes(sessionId)) return false;
  const sess = sanitizeGuideHighlightSessions(moduleId, entry.guideHighlightSessions);
  if (ids.length >= 2) {
    return (sess[itemId] || []).includes(sessionId);
  }
  return entry.guideHighlights?.[itemId] === true;
}

/**
 * Jobber FSM: capabilities included on Grow but not on Connect.
 * Plus is treated as a superset of Grow for these flags until Plus-specific rules exist.
 * (Shopify / other products omitted; Jobber training scope only.)
 */
const PLAN_TIER = { connect: 0, grow: 1, plus: 2 };

const PLAN_GATED_FEATURES = [
  {
    id: "quoteFollowUps",
    label: "Automatic quote follow-ups",
    blurb: "Nudges clients to approve pending quotes.",
    minPlan: "grow",
    moduleIds: ["M05", "M13"],
  },
  {
    id: "jobCosting",
    label: "Job costing",
    blurb: "Labor, materials, and expenses vs. quote for margin visibility.",
    minPlan: "grow",
    moduleIds: ["M06", "M16"],
  },
  {
    id: "twoWaySms",
    label: "Two-way SMS",
    blurb: "Direct texting with clients in-app (Connect: one-way notifications only).",
    minPlan: "grow",
    moduleIds: ["M10"],
  },
  {
    id: "advancedQuotes",
    label: "Advanced quote customization",
    blurb: "Optional line items and professional markups.",
    minPlan: "grow",
    moduleIds: ["M05"],
  },
  {
    id: "workflowAutomations",
    label: "Custom workflow automations",
    blurb: "Triggers to automate repetitive tasks.",
    minPlan: "grow",
    moduleIds: ["M05", "M10"],
  },
  {
    id: "tailoredOnboarding",
    label: "Tailored onboarding",
    blurb: "Dedicated specialist support for workflow setup.",
    minPlan: "connect",
    moduleIds: ["M01"],
  },
];

function planTierValue(plan) {
  if (plan === "connect") return PLAN_TIER.connect;
  if (plan === "grow") return PLAN_TIER.grow;
  if (plan === "plus") return PLAN_TIER.plus;
  return -1;
}

function planGatedFeaturesForModule(moduleId) {
  return PLAN_GATED_FEATURES.filter((f) => f.moduleIds.includes(moduleId));
}

function renderModulePlanFeatures(moduleId, accountPlan) {
  const feats = planGatedFeaturesForModule(moduleId);
  if (!feats.length) return "";
  const tier = planTierValue(accountPlan);
  if (tier < 0) {
    return `
    <div class="module-plan-features module-plan-features--unset" role="note">
      <p class="module-plan-features-heading">Plan-specific capabilities</p>
      <p class="module-plan-features-prompt">Select a plan in <strong>Account details</strong> to show what this account can use in this topic.</p>
    </div>`;
  }
  const planLabel =
    accountPlan === "connect" ? "Connect" : accountPlan === "grow" ? "Grow" : "Plus";
  const rows = feats
    .map((f) => {
      const included = tier >= PLAN_TIER[f.minPlan];
      const rowClass = included ? "module-plan-feature--in" : "module-plan-feature--out";
      const status = included ? "On this plan" : "Grow+ only · not on Connect";
      return `<li class="module-plan-feature ${rowClass}">
        <span class="module-plan-feature-main">
          <span class="module-plan-feature-title">${escapeHtml(f.label)}</span>
          <span class="module-plan-feature-status">${escapeHtml(status)}</span>
        </span>
        <span class="module-plan-feature-blurb">${escapeHtml(f.blurb)}</span>
      </li>`;
    })
    .join("");
  return `
    <div class="module-plan-features" role="region" aria-label="Plan-specific capabilities (${escapeHtml(planLabel)})">
      <p class="module-plan-features-heading">For <strong>${escapeHtml(planLabel)}</strong> accounts</p>
      <ul class="module-plan-feature-list">${rows}</ul>
    </div>`;
}

function moduleById(id) {
  return MODULES.find((m) => m.id === id);
}

/**
 * Legacy order before `pathModuleIds` existed (import / old saves).
 * Honors very old `customModuleIds` when `learningPath` was `"custom"`.
 */
function legacyOrderedModuleIds(j) {
  const picked = j.customModuleIds?.filter(Boolean);
  if (j.learningPath === "custom" && picked?.length) {
    const rest = MODULES.map((m) => m.id).filter((id) => !picked.includes(id));
    return [...picked, ...rest];
  }
  return MODULES.map((m) => m.id);
}

function sanitizePathModuleIds(ids) {
  const seen = new Set();
  const out = [];
  for (const id of ids || []) {
    if (!moduleById(id) || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/** Kickoff is index 0; post-kickoff sessions default to Training 1, Training 2, … */
function defaultSessionTitleAtIndex(index) {
  if (index <= 0) return "Kickoff";
  return `Training ${index}`;
}

/** Locale display for session card tooltips / aria (ISO yyyy-mm-dd). */
function formatSessionDateDisplay(iso) {
  const t = (iso || "").trim();
  if (!t || !/^\d{4}-\d{2}-\d{2}$/.test(t)) return "";
  const d = new Date(`${t}T12:00:00`);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { dateStyle: "medium" });
}

/** Compact heading label, e.g. "Jan 15" (short month, day of month; no year). */
function formatSessionDateHeading(iso) {
  const t = (iso || "").trim();
  if (!t || !/^\d{4}-\d{2}-\d{2}$/.test(t)) return "";
  const d = new Date(`${t}T12:00:00`);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** New journeys: Kickoff + Training 1, no modules assigned (all start in Unscheduled). */
function emptyDefaultPathSessions() {
  return [
    { id: newId(), title: "Kickoff", date: "", moduleIds: [] },
    { id: newId(), title: "Training 1", date: "", moduleIds: [] },
  ];
}

/** Migration fallback: empty Kickoff + listed modules in Training 1. */
function defaultPathSessionsFromModuleIds(ids) {
  const cleaned = sanitizePathModuleIds(ids);
  return [
    { id: newId(), title: "Kickoff", date: "", moduleIds: [] },
    { id: newId(), title: "Training 1", date: "", moduleIds: [...cleaned] },
  ];
}

/**
 * Normalize sessions (≥2). The same module may appear in multiple sessions; within one session, ids are unique.
 * `flatFallback` is used only when raw is missing or invalid.
 */
function sanitizePathSessionsInput(raw, flatFallback) {
  if (!Array.isArray(raw) || raw.length < 2) {
    return defaultPathSessionsFromModuleIds(sanitizePathModuleIds(flatFallback));
  }
  const sessions = raw.map((s, i) => {
    let title =
      typeof s?.title === "string" && s.title.trim()
        ? s.title.trim().slice(0, 120)
        : defaultSessionTitleAtIndex(i);
    if (/^first session$/i.test(title)) title = "Training 1";
    return {
      id: typeof s?.id === "string" && s.id.trim() ? s.id.trim() : newId(),
      title,
      date: typeof s?.date === "string" ? s.date.slice(0, 32) : "",
      moduleIds: sanitizePathModuleIds(s?.moduleIds || []),
    };
  });
  for (const s of sessions) {
    s.moduleIds = sanitizePathModuleIds(s.moduleIds);
  }
  return sessions;
}

/** Unique module ids in plan order (first time seen across sessions, top to bottom). */
function flattenSessionsToPath(sessions) {
  const seen = new Set();
  const out = [];
  for (const s of sessions || []) {
    for (const id of s.moduleIds || []) {
      if (!moduleById(id) || seen.has(id)) continue;
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}

/** All scheduled slots in order (duplicates allowed). “Next up” walks this list. */
function flattenSessionSlotsOrdered(sessions) {
  const out = [];
  for (const s of sessions || []) {
    for (const id of s.moduleIds || []) {
      if (moduleById(id)) out.push(id);
    }
  }
  return out;
}

function getPathSessions(j) {
  return sanitizePathSessionsInput(j.pathSessions, j.pathModuleIds);
}

function scheduledModuleIdSet(j) {
  const set = new Set();
  for (const s of getPathSessions(j)) {
    for (const id of s.moduleIds || []) {
      if (moduleById(id)) set.add(id);
    }
  }
  return set;
}

function moduleScheduledOnPlan(j, moduleId) {
  return scheduledModuleIdSet(j).has(moduleId);
}

function getPathModuleIds(j) {
  return flattenSessionsToPath(getPathSessions(j));
}

function formatSessionDate(raw) {
  if (!raw || typeof raw !== "string") return "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  try {
    return new Date(`${raw}T12:00:00`).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return raw;
  }
}

async function copyTextToClipboard(text) {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      /* fall through */
    }
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.left = "-2000px";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

/** Rich paste: clickable links in email/docs; falls back to plain only if needed. */
async function copyPlainHtmlToClipboard(plain, html) {
  if (navigator.clipboard?.write && window.isSecureContext && typeof ClipboardItem !== "undefined") {
    try {
      const doc = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>${html}</body></html>`;
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/plain": new Blob([plain], { type: "text/plain" }),
          "text/html": new Blob([doc], { type: "text/html" }),
        }),
      ]);
      return true;
    } catch {
      /* fall through */
    }
  }
  return copyTextToClipboard(plain);
}

/** Plain session export: bullet + article title + flowing paragraph (no URL line). */
function formatModuleResourceSessionExportPlainFlowing(r) {
  const lt = titleCaseEachWord(r.linkText || "").trim() || "Help article";
  const p = typeof r.paragraph === "string" ? r.paragraph.trim() : "";
  const line = p ? `• ${lt} ${p}` : `• ${lt}`;
  return line.replace(/\s+/g, " ").trim();
}

/** HTML fragment: linked title + sentence (for rich paste). */
function formatModuleResourceSessionExportHtml(r) {
  const lt = titleCaseEachWord(r.linkText || "").trim() || "Help article";
  const p = typeof r.paragraph === "string" ? r.paragraph.trim() : "";
  const a = `<a href="${escapeHtml(r.url)}">${escapeHtml(lt)}</a>`;
  return p ? `${a} ${escapeHtml(p)}` : a;
}

/** Exact Help URLs → one-line session summary chip (before detailed Related resources block). */
const SESSION_RESOURCE_SUMMARY_SHORT_BY_URL = new Map([
  [
    "https://help.getjobber.com/hc/en-us/articles/360056046054-The-Five-Minute-Guide-to-Getting-Set-Up-with-Jobber",
    "Start Guide",
  ],
  ["https://help.getjobber.com/hc/en-us/articles/360047029094-Dedicated-Phone-Number", "DPN"],
  [
    "https://help.getjobber.com/hc/en-us/articles/34842183031959-Privacy-Policy-Requirements-for-your-Dedicated-Phone-Number-Application",
    "Privacy & Terms",
  ],
  ["https://help.getjobber.com/hc/en-us/articles/360051087154-Two-Way-Text-Messaging", "2-Way Texting"],
]);

/** Short label for the session export “Resources: A → B → C” line (not the bullet paragraphs). */
function formatResourceSessionSummaryShort(r) {
  const url = (r.url || "").trim();
  if (url && SESSION_RESOURCE_SUMMARY_SHORT_BY_URL.has(url)) {
    return SESSION_RESOURCE_SUMMARY_SHORT_BY_URL.get(url);
  }
  const lt = (r.linkText || "").trim();
  if (!lt) return "Article";
  const key = lt.toLowerCase();
  if (/five[-\s]?minute|getting\s+set\s+up\s+with\s+jobber/i.test(lt)) return "Start Guide";
  if (key === "dedicated phone number") return "DPN";
  if (key.includes("privacy policy") && (key.includes("dpn") || key.includes("dedicated phone"))) {
    return "Privacy & Terms";
  }
  if (key.includes("two-way") || /\btwo\s+way\b/.test(key)) return "2-Way Texting";
  const tc = titleCaseEachWord(lt);
  const words = tc.split(/\s+/).filter(Boolean);
  if (words.length <= 4) return tc;
  return `${words.slice(0, 3).join(" ")}…`;
}

/**
 * Session copy/export: plain + HTML. Plain matches paste layout: spaced blocks, Covered chain,
 * Homework: items joined by arrows, Resources: short chips, then Related resources (• title + sentence, no URLs).
 */
function buildSessionCoverageExport(j, sessionId) {
  const sessions = getPathSessions(j);
  const idx = sessions.findIndex((s) => s.id === sessionId);
  const s = idx >= 0 ? sessions[idx] : null;
  if (!s) return { plain: "", html: "" };
  const title = (s.title || "").trim() || defaultSessionTitleAtIndex(Math.max(0, idx));
  const datePart = s.date ? formatSessionDate(s.date) : "";
  const sessionLine = datePart ? `${title} (${datePart})` : title;

  const seen = new Set();
  const moduleOrder = [];
  for (const moduleId of s.moduleIds || []) {
    if (seen.has(moduleId)) continue;
    seen.add(moduleId);
    if (moduleById(moduleId)) moduleOrder.push(moduleId);
  }

  if (!moduleOrder.length) {
    const plain = `${sessionLine}\n\nCovered: (no modules in this session).\n\nRelated resources\n\n(No related Help articles selected for export.)\n`;
    const html = `<p>${escapeHtml(sessionLine)}</p><p>${escapeHtml("Covered: (no modules in this session).")}</p><p><strong>Related resources</strong></p><p><em>${escapeHtml("(No related Help articles selected for export.)")}</em></p>`;
    return { plain, html };
  }
  const topicNames = moduleOrder.map((id) => {
    const m = moduleById(id);
    return (m.topic || m.title || "").trim() || id;
  });

  const homeworkItems = [];
  for (const moduleId of moduleOrder) {
    const entry = getModuleEntry(j, moduleId);
    const [d1, d2] = getModuleHomeworkDefaults(moduleId);
    const [r0, r1] = entry.homeworkRecommendedChecked;
    if (r0) homeworkItems.push(d1);
    if (r1) homeworkItems.push(d2);
    for (const h of entry.homeworkCustom) {
      if (h.checked) homeworkItems.push(h.text);
    }
  }
  const resourceLinesPlain = [];
  const resourceLinesHtml = [];
  const resourceSummaryShorts = [];
  const resourceSummarySeenUrl = new Set();
  for (const moduleId of moduleOrder) {
    const entry = getModuleEntry(j, moduleId);
    const ack = entry.moduleResourcesChecked;
    for (const r of getModuleResources(moduleId)) {
      if (!ack[r.id]) continue;
      resourceLinesPlain.push(formatModuleResourceSessionExportPlainFlowing(r));
      resourceLinesHtml.push(`<p>• ${formatModuleResourceSessionExportHtml(r)}</p>`);
      if (!resourceSummarySeenUrl.has(r.url)) {
        resourceSummarySeenUrl.add(r.url);
        resourceSummaryShorts.push(formatResourceSessionSummaryShort(r));
      }
    }
  }

  const coveredLine = `Covered: ${topicNames.join(" → ")}.`;
  const relatedHeader = "Related resources";
  const plainParts = [sessionLine, coveredLine];
  if (homeworkItems.length > 0) {
    plainParts.push(`Homework: ${homeworkItems.join(" → ")}`);
  }
  if (resourceSummaryShorts.length > 0) {
    plainParts.push(`Resources: ${resourceSummaryShorts.join(" → ")}`);
  }
  plainParts.push(
    relatedHeader,
    resourceLinesPlain.length > 0
      ? resourceLinesPlain.join("\n\n")
      : "(No related Help articles selected for export.)"
  );
  const plain = `${plainParts.join("\n\n")}\n`;

  const htmlParts = [`<p>${escapeHtml(sessionLine)}</p>`, `<p>${escapeHtml(coveredLine)}</p>`];
  if (homeworkItems.length > 0) {
    htmlParts.push(
      `<p>${escapeHtml("Homework: ")}${homeworkItems.map((t) => escapeHtml(t)).join(" → ")}</p>`
    );
  }
  if (resourceSummaryShorts.length > 0) {
    htmlParts.push(
      `<p>${escapeHtml("Resources: ")}${resourceSummaryShorts.map((t) => escapeHtml(t)).join(" → ")}</p>`
    );
  }
  htmlParts.push(`<p><strong>${escapeHtml(relatedHeader)}</strong></p>`);
  if (resourceLinesHtml.length) {
    htmlParts.push(...resourceLinesHtml);
  } else {
    htmlParts.push(`<p><em>${escapeHtml("(No related Help articles selected for export.)")}</em></p>`);
  }

  return { plain, html: htmlParts.join("") };
}

/** Label for module cards: all sessions that include this module. */
function sessionPlacementLabel(j, moduleId) {
  const labels = [];
  const list = getPathSessions(j);
  list.forEach((s, idx) => {
    if (!s.moduleIds.includes(moduleId)) return;
    const title = (s.title || "").trim() || defaultSessionTitleAtIndex(idx);
    const d = formatSessionDate(s.date);
    labels.push(d ? `${title} (${d})` : title);
  });
  if (!labels.length) return null;
  if (labels.length === 1) return labels[0];
  const max = 3;
  const shown = labels.slice(0, max).join(" · ");
  return labels.length > max ? `${shown} +${labels.length - max}` : shown;
}

/** When AI Receptionist add-on is on, append M15 to Training 1 (first post-kickoff) if not already scheduled anywhere. */
function ensureAiReceptionistEarlyInPlan(j) {
  if (!getAccountAddOns(j).aiReceptionist) return j;
  const sessions = getPathSessions(j).map((s) => ({
    id: s.id,
    title: s.title,
    date: s.date,
    moduleIds: [...s.moduleIds],
  }));
  if (sessions.some((s) => s.moduleIds.includes("M15"))) return j;
  let targetIdx = sessions.findIndex((s) => /^training 1$/i.test((s.title || "").trim()));
  if (targetIdx < 0) targetIdx = Math.min(1, sessions.length - 1);
  const target = sessions[targetIdx];
  if (!target) return j;
  target.moduleIds = [...target.moduleIds, "M15"];
  const pathSessions = sanitizePathSessionsInput(sessions, flattenSessionsToPath(sessions));
  return { ...j, pathSessions, pathModuleIds: flattenSessionsToPath(pathSessions) };
}

/** Remove a module id from every session (e.g. M15 when AI Receptionist is no longer enabled). */
function removeModuleFromLearningPath(j, moduleId) {
  const sessions = getPathSessions(j).map((s) => ({
    id: s.id,
    title: s.title,
    date: s.date,
    moduleIds: s.moduleIds.filter((id) => id !== moduleId),
  }));
  const pathSessions = sanitizePathSessionsInput(sessions, flattenSessionsToPath(sessions));
  return { ...j, pathSessions, pathModuleIds: flattenSessionsToPath(pathSessions) };
}

function mapLegacyModuleId(id) {
  return LEGACY_MODULE_ID_MAP[id] || id;
}

/** v2 (M01–M14) → v3 (M01–M13): merge former M02 + M03 into M02; shift M04+ down by one. */
function mapModuleIdV2toV3(id) {
  if (id === "M02" || id === "M03") return "M02";
  const m = /^M(\d{2})$/.exec(id);
  if (!m) return id;
  const n = parseInt(m[1], 10);
  if (n <= 1) return id;
  if (n >= 4 && n <= 14) return `M${String(n - 1).padStart(2, "0")}`;
  return id;
}

function mapAnyToCurrentScheme(id) {
  return mapModuleIdV2toV3(mapLegacyModuleId(id));
}

function mergeModuleEntryForMigration(a, b) {
  const rank = {
    complete: 6,
    completeManual: 6,
    priorKickoff: 5,
    inProgress: 3,
    incomplete: 2,
    skipped: 2,
  };
  const ra = rank[a.status] ?? 0;
  const rb = rank[b.status] ?? 0;
  const pick = ra >= rb ? a : b;
  const notes = [a.notes, b.notes]
    .filter((x) => x != null && String(x).trim() !== "")
    .join("\n\n");
  return { ...pick, notes: notes || pick.notes || "" };
}

const MODULE_IDS_V3 = new Set(
  Array.from({ length: 13 }, (_, i) => `M${String(i + 1).padStart(2, "0")}`)
);

const MODULE_IDS_V4 = new Set(
  Array.from({ length: 14 }, (_, i) => `M${String(i + 1).padStart(2, "0")}`)
);

/** Map v3 id → v4 id (single step); old v3 M02 is handled separately (splits to M02 + M03). */
function mapModuleIdV3toV4Single(id) {
  if (id === "M01") return "M01";
  if (id === "M02") return "M02";
  const m = /^M(\d{2})$/.exec(id);
  if (!m) return id;
  const n = parseInt(m[1], 10);
  if (n >= 3 && n <= 13) return `M${String(n + 1).padStart(2, "0")}`;
  return id;
}

/**
 * v3 (M01–M13, combined M02) → v4 (M01–M14): split M02 into Basic Setup + Jobber Payments; shift former M03–M13 up.
 */
function migrateV3toV4(j) {
  const nextModules = {};
  function mergePut(id, entry) {
    if (!MODULE_IDS_V4.has(id)) return;
    if (nextModules[id]) {
      nextModules[id] = mergeModuleEntryForMigration(nextModules[id], entry);
    } else {
      nextModules[id] = { ...entry };
    }
  }
  for (const [k, v] of Object.entries(j.modules || {})) {
    if (k === "M02") continue;
    mergePut(mapModuleIdV3toV4Single(k), v);
  }
  const m02 = j.modules?.M02;
  if (m02) {
    mergePut("M02", m02);
    mergePut("M03", m02);
  }

  function expandPathIds(ids) {
    const out = [];
    for (const id of ids || []) {
      if (id === "M02") {
        out.push("M02", "M03");
      } else {
        out.push(mapModuleIdV3toV4Single(id));
      }
    }
    return sanitizePathModuleIds(out);
  }

  const pathModuleIds = expandPathIds(j.pathModuleIds);
  const pathSessions = Array.isArray(j.pathSessions)
    ? j.pathSessions.map((s) => ({
        ...s,
        moduleIds: expandPathIds(s.moduleIds),
      }))
    : j.pathSessions;

  return { ...j, modules: nextModules, pathModuleIds, pathSessions };
}

/** v4 M12–M14 → v5 M15–M17; v4 M11 (Marketing) → v5 M11–M14 (Reviews … Website). */
function mapModuleIdV4toV5Single(id) {
  const m = /^M(\d{2})$/.exec(id);
  if (!m) return id;
  const n = parseInt(m[1], 10);
  if (n <= 10) return id;
  if (n === 11) return "M11";
  if (n >= 12 && n <= 14) return `M${String(n + 3).padStart(2, "0")}`;
  return id;
}

function migrateV4toV5(j) {
  const nextModules = {};
  function mergePut(id, entry) {
    if (!moduleById(id)) return;
    if (nextModules[id]) {
      nextModules[id] = mergeModuleEntryForMigration(nextModules[id], entry);
    } else {
      nextModules[id] = { ...entry };
    }
  }
  for (const [k, v] of Object.entries(j.modules || {})) {
    if (k === "M11") continue;
    mergePut(mapModuleIdV4toV5Single(k), v);
  }
  const m11 = j.modules?.M11;
  if (m11) {
    mergePut("M11", m11);
    mergePut("M12", m11);
    mergePut("M13", m11);
    mergePut("M14", m11);
  }

  function expandPathIds(ids) {
    const out = [];
    for (const id of ids || []) {
      if (id === "M11") {
        out.push("M11", "M12", "M13", "M14");
      } else {
        out.push(mapModuleIdV4toV5Single(id));
      }
    }
    return sanitizePathModuleIds(out);
  }

  const pathModuleIds = expandPathIds(j.pathModuleIds);
  const pathSessions = Array.isArray(j.pathSessions)
    ? j.pathSessions.map((s) => ({
        ...s,
        moduleIds: expandPathIds(s.moduleIds),
      }))
    : j.pathSessions;

  return { ...j, modules: nextModules, pathModuleIds, pathSessions };
}

/** Remap keys to v3 shape (M01–M13) without using current MODULES for validation. */
function applyModuleIdMapToV3(j, mapFn) {
  const nextModules = {};
  for (const [k, v] of Object.entries(j.modules || {})) {
    const nk = mapFn(k);
    if (!MODULE_IDS_V3.has(nk)) continue;
    const entry = { ...v };
    if (nextModules[nk]) {
      nextModules[nk] = mergeModuleEntryForMigration(nextModules[nk], entry);
    } else {
      nextModules[nk] = entry;
    }
  }

  const mapList = (ids) => {
    const seen = new Set();
    const out = [];
    for (const id of ids || []) {
      const nk = mapFn(id);
      if (!MODULE_IDS_V3.has(nk) || seen.has(nk)) continue;
      seen.add(nk);
      out.push(nk);
    }
    return out;
  };

  const pathModuleIds = mapList(j.pathModuleIds);
  const pathSessions = Array.isArray(j.pathSessions)
    ? j.pathSessions.map((s) => ({
        ...s,
        moduleIds: mapList(s.moduleIds),
      }))
    : j.pathSessions;

  return { ...j, modules: nextModules, pathModuleIds, pathSessions, moduleIdSchemeVersion: 3 };
}

/**
 * Remap stored module ids: v1 → v2 → v3 → v4 → v5.
 * v5: M11–M14 marketing split; M15–M17 AI / Reports / Integrations.
 */
function migrateModuleIdSchemeIfNeeded(j) {
  let ver = j.moduleIdSchemeVersion | 0;
  if (ver >= MODULE_ID_SCHEME_VERSION) return j;

  let cur = { ...j };

  if (ver < 2) {
    cur = applyModuleIdMapToV3(cur, mapAnyToCurrentScheme);
    ver = 3;
  } else if (ver === 2) {
    cur = applyModuleIdMapToV3(cur, mapModuleIdV2toV3);
    ver = 3;
  }

  if (ver === 3) {
    cur = migrateV3toV4(cur);
    ver = 4;
  }

  if (ver === 4) {
    cur = migrateV4toV5(cur);
    ver = 5;
  }

  return { ...cur, moduleIdSchemeVersion: MODULE_ID_SCHEME_VERSION };
}

function migrateJourney(j) {
  j = migrateModuleIdSchemeIfNeeded(j);
  let pathModuleIds = sanitizePathModuleIds(j.pathModuleIds);
  if (!pathModuleIds.length) {
    pathModuleIds = sanitizePathModuleIds(legacyOrderedModuleIds(j));
  }
  if (!pathModuleIds.length) {
    pathModuleIds = MODULES.map((m) => m.id);
  }
  const pathSessions = sanitizePathSessionsInput(j.pathSessions, pathModuleIds);
  pathModuleIds = flattenSessionsToPath(pathSessions);
  const modules = { ...j.modules };
  for (const m of MODULES) {
    const e = modules[m.id] || {
      status: "incomplete",
      notes: "",
      guideHighlights: {},
      guideHighlightSessions: {},
      moduleResourcesChecked: {},
      homeworkCustom: [],
      homeworkRecommendedChecked: [false, false],
    };
    let status = e.status;
    if (status === "skipped") {
      status = "incomplete";
    }
    const allowed =
      status === "complete" ||
      status === "completeManual" ||
      status === "priorKickoff" ||
      status === "incomplete" ||
      status === "inProgress";
    if (!allowed) {
      status = "incomplete";
    }
    const guideHighlights = sanitizeModuleGuideHighlights(m.id, e.guideHighlights);
    const guideHighlightSessions = sanitizeGuideHighlightSessions(m.id, e.guideHighlightSessions);
    const homeworkCustom = sanitizeHomeworkCustom(e.homeworkCustom);
    const homeworkRecommendedChecked = sanitizeHomeworkRecommendedChecked(e.homeworkRecommendedChecked);
    const moduleResourcesChecked = sanitizeModuleResourcesChecked(m.id, e.moduleResourcesChecked);
    modules[m.id] = {
      ...e,
      status,
      notes: typeof e.notes === "string" ? e.notes : "",
      guideHighlights,
      guideHighlightSessions,
      moduleResourcesChecked,
      homeworkCustom,
      homeworkRecommendedChecked,
    };
  }
  const accountPlan =
    j.accountPlan === "connect" || j.accountPlan === "grow" || j.accountPlan === "plus"
      ? j.accountPlan
      : null;
  const accountAddOns = normalizeAccountAddOns(accountPlan, j.accountAddOns || {});
  let accountAutoCollapsedOnce = !!j.accountAutoCollapsedOnce;
  const mergedAccount = { ...j, pathSessions, pathModuleIds, modules, accountPlan, accountAddOns };
  let jobberPaymentsStatus =
    typeof j.jobberPaymentsStatus === "string" && JOBBER_PAYMENTS_STATUS_BY_VALUE[j.jobberPaymentsStatus]
      ? j.jobberPaymentsStatus
      : null;
  const mergedWithJp = { ...mergedAccount, jobberPaymentsStatus };
  if (!accountAutoCollapsedOnce && isAccountComplete(mergedWithJp) && hasAnyAccountAddOn(mergedWithJp)) {
    accountAutoCollapsedOnce = true;
  }
  const learningUiBase = { ...defaultLearningUi(), ...(j.learningUi && typeof j.learningUi === "object" ? j.learningUi : {}) };
  const learningUi = {
    ...learningUiBase,
    guideSessionFilter: sanitizeGuideSessionFilterObject(
      { ...mergedWithJp, learningUi: learningUiBase },
      learningUiBase.guideSessionFilter && typeof learningUiBase.guideSessionFilter === "object"
        ? learningUiBase.guideSessionFilter
        : {}
    ),
  };
  let migrated = applyJobberPaymentsStatusToM03({ ...mergedWithJp, accountAutoCollapsedOnce, learningUi });
  const { risks: _removedRisks, ...withoutRisks } = migrated;
  const suRaw = withoutRisks.sectionUi && typeof withoutRisks.sectionUi === "object" ? { ...withoutRisks.sectionUi } : {};
  delete suRaw.risksCollapsed;
  return { ...withoutRisks, sectionUi: { ...defaultSectionUi(), ...suRaw } };
}

function loadJourneys() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    return data.map(migrateJourney);
  } catch {
    return [];
  }
}

function orderedModuleIds(j) {
  const path = getPathModuleIds(j);
  const inPath = new Set(path);
  const tail = getModuleIdsInDisplayOrder().filter((id) => !inPath.has(id));
  return [...path, ...tail];
}

function moduleInCurrentPath(j, moduleId) {
  return getPathModuleIds(j).includes(moduleId);
}

function getOrderedModulesForUi() {
  return MODULES.slice();
}

function getModuleIdsInDisplayOrder() {
  return getOrderedModulesForUi().map((m) => m.id);
}

const PERSONAS = [
  {
    value: "sam",
    label: "Solo Sam",
    description:
      "Owner-operator: they still do most of the work themselves (quotes, dispatch, field work, billing). Usually startup or survival mode; optimize for time, simple habits, and getting real work into Jobber without extra complexity.",
  },
  {
    value: "gary",
    label: "Growing Gary",
    description:
      "They’ve hired their first people (often 1–3) and are shifting from technician to manager. Focus on repeatable processes, delegation, and keeping quality up while the team grows.",
  },
  {
    value: "paula",
    label: "Professional Paula",
    description:
      "Solid team and often multiple crews. Less day-to-day in the truck; more margin, scheduling, marketing, and a consistent customer experience across the business.",
  },
  {
    value: "eric",
    label: "Enterprise Eric",
    description:
      "Larger or multi-location operation: more data, integrations, office roles, and governance. Prioritize sustainability, reporting, and culture at scale; not just basics.",
  },
];

function personaByValue(value) {
  if (value == null || value === "") {
    return {
      label: "Persona not set",
      description: "Choose a persona in Business details below.",
    };
  }
  return PERSONAS.find((p) => p.value === value) || PERSONAS[1];
}

function renderAccountDetailsSection(j) {
  const su = getSectionUi(j);
  const accountOpen = !su.accountCollapsed;
  const plan = j.accountPlan;
  const add = getAccountAddOns(j);
  const suiteOn = add.marketingSuite;

  const badge = (complete) =>
    complete
      ? `<span class="section-summary-badge">Complete</span>`
      : `<span class="section-summary-badge section-summary-badge--todo">In progress</span>`;

  const planRadios = ACCOUNT_PLANS.map(
    (p) => `
    <label class="account-plan-option">
      <input
        type="radio"
        name="edit-account-plan"
        value="${p.value}"
        ${plan === p.value ? "checked" : ""}
      />
      <span class="account-plan-option-label">${escapeHtml(p.label)}</span>
    </label>`
  ).join("");

  const trioKey = (k) => k === "reviews" || k === "campaigns" || k === "referrals";
  const dpnLocked = isDpnLockedOnByAccount(j);
  const plusBundled = plan === "plus";
  const addonRows = ACCOUNT_ADDON_DEFS.map((d) => {
    const checked = add[d.key] ? "checked" : "";
    const suiteDisabled = suiteOn && trioKey(d.key);
    const dpnDisabled = d.key === "dpn" && dpnLocked;
    const plusLocked =
      plusBundled &&
      (d.key === "marketingSuite" || d.key === "aiReceptionist" || d.key === "dpn");
    const disabled = suiteDisabled || dpnDisabled || plusLocked ? "disabled" : "";
    const suiteBundled = suiteOn && trioKey(d.key);
    const extraClass = [
      disabled ? "account-addon-option--locked" : "",
      suiteBundled ? "account-addon-option--suite-bundled" : "",
    ]
      .filter(Boolean)
      .join(" ");
    const meta = d.blurb
      ? `<span class="account-addon-meta">${escapeHtml(d.blurb)}</span>`
      : "";
    const rowTitle = suiteBundled
      ? ` title="Controlled by Marketing Suite"`
      : plusLocked && d.key === "marketingSuite"
        ? ` title="Included with the Plus plan."`
        : plusLocked && d.key === "aiReceptionist"
          ? ` title="Included with the Plus plan."`
          : plusLocked && d.key === "dpn"
            ? ` title="Included with the Plus plan (DPN stays on)."`
            : dpnDisabled
              ? ` title="Always on for Grow, Plus, or when AI Receptionist is enabled."`
              : "";
    return `
    <label class="account-addon-option${extraClass ? ` ${extraClass}` : ""}"${rowTitle}>
      <input type="checkbox" data-account-addon="${d.key}" ${checked} ${disabled} />
      <span class="account-addon-line">
        <span class="account-addon-label">${escapeHtml(d.label)}</span>
        ${meta}
      </span>
    </label>`;
  }).join("");

  const jpSorted = [...JOBBER_PAYMENTS_STATUSES].sort((a, b) => a.code - b.code);
  const selectedJp = j.jobberPaymentsStatus && JOBBER_PAYMENTS_STATUS_BY_VALUE[j.jobberPaymentsStatus];
  const jpOptions = jpSorted
    .map(
      (s) =>
        `<option value="${escapeHtml(s.value)}" ${j.jobberPaymentsStatus === s.value ? "selected" : ""}>${escapeHtml(s.label)} (${s.code})</option>`
    )
    .join("");
  const jpCoachBody = selectedJp
    ? selectedJp.coachBullets.map((b) => `<p>${escapeHtml(b)}</p>`).join("")
    : "";
  const jpDescBlock = selectedJp
    ? `
        <p class="account-jp-training-hint">${escapeHtml(selectedJp.trainingHint)}</p>
        <p class="account-jp-summary">${escapeHtml(selectedJp.summary)}</p>
        <details class="account-jp-coach">
          <summary>Coaching &amp; how accounts arrive here</summary>
          <div class="account-jp-coach-body">${jpCoachBody}</div>
        </details>`
    : "";

  return `
    <details class="section-disclosure form-panel form-panel--account" data-section="account" ${accountOpen ? "open" : ""}>
      <summary class="section-summary">
        <span class="section-summary-left">
          <span class="section-summary-title">Account details</span>
          ${badge(isAccountComplete(j))}
        </span>
        <span class="section-summary-hint" aria-hidden="true">Tap to expand or collapse</span>
      </summary>
      <div class="section-body account-section-body">
        <div class="account-sheet">
          <fieldset class="account-fieldset account-panel">
            <legend class="account-panel-legend">
              <span class="account-panel-step" aria-hidden="true">1</span>
              <span class="account-panel-legend-text">Plan</span>
            </legend>
            <p class="account-panel-note">Jobber plan tier for this account.</p>
            <div class="account-plan-options" role="radiogroup" aria-label="Account plan">
              ${planRadios}
            </div>
          </fieldset>
          <fieldset class="account-fieldset account-panel">
            <legend class="account-panel-legend">
              <span class="account-panel-step" aria-hidden="true">2</span>
              <span class="account-panel-legend-text">Add-ons</span>
            </legend>
            <p class="account-panel-note">What’s enabled. Marketing Suite bundles Reviews, Campaigns, and Referrals. <strong>Plus</strong> includes Marketing Suite, AI Receptionist, and DPN; those stay on while Plus is selected.</p>
            <div class="account-addons-list">
              ${addonRows}
            </div>
          </fieldset>
          <fieldset class="account-fieldset account-panel account-panel--flush-bottom">
            <legend class="account-panel-legend">
              <span class="account-panel-step" aria-hidden="true">3</span>
              <span class="account-panel-legend-text">Jobber Payments status</span>
            </legend>
            <p class="account-panel-note">Jobber Payments status drives <strong>M03 Jobber Payments</strong> only. <strong>M02 Basic Setup</strong> is tracked separately in the learning plan.</p>
            <div class="account-jp-controls">
              <select
                id="jobber-payments-status"
                class="account-jp-select"
                aria-label="Jobber Payments status"
                aria-describedby="account-jp-desc"
              >
                <option value="">Select status…</option>
                ${jpOptions}
              </select>
            </div>
            <div id="account-jp-desc" class="account-jp-desc">${jpDescBlock}</div>
          </fieldset>
        </div>
      </div>
    </details>
  `;
}

function renderPersonaFieldset(namePrefix, selectedValue, opts = {}) {
  const selected = selectedValue == null || selectedValue === "" ? null : selectedValue;
  const required = !!opts.required;
  return `
    <fieldset class="persona-fieldset">
      <legend class="persona-legend">Persona</legend>
      <p class="persona-intro">Pick the profile that best matches how this business runs right now. It only steers emphasis; not a rigid box.</p>
      <div class="persona-options">
        ${PERSONAS.map(
          (p, i) => `
          <label class="persona-option">
            <input
              type="radio"
              name="${namePrefix}persona"
              value="${p.value}"
              ${selected === p.value ? "checked" : ""}
              ${required && i === 0 ? "required" : ""}
            />
            <span class="persona-option-body">
              <span class="persona-option-title">${escapeHtml(p.label)}</span>
              <span class="persona-option-desc">${escapeHtml(p.description)}</span>
            </span>
          </label>
        `
        ).join("")}
      </div>
    </fieldset>
  `;
}

const ACCOUNT_PLANS = [
  { value: "connect", label: "Connect" },
  { value: "grow", label: "Grow" },
  { value: "plus", label: "Plus" },
];

/** Add-on keys; Marketing Suite bundles Reviews, Campaigns, and Referrals in the UI. */
const ACCOUNT_ADDON_DEFS = [
  { key: "reviews", label: "Reviews" },
  { key: "campaigns", label: "Campaigns" },
  { key: "referrals", label: "Referrals" },
  { key: "marketingSuite", label: "Marketing Suite", blurb: "Reviews, Campaigns & Referrals" },
  {
    key: "dpn",
    label: "Dedicated Phone Number (DPN)",
    blurb: "Always on for Grow/Plus or when AI Receptionist is enabled. Start as soon as possible; provisioning often takes up to ~3 weeks from first setup.",
  },
  {
    key: "aiReceptionist",
    label: "AI Receptionist",
    blurb: "Adds M15 to Training 1 when enabled (after Website in the default sequence). Requires DPN; keep DPN enabled.",
  },
];

function defaultAccountAddOns() {
  const o = {};
  for (const d of ACCOUNT_ADDON_DEFS) o[d.key] = false;
  return o;
}

/** Grow/Plus or AI Receptionist → DPN must stay on (provisioning lead time). */
function isDpnLockedOnByAccount(j) {
  const p = j.accountPlan;
  if (p === "grow" || p === "plus") return true;
  return !!(j.accountAddOns && j.accountAddOns.aiReceptionist);
}

/** Clear add-ons that were only forced while on Plus, before re-normalizing for Grow/Connect. */
function stripPlusIncludedAddOnsFromRaw(raw) {
  return {
    ...raw,
    reviews: false,
    campaigns: false,
    referrals: false,
    marketingSuite: false,
    aiReceptionist: false,
  };
}

function normalizeAccountAddOns(accountPlan, raw) {
  const add = { ...defaultAccountAddOns(), ...raw };
  for (const d of ACCOUNT_ADDON_DEFS) add[d.key] = !!add[d.key];
  if (add.reviews && add.campaigns && add.referrals) add.marketingSuite = true;
  const p =
    accountPlan === "connect" || accountPlan === "grow" || accountPlan === "plus"
      ? accountPlan
      : null;
  if (p === "grow" || p === "plus" || add.aiReceptionist) add.dpn = true;
  /** Connect: DPN only with AI Receptionist (not left “on” from Grow/Plus raw state). */
  if (p === "connect" && !add.aiReceptionist) add.dpn = false;
  if (p === "plus") {
    add.reviews = true;
    add.campaigns = true;
    add.referrals = true;
    add.marketingSuite = true;
    add.aiReceptionist = true;
  }
  return add;
}

function getAccountAddOns(j) {
  return normalizeAccountAddOns(j.accountPlan, j.accountAddOns || {});
}

function hasAnyAccountAddOn(j) {
  return Object.values(getAccountAddOns(j)).some(Boolean);
}

/**
 * Jobber Payments states (Anchor). moduleOutcome drives M03 (Jobber Payments) in the learning plan:
 * complete | incomplete (skipped outcomes map to incomplete)
 */
const JOBBER_PAYMENTS_STATUSES = [
  {
    value: "backfill",
    code: 0,
    label: "Backfill / unknown",
    moduleOutcome: "incomplete",
    summary: "Historical placeholder only; previous state unknown when backfilling.",
    trainingHint: "M03: treat as not started until you confirm a real Anchor status.",
    coachBullets: [
      "Used in history for the first row’s previous_state during backfill; not a live operational state.",
    ],
  },
  {
    value: "ineligible",
    code: 100,
    label: "Ineligible",
    moduleOutcome: "skipped",
    summary: "Not eligible for Jobber Payments.",
    trainingHint: "M03: skip; SP cannot use Jobber Payments.",
    coachBullets: [
      "SP is unable to use Jobber Payments.",
      "Typical paths: account creation, plan change, or removing “Jobber Payments Blocked” risk control; only if they never signed up.",
      "Geo/plan rules: not US/CA; UK without subscribe+pay; AU without jobber_payments_au; IE without jobber_payments_ie; or plan not in the eligible list.",
    ],
  },
  {
    value: "eligible",
    code: 101,
    label: "Eligible",
    moduleOutcome: "incomplete",
    summary: "Eligible for Jobber Payments; not yet signed up.",
    trainingHint: "M03: needs work; discuss and drive Jobber Payments setup.",
    coachBullets: [
      "SP can use Jobber Payments. Discuss Jobber Payments on your calls.",
      "Requires eligible region/plan and never having signed up for Jobber Payments before.",
    ],
  },
  {
    value: "hosted_onboarding",
    code: 102,
    label: "Hosted onboarding",
    moduleOutcome: "incomplete",
    summary: "Stripe verification started via Hosted Onboarding (data submitted).",
    trainingHint: "M03: needs work; help them finish hosted onboarding and bank details.",
    coachBullets: [
      "SP is not enabled to collect with Jobber Payments yet.",
      "Offer to help through hosted onboarding and bank setup.",
      "Connect account exists in Stripe; charges not enabled; not On By Default; JobberPaymentsFeature not present.",
    ],
  },
  {
    value: "on_by_default",
    code: 200,
    label: "On by default",
    moduleOutcome: "incomplete",
    summary: "Jobber Payments auto-enabled; payouts not ready (no bank).",
    trainingHint: "M03: needs work; they can’t receive payouts yet; help with onboarding + bank.",
    coachBullets: [
      "Charges enabled; payouts disabled; no bank connected; Jobber Payments feature enabled; Stripe has on-by-default.",
    ],
  },
  {
    value: "onboarded",
    code: 201,
    label: "Onboarded",
    moduleOutcome: "incomplete",
    summary: "Hosted onboarding done; bank not connected yet.",
    trainingHint: "M03: needs work; ensure they connect a bank account.",
    coachBullets: [
      "Charges enabled; payouts disabled; Jobber Payments on; not On By Default.",
    ],
  },
  {
    value: "verifying",
    code: 202,
    label: "Verifying",
    moduleOutcome: "incomplete",
    summary: "Stripe is verifying onboarding + bank information.",
    trainingHint: "M03: needs work; if stuck >5 business days, escalate via Support / Financial Services.",
    coachBullets: [
      "Charges enabled; payouts disabled; bank connected; Jobber Payments enabled.",
      "If verifying longer than 5 business days, use #help-success or #help_support for a Financial Services ticket.",
    ],
  },
  {
    value: "enabled",
    code: 300,
    label: "Enabled",
    moduleOutcome: "complete",
    summary: "Jobber Payments fully enabled; charges and payouts on with bank connected.",
    trainingHint: "M03: complete; no payments training gap for setup.",
    coachBullets: ["SP is fully set up. No action required for Jobber Payments enablement."],
  },
  {
    value: "demo",
    code: 399,
    label: "Demo",
    moduleOutcome: "complete",
    summary: "Internal demo account with Jobber Payments enabled.",
    trainingHint: "M03: complete; demo environment.",
    coachBullets: ["Demo signup with Jobber Payments enabled from demo settings."],
  },
  {
    value: "sp_disabled",
    code: 900,
    label: "SP disabled",
    moduleOutcome: "skipped",
    summary: "SP turned Jobber Payments off in the product.",
    trainingHint: "M03: skip; SP opted out. Discuss only if appropriate; don’t oversell.",
    coachBullets: [
      "SP disabled Jobber Payments from the product (or cancelled while JP was enabled).",
      "You may discuss Jobber Payments with context they may have had concerns in the past.",
    ],
  },
  {
    value: "blocked",
    code: 901,
    label: "Blocked",
    moduleOutcome: "skipped",
    summary: "Blocked by Jobber risk or Stripe (e.g. platform paused / rejected).",
    trainingHint: "M03: skip for training completion; resolve blockers via Risk / Financial Services.",
    coachBullets: [
      "Check Risk Controls on Anchor. #help-risk for Jobber blocks; #help_support + @hey_financial_services for Stripe reasons.",
      "When blocking is removed, Anchor moves them to the appropriate state.",
    ],
  },
  {
    value: "on_by_default_timeout",
    code: 910,
    label: "On by default (timeout)",
    moduleOutcome: "incomplete",
    summary: "On by default but Stripe disabled charges; onboarding/bank not finished in time (30 days or $5k).",
    trainingHint: "M03: needs work; prioritize finishing hosted onboarding + bank; Payments AM may outreach.",
    coachBullets: [
      "Charges disabled; payouts disabled; requirements due; on-by-default flag still on.",
      "Completing onboarding + bank should move them toward Verifying or Enabled.",
    ],
  },
  {
    value: "onboarded_timeout",
    code: 911,
    label: "Onboarded (timeout)",
    moduleOutcome: "incomplete",
    summary: "Payouts disabled; no bank within 90 days of onboarded; may still collect.",
    trainingHint: "M03: needs work; get a bank connected; Payments AM may outreach.",
    coachBullets: [
      "Not On By Default; was in onboarded 90+ days without bank; payouts disabled.",
    ],
  },
];

const JOBBER_PAYMENTS_STATUS_BY_VALUE = Object.fromEntries(
  JOBBER_PAYMENTS_STATUSES.map((s) => [s.value, s])
);

function saveJourneys(journeys) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(journeys));
}

function emptyModuleState() {
  const modules = {};
  for (const m of MODULES) {
    modules[m.id] = {
      status: "incomplete",
      notes: "",
      guideHighlights: {},
      guideHighlightSessions: {},
      moduleResourcesChecked: {},
      homeworkCustom: [],
      homeworkRecommendedChecked: [false, false],
    };
  }
  return modules;
}

function defaultSectionUi() {
  return {
    accountCollapsed: false,
    detailsCollapsed: false,
    learningCollapsed: false,
  };
}

function getSectionUi(j) {
  const d = defaultSectionUi();
  const u = j.sectionUi || {};
  return { ...d, ...u };
}

function defaultLearningUi() {
  return {
    readingModuleId: null,
    readingSource: null,
    readingContextSessionId: null,
    libraryDrawerCollapsed: true,
    /** Per module (multi-session): { sessionId }; default session when opening the session picker (with filter). */
    checklistRecording: {},
    /** Per module id → session id: filter checklist to that session’s tags (null = show all). */
    guideSessionFilter: {},
  };
}

function getLearningUi(j) {
  const d = defaultLearningUi();
  const u = j.learningUi && typeof j.learningUi === "object" ? j.learningUi : {};
  return {
    ...d,
    ...u,
    readingSource:
      u.readingSource === "workspace" || u.readingSource === "past" || u.readingSource === "library"
        ? u.readingSource
        : d.readingSource,
    checklistRecording:
      u.checklistRecording && typeof u.checklistRecording === "object" ? u.checklistRecording : d.checklistRecording,
    guideSessionFilter: sanitizeGuideSessionFilterObject(
      j,
      u.guideSessionFilter && typeof u.guideSessionFilter === "object" ? u.guideSessionFilter : {}
    ),
  };
}

function resolveWorkspaceSessionId(j) {
  const sessions = getPathSessions(j);
  if (!sessions.length) return null;
  for (const s of sessions) {
    for (const id of s.moduleIds || []) {
      if (moduleById(id) && !isDone(getModuleEntry(j, id))) return s.id;
    }
  }
  return sessions[0].id;
}

function sessionHasModule(sessions, sessionId, moduleId) {
  const s = sessions.find((x) => x.id === sessionId);
  return s ? (s.moduleIds || []).includes(moduleId) : false;
}

function findSessionIdContainingModule(sessions, moduleId) {
  for (const s of sessions) {
    if ((s.moduleIds || []).includes(moduleId)) return s.id;
  }
  return null;
}

function sessionIdsContainingModule(j, moduleId) {
  const out = [];
  for (const s of getPathSessions(j)) {
    if ((s.moduleIds || []).includes(moduleId)) out.push(s.id);
  }
  return out;
}

function formatSessionLineForId(j, sessionId) {
  const sessions = getPathSessions(j);
  const idx = sessions.findIndex((s) => s.id === sessionId);
  if (idx < 0) return "";
  const s = sessions[idx];
  const title = (s.title || "").trim() || defaultSessionTitleAtIndex(idx);
  const d = s.date ? formatSessionDate(s.date) : "";
  return d ? `${title} (${d})` : title;
}

/** Multi-session modules: which session gets new checklist tags in “All” view (set by session chips / context). */
function getChecklistRecording(j, moduleId) {
  const ids = sessionIdsContainingModule(j, moduleId);
  if (ids.length < 2) {
    return { multi: false, sessionId: null, line: "", placementFull: "" };
  }
  const lu = getLearningUi(j);
  const row = lu.checklistRecording?.[moduleId] || {};
  let sessionId = row.sessionId || lu.readingContextSessionId || ids[0];
  if (!sessionId || !ids.includes(sessionId)) sessionId = ids[0];
  const placementFull = sessionPlacementLabel(j, moduleId) || "";
  return {
    multi: true,
    sessionId,
    line: formatSessionLineForId(j, sessionId),
    placementFull,
  };
}

function sanitizeGuideSessionFilterObject(j, raw) {
  if (!raw || typeof raw !== "object") return {};
  const out = {};
  for (const [mid, sid] of Object.entries(raw)) {
    if (!moduleById(mid) || typeof sid !== "string" || !sid) continue;
    const ids = sessionIdsContainingModule(j, mid);
    if (ids.includes(sid)) out[mid] = sid;
  }
  return out;
}

/** When set, checklist shows only items tagged to this session; "All" shows union. */
function getGuideSessionFilter(j, moduleId) {
  const lu = getLearningUi(j);
  const gsf = lu.guideSessionFilter;
  if (!gsf || typeof gsf !== "object") return null;
  const sid = gsf[moduleId];
  if (typeof sid !== "string" || !sid) return null;
  const ids = sessionIdsContainingModule(j, moduleId);
  return ids.includes(sid) ? sid : null;
}

/** Session id when toggling a checklist item (session filter wins; else single-session placement). */
function effectiveSessionForGuideAttribution(j, moduleId) {
  const ids = sessionIdsContainingModule(j, moduleId);
  if (!ids.length) return null;
  const filterSid = getGuideSessionFilter(j, moduleId);
  if (filterSid && ids.includes(filterSid)) return filterSid;
  const rec = getChecklistRecording(j, moduleId);
  if (rec.multi && rec.sessionId && ids.includes(rec.sessionId)) return rec.sessionId;
  if (!rec.multi && ids.length === 1) return ids[0];
  return null;
}

/** Column accent: session that holds the open guide’s module, else first session with incomplete work. */
function resolveAccentSessionId(j) {
  const sessions = getPathSessions(j);
  if (!sessions.length) return null;
  const lu = getLearningUi(j);
  const mid = lu.readingModuleId;
  if (mid && moduleById(mid)) {
    if (lu.readingContextSessionId && sessionHasModule(sessions, lu.readingContextSessionId, mid)) {
      return lu.readingContextSessionId;
    }
    const placed = findSessionIdContainingModule(sessions, mid);
    if (placed) return placed;
  }
  return resolveWorkspaceSessionId(j);
}

function readingPaneContextLine(j, moduleId) {
  const lu = getLearningUi(j);
  if (lu.readingModuleId !== moduleId) return "";
  if (lu.readingSource === "library") return "Source · Module library";
  const sessions = getPathSessions(j);
  let sid = lu.readingContextSessionId;
  if (lu.readingSource === "workspace") {
    if (!sid || !sessionHasModule(sessions, sid, moduleId)) {
      sid = findSessionIdContainingModule(sessions, moduleId);
    }
    if (!sid) return "";
    const idx = sessions.findIndex((x) => x.id === sid);
    const s = idx >= 0 ? sessions[idx] : null;
    const title = s ? (s.title || "").trim() || defaultSessionTitleAtIndex(idx) : "Session";
    const d = s?.date ? formatSessionDate(s.date) : "";
    return d ? `${title} (${d})` : title;
  }
  if (lu.readingSource === "past") {
    if (!sid) return "";
    const idx = sessions.findIndex((x) => x.id === sid);
    const s = idx >= 0 ? sessions[idx] : null;
    const title = s ? (s.title || "").trim() || defaultSessionTitleAtIndex(idx) : "Session";
    const d = s?.date ? formatSessionDate(s.date) : "";
    return `Reference · ${d ? `${title} (${d})` : title}`;
  }
  return "";
}

function applyReadingSelection(j, persist, moduleId, source, contextSessionId) {
  if (!moduleId || !moduleById(moduleId)) return;
  const lu = getLearningUi(j);
  const src =
    source === "past" || source === "library" || source === "workspace" ? source : "workspace";
  const sessions = getPathSessions(j);
  let ctx = contextSessionId || null;
  if (!ctx && src === "library") {
    const placedIn = sessions.filter((s) => (s.moduleIds || []).includes(moduleId));
    if (placedIn.length === 1) ctx = placedIn[0].id;
  }
  const sessionIdsForMod = sessionIdsContainingModule(j, moduleId);
  const prevCr =
    lu.checklistRecording && typeof lu.checklistRecording === "object" ? { ...lu.checklistRecording } : {};
  let checklistRecording = { ...prevCr };
  if (sessionIdsForMod.length >= 2) {
    let sidForRec = ctx;
    if (!sidForRec || !sessionIdsForMod.includes(sidForRec)) sidForRec = sessionIdsForMod[0];
    checklistRecording[moduleId] = { sessionId: sidForRec };
  } else {
    const { [moduleId]: _drop, ...rest } = checklistRecording;
    checklistRecording = rest;
  }

  const updated = {
    ...j,
    learningUi: {
      ...lu,
      readingModuleId: moduleId,
      readingSource: src,
      readingContextSessionId: ctx,
      checklistRecording,
    },
  };
  persist(updated);
  Object.assign(j, updated);
  renderApp();
}

function isAccountComplete(j) {
  const p = j.accountPlan;
  const planOk = p === "connect" || p === "grow" || p === "plus";
  const jp = j.jobberPaymentsStatus;
  const jpOk = typeof jp === "string" && !!JOBBER_PAYMENTS_STATUS_BY_VALUE[jp];
  return planOk && jpOk;
}

/** First time plan + any add-on are both set: collapse once; later edits leave section open/closed per user. */
function applyAccountSectionFirstTimeCollapse(updated) {
  if (updated.accountAutoCollapsedOnce) return updated;
  if (!isAccountComplete(updated) || !hasAnyAccountAddOn(updated)) return updated;
  return {
    ...updated,
    sectionUi: { ...getSectionUi(updated), accountCollapsed: true },
    accountAutoCollapsedOnce: true,
  };
}

function isDetailsComplete(j) {
  const name = (j.businessName || "").trim();
  return name.length > 0 && j.persona != null && j.persona !== "";
}

function isLearningComplete(j) {
  const ids = scheduledModuleIdSet(j);
  if (!ids.size) return false;
  return [...ids].every((id) => isDone(getModuleEntry(j, id)));
}

function createJourney(payload) {
  const now = new Date().toISOString();
  const rawP = payload.persona;
  const persona =
    rawP != null && String(rawP).trim() !== "" ? String(rawP) : null;
  const pathSessions = emptyDefaultPathSessions();
  return {
    id: newId(),
    businessName: payload.businessName?.trim() || "Untitled business",
    persona,
    modules: emptyModuleState(),
    sectionUi: defaultSectionUi(),
    learningUi: defaultLearningUi(),
    pathSessions,
    pathModuleIds: flattenSessionsToPath(pathSessions),
    moduleIdSchemeVersion: MODULE_ID_SCHEME_VERSION,
    accountPlan: null,
    accountAddOns: defaultAccountAddOns(),
    accountAutoCollapsedOnce: false,
    jobberPaymentsStatus: null,
    createdAt: now,
    updatedAt: now,
  };
}

function getModuleEntry(journey, moduleId) {
  const e = journey.modules?.[moduleId] || {};
  return {
    status:
      e.status === "complete" ||
      e.status === "completeManual" ||
      e.status === "priorKickoff" ||
      e.status === "incomplete" ||
      e.status === "inProgress"
        ? e.status
        : "incomplete",
    notes: typeof e.notes === "string" ? e.notes : "",
    guideHighlights: sanitizeModuleGuideHighlights(moduleId, e.guideHighlights),
    guideHighlightSessions: sanitizeGuideHighlightSessions(moduleId, e.guideHighlightSessions),
    moduleResourcesChecked: sanitizeModuleResourcesChecked(moduleId, e.moduleResourcesChecked),
    homeworkCustom: sanitizeHomeworkCustom(e.homeworkCustom),
    homeworkRecommendedChecked: sanitizeHomeworkRecommendedChecked(e.homeworkRecommendedChecked),
  };
}

/** Sets M03 (Jobber Payments) completion from Account → Jobber Payments status. */
function applyJobberPaymentsStatusToM03(j) {
  const key = j.jobberPaymentsStatus;
  if (!key) return j;
  const def = JOBBER_PAYMENTS_STATUS_BY_VALUE[key];
  if (!def) return j;
  const status = def.moduleOutcome === "complete" ? "complete" : "incomplete";
  return {
    ...j,
    modules: {
      ...j.modules,
      M03: { ...getModuleEntry(j, "M03"), status },
    },
  };
}

function isDone(entry) {
  return (
    entry.status === "complete" ||
    entry.status === "completeManual" ||
    entry.status === "priorKickoff"
  );
}

/** Adjust module status from coverage checklist progress (M03 excluded; Jobber Payments drives that). */
function syncModuleStatusFromGuideProgress(j, moduleId) {
  if (moduleId === "M03") return null;
  if (!moduleById(moduleId)) return null;
  const entry = getModuleEntry(j, moduleId);
  const st = entry.status;
  if (moduleGuideItemMeta(moduleId).length === 0) return null;

  const { done, total } = countModuleGuideProgress(moduleId, entry);
  if (total === 0) return null;

  if (st === "priorKickoff") return null;

  if (st === "completeManual") {
    if (done === total) return "complete";
    if (done > 0) return "inProgress";
    return null;
  }

  if (done === total) {
    return st !== "complete" ? "complete" : null;
  }
  if (done > 0) {
    if (st === "incomplete") return "inProgress";
    if (st === "complete") return "inProgress";
    return null;
  }
  if (st === "inProgress") return "incomplete";
  if (st === "complete") return "incomplete";
  return null;
}

function patchJourneyAfterGuideData(j, moduleId, highlights, sess) {
  const modBase = j.modules[moduleId] || {};
  const guideHighlights = sanitizeModuleGuideHighlights(moduleId, highlights);
  const guideHighlightSessions = sanitizeGuideHighlightSessions(moduleId, sess);
  const prevStatus = getModuleEntry(j, moduleId).status;
  let nextModule = {
    ...modBase,
    status: modBase.status != null && modBase.status !== "" ? modBase.status : prevStatus,
    guideHighlights,
    guideHighlightSessions,
  };
  const jAfterGuide = { ...j, modules: { ...j.modules, [moduleId]: nextModule } };
  const synced = syncModuleStatusFromGuideProgress(jAfterGuide, moduleId);
  if (synced) nextModule = { ...nextModule, status: synced };
  return { ...j, modules: { ...j.modules, [moduleId]: nextModule } };
}

function getRecommendedNextId(journey) {
  const slots = flattenSessionSlotsOrdered(getPathSessions(journey));
  if (!slots.length) return null;
  for (const id of slots) {
    const e = getModuleEntry(journey, id);
    if (!isDone(e)) return id;
  }
  return null;
}

function progressCounts(journey) {
  const ids = [...scheduledModuleIdSet(journey)];
  if (!ids.length) return { done: 0, total: 0 };
  let done = 0;
  for (const id of ids) {
    if (isDone(getModuleEntry(journey, id))) done++;
  }
  return { done, total: ids.length };
}

function parseHash() {
  const h = window.location.hash.slice(1) || "/";
  const parts = h.split("/").filter(Boolean);
  if (parts[0] === "journey" && parts[1]) return { name: "journey", id: parts[1] };
  if (parts[0] === "new") return { name: "new" };
  return { name: "home" };
}

function navigate(name, id) {
  if (name === "home") window.location.hash = "/";
  else if (name === "new") window.location.hash = "/new";
  else if (name === "journey") window.location.hash = `/journey/${id}`;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Gear menu in the header; reset clears localStorage journeys. */
function renderAppSettingsMenu() {
  return `
  <details class="app-settings-dropdown">
    <summary class="app-settings-summary" aria-label="App settings" title="App settings">
      <svg class="app-settings-gear-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </svg>
    </summary>
    <div class="app-settings-panel">
      <p class="app-settings-durability">Data stays only in this browser; clearing site data or switching devices loses journeys unless you export.</p>
      <p class="app-settings-last-export"><strong>Last backup export:</strong> ${escapeHtml(getLastBackupExportLabel())}</p>
      <button type="button" class="btn btn-ghost btn-small app-settings-reset" data-app-reset>Reset app data…</button>
      <p class="app-settings-hint">Reset removes every journey. Export a JSON backup from the home screen first if you need a copy.</p>
    </div>
  </details>`;
}

async function handleAppRootClick(e) {
  const btn = e.target.closest("[data-app-reset]");
  if (!btn) return;
  e.preventDefault();
  const ok = await showAppConfirm({
    title: "Reset app data?",
    message:
      "Remove all journeys and wipe this app's data in this browser? You cannot undo this.",
    confirmLabel: "Reset app data",
    cancelLabel: "Cancel",
    variant: "danger",
  });
  if (!ok) return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
  const root = document.getElementById("app");
  root?.querySelector("details.app-settings-dropdown[open]")?.removeAttribute("open");
  navigate("home");
  renderApp();
}

function renderApp() {
  const root = document.getElementById("app");
  if (!root) return;

  try {
    const route = parseHash();
    const journeys = loadJourneys();

    if (route.name === "home") {
      root.innerHTML = renderHome(journeys);
      bindHome(journeys);
    } else if (route.name === "new") {
      root.innerHTML = renderNew();
      bindNew();
    } else if (route.name === "journey") {
      const j = journeys.find((x) => x.id === route.id);
      if (!j) {
        navigate("home");
        renderApp();
        return;
      }
      root.innerHTML = renderJourneyDetail(j);
      bindJourneyDetail(j, journeys);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    root.innerHTML = `
      <div class="form-panel error-panel">
        <h2>Something broke</h2>
        <p>${escapeHtml(msg)}</p>
        <p class="small">Open DevTools → Console for the full stack. Try a hard refresh (⌘⇧R).</p>
        <button type="button" class="btn btn-primary" id="btn-retry-app">Try again</button>
      </div>`;
    document.getElementById("btn-retry-app")?.addEventListener("click", () => {
      window.location.reload();
    });
  }
}

function renderHome(journeys) {
  const cards =
    journeys.length === 0
      ? `<div class="empty-state"><p>No journeys yet. Create one to track an SP and your learning plan.</p></div>`
      : journeys
          .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
          .map((j) => {
            const { done, total } = progressCounts(j);
            const pct = total ? Math.round((done / total) * 100) : 0;
            const persona = personaByValue(j.persona).label;
            return `
            <a class="journey-card" href="#/journey/${j.id}">
              <h2>${escapeHtml(j.businessName)}</h2>
              <div class="meta">${escapeHtml(persona)} · ${escapeHtml(done)}/${total} modules · updated ${formatDate(j.updatedAt)}</div>
              <div class="progress-bar"><span style="width:${pct}%"></span></div>
            </a>`;
          })
          .join("");

  return `
    <header class="app-header">
      <div>
        <h1>Training Sherpa</h1>
        <p>Your onboarding journeys & learning plans; stored in this browser.</p>
      </div>
      <div class="app-header-actions">
        <a class="btn btn-primary" href="#/new">+ New journey</a>
        ${renderAppSettingsMenu()}
      </div>
    </header>
    <div class="toolbar">
      <button type="button" class="btn btn-ghost btn-small" id="btn-export">Export backup (JSON)</button>
      <label class="btn btn-ghost btn-small" style="cursor:pointer">
        Import backup
        <input type="file" id="import-file" accept="application/json" class="sr-only" />
      </label>
    </div>
    <p class="home-durability-hint">Journeys live in this browser only. <strong>Last export:</strong> ${escapeHtml(getLastBackupExportLabel())}</p>
    <div class="journey-grid">${cards}</div>
  `;
}

function formatDate(iso) {
  if (!iso) return "-";
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return iso;
  }
}

function renderNew() {
  return `
    <header class="app-header">
      <div>
        <h1>New journey</h1>
        <p>Start with the business name. Choose persona under <strong>Business details</strong> on the next screen.</p>
      </div>
      <div class="app-header-actions">
        <a class="btn btn-ghost" href="#/">← All journeys</a>
        ${renderAppSettingsMenu()}
      </div>
    </header>
    <form class="form-panel" id="form-new">
      <h2>About this business</h2>
      <div class="form-row">
        <label for="businessName">Business name</label>
        <input id="businessName" name="businessName" required placeholder="e.g. ACME Plumbing" autocomplete="organization" />
      </div>
      <div class="form-actions">
        <button type="submit" class="btn btn-primary">Create journey</button>
        <a class="btn btn-ghost" href="#/">Cancel</a>
      </div>
    </form>
  `;
}

function renderModuleReadingPanel(j, moduleId) {
  const m = moduleById(moduleId);
  if (!m) return `<p class="reading-pane-fallback">Unknown module.</p>`;
  const entry = getModuleEntry(j, moduleId);
  const nextId = getRecommendedNextId(j);
  const pathSet = new Set(getPathModuleIds(j));
  const isNext = moduleId === nextId && moduleScheduledOnPlan(j, moduleId) && !isDone(entry);
  const inPath = pathSet.has(moduleId);
  const placement = sessionPlacementLabel(j, moduleId);
  const st =
    entry.status === "priorKickoff" ||
    entry.status === "complete" ||
    entry.status === "completeManual" ||
    entry.status === "incomplete" ||
    entry.status === "inProgress"
      ? entry.status
      : "incomplete";
  const incompleteChecked = st === "incomplete" ? "checked" : "";
  const inProgressChecked = st === "inProgress" ? "checked" : "";
  const priorChecked = st === "priorKickoff" ? "checked" : "";
  const completeChecked = st === "complete" ? "checked" : "";
  const completeManualChecked = st === "completeManual" ? "checked" : "";
  const completionName = `mod-completion-${m.id}`;
  const onPlan = moduleScheduledOnPlan(j, moduleId);
  const completionSection = onPlan
    ? `<section class="reading-pane-section reading-pane-section--completion" aria-labelledby="reading-completion-${m.id}">
        <h3 class="reading-pane-section-title" id="reading-completion-${m.id}">Completion</h3>
        <fieldset class="module-completion-fieldset module-completion-fieldset--reading">
          <legend class="module-completion-legend module-completion-legend--sr">Status</legend>
          <div class="module-completion-options module-completion-options--reading-row" role="radiogroup" aria-label="Completion for ${escapeHtml(m.topic)}">
            <label class="module-completion-option module-completion-option--prior">
              <input type="radio" name="${completionName}" value="priorKickoff" ${priorChecked} data-module-completion="${m.id}" />
              <span>Prior kickoff</span>
            </label>
            <label class="module-completion-option">
              <input type="radio" name="${completionName}" value="incomplete" ${incompleteChecked} data-module-completion="${m.id}" />
              <span>Not started</span>
            </label>
            <label class="module-completion-option module-completion-option--progress">
              <input type="radio" name="${completionName}" value="inProgress" ${inProgressChecked} data-module-completion="${m.id}" />
              <span>In progress</span>
            </label>
            <label class="module-completion-option module-completion-option--done">
              <input type="radio" name="${completionName}" value="complete" ${completeChecked} data-module-completion="${m.id}" />
              <span>Complete</span>
            </label>
            <label class="module-completion-option module-completion-option--manual-done">
              <input type="radio" name="${completionName}" value="completeManual" ${completeManualChecked} data-module-completion="${m.id}" />
              <span>Mark as Complete</span>
            </label>
          </div>
        </fieldset>
      </section>`
    : `<section class="reading-pane-section reading-pane-section--completion reading-pane-section--completion--na" aria-labelledby="reading-completion-${m.id}">
        <h3 class="reading-pane-section-title" id="reading-completion-${m.id}">Completion</h3>
        <p class="reading-pane-completion-na">Not scheduled in any session; not applicable for this plan.</p>
      </section>`;
  const jpHint =
    m.id === "M03" && j.jobberPaymentsStatus && JOBBER_PAYMENTS_STATUS_BY_VALUE[j.jobberPaymentsStatus]
      ? `<p class="module-card-jp-hint"><span class="module-card-jp-hint-label">Payments status</span> ${escapeHtml(JOBBER_PAYMENTS_STATUS_BY_VALUE[j.jobberPaymentsStatus].label)} (${escapeHtml(JOBBER_PAYMENTS_STATUS_BY_VALUE[j.jobberPaymentsStatus].code)}), ${escapeHtml(JOBBER_PAYMENTS_STATUS_BY_VALUE[j.jobberPaymentsStatus].trainingHint)}</p>`
      : "";
  const dpnHint =
    m.id === "M04" && isDpnLockedOnByAccount(j)
      ? `<p class="module-card-jp-hint"><span class="module-card-jp-hint-label">DPN</span> Required for this account; start setup as soon as possible. Final activation can take up to ~3 weeks from initial setup.</p>`
      : "";
  const showOptionalBadge = m.optional && !(m.id === "M04" && isDpnLockedOnByAccount(j));
  const ctx = readingPaneContextLine(j, moduleId);
  const readingSrc = getLearningUi(j).readingSource;
  const showTopContext = ctx && readingSrc !== "workspace";
  const rec = getChecklistRecording(j, moduleId);
  const filterSid = rec.multi ? getGuideSessionFilter(j, moduleId) : null;
  const { done: hiDone, total: hiTotal } = countModuleGuideProgress(m.id, entry, filterSid || undefined);
  const meterAria =
    filterSid && hiTotal > 0
      ? `${formatSessionLineForId(j, filterSid)}: ${hiDone} of ${hiTotal} checklist items tagged`
      : `Coverage checklist: ${hiDone} of ${hiTotal} checked`;
  const meterHtml =
    hiTotal > 0
      ? `<span class="reading-pane-meter" aria-label="${escapeHtml(meterAria)}">${hiDone}/${hiTotal} checked</span>`
      : "";
  const formalInline = moduleShowsFormalTitle(m)
    ? `<span class="reading-pane-formal-title reading-pane-formal-title--inline" title="${escapeHtml(m.title)}">${escapeHtml(m.title)}</span>`
    : "";
  let sessionMetaHtml;
  if (rec.multi && placement) {
    const chipIds = sessionIdsContainingModule(j, moduleId);
    const selVal = filterSid || "";
    const sessionOptions = chipIds
      .map((sid) => {
        const line = formatSessionLineForId(j, sid);
        const sel = sid === selVal ? " selected" : "";
        return `<option value="${escapeHtml(sid)}"${sel}>${escapeHtml(line)}</option>`;
      })
      .join("");
    const allSel = !filterSid ? " selected" : "";
    const selectTitle = filterSid
      ? `Editing checklist for this session only. Uncheck or check items to update coverage for this session.`
      : `View-only: combined coverage across sessions. Pick a session below to add or remove checks for that session.`;
    sessionMetaHtml = `<div class="reading-pane-session-multi">
      <label class="reading-pane-session-select-label">
        <span class="reading-pane-session-select-caption">Session</span>
        <select
          class="reading-pane-session-select"
          data-guide-session-select="1"
          data-module-id="${escapeHtml(moduleId)}"
          aria-label="All sessions: view only. Choose a session to edit checklist items for that session."
          title="${escapeHtml(selectTitle)}"
        >
          <option value=""${allSel}>All sessions</option>
          ${sessionOptions}
        </select>
      </label>
    </div>`;
  } else if (placement) {
    sessionMetaHtml = `<span class="reading-pane-session-label" title="${escapeHtml(placement)}">${escapeHtml(placement)}</span>`;
  } else {
    sessionMetaHtml = `<span class="reading-pane-session-label reading-pane-session-label--muted" title="Not in any session">Not in any session</span>`;
  }
  const accountBlock = `${renderModulePlanFeatures(m.id, j.accountPlan)}${jpHint}${dpnHint}${
    isNext ? `<p class="module-card-next">Suggested focus next</p>` : ""
  }`;
  const accountSection = accountBlock.trim()
    ? `<section class="reading-pane-section reading-pane-section--account" aria-labelledby="reading-account-${m.id}">
        <h3 class="reading-pane-section-title" id="reading-account-${m.id}">Account &amp; plan notes</h3>
        <div class="reading-pane-account-body">${accountBlock}</div>
      </section>`
    : "";
  const guideFilterHint =
    filterSid && rec.multi
      ? `<span class="reading-pane-guide-filter-hint"> · ${escapeHtml(formatSessionLineForId(j, filterSid))}</span>`
      : "";
  const guideBody = renderModuleGuideSection(m, entry, j);
  const guideSection = guideBody.trim()
    ? `<section class="reading-pane-section reading-pane-section--guide" aria-labelledby="reading-guide-${m.id}">
        <h3 class="reading-pane-section-title" id="reading-guide-${m.id}">Coverage checklist${guideFilterHint}</h3>
        ${guideBody}
      </section>`
    : "";
  const relatedResourcesSection =
    getModuleResources(m.id).length > 0 ? renderModuleRelatedResourcesSection(m, entry) : "";
  const homeworkSection = renderModuleHomeworkSection(m, entry);
  return `
    <div class="reading-pane-inner${isNext ? " reading-pane-inner--next" : ""}${inPath ? " reading-pane-inner--in-path" : " reading-pane-inner--off-path"}">
      <div class="reading-pane-sticky">
        ${showTopContext ? `<p class="reading-pane-context">${escapeHtml(ctx)}</p>` : ""}
        <header class="reading-pane-identity" aria-label="Module identity">
          <div class="reading-pane-header-line">
            <div class="reading-pane-header-left">
              <h2 class="reading-pane-title">${escapeHtml(m.topic)}</h2>
              ${formalInline}
              ${showOptionalBadge ? `<span class="module-card-badge module-card-badge--optional">Optional</span>` : ""}
            </div>
            <div class="reading-pane-header-right${rec.multi ? " reading-pane-header-right--multi" : ""}">
              <div class="reading-pane-header-right-cluster">
                <div class="reading-pane-session-meta">${sessionMetaHtml}</div>
                <span class="reading-pane-header-divider" aria-hidden="true">|</span>
                <div class="reading-pane-header-right-tools">
                  ${meterHtml}
                  <span class="module-card-id reading-pane-module-code" title="${escapeHtml(m.id)}">${escapeHtml(m.id)}</span>
                </div>
              </div>
            </div>
          </div>
        </header>
      </div>
      ${accountSection}
      ${guideSection}
      ${homeworkSection}
      ${relatedResourcesSection}
      ${completionSection}
    </div>`;
}

function renderReadingPane(j) {
  const lu = getLearningUi(j);
  const mid = lu.readingModuleId;
  if (!mid || !moduleById(mid)) {
    return `<div class="reading-pane reading-pane--empty" id="reading-pane" aria-live="polite">
      <p class="reading-pane-empty-title">Module guide</p>
      <ol class="reading-pane-empty-steps">
        <li>Use the <strong>Module library</strong> at the top to preview a topic (click) or add it by <strong>dragging</strong> a row into a session column.</li>
        <li>Click any module in a session column or the library to open its guide here. Your <strong>last selection</strong> stays until you pick another.</li>
        <li>A subtle <strong>border and hatch pattern</strong> marks the session column that matches your open guide (when that module is on the plan).</li>
      </ol>
    </div>`;
  }
  return `<div class="reading-pane" id="reading-pane" aria-live="polite">${renderModuleReadingPanel(j, mid)}</div>`;
}

function renderPathItemsForSession(j, s) {
  return (s.moduleIds || [])
    .map((id, index) => {
      const m = moduleById(id);
      if (!m) return "";
      return `
      <li class="path-item" data-path-index="${index}" data-module-id="${escapeHtml(m.id)}" data-session-id="${escapeHtml(s.id)}">
        <div
          class="path-item-drag"
          draggable="true"
          data-path-index="${index}"
          data-module-id="${escapeHtml(m.id)}"
          data-session-id="${escapeHtml(s.id)}"
        >
          <span class="path-item-grip" aria-hidden="true">⋮⋮</span>
          <button
            type="button"
            class="path-item-hit"
            data-reading-module="${escapeHtml(m.id)}"
            data-reading-source="workspace"
            data-reading-context-session="${escapeHtml(s.id)}"
            aria-label="Open guide for ${escapeHtml(m.topic)} (${escapeHtml(m.id)}). Drag the row to reorder or move sessions."
            title="${escapeHtml(m.topic)}"
          >
            <span class="path-item-body">
              <span class="path-item-id">${escapeHtml(m.id)}</span>
              <span class="path-item-topic">${escapeHtml(m.topic)}</span>
            </span>
          </button>
        </div>
        <button type="button" class="path-item-remove" draggable="false" data-path-remove-index="${index}" data-session-id="${escapeHtml(s.id)}" aria-label="Remove ${escapeHtml(m.topic)} from this session" title="Remove from session">×</button>
      </li>`;
    })
    .join("");
}

function renderSessionBoardColumn(j, s, sessionIndex, accentSessionId) {
  const sessions = getPathSessions(j);
  const canDeleteSession = sessions.length > 2;
  const isAccent = accentSessionId && s.id === accentSessionId;
  const pathItems = renderPathItemsForSession(j, s);
  const dateVal = s.date && /^\d{4}-\d{2}-\d{2}$/.test(s.date) ? escapeHtml(s.date) : "";
  const dateHuman = formatSessionDateDisplay(s.date);
  const dateShort = formatSessionDateHeading(s.date);
  const dateAria = dateHuman ? `Session date, ${dateHuman}` : "Set session date";
  const titleForInput = (s.title || "").trim() || defaultSessionTitleAtIndex(sessionIndex);
  const colLabel = (s.title || "").trim() || defaultSessionTitleAtIndex(sessionIndex);
  return `<section
      class="path-session path-session--board${isAccent ? " path-session--accent" : ""}"
      data-session-id="${escapeHtml(s.id)}"
      aria-label="${escapeHtml(colLabel)}"
    >
        <div class="path-session-header">
          <input
            type="text"
            class="path-session-header-input path-session-header-input--text"
            data-session-field="title"
            data-session-id="${escapeHtml(s.id)}"
            value="${escapeHtml(titleForInput)}"
            maxlength="120"
            aria-label="Session name"
          />
          <div class="path-session-header-date-row">
            ${
              dateShort
                ? `<span class="path-session-date-heading" title="${escapeHtml(dateHuman || dateShort)}">${escapeHtml(dateShort)}</span>`
                : ""
            }
            <div
              class="path-session-date-wrap${dateVal ? " path-session-date-wrap--set" : ""}"
              data-session-date-wrap
              data-session-id="${escapeHtml(s.id)}"
            >
              <div class="path-session-date-face" aria-hidden="true">
                <svg
                  class="path-session-date-icon"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  aria-hidden="true"
                >
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                  <line x1="16" y1="2" x2="16" y2="6" />
                  <line x1="8" y1="2" x2="8" y2="6" />
                  <line x1="3" y1="10" x2="21" y2="10" />
                </svg>
              </div>
              <input
                type="date"
                class="path-session-header-input path-session-header-input--date path-session-header-date-input"
                data-session-field="date"
                data-session-id="${escapeHtml(s.id)}"
                value="${dateVal}"
                aria-label="${escapeHtml(dateAria)}"
              />
            </div>
            <button
              type="button"
              class="path-session-header-export"
              data-session-copy-coverage="${escapeHtml(s.id)}"
              aria-label="Copy session summary with covered topics, homework, and selected Help articles to clipboard"
              title="Copy session name, covered module topics, checked homework, and Help articles checked under Related resources"
            >
              <svg class="path-session-copy-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
            </button>
            ${
              canDeleteSession
                ? `<button type="button" class="path-session-header-remove" data-session-delete="${escapeHtml(s.id)}" aria-label="Remove session" title="Remove session">×</button>`
                : ""
            }
          </div>
        </div>
        <ol class="path-list" data-drop-zone="session" data-session-id="${escapeHtml(s.id)}">
          ${pathItems || `<li class="path-empty">Drop modules from the library or add below.</li>`}
        </ol>
      </section>`;
}

function renderLearningWorkspace(j) {
  const sessions = getPathSessions(j);
  const accentSessionId = resolveAccentSessionId(j);
  const totalSlots = sessions.reduce((n, s) => n + (s.moduleIds?.length || 0), 0);
  const uniqueScheduled = scheduledModuleIdSet(j).size;
  const modulesForLibrary = getOrderedModulesForUi();
  const planModuleSet = scheduledModuleIdSet(j);
  const lu = getLearningUi(j);
  const libraryOpen = !lu.libraryDrawerCollapsed;

  const boardCols = sessions.length <= 1 ? 1 : sessions.length === 2 ? 2 : 3;
  const libraryGridRows =
    modulesForLibrary.length > 0 ? Math.ceil(modulesForLibrary.length / 2) : 1;

  const libraryItems = modulesForLibrary
    .map((m) => {
      const showAddOnTag =
        m.optional && !(m.id === "M04" && isDpnLockedOnByAccount(j));
      const addOnTag = showAddOnTag ? `<span class="path-library-addon">Add-on</span>` : "";
      const inPlan = planModuleSet.has(m.id);
      const inPlanTag = inPlan ? `<span class="path-library-in-plan" title="Already placed in at least one session">In plan</span>` : "";
      const liClass = `path-library-item${inPlan ? " path-library-item--in-plan" : ""}`;
      const a11yInPlan = inPlan ? " Already in your plan." : "";
      return `
      <li class="${liClass}" data-library-module="${escapeHtml(m.id)}">
        <div class="path-library-drag" draggable="true">
          <span class="path-library-grip" aria-hidden="true">⋮⋮</span>
          <button
            type="button"
            class="path-library-hit"
            data-reading-module="${escapeHtml(m.id)}"
            data-reading-source="library"
            aria-label="Open guide for ${escapeHtml(m.topic)} (${escapeHtml(m.id)}). Drag the row into a session to add it.${a11yInPlan}"
          >
            <span class="path-library-id">${escapeHtml(m.id)}</span>
            <span class="path-library-main">
              <span class="path-library-topic">${escapeHtml(m.topic)}</span>
              ${addOnTag}
              ${inPlanTag}
            </span>
          </button>
        </div>
      </li>`;
    })
    .join("");

  const sessionsBoard =
    sessions.length > 0
      ? `<div class="sessions-board sessions-board--cols-${boardCols}" role="region" aria-label="Training sessions (${sessions.length})">
          ${sessions.map((s, idx) => renderSessionBoardColumn(j, s, idx, accentSessionId)).join("")}
        </div>`
      : `<p class="learning-workspace-fallback">No sessions yet.</p>`;

  return `
    <div class="learning-workspace" id="path-builder">
      <details class="library-drawer library-drawer--workspace-top" id="library-drawer" data-library-drawer="1" ${libraryOpen ? "open" : ""}>
        <summary class="library-drawer-summary">
          <span class="library-drawer-title">Module library</span>
          <span class="path-column-count">(${modulesForLibrary.length})</span>
        </summary>
        <ul class="path-library-list" id="path-library-list" data-drop-zone="library" style="--library-rows: ${libraryGridRows}">
          ${libraryItems}
        </ul>
      </details>
      <div class="learning-stack">
        <div class="workspace-toolbar">
          <div class="workspace-toolbar-row">
            <span class="workspace-toolbar-meta">${sessions.length} sessions · ${totalSlots} placed · ${uniqueScheduled} unique</span>
            <button type="button" class="btn btn-ghost btn-small path-add-session" id="path-add-session">+ Session</button>
          </div>
        </div>
        ${sessionsBoard}
        <div class="learning-col learning-col--read">
          ${renderReadingPane(j)}
        </div>
      </div>
    </div>
  `;
}

function renderModuleGuideSection(m, entry, j) {
  const groups = moduleGuideGroups(m.id);
  if (!groups.length) return "";
  const rec = getChecklistRecording(j, m.id);
  const filterSid = rec.multi ? getGuideSessionFilter(j, m.id) : null;
  const checklistReadOnly = rec.multi && !filterSid;
  const checkedSet = checkedGuideItemIds(m.id, entry);
  const sess = sanitizeGuideHighlightSessions(m.id, entry.guideHighlightSessions);
  const blocks = groups
    .map((g) => {
      const items = g.items
        .map((it) => {
          const taggedHere = filterSid ? (sess[it.id] || []).includes(filterSid) : checkedSet.has(it.id);
          const checked = taggedHere ? "checked" : "";
          const coveredGlobally = checkedSet.has(it.id);
          const elsewhere = !!(filterSid && coveredGlobally && !(sess[it.id] || []).includes(filterSid));
          const itemClass = [
            "module-guide-item",
            filterSid ? "module-guide-item--filter-active" : "",
            elsewhere ? "module-guide-item--covered-elsewhere" : "",
            checklistReadOnly ? "module-guide-item--read-only" : "",
          ]
            .filter(Boolean)
            .join(" ");
          const roAttr = checklistReadOnly ? " disabled" : "";
          return `<div class="${itemClass}">
        <label class="module-guide-item-check">
        <span class="module-guide-checkbox-frame">
        <input type="checkbox" class="module-guide-checkbox-native"${roAttr} ${checked} data-module-guide-check="${escapeHtml(m.id)}" data-guide-item-id="${escapeHtml(it.id)}" />
        </span>
        ${renderGuideItemChecklistLabel(it)}
      </label>
    </div>`;
        })
        .join("");
      return `<div class="module-guide-group">
      <p class="module-guide-group-title">${escapeHtml(g.title)}</p>
      <div class="module-guide-items">${items}</div>
    </div>`;
    })
    .join("");
  const guideClass = [
    "module-guide",
    filterSid ? "module-guide--session-filter" : "",
    checklistReadOnly ? "module-guide--all-sessions-readonly" : "",
  ]
    .filter(Boolean)
    .join(" ");
  return `
    <div class="${guideClass}" aria-label="Coverage checklist for ${escapeHtml(m.topic)}">
      ${blocks}
    </div>`;
}

function renderModuleRelatedResourcesSection(m, entry) {
  const resources = getModuleResources(m.id);
  if (!resources.length) return "";
  const ack = entry.moduleResourcesChecked;
  const lis = resources.map((r) => {
    const titleLine = titleCaseEachWord(r.linkText || "").trim() || "Help article";
    const selChecked = ack[r.id] ? "checked" : "";
    const bodyHtml = renderModuleResourceBlurb(r);
    const payloadsEnc = encodeResourceBlurbPayloads([r]);
    return `<li class="module-homework-line module-related-resource-line">
        <div class="module-related-resource-line-stack" data-resource-blurb-wrap="1">
          <div class="module-related-resource-top-row">
            <label class="module-guide-item-check module-homework-line-label module-related-resource-select-label module-related-resource-top-label">
              <span class="module-guide-checkbox-frame">
                <input type="checkbox" class="module-guide-checkbox-native" ${selChecked} data-module-resource-check="${escapeHtml(m.id)}" data-resource-id="${escapeHtml(r.id)}" aria-label="Include in session export: ${escapeHtml(titleLine)}" />
              </span>
              <span class="module-guide-item-label">
                <span class="module-related-resource-combined-title module-homework-suggested-text">${escapeHtml(titleLine)}</span>
              </span>
            </label>
            <div class="module-related-resource-actions module-related-resource-actions--top">
              <button type="button" class="btn btn-ghost btn-small" data-resource-blurb-copy data-blurb-payload-list="${payloadsEnc}" aria-label="Copy this resource blurb">Copy</button>
              <button type="button" class="btn btn-ghost btn-small" data-resource-blurb-expand aria-expanded="false" aria-label="Expand resource description">Expand</button>
            </div>
          </div>
          <div class="module-related-resource-blurb-body module-related-resource-blurb-body--below-title" hidden>${bodyHtml}</div>
        </div>
      </li>`;
  });
  return `<section class="reading-pane-section reading-pane-section--related-resources" aria-labelledby="reading-related-${m.id}">
    <h3 class="reading-pane-section-title" id="reading-related-${m.id}">Related resources</h3>
    <ul class="module-homework-suggested-list module-related-resources-items" aria-label="Related Help articles">${lis.join("")}</ul>
  </section>`;
}

function renderModuleHomeworkSection(m, entry) {
  const [s1, s2] = getModuleHomeworkDefaults(m.id);
  const [rc0, rc1] = entry.homeworkRecommendedChecked;
  const custom = entry.homeworkCustom;
  const rec0 = rc0 ? "checked" : "";
  const rec1 = rc1 ? "checked" : "";
  const customLis = custom
    .map((h) => {
      const ch = h.checked ? "checked" : "";
      return `<li class="module-homework-custom-item">
      <label class="module-guide-item-check module-homework-custom-label">
        <span class="module-guide-checkbox-frame">
          <input type="checkbox" class="module-guide-checkbox-native" ${ch} data-homework-custom-check data-module-id="${escapeHtml(m.id)}" data-homework-item-id="${escapeHtml(h.id)}" aria-label="Assign this homework item" />
        </span>
        <span class="module-guide-item-label module-homework-custom-text">${escapeHtml(h.text)}</span>
      </label>
      <button type="button" class="module-homework-remove btn btn-ghost btn-small" data-homework-remove data-module-id="${escapeHtml(m.id)}" data-homework-item-id="${escapeHtml(h.id)}" aria-label="Remove homework item">Remove</button>
    </li>`;
    })
    .join("");
  return `<section class="reading-pane-section reading-pane-section--homework" aria-labelledby="reading-homework-${m.id}">
    <h3 class="reading-pane-section-title" id="reading-homework-${m.id}">Homework</h3>
    <p class="module-homework-intro">Check the items you want this SP to take on. Only checked lines are included when you copy the session summary.</p>
    <ul class="module-homework-suggested-list" aria-label="Recommended homework">
      <li class="module-homework-line">
        <label class="module-guide-item-check module-homework-line-label">
          <span class="module-guide-checkbox-frame">
            <input type="checkbox" class="module-guide-checkbox-native" ${rec0} data-homework-recommended data-module-id="${escapeHtml(m.id)}" data-homework-slot="0" aria-label="Assign recommended homework 1" />
          </span>
          <span class="module-guide-item-label">
            <span class="module-homework-badge">Recommended</span>
            <span class="module-homework-suggested-text">${escapeHtml(s1)}</span>
          </span>
        </label>
      </li>
      <li class="module-homework-line">
        <label class="module-guide-item-check module-homework-line-label">
          <span class="module-guide-checkbox-frame">
            <input type="checkbox" class="module-guide-checkbox-native" ${rec1} data-homework-recommended data-module-id="${escapeHtml(m.id)}" data-homework-slot="1" aria-label="Assign recommended homework 2" />
          </span>
          <span class="module-guide-item-label">
            <span class="module-homework-badge">Recommended</span>
            <span class="module-homework-suggested-text">${escapeHtml(s2)}</span>
          </span>
        </label>
      </li>
    </ul>
    ${
      custom.length
        ? `<ul class="module-homework-custom-list" aria-label="Your homework">${customLis}</ul>`
        : ""
    }
    <div class="module-homework-add-row">
      <input type="text" class="module-homework-input" id="homework-input-${escapeHtml(m.id)}" maxlength="${MAX_HOMEWORK_CUSTOM_LEN}" placeholder="Add a custom homework task…" aria-label="Custom homework for ${escapeHtml(m.topic)}" />
      <button type="button" class="btn btn-primary btn-small" data-homework-add data-module-id="${escapeHtml(m.id)}">Add</button>
    </div>
  </section>`;
}

function renderJourneyDetail(j) {
  const { done, total } = progressCounts(j);
  const pct = total ? Math.round((done / total) * 100) : 0;

  const pInfo = personaByValue(j.persona);
  const su = getSectionUi(j);
  const detailsOpen = !su.detailsCollapsed;
  const learningOpen = !su.learningCollapsed;
  const badge = (complete) =>
    complete
      ? `<span class="section-summary-badge">Complete</span>`
      : `<span class="section-summary-badge section-summary-badge--todo">In progress</span>`;

  return `
    <header class="app-header">
      <div>
        <h1>${escapeHtml(j.businessName)}</h1>
        <p class="app-header-meta">${escapeHtml(pInfo.label)} · ${done}/${total} modules (${pct}%)</p>
        <p class="app-header-desc">${escapeHtml(pInfo.description)}</p>
        <p class="app-header-durability">Stored in this browser. Export from the home screen to back up. Last export: ${escapeHtml(getLastBackupExportLabel())}</p>
      </div>
      <div class="app-header-actions">
        <a class="btn btn-ghost" href="#/">← All journeys</a>
        ${renderAppSettingsMenu()}
      </div>
    </header>

    ${renderAccountDetailsSection(j)}

    <details class="section-disclosure form-panel" data-section="details" ${detailsOpen ? "open" : ""}>
      <summary class="section-summary">
        <span class="section-summary-left">
          <span class="section-summary-title">Business details</span>
          ${badge(isDetailsComplete(j))}
        </span>
        <span class="section-summary-hint" aria-hidden="true">Tap to expand or collapse</span>
      </summary>
      <div class="section-body">
        <p class="basics-hint">Name saves when you leave the field; persona saves as soon as you pick one.</p>
        <div class="form-row">
          <label for="edit-businessName">Business name</label>
          <input id="edit-businessName" value="${escapeHtml(j.businessName)}" autocomplete="organization" />
        </div>
        ${renderPersonaFieldset("edit-", j.persona)}
      </div>
    </details>

    <details class="section-disclosure form-panel" data-section="learning" ${learningOpen ? "open" : ""}>
      <summary class="section-summary">
        <span class="section-summary-left">
          <span class="section-summary-title">Learning plan</span>
          ${badge(isLearningComplete(j))}
        </span>
        <span class="section-summary-hint" aria-hidden="true">Tap to expand or collapse</span>
      </summary>
      <div class="section-body section-body--learning">
        ${renderLearningWorkspace(j)}
      </div>
    </details>

    <div class="form-actions form-actions--spaced">
      <button type="button" class="btn btn-danger" id="btn-delete">Delete this journey</button>
    </div>
  `;
}

function bindHome(journeys) {
  document.getElementById("btn-export")?.addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(journeys, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `training-sherpa-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    recordBackupExportTimestamp();
    renderApp();
  });

  document.getElementById("import-file")?.addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (!Array.isArray(data)) throw new Error("Invalid file");
        saveJourneys(data.map(migrateJourney));
        recordBackupExportTimestamp();
        renderApp();
      } catch {
        alert("Could not import, invalid JSON backup.");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  });
}

function bindNew() {
  document.getElementById("form-new")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const journeys = loadJourneys();
    const j = createJourney({
      businessName: fd.get("businessName"),
      persona: fd.get("persona"),
    });
    journeys.push(j);
    saveJourneys(journeys);
    navigate("journey", j.id);
    renderApp();
  });
}

const PATH_DND_TYPE = "application/training-sherpa-path";

function clonePathSessions(j) {
  return getPathSessions(j).map((s) => ({
    id: s.id,
    title: s.title,
    date: s.date,
    moduleIds: [...s.moduleIds],
  }));
}

function removeModuleFromSessionAt(sessions, sessionId, index) {
  return sessions.map((s) => {
    if (s.id !== sessionId) return s;
    const ids = [...s.moduleIds];
    if (index < 0 || index >= ids.length) return s;
    ids.splice(index, 1);
    return { ...s, moduleIds: ids };
  });
}

/** Insert from library: skipped if that session already lists the module. */
function insertLibraryModuleAt(sessions, sessionId, index, moduleId) {
  if (!moduleById(moduleId)) return sessions;
  return sessions.map((s) => {
    if (s.id !== sessionId) return s;
    if (s.moduleIds.includes(moduleId)) return s;
    const ids = [...s.moduleIds];
    const at = Math.min(Math.max(0, index), ids.length);
    ids.splice(at, 0, moduleId);
    return { ...s, moduleIds: ids };
  });
}

/** Move from another session: skipped if target already has this module. */
function insertMovedModuleAt(sessions, sessionId, index, moduleId) {
  if (!moduleById(moduleId)) return sessions;
  return sessions.map((s) => {
    if (s.id !== sessionId) return s;
    if (s.moduleIds.includes(moduleId)) return s;
    const ids = [...s.moduleIds];
    const at = Math.min(Math.max(0, index), ids.length);
    ids.splice(at, 0, moduleId);
    return { ...s, moduleIds: ids };
  });
}

function moveModuleBetweenSessions(sessions, fromSessionId, fromIndex, toSessionId, moduleId, insertBefore) {
  const next = removeModuleFromSessionAt(sessions, fromSessionId, fromIndex);
  return insertMovedModuleAt(next, toSessionId, insertBefore, moduleId);
}

/** Reorder within one session; insertBefore is index in the list after the dragged item is removed. */
function reorderSessionModuleIdsByDrop(moduleIds, fromIndex, insertBefore) {
  const ids = [...moduleIds];
  if (fromIndex < 0 || fromIndex >= ids.length) return moduleIds;
  const [moved] = ids.splice(fromIndex, 1);
  const dest = Math.min(Math.max(0, insertBefore), ids.length);
  ids.splice(dest, 0, moved);
  return ids;
}

function getSessionListDropInsertBefore(pathList, clientY) {
  if (pathList.querySelector(".path-empty")) return 0;
  const items = [...pathList.querySelectorAll(".path-item:not(.path-item--dragging)")];
  if (!items.length) return 0;
  let insertBefore = items.length;
  for (let i = 0; i < items.length; i++) {
    const r = items[i].getBoundingClientRect();
    if (clientY < r.top + r.height / 2) {
      insertBefore = i;
      break;
    }
  }
  return insertBefore;
}

function clearPathDropUi(builder, libraryList) {
  builder.querySelectorAll(".path-item.path-drop-before").forEach((el) => el.classList.remove("path-drop-before"));
  builder.querySelectorAll("ol.path-list").forEach((ol) => {
    ol.classList.remove("path-list--drop-end", "path-list--drop-empty-active", "path-list--drag-over");
  });
  libraryList?.classList.remove("path-library-list--drag-over");
}

function applySessionDropIndicator(pathList, insertBefore) {
  pathList.classList.remove("path-list--drop-end", "path-list--drop-empty-active");
  if (pathList.querySelector(".path-empty")) {
    pathList.classList.add("path-list--drop-empty-active");
    return;
  }
  const items = [...pathList.querySelectorAll(".path-item:not(.path-item--dragging)")];
  if (insertBefore < items.length) items[insertBefore].classList.add("path-drop-before");
  else pathList.classList.add("path-list--drop-end");
}

function bindPathBuilder(j, persist) {
  const builder = document.getElementById("path-builder");
  const libraryList = document.getElementById("path-library-list");
  if (!builder || !libraryList) return;

  const applySessions = (nextSessions) => {
    const pathSessions = sanitizePathSessionsInput(
      nextSessions,
      flattenSessionsToPath(nextSessions)
    );
    const pathModuleIds = flattenSessionsToPath(pathSessions);
    const updated = { ...j, pathSessions, pathModuleIds };
    persist(updated);
    Object.assign(j, updated);
    renderApp();
  };

  const parseDropPayload = (e) => {
    try {
      const raw = e.dataTransfer.getData(PATH_DND_TYPE);
      if (raw) return JSON.parse(raw);
    } catch {
      /* ignore */
    }
    return null;
  };

  let dragPayload = null;

  builder.querySelectorAll("input[data-session-field]").forEach((input) => {
    const field = input.dataset.sessionField;
    const sid = input.dataset.sessionId;
    if (!sid || (field !== "title" && field !== "date")) return;
    const handler = () => {
      const sessions = clonePathSessions(j);
      const s = sessions.find((x) => x.id === sid);
      if (!s) return;
      if (field === "title") s.title = input.value.trim().slice(0, 120) || "Session";
      else s.date = input.value || "";
      applySessions(sessions);
    };
    if (field === "title") input.addEventListener("blur", handler);
    else input.addEventListener("change", handler);
  });

  builder.querySelectorAll("[data-session-delete]").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.preventDefault();
      const id = btn.getAttribute("data-session-delete");
      if (!id) return;
      const ok = await showAppConfirm({
        title: "Remove this session?",
        message: "It will leave your plan. Modules stay in the library.",
        confirmLabel: "Remove session",
        cancelLabel: "Cancel",
        variant: "primary",
      });
      if (!ok) return;
      const sessions = clonePathSessions(j).filter((s) => s.id !== id);
      if (sessions.length < 2) return;
      applySessions(sessions);
    });
  });

  document.getElementById("path-add-session")?.addEventListener("click", (e) => {
    e.preventDefault();
    const sessions = clonePathSessions(j);
    sessions.push({
      id: newId(),
      title: `Training ${sessions.length}`,
      date: "",
      moduleIds: [],
    });
    applySessions(sessions);
  });

  builder.querySelectorAll("[data-path-remove-index]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      const sid = btn.getAttribute("data-session-id");
      const idx = parseInt(btn.getAttribute("data-path-remove-index"), 10);
      if (!sid || Number.isNaN(idx)) return;
      const sessions = clonePathSessions(j);
      const s = sessions.find((x) => x.id === sid);
      if (!s) return;
      if (idx < 0 || idx >= s.moduleIds.length) return;
      s.moduleIds.splice(idx, 1);
      applySessions(sessions);
    });
  });

  let suppressReadingClickAfterDrag = false;

  const endDrag = () => {
    dragPayload = null;
    clearPathDropUi(builder, libraryList);
    builder.querySelectorAll(".path-item--dragging").forEach((el) => el.classList.remove("path-item--dragging"));
    libraryList.querySelectorAll(".path-library-item--dragging").forEach((el) =>
      el.classList.remove("path-library-item--dragging")
    );
    setTimeout(() => {
      suppressReadingClickAfterDrag = false;
    }, 80);
  };

  builder.querySelectorAll(".path-item-drag").forEach((surface) => {
    surface.addEventListener("dragstart", (e) => {
      const li = surface.closest(".path-item");
      if (!li) return;
      const idx = parseInt(surface.dataset.pathIndex, 10);
      const id = surface.dataset.moduleId;
      const sessionId = surface.dataset.sessionId;
      if (Number.isNaN(idx) || !id || !sessionId) return;
      suppressReadingClickAfterDrag = true;
      dragPayload = { kind: "session", sessionId, fromIndex: idx, id };
      try {
        e.dataTransfer.setData(PATH_DND_TYPE, JSON.stringify(dragPayload));
        e.dataTransfer.setData("text/plain", id);
      } catch {
        /* ignore */
      }
      e.dataTransfer.effectAllowed = "move";
      li.classList.add("path-item--dragging");
    });
    surface.addEventListener("dragend", endDrag);
  });

  libraryList.querySelectorAll(".path-library-drag").forEach((surface) => {
    surface.addEventListener("dragstart", (e) => {
      const li = surface.closest(".path-library-item");
      if (!li) return;
      const id = li.dataset.libraryModule;
      if (!id) return;
      suppressReadingClickAfterDrag = true;
      dragPayload = { kind: "library", id };
      try {
        e.dataTransfer.setData(PATH_DND_TYPE, JSON.stringify(dragPayload));
        e.dataTransfer.setData("text/plain", id);
      } catch {
        /* ignore */
      }
      e.dataTransfer.effectAllowed = "copy";
      li.classList.add("path-library-item--dragging");
    });
    surface.addEventListener("dragend", endDrag);
  });

  builder.addEventListener("click", (e) => {
    if (e.target.closest(".path-item-remove")) return;
    const t = e.target.closest("[data-reading-module]");
    if (!t || !builder.contains(t)) return;
    if (suppressReadingClickAfterDrag) return;
    const moduleId = t.getAttribute("data-reading-module");
    const source = t.getAttribute("data-reading-source") || "workspace";
    const ctx = t.getAttribute("data-reading-context-session");
    if (!moduleId) return;
    applyReadingSelection(j, persist, moduleId, source, ctx || null);
  });

  builder.querySelectorAll('ol[data-drop-zone="session"]').forEach((pathList) => {
    pathList.addEventListener("dragenter", (e) => {
      if (!dragPayload) return;
      e.preventDefault();
      pathList.classList.add("path-list--drag-over");
    });
    pathList.addEventListener("dragover", (e) => {
      if (!dragPayload) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = dragPayload.kind === "library" ? "copy" : "move";
      const insertBefore = getSessionListDropInsertBefore(pathList, e.clientY);
      clearPathDropUi(builder, libraryList);
      pathList.classList.add("path-list--drag-over");
      applySessionDropIndicator(pathList, insertBefore);
      if (dragPayload.kind === "session") libraryList.classList.add("path-library-list--drag-over");
    });
    pathList.addEventListener("dragleave", (e) => {
      if (pathList.contains(e.relatedTarget)) return;
      pathList.classList.remove("path-list--drag-over");
    });
    pathList.addEventListener("drop", (e) => {
      e.preventDefault();
      const payload = parseDropPayload(e) || dragPayload;
      if (!payload || !payload.kind) {
        endDrag();
        return;
      }
      const toSessionId = pathList.dataset.sessionId;
      if (!toSessionId) return;
      let sessions = clonePathSessions(j);
      const targetSession = sessions.find((s) => s.id === toSessionId);
      if (!targetSession) return;

      const insertBefore = getSessionListDropInsertBefore(pathList, e.clientY);

      if (payload.kind === "session") {
        const { sessionId: fromSessionId, fromIndex, id: moduleId } = payload;
        if (!moduleId || !fromSessionId || Number.isNaN(fromIndex)) return;
        if (fromSessionId === toSessionId) {
          sessions = sessions.map((s) => {
            if (s.id !== toSessionId) return s;
            return {
              ...s,
              moduleIds: reorderSessionModuleIdsByDrop(s.moduleIds, fromIndex, insertBefore),
            };
          });
        } else {
          sessions = moveModuleBetweenSessions(
            sessions,
            fromSessionId,
            fromIndex,
            toSessionId,
            moduleId,
            insertBefore
          );
        }
        applySessions(sessions);
        endDrag();
        return;
      }

      if (payload.kind === "library") {
        const id = payload.id;
        if (!id) return;
        sessions = insertLibraryModuleAt(sessions, toSessionId, insertBefore, id);
        applySessions(sessions);
        endDrag();
      }
    });
  });

  libraryList.addEventListener("dragover", (e) => {
    if (!dragPayload || dragPayload.kind !== "session") return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    clearPathDropUi(builder, libraryList);
    libraryList.classList.add("path-library-list--drag-over");
  });

  libraryList.addEventListener("dragleave", (e) => {
    if (libraryList.contains(e.relatedTarget)) return;
    libraryList.classList.remove("path-library-list--drag-over");
  });

  libraryList.addEventListener("drop", (e) => {
    e.preventDefault();
    const payload = parseDropPayload(e) || dragPayload;
    if (!payload || payload.kind !== "session") {
      endDrag();
      return;
    }
    const { sessionId, fromIndex, id: moduleId } = payload;
    if (!moduleId || !sessionId || Number.isNaN(fromIndex)) return;
    const sessions = removeModuleFromSessionAt(clonePathSessions(j), sessionId, fromIndex);
    applySessions(sessions);
    endDrag();
  });
}

function bindJourneyDetail(j, allJourneys) {
  const persist = (updated) => {
    const idx = allJourneys.findIndex((x) => x.id === updated.id);
    if (idx === -1) return;
    updated.updatedAt = new Date().toISOString();
    allJourneys[idx] = updated;
    saveJourneys(allJourneys);
  };

  const syncBasicsFromDom = () => {
    const personaEl = document.querySelector('input[name="edit-persona"]:checked');
    const businessName = document.getElementById("edit-businessName")?.value.trim() || j.businessName;
    const persona = personaEl ? personaEl.value : (j.persona ?? null);
    if (businessName === j.businessName && persona === j.persona) return;
    const beforeDetail = isDetailsComplete(j);
    let updated = { ...j, businessName, persona };
    if (!beforeDetail && isDetailsComplete(updated)) {
      updated.sectionUi = { ...getSectionUi(updated), detailsCollapsed: true };
    }
    persist(updated);
    Object.assign(j, updated);
    renderApp();
  };

  document.getElementById("edit-businessName")?.addEventListener("blur", syncBasicsFromDom);
  document.querySelectorAll('input[name="edit-persona"]').forEach((radio) => {
    radio.addEventListener("change", syncBasicsFromDom);
  });

  document.querySelectorAll('input[name="edit-account-plan"]').forEach((radio) => {
    radio.addEventListener("change", () => {
      const el = document.querySelector('input[name="edit-account-plan"]:checked');
      const v = el?.value;
      if (v !== "connect" && v !== "grow" && v !== "plus") return;
      const prevPlan = j.accountPlan;
      let rawAddOns = j.accountAddOns || {};
      if (prevPlan === "plus" && v !== "plus") {
        rawAddOns = stripPlusIncludedAddOnsFromRaw(rawAddOns);
      }
      let updated = {
        ...j,
        accountPlan: v,
        accountAddOns: normalizeAccountAddOns(v, rawAddOns),
      };
      if (!getAccountAddOns(updated).aiReceptionist) {
        updated = removeModuleFromLearningPath(updated, "M15");
      }
      if (v === "plus") {
        updated = ensureAiReceptionistEarlyInPlan(updated);
      }
      updated = applyAccountSectionFirstTimeCollapse(updated);
      persist(updated);
      Object.assign(j, updated);
      renderApp();
    });
  });

  document.getElementById("jobber-payments-status")?.addEventListener("change", (e) => {
    const v = e.target.value;
    const valid = v === "" || !JOBBER_PAYMENTS_STATUS_BY_VALUE[v] ? null : v;
    let updated = { ...j, jobberPaymentsStatus: valid };
    updated = applyJobberPaymentsStatusToM03(updated);
    persist(updated);
    Object.assign(j, updated);
    renderApp();
  });

  document.querySelectorAll("input[data-account-addon]").forEach((cb) => {
    cb.addEventListener("change", () => {
      const key = cb.getAttribute("data-account-addon");
      if (!key) return;
      if (key === "dpn" && isDpnLockedOnByAccount(j)) return;
      const add = getAccountAddOns(j);
      if (
        add.marketingSuite &&
        (key === "reviews" || key === "campaigns" || key === "referrals")
      ) {
        return;
      }
      let next = { ...add };
      if (key === "marketingSuite") {
        if (cb.checked) {
          next = {
            ...next,
            marketingSuite: true,
            reviews: true,
            campaigns: true,
            referrals: true,
          };
        } else {
          next = {
            ...next,
            marketingSuite: false,
            reviews: false,
            campaigns: false,
            referrals: false,
          };
        }
      } else {
        next[key] = cb.checked;
        if (next.reviews && next.campaigns && next.referrals) {
          next.marketingSuite = true;
        }
      }
      if (key === "aiReceptionist" && cb.checked) {
        next.dpn = true;
      }
      const normalized = normalizeAccountAddOns(j.accountPlan, next);
      let updated = { ...j, accountAddOns: normalized };
      if (key === "aiReceptionist" && cb.checked) {
        updated = ensureAiReceptionistEarlyInPlan(updated);
      }
      updated = applyAccountSectionFirstTimeCollapse(updated);
      persist(updated);
      Object.assign(j, updated);
      renderApp();
    });
  });

  document.querySelectorAll("details.section-disclosure[data-section]").forEach((el) => {
    el.addEventListener("toggle", (ev) => {
      if (!ev.isTrusted) return;
      const section = el.dataset.section;
      const collapsed = !el.open;
      const map = {
        account: "accountCollapsed",
        details: "detailsCollapsed",
        learning: "learningCollapsed",
      };
      const uiKey = map[section];
      if (!uiKey) return;
      const updated = { ...j, sectionUi: { ...getSectionUi(j), [uiKey]: collapsed } };
      persist(updated);
      Object.assign(j, updated);
    });
  });

  document.querySelectorAll("input[data-module-completion]").forEach((radio) => {
    radio.addEventListener("change", () => {
      if (!radio.checked) return;
      const moduleId = radio.getAttribute("data-module-completion");
      const value = radio.value;
      if (
        !moduleId ||
        (value !== "incomplete" &&
          value !== "inProgress" &&
          value !== "priorKickoff" &&
          value !== "complete" &&
          value !== "completeManual")
      ) {
        return;
      }
      const beforeL = isLearningComplete(j);
      j.modules[moduleId] = { ...getModuleEntry(j, moduleId), status: value };
      const updated = { ...j };
      if (!beforeL && isLearningComplete(updated)) {
        updated.sectionUi = { ...getSectionUi(updated), learningCollapsed: true };
      }
      persist(updated);
      Object.assign(j, updated);
      renderApp();
    });
  });

  document.getElementById("library-drawer")?.addEventListener("toggle", (ev) => {
    if (!ev.isTrusted) return;
    const el = ev.target;
    if (!(el instanceof HTMLDetailsElement) || el.id !== "library-drawer") return;
    const updated = {
      ...j,
      learningUi: { ...getLearningUi(j), libraryDrawerCollapsed: !el.open },
    };
    persist(updated);
    Object.assign(j, updated);
  });

  document.querySelectorAll("input[data-module-guide-check]").forEach((cb) => {
    cb.addEventListener("change", () => {
      const moduleId = cb.getAttribute("data-module-guide-check");
      const itemId = cb.getAttribute("data-guide-item-id");
      if (!moduleId || !itemId) return;
      const rec = getChecklistRecording(j, moduleId);
      if (rec.multi && !getGuideSessionFilter(j, moduleId)) {
        cb.checked = !cb.checked;
        return;
      }
      const entry = getModuleEntry(j, moduleId);
      const highlights = { ...entry.guideHighlights };
      const sess = { ...entry.guideHighlightSessions };
      const effSid = effectiveSessionForGuideAttribution(j, moduleId);
      const sessionIds = sessionIdsContainingModule(j, moduleId);

      if (cb.checked) {
        highlights[itemId] = true;
        if (effSid && sessionIds.includes(effSid)) {
          const cur = new Set(sess[itemId] || []);
          cur.add(effSid);
          sess[itemId] = [...cur];
        }
      } else if (effSid && sessionIds.includes(effSid)) {
        const cur = (sess[itemId] || []).filter((x) => x !== effSid);
        if (cur.length) sess[itemId] = cur;
        else delete sess[itemId];
        if (!cur.length) delete highlights[itemId];
      } else {
        delete highlights[itemId];
        delete sess[itemId];
      }

      const updated = patchJourneyAfterGuideData(j, moduleId, highlights, sess);
      persist(updated);
      Object.assign(j, updated);
      renderApp();
    });
  });

  const applyHomeworkCustom = (moduleId, nextCustom) => {
    const sanitized = sanitizeHomeworkCustom(nextCustom);
    j.modules[moduleId] = { ...getModuleEntry(j, moduleId), homeworkCustom: sanitized };
    const updated = { ...j };
    persist(updated);
    Object.assign(j, updated);
    renderApp();
  };

  document.querySelectorAll("[data-homework-add]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const moduleId = btn.getAttribute("data-module-id");
      if (!moduleId) return;
      const row = btn.closest(".module-homework-add-row");
      const input =
        (row && row.querySelector(".module-homework-input")) ||
        document.getElementById(`homework-input-${moduleId}`);
      if (!(input instanceof HTMLInputElement)) return;
      let text = input.value.trim();
      if (!text) return;
      if (text.length > MAX_HOMEWORK_CUSTOM_LEN) text = text.slice(0, MAX_HOMEWORK_CUSTOM_LEN);
      const entry = getModuleEntry(j, moduleId);
      applyHomeworkCustom(moduleId, [...entry.homeworkCustom, { id: newId(), text, checked: true }]);
    });
  });

  document.querySelectorAll(".module-homework-input").forEach((input) => {
    input.addEventListener("keydown", (ev) => {
      if (ev.key !== "Enter") return;
      ev.preventDefault();
      const row = input.closest(".module-homework-add-row");
      row?.querySelector("[data-homework-add]")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
  });

  document.querySelectorAll("[data-homework-remove]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const moduleId = btn.getAttribute("data-module-id");
      const itemId = btn.getAttribute("data-homework-item-id");
      if (!moduleId || !itemId) return;
      const entry = getModuleEntry(j, moduleId);
      applyHomeworkCustom(
        moduleId,
        entry.homeworkCustom.filter((h) => h.id !== itemId)
      );
    });
  });

  document.querySelectorAll("input[data-homework-recommended]").forEach((cb) => {
    cb.addEventListener("change", () => {
      const moduleId = cb.getAttribute("data-module-id");
      const slot = cb.getAttribute("data-homework-slot");
      if (!moduleId || (slot !== "0" && slot !== "1")) return;
      const idx = slot === "0" ? 0 : 1;
      const entry = getModuleEntry(j, moduleId);
      const next = [...entry.homeworkRecommendedChecked];
      next[idx] = cb.checked;
      j.modules[moduleId] = { ...entry, homeworkRecommendedChecked: sanitizeHomeworkRecommendedChecked(next) };
      const updated = { ...j };
      persist(updated);
      Object.assign(j, updated);
      renderApp();
    });
  });

  document.querySelectorAll("input[data-homework-custom-check]").forEach((cb) => {
    cb.addEventListener("change", () => {
      const moduleId = cb.getAttribute("data-module-id");
      const itemId = cb.getAttribute("data-homework-item-id");
      if (!moduleId || !itemId) return;
      const entry = getModuleEntry(j, moduleId);
      applyHomeworkCustom(
        moduleId,
        entry.homeworkCustom.map((h) => (h.id === itemId ? { ...h, checked: cb.checked } : h))
      );
    });
  });

  document.querySelectorAll("input[data-module-resource-check]").forEach((cb) => {
    cb.addEventListener("change", () => {
      const moduleId = cb.getAttribute("data-module-resource-check");
      const resourceId = cb.getAttribute("data-resource-id");
      if (!moduleId || !resourceId) return;
      const entry = getModuleEntry(j, moduleId);
      const next = { ...entry.moduleResourcesChecked, [resourceId]: cb.checked };
      j.modules[moduleId] = {
        ...entry,
        moduleResourcesChecked: sanitizeModuleResourcesChecked(moduleId, next),
      };
      const updated = { ...j };
      persist(updated);
      Object.assign(j, updated);
      renderApp();
    });
  });

  document.querySelectorAll("[data-resource-blurb-expand]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const wrap = btn.closest("[data-resource-blurb-wrap]");
      const body = wrap?.querySelector(".module-related-resource-blurb-body");
      if (!(body instanceof HTMLElement)) return;
      const open = btn.getAttribute("aria-expanded") === "true";
      btn.setAttribute("aria-expanded", open ? "false" : "true");
      btn.textContent = open ? "Expand" : "Collapse";
      btn.setAttribute("aria-label", open ? "Expand resource description" : "Collapse resource description");
      body.hidden = open;
    });
  });

  document.querySelectorAll("[data-resource-blurb-copy]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const encList = btn.getAttribute("data-blurb-payload-list");
      const enc = btn.getAttribute("data-blurb-payload");
      let text = "";
      if (encList) {
        try {
          const arr = JSON.parse(decodeURIComponent(encList));
          if (!Array.isArray(arr)) return;
          text = arr
            .map((p) => formatResourceCopyPlainText(p))
            .filter((s) => typeof s === "string" && s.trim())
            .join("\n\n");
        } catch {
          return;
        }
      } else if (enc) {
        try {
          const p = JSON.parse(decodeURIComponent(enc));
          text = formatResourceCopyPlainText(p);
        } catch {
          return;
        }
      } else {
        return;
      }
      if (!text) return;
      const ok = await copyTextToClipboard(text);
      if (!btn.dataset.copyTitleOriginal) btn.dataset.copyTitleOriginal = btn.getAttribute("title") || "";
      const baseTitle = btn.dataset.copyTitleOriginal;
      btn.setAttribute("title", ok ? "Copied" : "Copy failed, try again");
      btn.classList.toggle("resource-copy--ok", ok);
      btn.classList.toggle("resource-copy--fail", !ok);
      setTimeout(() => {
        btn.setAttribute("title", baseTitle);
        btn.classList.remove("resource-copy--ok", "resource-copy--fail");
      }, ok ? 1800 : 2800);
    });
  });

  document.querySelectorAll("select[data-guide-session-select]").forEach((sel) => {
    sel.addEventListener("change", () => {
      const mid = sel.getAttribute("data-module-id");
      if (!mid) return;
      const v = sel.value;
      const lu = getLearningUi(j);
      const baseGsf =
        lu.guideSessionFilter && typeof lu.guideSessionFilter === "object" ? { ...lu.guideSessionFilter } : {};
      const cr = { ...(lu.checklistRecording && typeof lu.checklistRecording === "object" ? lu.checklistRecording : {}) };
      if (!v) {
        delete baseGsf[mid];
        const updated = {
          ...j,
          learningUi: {
            ...lu,
            guideSessionFilter: sanitizeGuideSessionFilterObject(j, baseGsf),
            checklistRecording: cr,
          },
        };
        persist(updated);
        Object.assign(j, updated);
        renderApp();
        return;
      }
      const raw = { ...baseGsf, [mid]: v };
      cr[mid] = { sessionId: v };
      const updated = {
        ...j,
        learningUi: {
          ...lu,
          guideSessionFilter: sanitizeGuideSessionFilterObject(j, raw),
          checklistRecording: cr,
        },
      };
      persist(updated);
      Object.assign(j, updated);
      renderApp();
    });
  });

  const prevGuideFilterDismiss = window.__trainingSherpaGuideFilterMousedown;
  if (prevGuideFilterDismiss) document.removeEventListener("mousedown", prevGuideFilterDismiss, true);
  const guideFilterMousedown = (e) => {
    const t = e.target;
    if (!(t instanceof Element)) return;
    const lu = getLearningUi(j);
    const mid = lu.readingModuleId;
    if (!mid || !getGuideSessionFilter(j, mid)) return;
    if (
      t.closest(".reading-pane-session-meta") ||
      t.closest(".module-guide") ||
      t.closest(".reading-pane-section--related-resources")
    ) {
      return;
    }
    const raw = { ...(lu.guideSessionFilter && typeof lu.guideSessionFilter === "object" ? { ...lu.guideSessionFilter } : {}) };
    delete raw[mid];
    const updated = {
      ...j,
      learningUi: { ...lu, guideSessionFilter: sanitizeGuideSessionFilterObject(j, raw) },
    };
    persist(updated);
    Object.assign(j, updated);
    renderApp();
  };
  window.__trainingSherpaGuideFilterMousedown = guideFilterMousedown;
  document.addEventListener("mousedown", guideFilterMousedown, true);

  bindPathBuilder(j, persist);

  document.querySelectorAll("[data-session-copy-coverage]").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.preventDefault();
      const sid = btn.getAttribute("data-session-copy-coverage");
      if (!sid) return;
      const { plain, html } = buildSessionCoverageExport(j, sid);
      const ok = await copyPlainHtmlToClipboard(plain, html);
      if (!btn.dataset.exportTitleOriginal) btn.dataset.exportTitleOriginal = btn.getAttribute("title") || "";
      const baseTitle = btn.dataset.exportTitleOriginal;
      btn.setAttribute("title", ok ? "Copied to clipboard" : "Copy failed, try again or check permissions");
      btn.classList.toggle("path-session-header-export--ok", ok);
      btn.classList.toggle("path-session-header-export--fail", !ok);
      setTimeout(() => {
        btn.setAttribute("title", baseTitle);
        btn.classList.remove("path-session-header-export--ok", "path-session-header-export--fail");
      }, ok ? 2200 : 3200);
    });
  });

  document.getElementById("btn-delete")?.addEventListener("click", async () => {
    const ok = await showAppConfirm({
      title: "Delete this journey?",
      message: "This removes the journey from this browser. You cannot undo it.",
      confirmLabel: "Delete journey",
      cancelLabel: "Cancel",
      variant: "danger",
    });
    if (!ok) return;
    const next = allJourneys.filter((x) => x.id !== j.id);
    saveJourneys(next);
    navigate("home");
    renderApp();
  });
}

function boot() {
  const appRoot = document.getElementById("app");
  if (appRoot && appRoot.dataset.appDelegatedClick !== "1") {
    appRoot.dataset.appDelegatedClick = "1";
    appRoot.addEventListener("click", handleAppRootClick);
  }
  if (!window.__trainingSherpaPathDragEnd) {
    window.__trainingSherpaPathDragEnd = true;
    document.addEventListener(
      "dragend",
      () => {
        const b = document.getElementById("path-builder");
        const lib = document.getElementById("path-library-list");
        if (b && lib) clearPathDropUi(b, lib);
      },
      true
    );
  }
  window.addEventListener("hashchange", renderApp);
  renderApp();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}
