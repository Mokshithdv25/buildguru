import React, { useEffect } from "react";
import { Link, useParams } from "react-router-dom";

const GUIDES = [
  {
    slug: "home-construction-cost-estimate-india",
    title: "How to estimate home construction cost in India",
    description: "A practical way to turn plot size, built-up area, finishes, and professional fees into a useful early budget.",
    date: "2026-09-07",
    sections: [
      ["Start with built-up area", "Separate plot area from the built-up area you plan to construct. A first budget becomes more useful when the number of floors, rooms, and service areas are written down before comparing quotes."],
      ["Split the budget into work packages", "Keep structure, masonry, electrical, plumbing, doors and windows, flooring, kitchen, paint, approvals, and professional fees as separate lines. This makes scope gaps visible when two estimates look very different."],
      ["Keep a contingency", "Early concepts change. Keep a contingency reserve for site conditions, design changes, price movement, and items discovered after work begins. Treat an early estimate as a planning range, not a fixed quotation."],
      ["Validate before committing", "Use an architect, engineer, or contractor familiar with the local site and rules to validate quantities, specifications, approvals, and the final contract before construction."],
    ],
  },
  {
    slug: "home-remodeling-project-checklist",
    title: "A homeowner’s checklist for planning a remodel",
    description: "The decisions to make before a kitchen, bathroom, room, or whole-home remodel begins.",
    date: "2026-09-07",
    sections: [
      ["Define the outcome", "Write down what should improve: storage, circulation, daylight, maintenance, accessibility, energy use, or resale value. A clear outcome prevents a remodel from becoming a list of disconnected purchases."],
      ["Record the existing condition", "Photograph rooms, note measurements, and list plumbing, electrical, structural, and moisture issues. Existing conditions affect both sequence and cost."],
      ["Choose the specification level", "Decide where you need durable or premium materials and where standard products are acceptable. Compare complete installed costs, including delivery, labour, wastage, and taxes."],
      ["Agree on scope and handoffs", "Before work begins, document drawings, finishes, exclusions, milestones, payment terms, change-order rules, site access, and who is responsible for approvals."],
    ],
  },
  {
    slug: "how-to-choose-a-home-construction-professional",
    title: "How to choose a professional for your home project",
    description: "A clear process for comparing architects, designers, engineers, and contractors before hiring.",
    date: "2026-09-07",
    sections: [
      ["Match the professional to the job", "An architect may lead planning and approvals, an interior designer may focus on finishes and space, an engineer may handle technical design, and a contractor may execute the work. Many projects need a coordinated team."],
      ["Review relevant work", "Look for projects with a similar scale, budget, climate, and construction type. Ask what the professional personally handled and request references you can contact."],
      ["Compare the process, not only the fee", "Ask how site measurements, drawings, revisions, procurement, supervision, quality checks, and changes are managed. The cheapest quote can become expensive when responsibilities are unclear."],
      ["Use a written agreement", "Record scope, deliverables, schedule, fees, taxes, payment milestones, ownership of drawings, termination terms, and the process for resolving changes before work starts."],
    ],
  },
];

function SeoMeta({ title, description, url }) {
  useEffect(() => {
    document.title = `${title} | BuildGuru`;
    let descriptionTag = document.querySelector('meta[name="description"]');
    if (!descriptionTag) {
      descriptionTag = document.createElement("meta");
      descriptionTag.name = "description";
      document.head.appendChild(descriptionTag);
    }
    descriptionTag.content = description;
    let canonical = document.querySelector('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.rel = "canonical";
      document.head.appendChild(canonical);
    }
    canonical.href = `https://www.buildguru.ai${url}`;
    const schemaId = "buildguru-guide-schema";
    let schema = document.getElementById(schemaId);
    if (!schema) {
      schema = document.createElement("script");
      schema.id = schemaId;
      schema.type = "application/ld+json";
      document.head.appendChild(schema);
    }
    schema.textContent = JSON.stringify({ "@context": "https://schema.org", "@type": "Article", headline: title, description, url: `https://www.buildguru.ai${url}`, publisher: { "@type": "Organization", name: "BuildGuru", url: "https://www.buildguru.ai/" } });
    return () => schema.remove();
  }, [title, description, url]);

  return null;
}

export default function GuidesPage() {
  const { slug } = useParams();
  const guide = slug ? GUIDES.find((item) => item.slug === slug) : null;

  if (slug && !guide) {
    return <main className="min-h-screen bg-[#FBF7F2] px-6 py-20 text-center"><h1 className="font-serif-display text-3xl">Guide not found</h1><Link className="mt-5 inline-block text-[#A65427]" to="/guides">Browse BuildGuru guides</Link></main>;
  }

  if (!guide) {
    return (
      <main className="min-h-screen bg-[#FBF7F2] px-6 py-12 text-[#1C1917] md:py-20">
        <SeoMeta title="Home construction and remodeling guides" description="Practical BuildGuru guides for planning, budgeting, remodeling, and choosing professionals for a home project in India." url="/guides" />
        <div className="mx-auto max-w-5xl">
          <Link to="/" className="text-sm font-semibold text-[#A65427]">← BuildGuru</Link>
          <p className="mt-12 text-xs font-bold uppercase tracking-[0.18em] text-[#A65427]">BuildGuru guides</p>
          <h1 className="mt-3 max-w-3xl font-serif-display text-4xl font-semibold md:text-6xl">Plan your home project with more clarity.</h1>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-[#6B625A]">Useful, plain-language guidance for homeowners planning construction, remodeling, budgets, and professional handoffs in India.</p>
          <div className="mt-12 grid gap-5 md:grid-cols-3">
            {GUIDES.map((item) => <article key={item.slug} className="rounded-2xl border border-[#E9DCCF] bg-white p-6 shadow-sm"><p className="text-xs font-semibold text-[#A65427]">{item.date}</p><h2 className="mt-3 font-serif-display text-2xl font-semibold">{item.title}</h2><p className="mt-3 text-sm leading-relaxed text-[#6B625A]">{item.description}</p><Link className="mt-6 inline-block text-sm font-bold text-[#A65427]" to={`/guides/${item.slug}`}>Read guide →</Link></article>)}
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#FBF7F2] px-6 py-12 text-[#1C1917] md:py-20">
      <SeoMeta title={guide.title} description={guide.description} url={`/guides/${guide.slug}`} />
      <article className="mx-auto max-w-3xl">
        <Link to="/guides" className="text-sm font-semibold text-[#A65427]">← All guides</Link>
        <p className="mt-12 text-xs font-bold uppercase tracking-[0.18em] text-[#A65427]">BuildGuru guide · {guide.date}</p>
        <h1 className="mt-3 font-serif-display text-4xl font-semibold md:text-6xl">{guide.title}</h1>
        <p className="mt-5 text-xl leading-relaxed text-[#6B625A]">{guide.description}</p>
        <div className="mt-12 space-y-8">
          {guide.sections.map(([heading, body]) => <section key={heading}><h2 className="font-serif-display text-2xl font-semibold">{heading}</h2><p className="mt-2 text-base leading-8 text-[#4A433E]">{body}</p></section>)}
        </div>
        <div className="mt-14 rounded-2xl border border-[#E9DCCF] bg-white p-6"><h2 className="font-serif-display text-2xl font-semibold">Turn the plan into a project</h2><p className="mt-2 text-sm leading-relaxed text-[#6B625A]">BuildGuru helps homeowners organize a brief, explore early concepts, manage project documents, and connect with professionals.</p><Link className="mt-5 inline-block rounded-xl bg-[#A65427] px-5 py-3 text-sm font-bold text-white" to="/build">Start with BuildGuru</Link></div>
      </article>
    </main>
  );
}
