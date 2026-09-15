import React from "react";
import { ArrowLeft } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";

/** Consistent secondary navigation control used across the product. */
export default function BackButton({ to, label = "Back", className = "", onClick, iconOnly = false }) {
  const navigate = useNavigate();
  const handleClick = () => {
    if (onClick) return onClick();
    return navigate(-1);
  };

  const classes = `hm-back-button${iconOnly ? " hm-back-button--icon" : ""} ${className}`.trim();
  const content = (
    <>
      <ArrowLeft size={16} strokeWidth={2} aria-hidden="true" />
      <span className={iconOnly ? "sr-only" : undefined}>{label}</span>
    </>
  );

  if (to && !onClick) {
    return <Link to={to} className={classes} aria-label={iconOnly ? label : undefined}>{content}</Link>;
  }

  return <button type="button" className={classes} onClick={handleClick} aria-label={iconOnly ? label : undefined}>{content}</button>;
}
