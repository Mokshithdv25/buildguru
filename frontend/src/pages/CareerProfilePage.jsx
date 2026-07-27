import React, { useEffect, useState } from "react";
import { ArrowLeft, MapPin } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import LandingFooter from "../components/landing/LandingFooter";
import LandingNavbar from "../components/landing/LandingNavbar";
import { useMobileNative } from "../hooks/useMobileNative";
import { getPublishedCareerProfile } from "../lib/careersApi";
import "./CareerProfilePage.css";

const EXPERIENCE_LABELS = {
  under_2: "Under 2 years",
  "2_3": "2–3 years",
  "4_6": "4–6 years",
  "7_plus": "7+ years",
};

export default function CareerProfilePage() {
  const { slug } = useParams();
  const mobile = useMobileNative();
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    getPublishedCareerProfile(slug)
      .then((result) => active && setProfile(result))
      .catch((err) => active && setError(err?.message || "This portfolio is not available."));
    return () => { active = false; };
  }, [slug]);

  return (
    <div className="hm-career-profile">
      {!mobile ? <LandingNavbar tagline="Portfolio" /> : null}
      <main>
        <Link to="/careers" className="hm-career-profile-back"><ArrowLeft size={16} /> Careers</Link>
        {error ? <div className="hm-career-profile-empty"><h1>Portfolio unavailable</h1><p>{error}</p></div> : null}
        {!profile && !error ? <div className="hm-career-profile-empty"><p>Loading portfolio…</p></div> : null}
        {profile ? (
          <>
            <header>
              <p>HomeMakers portfolio</p>
              <h1>{profile.full_name}</h1>
              <div>
                {profile.city ? <span><MapPin size={15} />{profile.city}</span> : null}
                {profile.candidate_profile?.experience_range ? <span>{EXPERIENCE_LABELS[profile.candidate_profile.experience_range]}</span> : null}
              </div>
              <p className="hm-career-profile-bio">{profile.short_bio}</p>
              <div className="hm-career-profile-tags">
                {(profile.candidate_profile?.specialties || []).map((item) => <span key={item}>{item}</span>)}
              </div>
              {profile.candidate_profile?.tools ? <p className="hm-career-profile-tools"><strong>Tools:</strong> {profile.candidate_profile.tools}</p> : null}
            </header>
            <section>
              <p className="hm-career-profile-kicker">Selected work</p>
              <h2>Projects and process</h2>
              <div className="hm-career-profile-grid">
                {profile.work_sample_urls.map((url, index) => (
                  <figure key={url}>
                    <img src={url} alt={profile.work_sample_captions?.[index] || `Project sample ${index + 1}`} />
                    <figcaption>{profile.work_sample_captions?.[index]}</figcaption>
                  </figure>
                ))}
              </div>
            </section>
          </>
        ) : null}
      </main>
      {!mobile ? <LandingFooter /> : null}
    </div>
  );
}
