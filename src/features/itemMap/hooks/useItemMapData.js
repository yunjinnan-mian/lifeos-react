/* itemMap 的数据订阅层。
   把 Firebase onSnapshot 从 App.jsx 移出，
   让 App 只消费数据，不直接接触 Firestore API。*/
import { useState, useEffect } from 'react';
import { db, collection, doc, onSnapshot, query, where } from '../../../lib/firebase.js';

export function useItemMapData() {
  const [zones, setZones] = useState([]);
  const [items, setItems] = useState([]);
  const [syncStatus, setSyncStatus] = useState('syncing');

  useEffect(() => {
    const unsubZones = onSnapshot(doc(db, 'config', 'itemMapZones'), snap => {
      setSyncStatus('syncing');
      setZones(snap.exists() ? (snap.data().zones || []) : []);
      setSyncStatus('synced');
    }, () => setSyncStatus('error'));

    const q = query(collection(db, 'items'), where('domain', 'in', ['home', 'explore', 'supplies']));
    const unsubItems = onSnapshot(q, snap => {
      setItems(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, () => {});

    return () => { unsubZones(); unsubItems(); };
  }, []);

  return { zones, setZones, items, syncStatus };
}
