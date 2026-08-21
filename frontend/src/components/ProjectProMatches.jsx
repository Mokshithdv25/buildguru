import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Send, Sparkles } from "lucide-react";
import { suggestStartingTeam } from "../lib/proMatching";
import { inviteProToBid, listProjectInvites } from "../lib/projectBidsApi";
import { craftLabel, proDisplayName, proInitials } from "./PublishedProsDirectory";
import "./ProjectProMatches.css";

/**
 * The starting team a homeowner can approach right after posting their brief.
 * Inviting a professional makes the project appear at the top of their lead
 * inbox; it does not share the homeowner's contact details.
 */
export default function ProjectProMatches({
  projectId,
  brief = {},
  onNavigatePath,
  onInvited,
  compact = false,
}) {
  const [team, setTeam] = useState({ designers: [], builders: [], others: [], totalPublished: 0 });
  const [invitedIds, setInvitedIds] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState("");
  const [error, setError] = useState("");

  const briefKey = JSON.stringify({
    city: brief?.city || brief?.location || "",
    room: brief?.room || "",
    homeType: brief?.homeType || "",
    styles: brief?.styles || [],
    hasArchitect: Boolean(brief?.hasArchitect),
  });

  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([
      suggestStartingTeam(brief, compact ? { architectCount: 1, contractorCount: 2 } : undefined),
      projectId ? listProjectInvites(projectId) : Promise.resolve({ invites: [] }),
    ])
      .then(([suggested, inviteResult]) => {
        if (!active) return;
        setTeam(suggested);
        setInvitedIds(new Set((inviteResult.invites || []).map((row) => String(row.portfolio_id))));
      })
      .catch(() => {
        if (active) setTeam({ designers: [], builders: [], others: [], totalPublished: 0 });
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, briefKey, compact]);

  const invite = useCallback(async (pro) => {
    if (!projectId) {
      setError("Save your project before inviting professionals.");
      return;
    }
    setSavingId(pro.id);
    setError("");
    try {
      await inviteProToBid({
        projectId,
        portfolioId: pro.id,
        matchScore: pro.matchScore,
        matchReason: pro.matchReasons?.join(", ") || craftLabel(pro.craft),
      });
      setInvitedIds((current) => new Set(current).add(String(pro.id)));
      onInvited?.(pro);
    } catch (err) {
      setError(err?.message || "Could not send that invitation.");
    } finally {
      setSavingId("");
    }
  }, [projectId, onInvited]);

  const groups = useMemo(() => [
    {
      key: "designers",
      title: brief?.hasArchitect ? "Design review" : "Architects & designers",
      hint: brief?.hasArchitect
        ? "A second opinion on your existing drawings."
        : "Start here — they shape the layout before anything is priced.",
      rows: team.designers,
    },
    {
      key: "builders",
      title: "Contractors & engineers",
      hint: "They price and build the scope. Invite two or three to compare bids.",
      rows: team.builders,
    },
    {
      key: "others",
      title: "Other professionals nearby",
      hint: "Published profiles in your area.",
      rows: team.others,
    },
  ].filter((group) => group.rows.length), [team, brief?.hasArchitect]);

  const totalSuggested = groups.reduce((sum, group) => sum + group.rows.length, 0);

  return (
    <section className="hm-matches" aria-label="Suggested professionals">
      <div className="hm-matches__head">
        <p className="hm-matches__kicker"><Sparkles size={13} /> Suggested starting team</p>
        <h3>{brief?.hasArchitect ? "Contractors to approach first" : "Architects and contractors to approach first"}</h3>
        <p>
          Ranked from published profiles using trade, your city, project scope, specialties, and experience. Inviting a
          professional puts your brief at the top of their inbox so they can send a priced bid. Your name and contact
          details stay private until you accept a bid.
        </p>
      </div>

      {error ? <p className="hm-matches__error" role="alert">{error}</p> : null}

      {loading ? (
        <p className="hm-matches__empty">Finding professionals who fit this project…</p>
      ) : !totalSuggested ? (
        <p className="hm-matches__empty">
          No published professionals match this project yet. Your brief is still live for pros in your area, and new
          profiles are matched automatically as they publish.
        </p>
      ) : (
        groups.map((group) => (
          <div className="hm-matches__group" key={group.key}>
            <h4 className="hm-matches__group-title">{group.title} <span>{group.hint}</span></h4>
            <div className="hm-matches__grid">
              {group.rows.map((pro) => {
                const invited = invitedIds.has(String(pro.id));
                const busy = savingId === pro.id;
                return (
                  <article className="hm-matches__card" key={pro.id}>
                    <div className="hm-matches__card-top">
                      <div className="hm-matches__avatar">
                        {pro.profile_photo ? <img src={pro.profile_photo} alt="" /> : proInitials(pro)}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <strong>{proDisplayName(pro)}</strong>
                        <span>{[craftLabel(pro.craft), pro.city].filter(Boolean).join(" · ")}</span>
                      </div>
                    </div>

                    <div className="hm-matches__fit">
                      <div className="hm-matches__bar"><span style={{ width: `${pro.matchScore}%` }} /></div>
                      <strong>{pro.matchScore}% fit</strong>
                    </div>

                    {pro.matchReasons?.length ? (
                      <div className="hm-matches__reasons">
                        {pro.matchReasons.map((reason) => <span className="hm-matches__reason" key={reason}>{reason}</span>)}
                      </div>
                    ) : null}

                    <div className="hm-matches__actions">
                      {pro.slug ? (
                        <button type="button" className="hm-matches__button-secondary" onClick={() => onNavigatePath?.(`/profile/${pro.slug}`)}>
                          Profile
                        </button>
                      ) : null}
                      {invited ? (
                        <button type="button" className="hm-matches__button is-invited" disabled>
                          <Check size={13} /> Invited
                        </button>
                      ) : (
                        <button type="button" className="hm-matches__button" disabled={busy} onClick={() => invite(pro)}>
                          <Send size={13} /> {busy ? "Sending…" : "Invite to bid"}
                        </button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        ))
      )}

      <div className="hm-matches__footer">
        <p className="hm-matches__note">
          You are not committed to anyone you invite. Compare the bids that come back under Bids, then shortlist or accept.
        </p>
        <button type="button" className="hm-matches__link" onClick={() => onNavigatePath?.("/project/browse")}>
          Browse all professionals
        </button>
      </div>
    </section>
  );
}
