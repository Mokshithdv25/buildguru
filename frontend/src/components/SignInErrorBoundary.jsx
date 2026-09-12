import React from "react";
import BackButton from "./BackButton";

/** Catches render errors on /sign-in so users see a message instead of a blank page. */
export default class SignInErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("[SignInPage]", error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen bg-[#FBF2E8] flex items-center justify-center p-6" role="alert">
          <div className="max-w-md w-full rounded-2xl border border-[#EEDCCB] bg-white p-8 shadow-lg">
            <h1 className="text-xl font-bold text-[#1C1917] mb-2">Sign-in could not load</h1>
            <p className="text-sm text-[#57534E] mb-4 leading-relaxed">
              Something went wrong loading this page. Try a hard refresh, or come back in a moment.
            </p>
            {process.env.NODE_ENV === "development" ? (
              <p className="text-xs text-[#78716C] font-mono break-all mb-6">
                {String(this.state.error?.message || this.state.error)}
              </p>
            ) : null}
            <BackButton to="/" label="Home" />
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
