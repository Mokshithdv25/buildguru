import React from "react";
import { motion } from "framer-motion";
import { Sparkles, Unlock, UsersRound, ClipboardList, CheckCircle2 } from "lucide-react";

const steps = [
  {
    icon: Sparkles,
    title: "Share your vision",
    description:
      "One brief for mood, plot, and budget. AI and your architect read the same story from day one.",
  },
  {
    icon: Unlock,
    title: "Unlock designs & estimates",
    description:
      "AI generates early layouts, visual concepts, and indicative cost ranges so your brief is easier to explain. Review at home, align family, then share with your team.",
  },
  {
    icon: UsersRound,
    title: "Bring in the right pros",
    description:
      "Browse professionals that fit your city and scope, or bring your own architect. You approve every hire before work starts.",
  },
  {
    icon: ClipboardList,
    title: "Run the build with clarity",
    description:
      "One AI-assisted hub for visits, photos, documents, checklists, and project questions—with schedule tracking and follow-ups. Agentic shopping is coming soon; today you can edit and approve a material plan before vendor pricing.",
  },
];

export default function LandingHowItWorks() {
  return (
    <section id="how-it-works" className="py-24 md:py-28 bg-secondary/70">
      <div className="container">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="max-w-3xl mb-16 md:mb-20"
        >
          <span className="section-kicker">
            <CheckCircle2 className="h-3.5 w-3.5" />
            How it works
          </span>
          <h2 className="font-display text-4xl md:text-5xl font-semibold text-foreground mt-4 mb-4 leading-tight">
            From first sketch to a clearer project plan
          </h2>
          <p className="text-muted-foreground font-body text-lg leading-relaxed max-w-2xl">
            AI helps at each stage: design, estimates, contractor matching, project management, and materials. Built
            for Indian homes. You approve what matters.
          </p>
        </motion.div>

        <div className="relative max-w-4xl">
          <div className="hidden md:block absolute left-[19px] top-8 bottom-8 w-px bg-border" aria-hidden />
          <div className="space-y-6 md:space-y-5">
            {steps.map((step, i) => (
              <motion.div
                key={step.title}
                initial={{ opacity: 0, x: -12 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.08 }}
                className="relative md:pl-14"
              >
                <div className="hidden md:flex absolute left-0 top-8 h-10 w-10 items-center justify-center rounded-full border-2 border-background bg-card shadow-sm z-[1]">
                  <span className="font-body text-xs font-bold text-copper tabular-nums">{i + 1}</span>
                </div>
                <div className="surface-panel p-6 md:p-8 md:grid md:grid-cols-[auto_1fr] md:gap-8 items-start">
                  <div className="flex md:flex-col items-center md:items-start gap-4 mb-4 md:mb-0">
                    <div className="md:hidden flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-background text-copper font-body text-xs font-bold">
                      {i + 1}
                    </div>
                    <div className="h-12 w-12 rounded-xl gradient-copper flex items-center justify-center shrink-0">
                      <step.icon className="w-6 h-6 text-primary-foreground" strokeWidth={1.5} />
                    </div>
                  </div>
                  <div>
                    <div className="font-body text-[10px] font-semibold text-copper tracking-[0.15em] uppercase mb-2">
                      Step {i + 1}
                    </div>
                    <h3 className="font-display text-xl md:text-2xl font-semibold text-foreground mb-2">
                      {step.title}
                    </h3>
                    <p className="text-muted-foreground font-body text-sm leading-relaxed max-w-prose">
                      {step.description}
                    </p>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
