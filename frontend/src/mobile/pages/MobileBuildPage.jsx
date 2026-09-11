import React from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowRight, Check, Home, Images, MapPinned, Palette, Ruler, Sparkles, Wrench } from "lucide-react";
import MobileHeader from "../MobileHeader";
import { publicAsset } from "../../lib/publicAsset";
import { navigateToHomeownerFlow } from "../../lib/requireHomeownerAuth";

const NEW_HOME_STEPS = [
  { Icon: MapPinned, label: "Define plot" },
  { Icon: Ruler, label: "Plan rooms" },
  { Icon: Palette, label: "Choose style" },
  { Icon: Sparkles, label: "AI design + estimate" },
];

const REMODEL_STEPS = [
  { Icon: Images, label: "Add photos" },
  { Icon: Home, label: "Choose space" },
  { Icon: Wrench, label: "Set upgrades" },
  { Icon: Sparkles, label: "AI design + costs" },
];

function FlowCard({ image, badge, title, description, features, steps, onClick, accent = "copper" }) {
  return (
    <button
      type="button"
      className={`hm-m-build-card hm-m-build-card--${accent}`}
      onClick={onClick}
    >
      <img className="hm-m-flow-image" src={image} alt="" decoding="async" />
      <div className="hm-m-build-card__body">
        <span className="hm-m-flow-badge">{badge}</span>
        <div className="hm-m-build-card__heading">
          <h2>{title}</h2>
          <ArrowRight size={18} strokeWidth={2} aria-hidden />
        </div>
        <p>{description}</p>
        <div className="hm-m-flow-features">
          {features.map((feature) => (
            <span key={feature}>
              <Check size={13} strokeWidth={2.4} aria-hidden />
              {feature}
            </span>
          ))}
        </div>
        <div className="hm-m-build-steps" aria-label={`${title} steps`}>
          {steps.map(({ Icon, label }, index) => (
            <React.Fragment key={label}>
              <span className="hm-m-build-step">
                <Icon size={15} strokeWidth={1.8} aria-hidden />
                <small>{label}</small>
              </span>
              {index < steps.length - 1 ? <i aria-hidden>·</i> : null}
            </React.Fragment>
          ))}
        </div>
      </div>
    </button>
  );
}

export default function MobileBuildPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const fromPortfolio = (searchParams.get("source") || "").toLowerCase() === "portfolio";
  const referredPro = searchParams.get("pro") || "";
  const flowParams = new URLSearchParams();
  if (fromPortfolio) flowParams.set("source", "portfolio");
  if (referredPro) flowParams.set("pro", referredPro);
  const q = flowParams.toString() ? `?${flowParams.toString()}` : "";

  return (
    <>
      <MobileHeader title="What are you building?" subtitle="We'll tailor AI design & estimates" backTo="/" />
      <div className="hm-m-build-chooser">
        <div className="hm-m-build-chooser__intro">
          <span>Start with your home brief</span>
          <h1>Choose the path that fits your project.</h1>
          <p>Both paths end with a clear brief, AI concepts, an estimate, and a project hub you can keep using.</p>
        </div>
        <FlowCard
          image={publicAsset("mobile_flow_build.jpg")}
          badge="New construction"
          title="Build a new home"
          description="Describe your plot and lifestyle — get floor plans, renders, and a ballpark cost."
          features={["Saved brief", "AI exterior concepts", "Estimate + project hub"]}
          steps={NEW_HOME_STEPS}
          onClick={() => navigateToHomeownerFlow(navigate, "/build/new-home" + q)}
        />
        <FlowCard
          image={publicAsset("mobile_flow_remodel.jpg")}
          badge="Existing space"
          title="Renovate / remodel"
          description="Upload room photos, describe your vision, and get AI designs and costs."
          features={["Room photo upload", "AI remodel concepts", "Costs, tasks + pros"]}
          steps={REMODEL_STEPS}
          onClick={() => navigateToHomeownerFlow(navigate, "/build/remodel" + q)}
          accent="sand"
        />
      </div>
    </>
  );
}
