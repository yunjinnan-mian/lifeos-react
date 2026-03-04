import { useState, useEffect } from 'react';
import { getFirestore, collection, doc, onSnapshot, setDoc, deleteDoc, getDocs, writeBatch } from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { app } from '../../../../firebase'; // 复用已有的 firebase 初始化
import { DEFAULT_SEED, OLD_TYPE_MAP } from '../constants';
import { compressImage } from '../utils/imageUtils';

const db = getFirestore(app);
const storage = getStorage(app);

export { db, storage, ref, uploadBytes, getDownloadURL, deleteObject, setDoc, deleteDoc, doc, collection, writeBatch };

export function useWardrobeData() {
  const [zones, setZones] = useState([]);
  const [zoneTypes, setZoneTypes] = useState([]);
  const [items, setItems] = useState([]);
  const [notes, setNotes] = useState([]);
  const [syncStatus, setSyncStatus] = useState('syncing');

  useEffect(() => {
    let seeded = false;

    async function seedAndMigrate() {
      const zoneSnap = await getDocs(collection(db, 'zones'));
      let labelToTypeId = {};

      if (zoneSnap.empty) {
        const batch = writeBatch(db);
        const now = new Date().toISOString();
        DEFAULT_SEED.forEach((z, zi) => {
          const zRef = doc(collection(db, 'zones'));
          batch.set(zRef, { name: z.name, emoji: z.emoji, order: zi, createdAt: now, updatedAt: now });
          z.types.forEach((t, ti) => {
            const tRef = doc(collection(db, 'zoneTypes'));
            batch.set(tRef, { label: t, zoneId: zRef.id, order: ti, createdAt: now, updatedAt: now });
            labelToTypeId[t] = { id: tRef.id, zoneId: zRef.id };
          });
        });
        await batch.commit();
      } else {
        const typeSnap = await getDocs(collection(db, 'zoneTypes'));
        typeSnap.docs.forEach(d => { labelToTypeId[d.data().label] = { id: d.id, zoneId: d.data().zoneId }; });
      }

      // 迁移旧数据
      const itemSnap = await getDocs(collection(db, 'items'));
      const batch2 = writeBatch(db);
      let needsMigration = false;
      itemSnap.docs.forEach(d => {
        const data = d.data();
        if (data.type && !data.typeId) {
          const label = OLD_TYPE_MAP[data.type] || data.type;
          const mapped = labelToTypeId[label];
          if (mapped) {
            const update = { ...data, typeId: mapped.id, zoneId: mapped.zoneId, updatedAt: new Date().toISOString() };
            delete update.type;
            batch2.set(doc(db, 'items', d.id), update);
            needsMigration = true;
          }
        }
      });
      if (needsMigration) await batch2.commit();
      seeded = true;
    }

    setSyncStatus('syncing');
    seedAndMigrate().catch(() => setSyncStatus('error'));

    const unsubZones = onSnapshot(collection(db, 'zones'), snap => {
      setZones(snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.order || 0) - (b.order || 0)));
      setSyncStatus('synced');
    }, () => setSyncStatus('error'));

    const unsubTypes = onSnapshot(collection(db, 'zoneTypes'), snap => {
      setZoneTypes(snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.order || 0) - (b.order || 0)));
    }, () => {});

    const unsubItems = onSnapshot(collection(db, 'items'), snap => {
      setItems(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, () => {});

    const unsubNotes = onSnapshot(collection(db, 'notes'), snap => {
      setNotes(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, () => {});

    return () => {
      unsubZones();
      unsubTypes();
      unsubItems();
      unsubNotes();
    };
  }, []);

  return { zones, zoneTypes, items, notes, syncStatus, setSyncStatus, db, storage };
}

export async function patchItem(db, items, itemId, patch) {
  const item = items.find(i => i.id === itemId);
  if (!item) return;
  await setDoc(doc(db, 'items', itemId), { ...item, ...patch, updatedAt: new Date().toISOString() });
}

export async function uploadPhoto(storage, itemId, blob, existingUrl) {
  if (existingUrl) {
    try { await deleteObject(ref(storage, existingUrl)); } catch (e) {}
  }
  const storageRef = ref(storage, `wardrobe/${itemId}.webp`);
  await uploadBytes(storageRef, blob);
  return await getDownloadURL(storageRef);
}
