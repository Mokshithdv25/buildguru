/** Local intent routing for Homi — works offline and as fallback when AI is unavailable. */

import { HM_HUB_DEMO_PROJECT } from "./hmBrand";

const NAV_ALIASES = {
  overview: "Overview",
  home: "Overview",
  timeline: "Timeline",
  schedule: "Timeline",
  tasks: "Tasks",
  todo: "Tasks",
  budget: "Budget",
  money: "Budget",
  materials: "Materials",
  takeoff: "Materials",
  boq: "Materials",
  feed: "Site Feed",
  site: "Site Feed",
  bids: "Bids",
  bid: "Bids",
  quotes: "Bids",
  proposals: "Bids",
  settings: "Settings",
};

function normalize(text) {
  return String(text || "")
    .toLowerCase()
    .trim()
    .replace(/[^\w\s]/g, " ");
}

function formatTaskList(tasks, { limit = 6, openOnly = false } = {}) {
  const rows = (tasks || []).filter((t) => (openOnly ? !t.done : true));
  if (!rows.length) return openOnly ? "No open tasks on the board." : "No tasks tracked yet.";
  return rows
    .slice(0, limit)
    .map((t) => {
      const mark = t.done ? "✓" : "○";
      const phase = t.phase ? ` (${t.phase})` : "";
      return `${mark} ${t.title || t.name}${phase}`;
    })
    .join("\n");
}

function formatMessageDigest(messages, limit = 5) {
  const rows = (messages || []).slice(-limit);
  if (!rows.length) return "No site-feed messages yet.";
  return rows
    .map((m) => {
      const who = m.name || m.role || "Team";
      const phase = m.phase ? ` · ${m.phase}` : "";
      return `**${who}**${phase}: ${m.text}`;
    })
    .join("\n");
}

function formatMaterialList(materials, limit = 8) {
  const rows = (materials || []).filter((item) => item.status !== "removed").slice(0, limit);
  if (!rows.length) return "No material takeoff is saved yet.";
  return rows.map((item) => {
    const quantity = Number(item.quantity || 0).toLocaleString("en-IN");
    const brand = item.brand ? ` · ${item.brand}` : " · brand not selected";
    return `○ ${item.item}: ${quantity} ${item.unit || "unit"}${brand} (${item.status || "suggested"})`;
  }).join("\n");
}

function formatBidList(bids, limit = 6) {
  const rows = (bids || []).slice(0, limit);
  if (!rows.length) return "No professional has bid on this project yet.";
  return rows
    .map((bid) => {
      const amount = bid.amountInr ? `₹${Number(bid.amountInr).toLocaleString("en-IN")}` : "amount not stated";
      const weeks = bid.timelineWeeks ? ` · ${bid.timelineWeeks} weeks` : "";
      const decision = bid.decision && bid.decision !== "pending" ? ` · ${bid.decision}` : "";
      return `○ ${bid.pro}: ${amount}${weeks}${decision}`;
    })
    .join("\n");
}

function formatPaymentList(payments, limit = 6) {
  const rows = (payments || []).slice(0, limit);
  if (!rows.length) return "No payment records are saved yet.";
  return rows.map((payment) => `○ ${payment.title}: ₹${Number(payment.amountInr || 0).toLocaleString("en-IN")} (${payment.status || "planned"})`).join("\n");
}

function sourceLine(ctx, preferred = []) {
  const available = ctx.artifactRefs || [];
  const sources = preferred.filter((name) => available.includes(name));
  const selected = sources.length ? sources : available.slice(0, 5);
  return selected.length ? `\nSources: ${selected.join(", ")}.` : "";
}

export function buildLatestBriefing(ctx) {
  const lines = [];
  const name = ctx.userFirstName ? `${ctx.userFirstName}, ` : "";
  if (!ctx.signedIn) {
    return `${name}sign in to sync your build and remodel projects across devices. I can still explain the hub and help you start a flow.`;
  }
  if (!ctx.projectId && ctx.isDemoHub) {
    return `${name}you're on the **${HM_HUB_DEMO_PROJECT.line2}** sample hub (${HM_HUB_DEMO_PROJECT.meta}). Stage **${ctx.activePhase || "Structure"}** · **${ctx.pendingTaskCount ?? 3}** open tasks. Say **tasks**, **quotes**, or **design journey** — or **new build** to start yours.`;
  }
  if (!ctx.projectId) {
    return `${name}pick a saved project in the sidebar, or say **new build** / **remodel** to start one.`;
  }
  lines.push(`**${ctx.projectTitle || "Your project"}** · ${ctx.flowLabel || "Project"}`);
  if (ctx.activePhase) lines.push(`Stage focus: **${ctx.activePhase}** (${ctx.phasePct ?? 0}% in tracker).`);
  if (ctx.pendingTaskCount > 0) {
    lines.push(`**${ctx.pendingTaskCount}** open task${ctx.pendingTaskCount === 1 ? "" : "s"}${ctx.nextTask ? ` — next: ${ctx.nextTask}` : ""}.`);
  } else if (ctx.taskCount > 0) {
    lines.push("All tracked tasks are done for now — nice.");
  }
  const blockedTasks = (ctx.tasks || []).filter((task) => task.status === "blocked");
  if (blockedTasks.length) lines.push(`Blocked: **${blockedTasks.length}** task${blockedTasks.length === 1 ? "" : "s"} — ${blockedTasks.slice(0, 2).map((task) => task.title).join("; ")}.`);
  if (ctx.budgetLabel) lines.push(`Budget band: **${ctx.budgetLabel}**.`);
  if (ctx.hasV0) lines.push("Your **AI v0** pack is saved on this project.");
  if (ctx.v0Summary?.totalInr) {
    lines.push(`V0 estimate ballpark: **₹${Number(ctx.v0Summary.totalInr).toLocaleString("en-IN")}** (indicative).`);
  }
  if (ctx.materials?.length) {
    const approved = ctx.materials.filter((item) => ["approved", "ordered", "received"].includes(item.status)).length;
    lines.push(`Material plan: **${ctx.materials.length}** items · **${approved}** approved or ordered.`);
  }
  if (ctx.bidCount) {
    const lowest = ctx.lowestBidInr ? ` · lowest **₹${Number(ctx.lowestBidInr).toLocaleString("en-IN")}**` : "";
    lines.push(
      ctx.acceptedBidPro
        ? `Bids: **${ctx.bidCount}** received — you accepted **${ctx.acceptedBidPro}**.`
        : `Bids: **${ctx.bidCount}** received${ctx.newBidCount ? ` · **${ctx.newBidCount}** awaiting your decision` : ""}${lowest}.`,
    );
  }
  if (ctx.documents?.length) lines.push(`Documents on file: **${ctx.documents.length}**.`);
  if (ctx.agentActions?.some((action) => action.status === "suggested")) {
    lines.push(`There are **${ctx.agentActions.filter((action) => action.status === "suggested").length}** suggested actions awaiting approval.`);
  }
  if (ctx.pendingTasks?.length) {
    lines.push(`Open tasks:\n${formatTaskList(ctx.pendingTasks, { limit: 4, openOnly: true })}`);
  }
  if (ctx.recentMessages?.length) {
    lines.push(`Recent site feed:\n${formatMessageDigest(ctx.recentMessages, 3)}`);
  }
  if (ctx.postedBanner) {
    lines.push(
      ctx.wantsMarketplaceQuotes === false
        ? "You posted with your own team — use **Team** to invite pros."
        : ctx.bidCount
          ? "Your project is posted — say **bids** to compare what came in."
          : "Your project is posted — say **bids** to see suggested pros and invite them to bid.",
    );
  }
  const sources = sourceLine(ctx, ["project brief", "task board", "site feed", "material plan", "payment ledger"]);
  if (sources) lines.push(sources.trimStart());
  return lines.join("\n");
}

export function parseHubCommand(message, ctx) {
  const t = normalize(message);
  if (!t) return null;

  if (/\b(sign\s*in|log\s*in|google)\b/.test(t)) {
    return { kind: "navigate", path: ctx.signInPath || "/sign-in?mode=signin&role=homeowner&redirect=/project" };
  }
  if (/\b(new\s*home|new\s*build|build\s*new)\b/.test(t)) {
    return { kind: "navigate", path: "/build/new-home" };
  }
  if (/\b(remodel|renovat|refresh)\b/.test(t)) {
    return { kind: "navigate", path: "/build/remodel" };
  }
  if (/\b(design\s*journey|journey|v0|concepts?)\b/.test(t)) {
    const q = ctx.hubQuery || "";
    return { kind: "navigate", path: `/project/journey${q}` };
  }
  if (/\b(open|show|go to|take me to)\s+(documents?|files?|vault)\b/.test(t) || /^(documents?|files?|vault)$/.test(t)) {
    const q = ctx.hubQuery || "";
    return { kind: "navigate", path: `/documents${q}` };
  }
  if (/\b(quote|quotes|bid|bids|proposal|proposals|rfq)\b/.test(t)) {
    // Questions about the bids themselves are answered from context; requests to
    // find more professionals go to the directory.
    if (/\b(find|search|more|browse|new)\b.*\b(pros?|professionals?|contractors?|architects?)\b/.test(t)) {
      const path = ctx.projectId ? `/browse?projectId=${encodeURIComponent(ctx.projectId)}` : "/browse";
      return { kind: "navigate", path };
    }
    if (/\b(what|which|how many|compare|summar|list|lowest|cheapest|best)\b/.test(t)) {
      const summary = ctx.acceptedBidPro
        ? `You accepted **${ctx.acceptedBidPro}**.`
        : ctx.bidCount
          ? `**${ctx.bidCount}** bid${ctx.bidCount === 1 ? "" : "s"} received${ctx.newBidCount ? `, **${ctx.newBidCount}** awaiting your decision` : ""}.`
          : "No bids yet — invite a suggested professional to get the first one.";
      return {
        kind: "reply",
        text: `**Bids on ${ctx.projectTitle || "your project"}:**\n${summary}\n${formatBidList(ctx.bids)}${sourceLine(ctx, ["contractor bids"])}`,
      };
    }
    return { kind: "nav", nav: "Bids" };
  }
  if (/\b(team|invite)\b/.test(t) || /\b(open|show)\s+(architect|contractor)\b/.test(t)) {
    const q = ctx.hubQuery || "";
    return { kind: "navigate", path: `/team${q}` };
  }
  if (/\b(shop|materials?)\b/.test(t)) {
    if (/\b(shop|buy|vendor|order)\b/.test(t)) return { kind: "navigate", path: `/shop${ctx.hubQuery || ""}` };
    if (/^(material|materials)$/.test(t) || /\b(open|show|go to)\s+materials?\b/.test(t)) return { kind: "nav", nav: "Materials" };
  }
  if (/\b(pros|marketplace|browse)\b/.test(t)) {
    return { kind: "navigate", path: "/browse" };
  }
  if (/\b(latest|what'?s new|update|status|briefing|summary)\b/.test(t)) {
    return { kind: "reply", text: buildLatestBriefing(ctx) };
  }
  if (/\b(open\s*tasks?|todo|to[\s-]?do|pending\s*tasks?)\b/.test(t)) {
    return {
      kind: "reply",
      text: `**Open tasks** on ${ctx.projectTitle || "your project"}:\n${formatTaskList(ctx.pendingTasks || ctx.tasks, { openOnly: true })}`,
    };
  }
  if (/\b(all\s*tasks?|task\s*list|my\s*tasks?)\b/.test(t)) {
    return {
      kind: "reply",
      text: `**Tasks** (${ctx.taskCount ?? ctx.tasks?.length ?? 0} total):\n${formatTaskList(ctx.tasks)}`,
    };
  }
  if (/\b(messages?|site\s*feed|feed|updates?\s*from\s*site)\b/.test(t)) {
    return {
      kind: "reply",
      text: `**Site feed** (latest):\n${formatMessageDigest(ctx.recentMessages || ctx.messages)}`,
    };
  }
  if (/\b(material|materials|takeoff|boq|cement|steel|tile|paint|brand|shopping checklist)\b/.test(t)) {
    const terms = t.split(/\s+/).filter((word) => word.length > 3);
    const matching = (ctx.materials || []).filter((item) => {
      const hay = `${item.item} ${item.category} ${item.brand || ""}`.toLowerCase();
      return terms.some((term) => hay.includes(term));
    });
    const rows = matching.length ? matching : ctx.materials;
    return {
      kind: "reply",
      text: `**Material takeoff** (editable planning draft):\n${formatMaterialList(rows)}${sourceLine(ctx, ["material plan", "project brief", "AI v0 estimate"])}`,
    };
  }
  if (/\b(payment|payments|spend|spent|paid|ledger|cost records?)\b/.test(t)) {
    return {
      kind: "reply",
      text: `**Payment ledger:**\n${formatPaymentList(ctx.payments)}${sourceLine(ctx, ["payment ledger", "AI v0 estimate"])}`,
    };
  }
  if (/\b(document|documents|drawing|drawings|file|files|artifact|artifacts)\b/.test(t)) {
    const docs = (ctx.documents || []).slice(0, 8);
    const list = docs.length ? docs.map((doc) => `○ ${doc.name}${doc.kind ? ` (${doc.kind})` : ""}`).join("\n") : "No uploaded document metadata is saved yet.";
    return { kind: "reply", text: `**Project documents:**\n${list}${sourceLine(ctx, ["document register"])}` };
  }
  if (/\b(approval|approvals|approve|agent actions?|follow ups?)\b/.test(t)) {
    const actions = ctx.agentActions || [];
    const list = actions.length ? actions.slice(0, 8).map((action) => `○ ${action.title} (${action.status})`).join("\n") : "No approval decisions have been recorded yet.";
    return { kind: "reply", text: `**Approval log:**\n${list}${sourceLine(ctx, ["approval log", "task board"])}` };
  }
  if (/\b(scope|brief|what are we building|project requirements?)\b/.test(t) && ctx.brief) {
    const brief = ctx.brief;
    const scope = [brief.homeType, brief.room, brief.mainGoal, brief.location || brief.city, brief.budgetLabel, brief.timeline || brief.completionTime].filter(Boolean).join(" · ");
    return { kind: "reply", text: `**Saved project scope:** ${scope || "The brief exists, but its main scope fields are incomplete."}${sourceLine(ctx, ["project brief"])}` };
  }
  if (/\b(phase|stage|timeline|progress)\b/.test(t) && ctx.phases?.length) {
    const phaseLines = ctx.phases
      .map((p) => `**${p.name}** — ${p.pct ?? 0}%${p.status ? ` (${p.status})` : ""}`)
      .join("\n");
    return { kind: "reply", text: `Project phases:\n${phaseLines}` };
  }

  for (const [key, nav] of Object.entries(NAV_ALIASES)) {
    if (t === key || t.startsWith(`${key} `) || t.includes(`open ${key}`) || t.includes(`show ${key}`)) {
      return { kind: "nav", nav };
    }
  }

  const addTask = t.match(/^(add task|create task|new task)\s+(.+)$/);
  if (addTask?.[2]) {
    return { kind: "addTask", title: addTask[2].trim() };
  }

  if (/\b(help|commands?|what can you)\b/.test(t)) {
    return {
      kind: "reply",
      text:
        "Try: **daily briefing**, **tasks**, **materials**, **how much cement**, **payments**, **documents**, **approvals**, **timeline**, **design journey**, or **add task** _tile samples_.",
    };
  }

  return null;
}

export function localHubAssistantReply(message, ctx) {
  const cmd = parseHubCommand(message, ctx);
  if (cmd?.kind === "reply") return { text: cmd.text, action: null };
  if (cmd?.kind === "nav") {
    return {
      text: `Opening **${cmd.nav}** for you.`,
      action: { type: "nav", nav: cmd.nav },
    };
  }
  if (cmd?.kind === "navigate") {
    return {
      text: `Taking you there now.`,
      action: { type: "path", path: cmd.path },
    };
  }
  if (cmd?.kind === "addTask") {
    return {
      text: `Added task: **${cmd.title}**`,
      action: { type: "addTask", title: cmd.title },
    };
  }

  if (!ctx.signedIn) {
    return {
      text: "I’m **Homi**, your project co-pilot. Sign in to see saved builds and v0 packs — or ask about **new build**, **remodel**, or **help**.",
      action: null,
    };
  }

  return {
    text: buildLatestBriefing(ctx),
    action: null,
  };
}
