import React from "react";

/**
 * BuildGuru logo — continuous curvy heart/peach shape from design-compass.
 * Uses the exact same SVG path from the original design system.
 * size: controls width/height in px (default matches marketing header)
 * color: stroke color override (default uses gold gradient)
 */
export default function HomeLogo({ size = 62, color }) {
  const id = "hmGold_" + Math.random().toString(36).slice(2, 7);
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 200 200"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="BuildGuru logo"
    >
      <defs>
        <linearGradient id={id} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#EBC494" />
          <stop offset="50%" stopColor="#C59353" />
          <stop offset="100%" stopColor="#8E5A2A" />
        </linearGradient>
      </defs>
      <path
        d="M 100 25
           C 75 35 35 55 25 80
           C 15 105 20 135 35 155
           C 50 175 80 165 100 145
           C 125 120 155 105 155 80
           C 155 50 120 50 100 85
           C 80 50 45 50 45 80
           C 45 105 75 120 100 145
           C 120 165 150 175 165 155
           C 180 135 185 105 175 80
           C 165 55 125 35 100 25
           Z"
        stroke={color || `url(#${id})`}
        strokeWidth="6"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill={color ? "none" : `url(#${id})`}
        fillOpacity="0.05"
      />
    </svg>
  );
}
