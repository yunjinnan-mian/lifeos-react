const COLS = 4;

function tipText(item) {
  const parts = [item.note, item.usage].filter(Boolean);
  if (!parts.length) return '';
  const raw = parts.join('\n');
  return raw.length > 90 ? raw.slice(0, 88) + '…' : raw;
}

export default function InvGrid({ items, localPreviewCache, onAddSlot }) {
  const filled    = items.length;
  const remainder = filled % COLS;
  const emptyCount = remainder === 0 ? COLS : (COLS - remainder) + COLS;

  return (
    <div className="inv-grid">
      {/* Filled slots */}
      {items.map(item => {
        const url = localPreviewCache.get(item.id) || item.photoUrl;
        const tip = tipText(item);
        return (
          <div
            key={item.id}
            className="inv-slot-base inv-slot"
            data-tip={tip || undefined}
          >
            {url
              ? <img src={url} alt="" />
              : <div className="inv-slot-empty-icon">◈</div>
            }
          </div>
        );
      })}

      {/* Empty slots */}
      {Array.from({ length: emptyCount }).map((_, i) => (
        <div
          key={`empty-${i}`}
          className="inv-slot-base inv-slot-empty"
          onClick={onAddSlot}
        />
      ))}
    </div>
  );
}
