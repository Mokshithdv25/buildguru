/** Local intent routing for Homi (pro dashboard) — works offline and as a
 * fallback when the AI backend is unavailable. Mirrors hubAssistantCommands
 * but is scoped to a professional's portfolio, leads, and studio workflow. */

function normalize(text) {
  return String(text || "")
    .toLowerCase()
    .trim()
    .replace(/[^\w\s]/g, " ");
}

const RESUME_PATH = "/craft";

function formatInr(value) {
  const number = Number(value || 0);
  return number > 0 ? `₹${number.toLocaleString("en-IN")}` : "not shared";
}

function leadSource() {
  return "\nSources: homeowner lead inbox.";
}

/** Studio briefing shown when the assistant opens / on "latest". */
export function buildProBriefing(ctx = {}) {
  const name = ctx.firstName ? `${ctx.firstName}, ` : "";
  if (!ctx.published) {
    const pct = ctx.profileStrength ? ` You're **${ctx.profileStrength}%** there.` : "";
    return `${name}your portfolio isn't live yet.${pct} Finish it to get a public link and show up in the marketplace. Say **edit portfolio** to continue, or ask me to **write my bio**.`;
  }
  const lines = [];
  lines.push(`${name}your profile is **live**${ctx.profileStrength ? ` (${ctx.profileStrength}% complete)` : ""}.`);
  if (ctx.newLeadCount) lines.push(`You have **${ctx.newLeadCount}** new homeowner ${ctx.newLeadCount === 1 ? "lead" : "leads"} to review.`);
  if (ctx.followUpCount) lines.push(`There ${ctx.followUpCount === 1 ? "is" : "are"} **${ctx.followUpCount}** ${ctx.followUpCount === 1 ? "follow-up" : "follow-ups"} in your pipeline.`);
  if (ctx.activeProjectCount) lines.push(`You have **${ctx.activeProjectCount}** active ${ctx.activeProjectCount === 1 ? "project" : "projects"}.`);
  if (!ctx.leadCount) lines.push("Your homeowner lead pipeline is clear today.");
  lines.push("Say **review leads**, **open active work**, **share my link**, or ask me to **draft a client update**.");
  return lines.join(" ");
}

/** Compose a professional bio from portfolio fields — genuinely useful offline. */
export function draftProBio(ctx = {}) {
  const craft = (ctx.craftLabel || "building professional").toLowerCase();
  const who = ctx.businessName || ctx.firstName || "We";
  const isCompany = Boolean(ctx.businessName);
  const verb = isCompany ? "is" : "am";
  const subject = isCompany ? who : "I";
  const city = ctx.city ? ` based in ${ctx.city}` : "";
  const years = ctx.years ? ` with ${ctx.years}+ years of experience` : "";
  const specialties =
    Array.isArray(ctx.specialties) && ctx.specialties.length
      ? ` We specialise in ${ctx.specialties.slice(0, 3).join(", ")}.`
      : "";
  return [
    `${subject} ${verb} a trusted ${craft}${city}${years}.`,
    `From first concept to handover, ${isCompany ? who : "I"} focus${isCompany ? "es" : ""} on honest timelines, clear budgets, and craftsmanship that lasts.${specialties}`,
    `Browse the work below and reach out — let's build something you'll love coming home to.`,
  ].join(" ");
}

/** Draft a short client status update message. */
export function draftClientUpdate(ctx = {}) {
  const who = ctx.businessName || ctx.firstName || "the team";
  const active = (Array.isArray(ctx.leads) ? ctx.leads : []).find((lead) => lead.status === "won");
  const project = active?.title || "[project name]";
  return [
    `Hi! Quick update from ${who} on ${project}:`,
    `• Completed since the last update: [confirm from the project board].`,
    `• Next milestone: [confirm task and date${active?.timeline ? `; current target is ${active.timeline}` : ""}].`,
    `• Decision needed from you: [add the exact approval, if any].`,
    `Please review these details before sending. Reply with any questions and we can update the plan together.`,
  ].join("\n");
}

export function parseProCommand(message, ctx = {}) {
  const t = normalize(message);
  if (!t) return null;

  if (/\b(preview|view profile|as (a )?client|see my profile)\b/.test(t)) {
    return { kind: "preview" };
  }
  if (/\b(copy( my)? link|share( my)? link|share|link)\b/.test(t)) {
    return { kind: "copyLink" };
  }
  if (/\b(edit|portfolio|profile setup|onboard|continue|finish)\b/.test(t)) {
    return { kind: "navigate", path: RESUME_PATH };
  }
  if (/\b(which|what).*\b(leads?|opportunities).*\b(attention|priority|urgent|today)\b/.test(t)) {
    const leads = Array.isArray(ctx.leads) ? ctx.leads : [];
    const priorities = leads
      .filter((lead) => lead.homeownerDecision === "accepted" || lead.status === "new" || lead.status === "bid_submitted" || lead.status === "proposal_sent" || lead.targeted)
      .slice(0, 6);
    const priorityReason = (lead) => {
      if (lead.homeownerDecision === "accepted") return "bid accepted — start the engagement";
      if (lead.homeownerDecision === "shortlisted") return "shortlisted by the homeowner";
      if (lead.status === "bid_submitted") return "bid awaiting a decision";
      if (lead.status === "proposal_sent") return "proposal follow-up";
      if (lead.targeted) return "sent directly to you";
      return "new";
    };
    const rows = priorities.length
      ? priorities.map((lead) => `○ ${lead.title} · ${lead.city || "Location pending"} · ${priorityReason(lead)}`).join("\n")
      : "No homeowner leads need immediate attention.";
    return { kind: "reply", text: `**Lead priorities:**\n${rows}\nSources: homeowner lead inbox.` };
  }
  if (/\b(summarize|summary|show|review).*\b(active work|active projects?|won projects?)\b/.test(t)) {
    const active = (Array.isArray(ctx.leads) ? ctx.leads : []).filter((lead) => lead.status === "won");
    const rows = active.length
      ? active.map((lead) => `○ ${lead.title} · ${lead.city || "Location pending"} · ${lead.timeline || "timeline to confirm"}`).join("\n")
      : "No projects are in active work yet.";
    return { kind: "reply", text: `**Active work:**\n${rows}\nSources: homeowner lead inbox.` };
  }
  if (/^(lead|leads|quotes?|bids?|proposals?|rfq)$/.test(t) || /\b(open|show|review|go to)\b.*\b(leads?|quotes?|bids?|proposals?|rfq)\b/.test(t)) {
    return { kind: "navigate", path: "/pro/leads" };
  }
  if (/\b(shop|buy|supplies)\b/.test(t) || /\b(open|show|go to)\b.*\bmaterials?\b/.test(t)) {
    return { kind: "navigate", path: "/shop" };
  }
  if (/\b(bio|about|description|intro|write my)\b/.test(t)) {
    return { kind: "reply", text: `Here's a draft bio you can use — tweak and paste into your portfolio:\n\n${draftProBio(ctx)}` };
  }
  if (/\b(client update|status update|message|update my client)\b/.test(t)) {
    return { kind: "reply", text: `Here's an approval-ready draft. Fill the bracketed facts from the shared project board before sending—nothing has been sent automatically.\n\n${draftClientUpdate(ctx)}` };
  }
  if (/\b(estimate|quote draft|takeoff|boq|costing)\b/.test(t)) {
    return {
      kind: "reply",
      text: "For a quick estimate: list each line item, its quantity, and a unit rate — I'll total it. Open the relevant homeowner lead to keep the quote tied to the right opportunity.",
    };
  }
  if (/\b(budget|budget range|project value|cost range)\b/.test(t)) {
    const rows = (ctx.leads || []).slice(0, 8).map((lead) => {
      const range = lead.budgetMax
        ? `${formatInr(lead.budgetMin)}–${formatInr(lead.budgetMax)}`
        : formatInr(lead.budgetMin);
      return `○ ${lead.title}: ${range}`;
    });
    return { kind: "reply", text: `**Shared project budgets:**\n${rows.length ? rows.join("\n") : "No project budget ranges are shared yet."}${leadSource()}` };
  }
  if (/\b(scope|style|styles|timeline|location|where|what are they building|project details?)\b/.test(t)) {
    const rows = (ctx.leads || []).slice(0, 8).map((lead) => {
      const details = [lead.scope, lead.city, lead.timeline || "timeline to confirm", ...(lead.styles || []).slice(0, 2)].filter(Boolean);
      return `○ ${lead.title}: ${details.join(" · ")}`;
    });
    return { kind: "reply", text: `**Shared project details:**\n${rows.length ? rows.join("\n") : "No homeowner project details are shared yet."}${leadSource()}` };
  }
  if (/\b(latest|what'?s new|update|status|briefing|summary|today)\b/.test(t)) {
    return { kind: "reply", text: buildProBriefing(ctx) };
  }
  if (/^(project|projects|active work)$/.test(t) || /\b(open|show|go to|manage)\b.*\b(projects?|active work|client dashboard)\b/.test(t)) {
    return { kind: "navigate", path: "/pro/leads?status=won" };
  }
  if (/\b(help|commands?|what can you)\b/.test(t)) {
    return {
      kind: "reply",
      text:
        "I can: **review homeowner leads**, **open active work**, **preview as client**, **share my link**, **edit portfolio**, **write my bio**, or **draft a client update**.",
    };
  }
  return null;
}

export function localProAssistantReply(message, ctx = {}) {
  const cmd = parseProCommand(message, ctx);
  if (cmd?.kind === "reply") return { text: cmd.text, action: null };
  if (cmd?.kind === "preview") {
    return { text: "Opening your profile the way a client sees it.", action: { type: "preview" } };
  }
  if (cmd?.kind === "copyLink") {
    return ctx.published
      ? { text: "Copied your profile link to the clipboard — paste it anywhere.", action: { type: "copyLink" } }
      : { text: "Your profile isn't live yet — finish your portfolio first to get a shareable link.", action: null };
  }
  if (cmd?.kind === "navigate") {
    return { text: "Taking you there now.", action: { type: "path", path: cmd.path } };
  }
  return { text: buildProBriefing(ctx), action: null };
}
