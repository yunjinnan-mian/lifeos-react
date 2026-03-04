export default function AnnotateSection({ onOpenImmersive }) {
  return (
    <div className="annotate-entry">
      <button className="ann-enter-btn" onClick={onOpenImmersive}>
        <span className="ann-enter-icon">🌿</span>
        <span className="ann-enter-title">沉浸式标注衣物</span>
        <span className="ann-enter-sub">季节 · 眼缘 · 备注</span>
      </button>
    </div>
  );
}
