import React from "react";
import { motion } from "framer-motion";
import { Bot, Calculator, FolderKanban, Quote, ShoppingCart } from "lucide-react";

const capabilityGroups = [
  {
    title: "Design & planning",
    Icon: Bot,
    items: ["New-home design concepts", "Remodel concepts", "Floor-plan directions", "Mood boards & ideabooks", "Design preferences & briefs"],
  },
  {
    title: "Estimates & decisions",
    Icon: Calculator,
    items: ["Indicative cost estimates", "Material takeoffs", "Quantity & brand editing", "Professional discovery", "Approval-ready suggestions"],
  },
  {
    title: "Project management",
    Icon: FolderKanban,
    items: ["Schedules & task management", "Daily briefings & site logs", "Documents & approvals", "Project-grounded AI Q&A", "Client project dashboard"],
  },
  {
    title: "Professionals & material planning",
    Icon: ShoppingCart,
    items: ["Professional portfolios & leads", "RFQ and proposal-stage tracking", "Editable material takeoffs", "Project-linked shopping checklist", "Payments & receipt ledger"],
  },
];

export default function LandingTestimonials() {
  return (
    <section className="border-y border-border/40 bg-[#FBF7F2] py-20 md:py-24">
      <div className="container max-w-6xl">
        <motion.div initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="mx-auto mb-12 max-w-4xl text-center">
          <span className="section-kicker">One connected BuildGuru workflow</span>
          <h2 className="mt-4 font-display text-4xl font-bold leading-tight text-foreground md:text-5xl">Connected tools for planning, hiring, and running a home project.</h2>
          <p className="mx-auto mt-5 max-w-3xl font-body text-sm leading-relaxed text-muted-foreground md:text-base">BuildGuru connects early design concepts, floor-plan directions, indicative estimates, material planning, professional discovery, and day-to-day project management. Agentic shopping and payment protection are coming soon.</p>
        </motion.div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {capabilityGroups.map(({ title, Icon, items }, groupIndex) => (
            <motion.article key={title} initial={{ opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: groupIndex * 0.07 }} className="rounded-2xl border border-border/60 bg-white p-6 shadow-sm">
              <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-copper/10 text-copper"><Icon className="h-5 w-5" /></div>
              <h3 className="font-display text-xl font-bold text-foreground">{title}</h3>
              <ul className="mt-4 space-y-3 p-0">
                {items.map((item) => <li key={item} className="flex gap-2 font-body text-sm leading-snug text-foreground/80"><span className="mt-[0.45rem] h-1.5 w-1.5 shrink-0 rounded-full bg-copper" />{item}</li>)}
              </ul>
            </motion.article>
          ))}
        </div>
        <div className="mt-12 border-t border-border/60 pt-10">
          <div className="mb-6"><span className="section-kicker">Illustrative perspectives</span><h3 className="mt-3 font-display text-2xl font-bold text-foreground md:text-3xl">How the connected workflow should feel</h3></div>
          <div className="grid gap-4 md:grid-cols-2">
            {[
              { role: "Sample homeowner", place: "Bengaluru · New home", text: "I can compare designs and estimate ranges first, then carry the decisions I approve into contractor matching, materials, and one project dashboard." },
              { role: "Sample architect", place: "Kochi · Residential practice", text: "A structured homeowner brief, visible approvals, and one trail for tasks and documents would make proposals, coordination, and client updates much clearer." },
            ].map((story) => <article key={story.role} className="rounded-2xl border border-border/60 bg-white p-6 shadow-sm"><div className="flex items-start justify-between gap-4"><Quote className="h-7 w-7 text-copper/35" /><span className="rounded-full border border-border bg-secondary/50 px-2.5 py-1 font-body text-[9px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Sample</span></div><p className="mt-5 font-body text-base leading-relaxed text-foreground">“{story.text}”</p><div className="mt-5 font-body text-sm font-bold text-foreground">{story.role}</div><div className="mt-1 font-body text-xs text-muted-foreground">{story.place} · Illustrative, not a customer claim</div></article>)}
          </div>
        </div>
      </div>
    </section>
  );
}
