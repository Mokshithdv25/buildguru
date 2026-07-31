import React from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Search, ShoppingBag } from "lucide-react";
import MobileHeader from "../MobileHeader";
import { INDIAN_HOME_STYLES, INDIAN_ROOM_IDEAS } from "../mobileIA";
import { publicAsset } from "../../lib/publicAsset";

export default function MobileDesignPage() {
  const navigate = useNavigate();

  return (
    <>
      <MobileHeader title="Inspiration" subtitle="Indian homes, rooms & materials" />

      <section
        className="hm-m-design-hero"
        style={{
          backgroundImage: `linear-gradient(90deg,rgba(28,25,23,.84),rgba(28,25,23,.24)),url(${publicAsset("mobile_design_hero.jpg")})`,
        }}
      >
        <span>Designed for how India lives</span>
        <h1>Find a direction that feels like home.</h1>
        <p>Explore regional architecture and practical room ideas, then turn the direction you like into one clear project brief.</p>
      </section>

      <div className="hm-m-section-heading">
        <div>
          <span>Architecture</span>
          <h2>Indian homes, by style</h2>
          <p>Real directions from the same visual library used in your BuildGuru brief.</p>
        </div>
      </div>
      <div className="hm-m-style-stack">
        {INDIAN_HOME_STYLES.map((style) => (
          <button
            key={style.id}
            type="button"
            className="hm-m-style-card"
            onClick={() => navigate("/build", { state: { inspiration: style.id } })}
          >
            <img src={publicAsset(style.image)} alt="" loading={style.id === "kerala" ? "eager" : "lazy"} />
            <span className="hm-m-style-overlay">
              <strong>{style.title}</strong>
              <small>{style.subtitle}</small>
            </span>
          </button>
        ))}
      </div>

      <div className="hm-m-section-heading">
        <div>
          <span>Room ideas</span>
          <h2>Plan one space at a time</h2>
        </div>
      </div>
      <div className="hm-m-room-grid">
        {INDIAN_ROOM_IDEAS.map((room) => (
          <button key={room.id} type="button" onClick={() => navigate("/build", { state: { room: room.id } })}>
            <img src={publicAsset(room.image)} alt="" loading="lazy" />
            <span>{room.title}</span>
          </button>
        ))}
      </div>

      <section className="hm-m-idea-actions">
        <span>Ready to move forward?</span>
        <h2>Turn an idea into a real plan.</h2>
        <p>Start one project brief, or find a professional who already works in the style you like.</p>
        <div>
          <button type="button" className="primary" onClick={() => navigate("/build")}>
            Start a project <ArrowRight size={17} />
          </button>
          <button type="button" onClick={() => navigate("/browse")}>
            <Search size={17} /> Find professionals
          </button>
          <button type="button" onClick={() => navigate("/shop")}>
            <ShoppingBag size={17} /> Browse materials
          </button>
        </div>
      </section>
    </>
  );
}
