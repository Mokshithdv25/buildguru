import React from "react";
import "./HmHomiMascot.css";

/** Friendly Homi mascot — CSS character (no external assets). Pro dashboard only. */
export default function HmHomiMascot({ size = 48, variant = "default" }) {
  const s = size;
  return (
    <div
      className={`hm-homi-mascot hm-homi-mascot--${variant}`}
      style={{ width: s, height: s }}
      aria-hidden
    >
      <div className="hm-homi-mascot__glow" />
      <div className="hm-homi-mascot__body">
        <div className="hm-homi-mascot__visor">
          <span className="hm-homi-mascot__eye" />
          <span className="hm-homi-mascot__eye" />
        </div>
        <div className="hm-homi-mascot__smile" />
      </div>
      <div className="hm-homi-mascot__hardhat" />
      <div className="hm-homi-mascot__antenna" />
    </div>
  );
}
