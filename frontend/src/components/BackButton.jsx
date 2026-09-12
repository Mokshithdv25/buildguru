import React from "react";
import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";

/** Consistent secondary navigation control used across the product. */
export default function BackButton({ to, label = "Back", className = "", onClick }) {
  const navigate = useNavigate();
  const handleClick = () => {
    if (onClick) return onClick();
    if (to) return navigate(to);
    return navigate(-1);
  };
  return (
    <button type="button" className={`hm-back-button ${className}`.trim()} onClick={handleClick}>
      <ArrowLeft size={16} strokeWidth={2} aria-hidden="true" />
      <span>{label}</span>
    </button>
  );
}
