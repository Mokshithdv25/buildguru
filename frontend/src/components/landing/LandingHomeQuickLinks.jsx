import React from "react";
import { useNavigate } from "react-router-dom";
import { ArrowUpRight, Home, Hammer, LayoutDashboard, Briefcase, Store } from "lucide-react";
import { getProEntryPath } from "../../lib/proEntryPath";
import { navigateToHomeownerFlow } from "../../lib/requireHomeownerAuth";

const OR = "#C85F2B";

const PATHS = [
  {
    id: "new",
    title: "New home",
    description: "AI layouts, estimates, and a clear brief before you hire.",
    homeownerPath: "/build/new-home",
    icon: Home,
  },
  {
    id: "remodel",
    title: "Remodel",
    description: "Revamp your space with guided design and cost clarity.",
    homeownerPath: "/build/remodel",
    icon: Hammer,
  },
  {
    id: "hub",
    title: "Project hub",
    description: "Visits, photos, documents, and checklists. AI keeps next steps clear.",
    to: "/project",
    icon: LayoutDashboard,
  },
  {
    id: "marketplace",
    title: "Marketplace & shop",
    description: "Browse professionals and review an editable material plan before you shop.",
    to: "/browse",
    icon: Store,
  },
  {
    id: "pro",
    title: "For professionals",
    description: "Portfolio, marketplace leads, and a workspace to run jobs.",
    proEntry: true,
    icon: Briefcase,
  },
];

const JOURNEY = [
  { title: "Share your vision", text: "Capture the home, style, budget, and constraints in one brief." },
  { title: "Compare directions", text: "Review AI concepts, floor-plan directions, and estimate ranges." },
  { title: "Choose your team", text: "Match with professionals or bring the architect and contractor you trust." },
  { title: "Run the project", text: "Manage schedules, tasks, documents, materials, and approvals together." },
];

export default function LandingHomeQuickLinks() {
  const navigate = useNavigate();

  const onCardClick = (p) => {
    if (p.homeownerPath) {
      navigateToHomeownerFlow(navigate, p.homeownerPath);
      return;
    }
    if (p.proEntry) {
      navigate(getProEntryPath());
      return;
    }
    navigate(p.to);
  };

  return (
    <section className="border-b border-border/50 bg-gradient-to-b from-background to-secondary/15 py-16 md:py-20">
      <div className="container max-w-6xl">
        <p className="mb-3 font-display text-lg font-semibold leading-tight text-foreground md:text-xl">
          <span className="text-copper text-[1.35em] font-bold">AI</span>
          <span className="text-foreground">-powered flows</span>
        </p>
        <h2 className="mb-3 font-display text-[2.35rem] font-semibold leading-tight text-foreground sm:text-4xl md:text-[2.85rem]">
          Start <span className="italic" style={{ color: OR }}>here</span>
        </h2>
        <p className="mb-10 max-w-lg font-body text-sm text-muted-foreground md:text-base">
          Five paths. One platform. Pick what fits today.
        </p>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {PATHS.map((p) => {
            const Icon = p.icon;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => onCardClick(p)}
                className="surface-panel group flex h-full flex-col rounded-[1.25rem] p-5 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-copper/25 hover:shadow-md"
              >
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-copper/10">
                  <Icon className="h-5 w-5 text-copper" strokeWidth={2} />
                </div>
                <div className="mb-1 flex items-start justify-between gap-2">
                  <h3 className="font-display text-lg font-semibold text-foreground">{p.title}</h3>
                  <ArrowUpRight
                    className="h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
                    aria-hidden
                  />
                </div>
                <p className="m-0 flex-1 font-body text-sm leading-snug text-muted-foreground">{p.description}</p>
              </button>
            );
          })}
        </div>
        <div id="how-it-works" className="mt-14 border-t border-border/60 pt-12">
          <span className="section-kicker">How it works</span>
          <h2 className="mt-4 font-display text-3xl font-semibold leading-tight text-foreground md:text-4xl">From first sketch to a clearer project plan</h2>
          <p className="mt-3 max-w-2xl font-body text-sm leading-relaxed text-muted-foreground md:text-base">AI helps where it saves time. Homeowners and qualified professionals remain in control of every important decision.</p>
          <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {JOURNEY.map((step, index) => <article key={step.title} className="rounded-2xl border border-border/60 bg-white/80 p-5"><span className="font-body text-xs font-bold text-copper">0{index + 1}</span><h3 className="mt-3 font-display text-lg font-semibold text-foreground">{step.title}</h3><p className="mt-2 font-body text-sm leading-relaxed text-muted-foreground">{step.text}</p></article>)}
          </div>
        </div>
      </div>
    </section>
  );
}
