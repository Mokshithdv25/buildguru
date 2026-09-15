import React, { useMemo } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { Bookmark, BookmarkCheck } from "lucide-react";
import MobileHeader from "../MobileHeader";
import BackButton from "../../components/BackButton";
import MobileSaveToast from "../components/MobileSaveToast";
import { useMobileIdeabooks } from "../MobileIdeabooksContext";

export default function MobilePhotoPage() {
  const { id } = useParams();
  const { state } = useLocation();
  const navigate = useNavigate();
  const { savePhoto, isSaved, toast, clearToast, books } = useMobileIdeabooks();

  const photo = useMemo(() => {
    if (state?.photo) return state.photo;
    for (const book of books) {
      const hit = book.items.find((i) => i.id === id);
      if (hit) return hit;
    }
    return null;
  }, [state, id, books]);

  if (!photo) {
    return (
      <>
        <MobileHeader title="Photo" backTo="/" />
        <div className="hm-m-empty">
          <p>Photo not found.</p>
          <BackButton to="/" label="Home" />
        </div>
      </>
    );
  }

  const saved = isSaved(photo.id);

  return (
    <>
      <MobileHeader title={photo.room || "Photo"} backTo={-1} />
      <div className="hm-m-photo-detail">
        <img src={photo.url} alt={photo.title || photo.room} />
        <div className="hm-m-photo-meta">
          {photo.style ? <span className="hm-m-pill active">{photo.style}</span> : null}
          <h1>{photo.title || photo.room}</h1>
          {photo.proSlug ? (
            <button type="button" className="hm-m-link-btn" onClick={() => navigate(`/profile/${photo.proSlug}`)}>
              View professional →
            </button>
          ) : null}
          <button
            type="button"
            className={`hm-m-btn-primary${saved ? " saved" : ""}`}
            onClick={() => !saved && savePhoto(photo)}
            disabled={saved}
          >
            {saved ? <BookmarkCheck size={18} /> : <Bookmark size={18} />}
            {saved ? "Saved to Ideabooks" : "Save to Ideabooks"}
          </button>
        </div>
      </div>
      <MobileSaveToast toast={toast} onViewIdeas={() => { clearToast(); navigate("/design"); }} />
    </>
  );
}
