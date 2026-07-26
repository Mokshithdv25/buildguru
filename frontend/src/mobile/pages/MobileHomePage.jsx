import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowRight,
  BriefcaseBusiness,
  CheckCircle2,
  ChevronRight,
  FolderKanban,
  Search,
  ShoppingBag,
  Users,
} from "lucide-react";
import MobileCategoryRail from "../components/MobileCategoryRail";
import MobilePhotoGrid from "../components/MobilePhotoGrid";
import MobileSaveToast from "../components/MobileSaveToast";
import { useMobileIdeabooks } from "../MobileIdeabooksContext";
import { useMobileHub } from "../hooks/useMobileHub";
import { INDIAN_HOME_STYLES, INDIAN_ROOM_FILTERS } from "../mobileIA";
import { listPublishedPortfolios } from "../../lib/api";
import { getProEntryPath } from "../../lib/proEntryPath";
import { craftLabel, proCardImage, proDisplayName } from "../../components/PublishedProsDirectory";
import { hmLogoMarkSrc } from "../../lib/hmBrand";
import { publicAsset } from "../../lib/publicAsset";

const HOME_ACTIONS = [
  {
    id: "project",
    label: "Start a project",
    sub: "Build or remodel with one clear brief",
    path: "/build",
    icon: FolderKanban,
    image: "mobile_flow_build.jpg",
  },
  {
    id: "pros",
    label: "Find professionals",
    sub: "Browse real portfolios near you",
    path: "/browse",
    icon: Users,
    image: "mobile_flow_pros.jpg",
  },
  {
    id: "materials",
    label: "Browse materials",
    sub: "Compare practical picks for your project",
    path: "/shop",
    icon: ShoppingBag,
    image: "shop_flooring.png",
  },
  {
    id: "portfolio",
    label: "Create a portfolio",
    sub: "Publish your practice and get discovered",
    icon: BriefcaseBusiness,
    image: "pro_hero_banner.png",
  },
];

const HOMEOWNER_BENEFITS = [
  {
    title: "See the direction before you hire",
    text: "Turn your plot, rooms, style and budget into indicative layouts, visuals and estimate ranges.",
  },
  {
    title: "Find professionals with proof of work",
    text: "Compare local portfolios and share the same structured brief with the people you shortlist.",
  },
  {
    title: "Keep the build in one project hub",
    text: "Bring site photos, tasks, documents, team contacts and owner-recorded payments together.",
  },
  {
    title: "Choose materials with context",
    text: "Review material suggestions against your room, project stage and budget before you decide.",
  },
];

const PROFESSIONAL_BENEFITS = [
  "Create one polished, shareable portfolio",
  "Get discovered by homeowners in your city",
  "Receive clearer briefs before the first call",
  "Keep client details and project work together",
];

function resumeImage(card) {
  if (card.id === "remodel-resume") return publicAsset("mobile_flow_remodel.jpg");
  if (card.id === "project-active") return publicAsset("mobile_flow_project.jpg");
  return publicAsset("mobile_flow_build.jpg");
}

function prosToFeed(pros, craftFilter) {
  const out = [];
  pros.forEach((pro) => {
    if (craftFilter && pro.craft !== craftFilter) return;
    const imgs = [pro.cover_photo, ...(Array.isArray(pro.photos) ? pro.photos : [])].filter(Boolean);
    imgs.slice(0, 2).forEach((url, i) => {
      if (String(url).startsWith("data:")) return;
      out.push({
        id: `pro_${pro.id}_${i}`,
        title: proDisplayName(pro),
        room: craftLabel(pro.craft),
        style: pro.city ? `${pro.city}` : "India",
        url: proCardImage({ ...pro, cover_photo: url }),
        h: 220 + (i % 3) * 36,
        proSlug: pro.slug,
      });
    });
  });
  return out;
}

export default function MobileHomePage() {
  const navigate = useNavigate();
  const { toast, clearToast } = useMobileIdeabooks();
  const { resumeCards } = useMobileHub({ includeProCount: true });
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [pros, setPros] = useState([]);
  const [loadingFeed, setLoadingFeed] = useState(true);
  const [feedError, setFeedError] = useState("");

  const craftFilter = INDIAN_ROOM_FILTERS.find((item) => item.id === filter)?.craft || null;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingFeed(true);
      setFeedError("");
      try {
        const rows = await listPublishedPortfolios({ craft: craftFilter, limit: 24 });
        if (!cancelled) setPros(rows);
      } catch (error) {
        if (!cancelled) setFeedError(error?.message || "Could not load professional portfolios.");
      } finally {
        if (!cancelled) setLoadingFeed(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [craftFilter]);

  const feed = useMemo(() => prosToFeed(pros, craftFilter), [pros, craftFilter]);
  const continuationCards = useMemo(
    () => resumeCards.filter((card) => card.id !== "pros-nearby"),
    [resumeCards],
  );

  const onSearchSubmit = (event) => {
    event.preventDefault();
    const query = search.trim();
    navigate(query ? `/browse?q=${encodeURIComponent(query)}` : "/browse");
  };

  const openAction = (action) => {
    navigate(action.id === "portfolio" ? getProEntryPath() : action.path);
  };

  return (
    <>
      <header className="hm-m-home-header">
        <div className="hm-m-home-lockup">
          <img src={hmLogoMarkSrc} alt="" />
          <div>
            <div className="hm-m-home-brand">HomeMakers</div>
            <p className="hm-m-home-tagline">Projects · Design & estimates · Pros · Materials</p>
          </div>
        </div>
        <form className="hm-m-home-search" onSubmit={onSearchSubmit}>
          <Search size={18} color="#78716C" />
          <input
            placeholder="Search architects, contractors, painters…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            aria-label="Search professionals"
          />
          <button type="submit" aria-label="Search"><ArrowRight size={18} /></button>
        </form>
      </header>

      <section
        className="hm-m-home-hero"
        style={{
          backgroundImage: `linear-gradient(90deg,rgba(20,14,11,.90),rgba(20,14,11,.48) 62%,rgba(20,14,11,.12)),url(${publicAsset("landing-hero.png")})`,
        }}
      >
        <span>For homeowners and professionals</span>
        <h1>Your Indian home project, clear from idea to handover.</h1>
        <p>Create a brief, explore real Indian homes, find professionals and materials, then keep the work organized in one place.</p>
        <div>
          <button type="button" className="primary" onClick={() => navigate("/build")}>
            Start a project <ArrowRight size={17} />
          </button>
          <button type="button" onClick={() => navigate("/browse")}>Find professionals</button>
        </div>
      </section>

      {continuationCards.length > 0 ? (
        <section className="hm-m-resume-section">
          <div className="hm-m-section-row"><div><span>Welcome back</span><h2>Continue where you left off</h2></div></div>
          <div className="hm-m-resume-rail">
            {continuationCards.map((card) => (
              <button
                key={card.id}
                type="button"
                className="hm-m-resume-card"
                style={{ backgroundImage: `linear-gradient(90deg,rgba(19,15,12,.86),rgba(19,15,12,.18)),url(${resumeImage(card)})` }}
                onClick={() => navigate(card.path)}
              >
                <span className="hm-m-resume-kicker">Saved to your workspace</span>
                <strong>{card.label}</strong>
                <small>{card.sub}</small>
                <span className="hm-m-resume-action">Resume <ChevronRight size={16} /></span>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <div className="hm-m-section-heading">
        <div>
          <span>Start here</span>
          <h2>What do you need today?</h2>
          <p>Choose one clear path. You can bring everything together later.</p>
        </div>
      </div>
      <div className="hm-m-grid-2 hm-m-home-actions">
        {HOME_ACTIONS.map((action) => {
          const Icon = action.icon;
          return (
            <button key={action.id} type="button" className="hm-m-quick" onClick={() => openAction(action)}>
              <span className="hm-m-quick-media">
                <img src={publicAsset(action.image)} alt="" loading={action.id === "project" ? "eager" : "lazy"} decoding="async" />
                <span><Icon size={20} /></span>
              </span>
              <span className="hm-m-quick-content">
                <span className="hm-m-quick-label">{action.label}</span>
                <span className="hm-m-quick-sub">{action.sub}</span>
              </span>
            </button>
          );
        })}
      </div>

      <div className="hm-m-section-heading">
        <div>
          <span>Get inspired</span>
          <h2>Real Indian homes</h2>
          <p>Start with a regional direction that suits your climate, city and way of living.</p>
        </div>
        <button type="button" onClick={() => navigate("/design")}>See all</button>
      </div>
      <div className="hm-m-inspiration-rail">
        {INDIAN_HOME_STYLES.map((style) => (
          <button key={style.id} type="button" onClick={() => navigate("/design")}>
            <img src={publicAsset(style.image)} alt="" loading="lazy" />
            <span>
              <strong>{style.title}</strong>
              <small>{style.subtitle}</small>
            </span>
          </button>
        ))}
      </div>

      <div className="hm-m-section-heading">
        <div>
          <span>Why HomeMakers</span>
          <h2>Built around your role</h2>
          <p>A clear path for planning a home—and a clear path for growing a professional practice.</p>
        </div>
      </div>
      <section className="hm-m-audience-section">
        <article className="hm-m-audience-card homeowner">
          <span>For homeowners</span>
          <h3>Go from an idea to an organized build.</h3>
          <div className="hm-m-benefit-list">
            {HOMEOWNER_BENEFITS.map((benefit) => (
              <div key={benefit.title}>
                <CheckCircle2 size={20} />
                <p><strong>{benefit.title}</strong><small>{benefit.text}</small></p>
              </div>
            ))}
          </div>
          <button type="button" onClick={() => navigate("/build")}>Create your project <ArrowRight size={17} /></button>
        </article>

        <article className="hm-m-audience-card professional">
          <span>For professionals</span>
          <h3>Turn your work into a visible practice.</h3>
          <p>Architects, designers, engineers, contractors and skilled trades get one serious place to present their work and meet better-prepared homeowners.</p>
          <ul>
            {PROFESSIONAL_BENEFITS.map((benefit) => <li key={benefit}>{benefit}</li>)}
          </ul>
          <button type="button" onClick={() => navigate(getProEntryPath())}>Create your portfolio <ArrowRight size={17} /></button>
        </article>
      </section>

      <div className="hm-m-section-heading">
        <div>
          <span>Professionals on HomeMakers</span>
          <h2>See real work before you shortlist</h2>
        </div>
        <button type="button" onClick={() => navigate("/browse")}>Find pros</button>
      </div>
      <MobileCategoryRail categories={INDIAN_ROOM_FILTERS} activeId={filter} onSelect={setFilter} />
      {feedError ? (
        <p role="alert" className="hm-m-inline-error">{feedError}</p>
      ) : loadingFeed ? (
        <div className="hm-m-feed-skeleton" role="status" aria-label="Loading professional portfolios">
          {[0, 1, 2, 3].map((item) => <span key={item} />)}
        </div>
      ) : feed.length === 0 ? (
        <div className="hm-m-empty" style={{ margin: "0 16px 24px" }}>
          <p>No published portfolios yet for this filter.</p>
          <button type="button" className="hm-m-btn-primary" onClick={() => navigate(getProEntryPath())}>
            Create the first portfolio
          </button>
        </div>
      ) : (
        <MobilePhotoGrid photos={feed} />
      )}

      <section className="hm-m-home-final-cta">
        <span>One place to begin</span>
        <h2>Ready to make the next decision clearer?</h2>
        <div>
          <button type="button" className="primary" onClick={() => navigate("/build")}>Start a home project</button>
          <button type="button" onClick={() => navigate(getProEntryPath())}>Create a pro portfolio</button>
        </div>
      </section>

      <section className="hm-m-careers-strip">
        <div>
          <span>Careers at HomeMakers</span>
          <strong>Help make Indian home projects clearer.</strong>
        </div>
        <button type="button" onClick={() => navigate("/careers")}>Open roles <ArrowRight size={16} /></button>
      </section>

      <MobileSaveToast toast={toast} onViewIdeas={() => { clearToast(); navigate("/design"); }} />
    </>
  );
}
