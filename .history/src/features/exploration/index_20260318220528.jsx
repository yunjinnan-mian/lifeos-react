// ============================================================
// ExplorationModal — 手账纸张 · 行内记录 · 搜索 · 时间轴
// ============================================================
import { useState, useRef, useEffect } from 'react';
import { db, DB, collection, query, where, onSnapshot } from '../../lib/firebase.js';
import { compressWebP } from '../../lib/photo.js';
import './exploration.css';

// ── 日期工具 ─────────────────────────────────────────────
function todayStr() {
  return new Date().toISOString().slice(0, 10);
}
function fmtDateShort(d) {
  if (!d) return '';
  const [, m, day] = d.split('-');
  return `${parseInt(m)}·${parseInt(day)}`;
}

// ── 确定性旋转（手账贴图用）─────────────────────────────
function deterministicRotation(seed, range = 3) {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 0x01000193);
  return (((h >>> 0) / 0xFFFFFFFF) * range * 2 - range).toFixed(2);
}

// ── 搜索模式识别 ─────────────────────────────────────────
// 数字/数字、N月N日、N月、单数字 → 日期跳转；其余 → 文本搜索
function detectSearchMode(q) {
  const s = q.trim();
  if (!s) return null;
  if (/^\d{1,2}[\/\-·\.]\d{1,2}$/.test(s)) return 'date';
  if (/^\d{1,2}月(\d{1,2}日?)?$/.test(s)) return 'date';
  return 'text';
}

function parseSearchDate(q, year) {
  const s = q.trim();
  let m, d, match;
  if ((match = s.match(/^(\d{1,2})[\/\-·\.](\d{1,2})$/))) { [, m, d] = match; }
  else if ((match = s.match(/^(\d{1,2})月(\d{1,2})日?$/))) { [, m, d] = match; }
  else if ((match = s.match(/^(\d{1,2})月$/))) { m = match[1]; d = '1'; }
  if (!m) return null;
  return `${year}-${String(m).padStart(2, '0')}-${String(d || '1').padStart(2, '0')}`;
}

/* 订阅某个探索岛的所有条目，isOpen/zoneId 变化时重新订阅 */
function useExplorationEntries(isOpen, zoneId) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!isOpen || !zoneId) return;
    setLoading(true);
    setEntries([]);
    const q = query(collection(db, 'explorationEntries'), where('islandId', '==', zoneId));
    const unsub = onSnapshot(q, snap => {
      setEntries(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    }, err => { console.error('exp snapshot:', err); setLoading(false); });
    return () => unsub();
  }, [isOpen, zoneId]);
  return { entries, loading };
}

// ============================================================
// 主组件
// ============================================================
export default function ExplorationModal({ isOpen, zone, onClose }) {
  const [activeCat, setActiveCat] = useState('all');
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTimelineDate, setActiveTimelineDate] = useState(null);

  const notebookRef = useRef(null);
  const dateSectionRefs = useRef(new Map()); // date → first card DOM el
  const timelineRef = useRef(null);
  const timelineDotRefs = useRef(new Map()); // date → dot button el
  const observerRef = useRef(null);

  // ── Firebase 订阅 ────────────────────────────────────────
  useEffect(() => {
    if (!isOpen || !zone?.id) return;
    setLoading(true);
    setEntries([]);
    setActiveCat('all');
    setSearchQuery('');
    setActiveTimelineDate(null);

    const q = query(collection(db, 'explorationEntries'), where('islandId', '==', zone.id));
    const unsub = onSnapshot(q, snap => {
      setEntries(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    }, err => { console.error('exp snapshot:', err); setLoading(false); });
    return () => unsub();
  }, [isOpen, zone?.id]);

  // ── 派生数据 ─────────────────────────────────────────────
  const searchMode = detectSearchMode(searchQuery);
  const catFiltered = entries.filter(e => activeCat === 'all' || e.categoryId === activeCat);
  const allDates = [...new Set(catFiltered.map(e => e.date))].sort();

  const filtered = catFiltered
    .filter(e => {
      if (!searchQuery.trim() || searchMode === 'date') return true;
      return e.text?.toLowerCase().includes(searchQuery.toLowerCase());
    })
    .sort((a, b) => b.date.localeCompare(a.date));

  // ── IntersectionObserver：滚动时更新时间轴激活点 ─────────
  useEffect(() => {
    if (!notebookRef.current || allDates.length === 0) return;
    observerRef.current?.disconnect();

    const observer = new IntersectionObserver(ioEntries => {
      const visible = ioEntries
        .filter(e => e.isIntersecting)
        .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      if (visible.length > 0) {
        const date = visible[0].target.dataset.date;
        if (date) setActiveTimelineDate(date);
      }
    }, {
      root: notebookRef.current,
      rootMargin: '0px 0px -70% 0px',
      threshold: 0,
    });

    dateSectionRefs.current.forEach(el => observer.observe(el));
    observerRef.current = observer;
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allDates.join(',')]);

  // ── 时间轴刻度自动居中 ───────────────────────────────────
  useEffect(() => {
    if (!activeTimelineDate) return;
    timelineDotRefs.current.get(activeTimelineDate)
      ?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }, [activeTimelineDate]);

  // ── 搜索→日期跳转 ────────────────────────────────────────
  useEffect(() => {
    if (searchMode !== 'date' || !searchQuery.trim()) return;
    const year = new Date().getFullYear().toString();
    const target = parseSearchDate(searchQuery, year);
    if (!target) return;
    // 找最近的有记录的日期
    const closest = allDates.find(d => d >= target) ?? allDates[allDates.length - 1];
    if (closest) scrollToDate(closest);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery]);

  function scrollToDate(dateStr) {
    const el = dateSectionRefs.current.get(dateStr);
    if (el && notebookRef.current) {
      // offsetTop relative to notebook scroll container
      let offset = 0;
      let node = el;
      while (node && node !== notebookRef.current) { offset += node.offsetTop; node = node.offsetParent; }
      notebookRef.current.scrollTo({ top: offset - 28, behavior: 'smooth' });
      setActiveTimelineDate(dateStr);
    }
  }

  // ── 保存条目 ─────────────────────────────────────────────
  async function handleSaveEntry(data) {
    const entryId = `entry_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const now = Date.now();
    const uploadedPhotos = [];

    for (let i = 0; i < data.photos.length; i++) {
      try {
        const blob = await compressPhoto(data.photos[i].file);
        const result = await DB.uploadExplorationPhoto(entryId, i, blob);
        uploadedPhotos.push(result);
      } catch (e) { console.error(`photo[${i}]:`, e); }
    }

    await DB.saveExplorationEntry(entryId, {
      islandId: data.islandId,
      categoryId: data.categoryId ?? null,
      date: data.date,
      text: data.text,
      photos: uploadedPhotos,
      createdAt: now,
      updatedAt: now,
    });
  }

  if (!isOpen || !zone) return null;
  const cats = zone.cats || [];

  return (
    <div className="modal-overlay open" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="exp-scope">
        <div className="exp-wrapper">

          {/* ── Header ── */}
          <div className="exp-header">
            <div className="exp-header-title">
              <span>{zone.emoji || '🔭'}</span>
              <span>{zone.name}</span>
            </div>
            <div className="exp-search-wrap">
              <input
                className="exp-search-input"
                type="text"
                placeholder="搜索 / 3·8"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <span className="exp-search-mode-tag">
                  {searchMode === 'date' ? '→日期' : '→搜索'}
                </span>
              )}
              {searchQuery && (
                <button className="exp-search-clear" onClick={() => setSearchQuery('')}>×</button>
              )}
            </div>
          </div>

          {/* ── 分类 chip bar ── */}
          {cats.length > 0 && (
            <div className="exp-cat-bar">
              <button className={`exp-cat-chip${activeCat === 'all' ? ' active' : ''}`} onClick={() => setActiveCat('all')}>全部</button>
              {cats.map(cat => (
                <button key={cat.id} className={`exp-cat-chip${activeCat === cat.id ? ' active' : ''}`} onClick={() => setActiveCat(cat.id)}>
                  {cat.emoji ? `${cat.emoji} ` : ''}{cat.label || cat.id}
                </button>
              ))}
            </div>
          )}

          {/* ── 时间轴 ── */}
          {allDates.length > 0 && (
            <div className="exp-timeline-rail" ref={timelineRef}>
              <div className="exp-timeline-track">
                {allDates.map(date => (
                  <button
                    key={date}
                    ref={el => { if (el) timelineDotRefs.current.set(date, el); else timelineDotRefs.current.delete(date); }}
                    className={`exp-date-dot${date === activeTimelineDate ? ' active' : ''}`}
                    onClick={() => scrollToDate(date)}
                  >
                    <div className="exp-date-dot-circle" />
                    <div className="exp-date-dot-label">{fmtDateShort(date)}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── Notebook ── */}
          <div className="exp-notebook" ref={notebookRef}>
            <div className="exp-entries-area">

              {loading && (
                <div className="exp-empty">
                  <div className="exp-empty-icon">⏳</div>
                  <div>加载中…</div>
                </div>
              )}

              {!loading && entries.length === 0 && (
                <div className="exp-empty">
                  <div className="exp-empty-icon">🔭</div>
                  <div>还没有记录</div>
                  <div style={{ fontSize: '12px', opacity: .6 }}>在下方写下第一篇观察</div>
                </div>
              )}

              {!loading && searchMode === 'text' && filtered.length === 0 && entries.length > 0 && (
                <div className="exp-empty">
                  <div className="exp-empty-icon">🔍</div>
                  <div>没有找到「{searchQuery}」</div>
                </div>
              )}

              {!loading && filtered.map((entry, idx) => {
                const showDate = idx === 0 || filtered[idx - 1].date !== entry.date;
                return (
                  <EntryCard
                    key={entry.id}
                    entry={entry}
                    showDate={showDate}
                    dateRef={showDate ? el => {
                      if (el) dateSectionRefs.current.set(entry.date, el);
                      else dateSectionRefs.current.delete(entry.date);
                    } : null}
                  />
                );
              })}

              {/* 行内编辑器：始终挂在列表底部 */}
              {!loading && (
                <InlineComposer
                  zone={zone}
                  activeCat={activeCat !== 'all' ? activeCat : null}
                  onSave={handleSaveEntry}
                />
              )}

            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

// ============================================================
// 条目卡片
// ============================================================
function EntryCard({ entry, showDate, dateRef }) {
  const photos = entry.photos ?? [];
  const rot1 = deterministicRotation(entry.id + '_0');
  const rot2 = deterministicRotation(entry.id + '_1');
  const [, m, d] = entry.date ? entry.date.split('-') : ['', '', ''];
  const textRef = useRef(null);
  // 用 ref 追踪最新保存的文字，避免 onBlur 闭包捕获旧值
  const savedText = useRef(entry.text ?? '');

  // 当 Firebase 外部更新时同步内容（非编辑状态下）
  useEffect(() => {
    const el = textRef.current;
    if (!el) return;
    if (document.activeElement !== el && el.innerText.replace(/\n$/, '') !== (entry.text ?? '')) {
      el.innerText = entry.text ?? '';
      savedText.current = entry.text ?? '';
    }
  }, [entry.text]);

  function handleBlur() {
    const el = textRef.current;
    if (!el) return;
    const current = el.innerText.replace(/\n$/, '').trim();
    if (current === savedText.current) return;
    savedText.current = current;
    DB.patchExplorationEntry(entry.id, { text: current }).catch(e => console.error('patch text:', e));
  }

  // 粘贴时剥离 HTML，只保留纯文本
  function handlePaste(e) {
    e.preventDefault();
    const text = e.clipboardData.getData('text/plain');
    document.execCommand('insertText', false, text);
  }

  return (
    <div className="exp-entry-card" ref={dateRef} data-date={entry.date}>
      {showDate && (
        <div className="exp-entry-date">{parseInt(m)}·{parseInt(d)}</div>
      )}

      <div
        ref={textRef}
        className="exp-entry-text"
        contentEditable
        suppressContentEditableWarning
        spellCheck={false}
        onBlur={handleBlur}
        onPaste={handlePaste}
        dangerouslySetInnerHTML={{ __html: entry.text ?? '' }}
      />

      {photos.length > 0 && (
        <div className="exp-entry-photos-sticker">
          {photos.map((p, idx) => (
            <div key={idx} className="exp-photo-frame" style={{ transform: `rotate(${idx === 0 ? rot1 : rot2}deg)` }}>
              <img src={p.url} alt="" loading="lazy" draggable={false} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================
// 行内编辑器
// ============================================================
function InlineComposer({ zone, activeCat, onSave }) {
  const [photos, setPhotos] = useState([]);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef(null);
  const contentRef = useRef(null);
  const today = todayStr();

  useEffect(() => {
    return () => { photos.forEach(p => URL.revokeObjectURL(p.previewUrl)); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleAddPhoto() {
    if (photos.length >= 2) return;
    fileRef.current?.click();
  }
  function handleFileChange(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setPhotos(prev => [...prev, { previewUrl: URL.createObjectURL(file), file }]);
  }
  function handleRemovePhoto(idx) {
    setPhotos(prev => {
      URL.revokeObjectURL(prev[idx].previewUrl);
      return prev.filter((_, i) => i !== idx);
    });
  }
  function handlePaste(e) {
    e.preventDefault();
    const text = e.clipboardData.getData('text/plain');
    document.execCommand('insertText', false, text);
  }

  async function handleSave() {
    if (saving) return;
    const text = contentRef.current?.innerText.replace(/\n$/, '').trim() ?? '';
    if (!text && photos.length === 0) return;
    setSaving(true);
    try {
      await onSave({ text, photos, date: today, islandId: zone.id, categoryId: activeCat ?? null });
      if (contentRef.current) contentRef.current.innerText = '';
      setPhotos([]);
    } catch (e) {
      console.error('save:', e);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="exp-composer">
      <div
        ref={contentRef}
        className="exp-composer-content"
        contentEditable={!saving}
        suppressContentEditableWarning
        spellCheck={false}
        onPaste={handlePaste}
        data-placeholder="写下今天观察到的…"
      />
      <div className="exp-composer-toolbar">
        <div className="exp-composer-photos">
          {photos.map((p, idx) => (
            <div key={idx} className="exp-composer-photo-thumb">
              <img src={p.previewUrl} alt="" />
              {!saving && (
                <button className="exp-composer-photo-remove" onClick={() => handleRemovePhoto(idx)}>×</button>
              )}
            </div>
          ))}
          {photos.length < 2 && !saving && (
            <button className="exp-composer-attach" onClick={handleAddPhoto}>附图</button>
          )}
        </div>
        <button className="exp-composer-save" onClick={handleSave} disabled={saving}>
          {saving ? '…' : '保存'}
        </button>
      </div>
      <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFileChange} />
    </div>
  );
}