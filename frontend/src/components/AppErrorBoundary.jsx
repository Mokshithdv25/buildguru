import React from "react";
import { useLocation } from "react-router-dom";

/** Catch render errors so a thrown page never becomes a blank screen. */
class AppErrorBoundaryInner extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null, pathname: props.pathname };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  static getDerivedStateFromProps(props, state) {
    if (props.pathname !== state.pathname) {
      return { error: null, pathname: props.pathname };
    }
    return null;
  }

  componentDidCatch(error, info) {
    console.error("[AppErrorBoundary]", error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen bg-[#FBF7F2] flex items-center justify-center p-6" role="alert">
          <div className="max-w-md w-full rounded-2xl border border-[#EEDCCB] bg-white p-8 shadow-lg">
            <h1 className="text-xl font-bold text-[#1C1917] mb-2">This page could not load</h1>
            <p className="text-sm text-[#57534E] mb-4 leading-relaxed">
              Something went wrong rendering this screen. Go back or return home and try again.
            </p>
            {process.env.NODE_ENV === "development" ? (
              <p className="text-xs text-[#78716C] font-mono break-all mb-6">
                {String(this.state.error?.message || this.state.error)}
              </p>
            ) : null}
            <div className="flex flex-wrap gap-4">
              <button
                type="button"
                className="text-sm font-semibold text-[#C85F2B] hover:underline bg-transparent border-none cursor-pointer p-0"
                onClick={() => {
                  this.setState({ error: null });
                  window.history.back();
                }}
              >
                Go back
              </button>
              <a href="/" className="text-sm font-semibold text-[#C85F2B] hover:underline">
                Home
              </a>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function AppErrorBoundary({ children }) {
  const { pathname } = useLocation();
  return <AppErrorBoundaryInner pathname={pathname}>{children}</AppErrorBoundaryInner>;
}
