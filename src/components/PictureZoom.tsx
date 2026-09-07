// Shared full-size picture viewer: the 10KB thumbnail renders everywhere;
// clicking a profile picture opens THIS with the full-size image (S3 URL or
// legacy base64). One implementation, used by ProfileHeader + ProfileDetails.
interface PictureZoomProps {
  src: string;
  name?: string;
  sourceHref?: string; // attribution page for web-sourced pics (seeded orgs)
  onClose: () => void;
}

function PictureZoom({ src, name, sourceHref, onClose }: PictureZoomProps) {
  const openSource = (e: React.MouseEvent) => {
    if (!sourceHref) return;
    e.stopPropagation();
    window.open(sourceHref, '_blank', 'noopener');
  };
  return (
    <div className="pic-zoom" onClick={onClose}>
      <img
        src={src}
        alt={name || 'Full size picture'}
        className={`pic-zoom-img ${sourceHref ? 'src-linked' : ''}`}
        onClick={sourceHref ? openSource : undefined}
      />
      {sourceHref && (
        <a className="pic-zoom-source" href={sourceHref} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
          View original source ↗
        </a>
      )}
      <style>{`
        .pic-zoom {
          position: fixed; inset: 0; background: rgba(0, 0, 0, 0.9);
          display: flex; align-items: center; justify-content: center;
          flex-direction: column; gap: 14px;
          z-index: 600; cursor: zoom-out; padding: 16px;
        }
        .pic-zoom-img {
          max-width: min(92vw, 1000px); max-height: 88vh;
          border-radius: 8px; object-fit: contain; cursor: default;
          background: #111;
        }
        .pic-zoom-img.src-linked { cursor: pointer; }
        .pic-zoom-source {
          color: #9ec5ff; font-size: 13px; text-decoration: none;
          background: rgba(255,255,255,0.08); padding: 6px 12px;
          border-radius: 16px;
        }
        .pic-zoom-source:hover { background: rgba(255,255,255,0.16); }
      `}</style>
    </div>
  );
}

export default PictureZoom;