import { useState, useEffect } from 'react';
import { doc, setDoc, deleteDoc, collection, writeBatch } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';

import './wardrobe.css';
import { useWardrobeData } from './hooks/useWardrobeData';
import { compressImage } from './utils/imageUtils';

import WardrobeHeader    from './components/WardrobeHeader';
import WardrobeTabs      from './components/WardrobeTabs';
import ClosetSection     from './components/ClosetSection';
import StatsSection      from './components/StatsSection';
import KnowledgeSection  from './components/KnowledgeSection';
import AnnotateSection   from './components/AnnotateSection';
import ImmersiveOverlay  from './components/ImmersiveOverlay';
import CategorySection   from './components/CategorySection';
import ItemModal         from './components/modals/ItemModal';
import NoteModal         from './components/modals/NoteModal';
import ZoneModal         from './components/modals/ZoneModal';
import TypeModal         from './components/modals/TypeModal';
import TransferModal     from './components/modals/TransferModal';

export default function Wardrobe() {
  const { zones, zoneTypes, items, notes, syncStatus, setSyncStatus, db, storage } = useWardrobeData();
  const [activeTab, setActiveTab] = useState('inventory');
  const [seasonFilter, setSeasonFilter] = useState(() => localStorage.getItem('wardrobeSeasonFilter') || 'all');
  const [immersiveOpen, setImmersiveOpen] = useState(false);

  // ── Modal state ───────────────────────────────────────
  const [itemModal, setItemModal]       = useState({ open: false, item: null });
  const [noteModal, setNoteModal]       = useState({ open: false, note: null });
  const [zoneModal, setZoneModal]       = useState({ open: false, zone: null });
  const [typeModal, setTypeModal]       = useState({ open: false, type: null, zoneId: null });
  const [transferModal, setTransferModal] = useState({ open: false, desc: '', options: [], pendingTypeId: null, pendingZoneId: null });

  // Update meta theme when immersive opens/closes
  useEffect(() => {
    const themeEl = document.getElementById('themeColor');
    const appleEl = document.getElementById('appleStatusBar');
    if (themeEl) themeEl.content = immersiveOpen ? '#111010' : '#faf7f2';
    if (appleEl) appleEl.content = immersiveOpen ? 'black' : 'default';
    document.body.style.overflow = immersiveOpen ? 'hidden' : '';
  }, [immersiveOpen]);

  function handleSeasonChange(s) {
    setSeasonFilter(s);
    localStorage.setItem('wardrobeSeasonFilter', s);
  }

  // ── Add item via zone camera ──────────────────────────
  async function handleAddItem(zoneId, file) {
    setSyncStatus('syncing');
    try {
      const compressed = await compressImage(file);
      const itemId = Date.now().toString();
      const storageRef = ref(storage, `wardrobe/${itemId}.webp`);
      await uploadBytes(storageRef, compressed);
      const photoUrl = await getDownloadURL(storageRef);
      const defaultType = zoneTypes.find(t => t.zoneId === zoneId);
      await setDoc(doc(db, 'items', itemId), {
        typeId: defaultType?.id || null,
        zoneId,
        vibe: null, note: '', photoUrl, seasons: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      setSeasonFilter('all');
      localStorage.setItem('wardrobeSeasonFilter', 'all');
      setSyncStatus('synced');
    } catch {
      alert('上传失败，请重试');
      setSyncStatus('error');
    }
  }

  // ── Item modal ────────────────────────────────────────
  function openItemModal(id) {
    const item = items.find(i => i.id === id);
    if (item) setItemModal({ open: true, item });
  }

  async function saveItem({ typeId, vibe, seasons, note, photoBlob, existingPhotoUrl }) {
    const item = itemModal.item;
    let photoUrl = existingPhotoUrl || null;
    if (photoBlob) {
      if (existingPhotoUrl) {
        try { await deleteObject(ref(storage, existingPhotoUrl)); } catch {}
      }
      const storageRef = ref(storage, `wardrobe/${item.id}.webp`);
      await uploadBytes(storageRef, photoBlob);
      photoUrl = await getDownloadURL(storageRef);
    }
    const zone = zoneTypes.find(t => t.id === typeId);
    await setDoc(doc(db, 'items', item.id), {
      typeId,
      zoneId: zone?.zoneId || item.zoneId || null,
      vibe, seasons, note, photoUrl,
      createdAt: item.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    setItemModal({ open: false, item: null });
  }

  async function deleteItem() {
    const { item } = itemModal;
    if (!item || !confirm('确定删除？')) return;
    await deleteDoc(doc(db, 'items', item.id));
    if (item.photoUrl) {
      try { await deleteObject(ref(storage, item.photoUrl)); } catch {}
    }
    setItemModal({ open: false, item: null });
  }

  // ── Note modal ────────────────────────────────────────
  async function saveNote({ tag, title, content }) {
    const { note } = noteModal;
    const id = note?.id || doc(collection(db, 'notes')).id;
    await setDoc(doc(db, 'notes', id), {
      module: 'wardrobe', tag, title, content,
      createdAt: note?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    setNoteModal({ open: false, note: null });
  }

  async function deleteNote() {
    const { note } = noteModal;
    if (!note || !confirm('确定删除？')) return;
    await deleteDoc(doc(db, 'notes', note.id));
    setNoteModal({ open: false, note: null });
  }

  // ── Zone modal ────────────────────────────────────────
  async function saveZone({ name, emoji }) {
    const { zone } = zoneModal;
    const id = zone?.id || doc(collection(db, 'zones')).id;
    await setDoc(doc(db, 'zones', id), {
      name, emoji,
      order: zone?.order ?? zones.length,
      createdAt: zone?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    setZoneModal({ open: false, zone: null });
  }

  async function deleteZone(zoneId) {
    const zoneItems = items.filter(i => i.zoneId === zoneId);
    if (zoneItems.length > 0) {
      const otherTypes = zoneTypes.filter(t => t.zoneId !== zoneId);
      if (!otherTypes.length) { alert('没有其他分类可以转移'); return; }
      const zoneName = zones.find(z => z.id === zoneId)?.name || '';
      setTransferModal({
        open: true,
        desc: `「${zoneName}」下共有 ${zoneItems.length} 件衣物，请选择转移目标分类：`,
        options: otherTypes.map(t => ({
          value: `${t.id}|${t.zoneId}`,
          label: `${zones.find(z => z.id === t.zoneId)?.name || ''} · ${t.label}`
        })),
        pendingZoneId: zoneId,
        pendingTypeId: null,
      });
      return;
    }
    if (!confirm(`删除「${zones.find(z => z.id === zoneId)?.name}」及其所有小分类？`)) return;
    const batch = writeBatch(db);
    zoneTypes.filter(t => t.zoneId === zoneId).forEach(t => batch.delete(doc(db, 'zoneTypes', t.id)));
    batch.delete(doc(db, 'zones', zoneId));
    await batch.commit();
  }

  // ── Type modal ────────────────────────────────────────
  async function saveType({ label }) {
    const { type, zoneId } = typeModal;
    const id = type?.id || doc(collection(db, 'zoneTypes')).id;
    await setDoc(doc(db, 'zoneTypes', id), {
      label, zoneId,
      order: type?.order ?? zoneTypes.filter(t => t.zoneId === zoneId).length,
      createdAt: type?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    setTypeModal({ open: false, type: null, zoneId: null });
  }

  async function deleteType(typeId, zoneId) {
    const affected = items.filter(i => i.typeId === typeId);
    if (affected.length > 0) {
      const otherTypes = zoneTypes.filter(t => t.id !== typeId);
      if (!otherTypes.length) { alert('没有其他分类可以转移'); return; }
      const typeName = zoneTypes.find(t => t.id === typeId)?.label || '';
      setTransferModal({
        open: true,
        desc: `「${typeName}」下有 ${affected.length} 件衣物，请选择转移目标：`,
        options: otherTypes.map(t => ({
          value: `${t.id}|${t.zoneId}`,
          label: `${zones.find(z => z.id === t.zoneId)?.name || ''} · ${t.label}`
        })),
        pendingTypeId: typeId,
        pendingZoneId: null,
      });
      return;
    }
    if (!confirm('确定删除这个小分类？')) return;
    await deleteDoc(doc(db, 'zoneTypes', typeId));
  }

  // ── Transfer confirm ──────────────────────────────────
  async function confirmTransfer(val) {
    const [newTypeId, newZoneId] = val.split('|');
    const { pendingTypeId, pendingZoneId } = transferModal;
    const batch = writeBatch(db);
    const now = new Date().toISOString();

    if (pendingTypeId) {
      items.filter(i => i.typeId === pendingTypeId).forEach(i =>
        batch.set(doc(db, 'items', i.id), { ...i, typeId: newTypeId, zoneId: newZoneId, updatedAt: now })
      );
      batch.delete(doc(db, 'zoneTypes', pendingTypeId));
    } else if (pendingZoneId) {
      items.filter(i => i.zoneId === pendingZoneId).forEach(i =>
        batch.set(doc(db, 'items', i.id), { ...i, typeId: newTypeId, zoneId: newZoneId, updatedAt: now })
      );
      zoneTypes.filter(t => t.zoneId === pendingZoneId).forEach(t =>
        batch.delete(doc(db, 'zoneTypes', t.id))
      );
      batch.delete(doc(db, 'zones', pendingZoneId));
    }

    await batch.commit();
    setTransferModal(prev => ({ ...prev, open: false }));
  }

  return (
    <>
      <WardrobeHeader syncStatus={syncStatus} />
      <WardrobeTabs activeTab={activeTab} onSwitch={setActiveTab} />

      <main className="wrd-main">
        {activeTab === 'inventory' && (
          <ClosetSection
            zones={zones} zoneTypes={zoneTypes} items={items}
            seasonFilter={seasonFilter} onSeasonChange={handleSeasonChange}
            onItemClick={openItemModal} onAddItem={handleAddItem}
          />
        )}
        {activeTab === 'stats' && (
          <StatsSection zones={zones} items={items} active={activeTab === 'stats'} />
        )}
        {activeTab === 'knowledge' && (
          <KnowledgeSection
            notes={notes}
            onNewNote={() => setNoteModal({ open: true, note: null })}
            onEditNote={id => setNoteModal({ open: true, note: notes.find(n => n.id === id) })}
          />
        )}
        {activeTab === 'annotate' && (
          <AnnotateSection onOpenImmersive={() => setImmersiveOpen(true)} />
        )}
        {activeTab === 'categories' && (
          <CategorySection
            zones={zones} zoneTypes={zoneTypes} items={items} db={db}
            onNewZone={() => setZoneModal({ open: true, zone: null })}
            onEditZone={id => setZoneModal({ open: true, zone: zones.find(z => z.id === id) })}
            onDeleteZone={deleteZone}
            onNewType={(typeId, zoneId) => setTypeModal({ open: true, type: null, zoneId })}
            onDeleteType={deleteType}
          />
        )}
      </main>

      {/* Modals */}
      <ItemModal
        open={itemModal.open} item={itemModal.item}
        zones={zones} zoneTypes={zoneTypes}
        onSave={saveItem} onDelete={deleteItem}
        onClose={() => setItemModal({ open: false, item: null })}
      />
      <NoteModal
        open={noteModal.open} note={noteModal.note}
        onSave={saveNote} onDelete={deleteNote}
        onClose={() => setNoteModal({ open: false, note: null })}
      />
      <ZoneModal
        open={zoneModal.open} zone={zoneModal.zone}
        onSave={saveZone} onClose={() => setZoneModal({ open: false, zone: null })}
      />
      <TypeModal
        open={typeModal.open} type={typeModal.type}
        onSave={saveType} onClose={() => setTypeModal({ open: false, type: null, zoneId: null })}
      />
      <TransferModal
        open={transferModal.open} desc={transferModal.desc} options={transferModal.options}
        onConfirm={confirmTransfer} onClose={() => setTransferModal(prev => ({ ...prev, open: false }))}
      />

      {/* Immersive annotate overlay */}
      <ImmersiveOverlay
        open={immersiveOpen} zones={zones} items={items} db={db}
        onClose={() => setImmersiveOpen(false)}
      />
    </>
  );
}
