import React from "react";
import { motion } from "framer-motion";
import { CheckCircle2 } from "lucide-react";

const features = [
  {
    id: 1,
    title: "AI design, plans & estimates",
    description:
      "Turn your brief into layouts, floor plans, visuals, and cost ranges your family can align on. Your vision, clear and shareable before sanction drawings.",
  },
  {
    id: 2,
    title: "AI professional matching",
    description:
      "Browse our marketplace or bring your own team. AI surfaces architects and contractors that fit your city and scope. You choose who to hire.",
  },
  {
    id: 3,
    title: "Smart project hub",
    description:
      "Site visits, documents, checklists, and team updates in one place. Smart reminders, schedule tracking, and follow-ups keep work moving. Agentic shopping suggests materials you approve.",
  },
  {
    id: 4,
    title: "Payment protection",
    description:
      "Milestone approvals for homeowners and predictable payouts for pros — funds release when work is signed off (escrow-style protection, coming soon).",
  },
];

export default function LandingWhyChooseUs() {
  return (
    <section className="border-y border-border/40 bg-secondary/40 py-16 md:py-20">
      <div className="container max-w-5xl">
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          transition={{ duration: 0.6 }}
          viewport={{ once: true }}
          className="mb-12 text-center"
        >
          <h2 className="mb-3 font-display text-4xl font-bold text-foreground md:text-5xl">Why choose BuildGuru</h2>
          <p className="mx-auto max-w-xl font-body text-base text-muted-foreground md:text-lg">
            Faster, smarter, seamless. AI where it saves you time. Real pros where it matters.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          transition={{ duration: 0.8 }}
          viewport={{ once: true }}
          className="grid grid-cols-1 gap-8 md:grid-cols-2"
        >
          {features.map((feature, idx) => (
            <motion.div
              key={feature.id}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: idx * 0.08 }}
              viewport={{ once: true }}
              className="flex gap-4 rounded-2xl border border-border/50 bg-card/50 p-5 pr-6 shadow-sm"
            >
              <CheckCircle2 className="h-8 w-8 shrink-0 text-green-600" />
              <div>
                <p className="mb-1 font-body text-lg font-semibold text-foreground">{feature.title}</p>
                <p className="m-0 font-body text-sm leading-relaxed text-muted-foreground">{feature.description}</p>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
