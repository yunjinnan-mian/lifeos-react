// ============================================================
// Finance Pro — Details 账单明细
// 功能：关键词筛选 + 排序 + 编辑 + 删除 + 表头筛选（多选）
// 优化：虚拟滚动 + React.memo + 搜索防抖
// ============================================================

import { useState, useMemo, useCallback, useRef, memo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useFinance } from '../index';
import { getCatName, getColorMap, getExpenseOpts, getIncomeOpts, getCatMap, getDomainForCat } from '../utils/catMap';
import { db } from '../../../lib/firebase';
import { doc, setDoc } from 'firebase/firestore';
import { useVirtualizer } from '@tanstack/react-virtual';

// ── Firestore 写入前清理（与 useFinanceData 中一致）──────────
function sanitizeForFirestore(obj) {
    const uiOnlyFields = new Set(['mode', 'dir', 'realType', 'isIgnored', 'source']);
    const cleaned = {};
    for (const [k, v] of Object.entries(obj)) {
        if (v === undefined || v === null) continue;
        if (uiOnlyFields.has(k)) continue;
        cleaned[k] = v;
    }
    return cleaned;
}

// ── 复制配置弹窗（Portal）───────────────────────────────────
const COL_FIELDS = [
    { key: 'month', label: '月份' },
    { key: 'desc', label: '说明' },
    { key: 'amount', label: '金额' },
];

const CopyConfigPopover = memo(function CopyConfigPopover({ anchorEl, onClose, selectedCols, onToggleCol, selectedCount, totalCount, onClearSelection, onCopy }) {
    const panelRef = useRef(null);
    const [pos, setPos] = useState({ top: 0, left: 0 });

    useEffect(() => {
        if (anchorEl) {
            const rect = anchorEl.getBoundingClientRect();
            setPos({ top: rect.bottom + 4, left: Math.max(0, rect.right - 220) });
        }
    }, [anchorEl]);

    useEffect(() => {
        const handler = (e) => {
            if (panelRef.current && !panelRef.current.contains(e.target) && e.target !== anchorEl) {
                onClose();
            }
        };
        const timer = setTimeout(() => document.addEventListener('mousedown', handler), 0);
        return () => { clearTimeout(timer); document.removeEventListener('mousedown', handler); };
    }, [onClose, anchorEl]);

    const dropdownStyle = {
        position: 'fixed',
        top: pos.top,
        left: pos.left,
        zIndex: 9999,
        minWidth: 200,
    };

    return createPortal(
<div className="filter-dropdown copy-config-popover fd-portal" ref={panelRef} style={dropdownStyle}>
            <div className="filter-section">
                <div className="filter-label">复制字段</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {COL_FIELDS.map(f => (
                        <label key={f.key} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13, color: 'var(--text-main)' }}>
                            <input
                                type="checkbox"
                                checked={selectedCols.has(f.key)}
                                onChange={() => onToggleCol(f.key)}
                                style={{ accentColor: 'var(--primary)' }}
                            />
                            {f.label}
                        </label>
                    ))}
                </div>
            </div>
            <div className="filter-section">
                <div className="filter-label">选择范围</div>
                <span style={{ fontSize: 12, color: 'var(--text-sub)' }}>
                    {selectedCount > 0 ? `已选 ${selectedCount} 条` : `当前筛选全部 ${totalCount} 条`}
                </span>
            </div>
            <div className="filter-actions">
                <button className="btn btn-outline btn-sm" onClick={() => { onClearSelection(); }}>清除选择</button>
                <button className="btn btn-primary btn-sm" onClick={() => { onCopy(); onClose(); }}>确定复制</button>
            </div>
        </div>,
        document.body
    );
});

// ── 多选复选框下拉组件（用于类型/一级/二级）────────
const MultiCheckDropdown = memo(function MultiCheckDropdown({ options, selectedValues, onChange, onSelectAll, onDeselectAll }) {
    // options 可能是字符串数组或 {id, name} 对象数组
    const isObjOpts = options && options.length > 0 && typeof options[0] === 'object';

    const getKey = (opt) => isObjOpts ? opt.id : opt;
    const getLabel = (opt) => isObjOpts ? opt.name : opt;

    const allSelected = options && options.length > 0 && options.every(opt => selectedValues.includes(getKey(opt)));
    const someSelected = selectedValues.length > 0 && !allSelected;

    return (
        <div className="multi-check-list">
            <div className="multi-check-actions">
                <button className="btn btn-outline btn-xs" onClick={onSelectAll}>全选</button>
                <button className="btn btn-outline btn-xs" onClick={onDeselectAll}>取消</button>
            </div>
            <div className="multi-check-options">
                {(options || []).map(opt => {
                    const key = getKey(opt);
                    const label = getLabel(opt);
                    return (
                        <label key={key} className="multi-check-item">
                            <input
                                type="checkbox"
                                checked={selectedValues.includes(key)}
                                onChange={() => onChange(key)}
                                style={{ accentColor: 'var(--primary)' }}
                            />
                            <span>{label}</span>
                        </label>
                    );
                })}
            </div>
        </div>
    );
});

// ── 表头筛选下拉组件（Portal 到 body，避免 overflow:hidden 裁剪）──
const FilterDropdown = memo(function FilterDropdown({ anchorEl, onClose, options, filterState, onApply, type }) {
    const [local, setLocal] = useState(() => {
        // 深拷贝，特别是数组类型
        const s = {};
        for (const k of Object.keys(filterState)) {
            s[k] = Array.isArray(filterState[k]) ? [...filterState[k]] : filterState[k];
        }
        return s;
    });
    const panelRef = useRef(null);
    const [pos, setPos] = useState({ top: 0, left: 0 });

    useEffect(() => {
        if (anchorEl) {
            const rect = anchorEl.getBoundingClientRect();
            setPos({ top: rect.bottom + 4, left: Math.max(0, rect.left - 100) });
        }
    }, [anchorEl]);

    // 点击外部关闭
    useEffect(() => {
        const handler = (e) => {
            if (panelRef.current && !panelRef.current.contains(e.target) && e.target !== anchorEl && !anchorEl?.contains(e.target)) {
                onClose();
            }
        };
        const timer = setTimeout(() => document.addEventListener('mousedown', handler), 0);
        return () => { clearTimeout(timer); document.removeEventListener('mousedown', handler); };
    }, [onClose, anchorEl]);

    const handleApply = () => {
        onApply(local);
        onClose();
    };

    const handleClear = () => {
        // 清除：数组字段设为空数组，标量字段设为空字符串
        const cleared = {};
        for (const k of Object.keys(local)) {
            cleared[k] = Array.isArray(local[k]) ? [] : '';
        }
        onApply(cleared);
        onClose();
    };

    const dropdownStyle = {
        position: 'fixed',
        top: pos.top,
        left: pos.left,
        zIndex: 9999,
    };

    // ── 日期筛选：月份多选 + 日输入 ──
    if (type === 'date') {
        const allMonths = (local.dateMonth || []).length === 0;
        const monthsList = (options?.months || []);

        const toggleMonth = (m) => {
            setLocal(l => {
                const cur = l.dateMonth || [];
                if (cur.includes(m)) {
                    return { ...l, dateMonth: cur.filter(x => x !== m) };
                } else {
                    return { ...l, dateMonth: [...cur, m] };
                }
            });
        };
        const selectAllMonths = () => setLocal(l => ({ ...l, dateMonth: [...monthsList] }));
        const deselectAllMonths = () => setLocal(l => ({ ...l, dateMonth: [] }));

        return createPortal(
            <div className="filter-dropdown fd-portal" ref={panelRef} style={{ ...dropdownStyle, minWidth: 220 }}>
                <div className="filter-section">
                    <div className="filter-label">按月份（可多选）</div>
                    <div className="multi-check-list">
                        <div className="multi-check-actions">
                            <button className="btn btn-outline btn-xs" onClick={selectAllMonths}>全选</button>
                            <button className="btn btn-outline btn-xs" onClick={deselectAllMonths}>取消</button>
                        </div>
                        <div className="multi-check-options">
                            {monthsList.map(m => (
                                <label key={m} className="multi-check-item">
                                    <input
                                        type="checkbox"
                                        checked={(local.dateMonth || []).includes(m)}
                                        onChange={() => toggleMonth(m)}
                                        style={{ accentColor: 'var(--primary)' }}
                                    />
                                    <span>{m}</span>
                                </label>
                            ))}
                        </div>
                    </div>
                </div>
                <div className="filter-section">
                    <div className="filter-label">按日期（日）</div>
                    <input
                        type="number"
                        className="form-control"
                        style={{ height: 32, fontSize: 12, width: '100%' }}
                        placeholder="如 15"
                        min={1} max={31}
                        value={local.dateDay || ''}
                        onChange={e => setLocal(l => ({ ...l, dateDay: e.target.value }))}
                    />
                </div>
                <div className="filter-actions">
                    <button className="btn btn-outline btn-sm" onClick={handleClear}>清除</button>
                    <button className="btn btn-primary btn-sm" onClick={handleApply}>应用</button>
                </div>
            </div>,
            document.body
        );
    }

    // ── 金额筛选 ──
    if (type === 'amount') {
        return createPortal(
            <div className="filter-dropdown fd-portal" ref={panelRef} style={{ ...dropdownStyle, minWidth: 180 }}>
                <div className="filter-section">
                    <div className="filter-label">最小金额</div>
                    <input
                        type="number"
                        className="form-control"
                        style={{ height: 32, fontSize: 12, width: '100%' }}
                        placeholder="0"
                        value={local.amountMin || ''}
                        onChange={e => setLocal(l => ({ ...l, amountMin: e.target.value }))}
                    />
                </div>
                <div className="filter-section">
                    <div className="filter-label">最大金额</div>
                    <input
                        type="number"
                        className="form-control"
                        style={{ height: 32, fontSize: 12, width: '100%' }}
                        placeholder="999999"
                        value={local.amountMax || ''}
                        onChange={e => setLocal(l => ({ ...l, amountMax: e.target.value }))}
                    />
                </div>
                <div className="filter-actions">
                    <button className="btn btn-outline btn-sm" onClick={handleClear}>清除</button>
                    <button className="btn btn-primary btn-sm" onClick={handleApply}>应用</button>
                </div>
            </div>,
            document.body
        );
    }

    // ── 文本筛选 ──
    if (type === 'text') {
        return createPortal(
            <div className="filter-dropdown fd-portal" ref={panelRef} style={{ ...dropdownStyle, minWidth: 160 }}>
                <div className="filter-section">
                    <input
                        type="text"
                        className="form-control"
                        style={{ height: 32, fontSize: 12 }}
                        placeholder="筛选..."
                        value={local.value || ''}
                        onChange={e => setLocal({ value: e.target.value })}
                        onKeyDown={e => { if (e.key === 'Enter') { handleApply(); } }}
                    />
                </div>
                <div className="filter-actions">
                    <button className="btn btn-outline btn-sm" onClick={handleClear}>清除</button>
                    <button className="btn btn-primary btn-sm" onClick={handleApply}>应用</button>
                </div>
            </div>,
            document.body
        );
    }

    // ── 多选（类型/一级/二级）──
    // options 可能是字符串数组或 {id, name} 对象数组
    const isObjOpts = options && options.length > 0 && typeof options[0] === 'object';
    const flatOpts = isObjOpts
        ? options
        : (options || []).map(o => ({ id: o, name: o }));

    const selectedArr = local.value || [];

    const toggleItem = (id) => {
        setLocal(l => {
            const cur = l.value || [];
            if (cur.includes(id)) {
                return { ...l, value: cur.filter(x => x !== id) };
            } else {
                return { ...l, value: [...cur, id] };
            }
        });
    };
    const selectAll = () => setLocal(l => ({ ...l, value: flatOpts.map(o => o.id) }));
    const deselectAll = () => setLocal(l => ({ ...l, value: [] }));

    return createPortal(
        <div className="filter-dropdown fd-portal" ref={panelRef} style={{ ...dropdownStyle, minWidth: 180 }}>
            <div className="filter-section">
                <div className="multi-check-list">
                    <div className="multi-check-actions">
                        <button className="btn btn-outline btn-xs" onClick={selectAll}>全选</button>
                        <button className="btn btn-outline btn-xs" onClick={deselectAll}>取消</button>
                    </div>
                    <div className="multi-check-options">
                        {flatOpts.map(opt => (
                            <label key={opt.id} className="multi-check-item">
                                <input
                                    type="checkbox"
                                    checked={selectedArr.includes(opt.id)}
                                    onChange={() => toggleItem(opt.id)}
                                    style={{ accentColor: 'var(--primary)' }}
                                />
                                <span>{opt.name}</span>
                            </label>
                        ))}
                    </div>
                </div>
            </div>
            <div className="filter-actions">
                <button className="btn btn-outline btn-sm" onClick={handleClear}>清除</button>
                <button className="btn btn-primary btn-sm" onClick={handleApply}>应用</button>
            </div>
        </div>,
        document.body
    );
});

// ── 表头单元格（可筛选）──────────────────────────────────────
const FilterableTh = memo(function FilterableTh({ className, label, sortable, sortDir, onSort, filterType, filterState, filterOptions, onFilterApply, isFiltered }) {
    const [open, setOpen] = useState(false);
    const thRef = useRef(null);
    const filterBtnRef = useRef(null);

    const handleFilterClick = (e) => {
        e.stopPropagation();
        setOpen(v => !v);
    };

    return (
        <div className={`virt-th ${className || ''}${isFiltered ? ' filtered' : ''}`} ref={thRef}>
            <span
                style={{ cursor: sortable ? 'pointer' : 'default', userSelect: 'none', flex: 1, display: 'flex', alignItems: 'center', gap: 2 }}
                onClick={sortable ? onSort : undefined}
            >
                {label}
                {sortable && <i className={sortDir ? 'ri-sort-desc' : 'ri-sort-asc'} />}
            </span>
            <span
                ref={filterBtnRef}
                className="filter-btn"
                onClick={handleFilterClick}
                title="筛选"
            >
                <i className={isFiltered ? 'ri-filter-fill' : 'ri-filter-line'} />
            </span>
            {open && (
                <FilterDropdown
                    anchorEl={filterBtnRef.current}
                    onClose={() => setOpen(false)}
                    type={filterType}
                    options={filterOptions}
                    filterState={filterState}
                    onApply={onFilterApply}
                />
            )}
        </div>
    );
});

const Details = memo(function Details() {
    const { data, setData, updateData, delTx, updateHistory, saveData, showToast } = useFinance();

    // ── 筛选状态 ─────────────────────────────────────────
    const [filterKey, setFilterKey] = useState('');        // 全局搜索（说明列文本）
    const [sortDesc, setSortDesc] = useState(true);
    const [amountSortDir, setAmountSortDir] = useState(null); // null | 'desc' | 'asc'
    const displayLimit = 30; // 默认显示最近30笔

    // 各列筛选状态（dateMonth/type/cat1/cat2 均为多选数组）
    const [colFilters, setColFilters] = useState({
        dateMonth: [],
        dateDay: '',
        type: [],
        cat1: [],
        cat2: [],
        desc: '',
        amountMin: '',
        amountMax: '',
    });

    // 行内编辑状态
    const [editingTxId, setEditingTxId] = useState(null);
    const [editFormData, setEditFormData] = useState({ date: '', cat2: '', desc: '', amount: 0 });

    // 复制配置状态
    const [copyConfigOpen, setCopyConfigOpen] = useState(false);
    const [selectedCols, setSelectedCols] = useState(new Set(['month', 'desc', 'amount']));
    const [selectedTxIds, setSelectedTxIds] = useState(null); // null = 使用全部筛选结果
    const copyBtnRef = useRef(null);

    // ── 搜索防抖 ─────────────────────────────────────────
    const [searchInput, setSearchInput] = useState('');
    const debounceRef = useRef(null);
    const handleSearchChange = useCallback((e) => {
        const val = e.target.value;
        setSearchInput(val);
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => setFilterKey(val), 120);
    }, []);

    // ── 提取各列唯一值（用于筛选下拉选项）────────────
    const filterOptions = useMemo(() => {
        const txs = data.txs || [];
        const monthsSet = new Set();
        const typeSet = new Set();
        const cat1Set = new Set();
        const cat2Map = new Map(); // id → name

        txs.forEach(t => {
            if (t.date) {
                const m = t.date.slice(0, 7); // YYYY-MM
                if (/^\d{4}-\d{2}$/.test(m)) monthsSet.add(m);
            }
            if (t.type) typeSet.add(t.type);
            if (t.cat1) cat1Set.add(t.cat1);
            if (t.cat2) {
                const name = getCatName(data.cats, t.cat2);
                cat2Map.set(t.cat2, name);
            }
        });

        return {
            months: [...monthsSet].sort().reverse(),
            types: [...typeSet].sort(),
            cat1s: [...cat1Set].sort(),
            cat2s: [...cat2Map.entries()].sort((a, b) => a[1].localeCompare(b[1])).map(([id, name]) => ({ id, name })),
        };
    }, [data.txs, data.cats]);

    // ── 筛选 + 排序 ──────────────────────────────────────
    const { filteredTxs, totalMatched } = useMemo(() => {
        const list = [...data.txs].filter(t => {
            // 全局搜索（说明）
            if (filterKey) {
                const txt = `${t.desc || ''} ${t.cat1 || ''} ${t.cat2 || ''}`.toLowerCase();
                if (!txt.includes(filterKey.toLowerCase())) return false;
            }

            // 日期 - 月份筛选（多选数组）
            if (Array.isArray(colFilters.dateMonth) && colFilters.dateMonth.length > 0) {
                const matchesMonth = colFilters.dateMonth.some(m => t.date && t.date.startsWith(m));
                if (!matchesMonth) return false;
            }
            // 日期 - 日筛选
            if (colFilters.dateDay) {
                const day = String(colFilters.dateDay).padStart(2, '0');
                if (!t.date || t.date.slice(8, 10) !== day) return false;
            }
            // 类型筛选（多选数组）
            if (Array.isArray(colFilters.type) && colFilters.type.length > 0) {
                if (!colFilters.type.includes(t.type)) return false;
            }
            // 一级分类（多选数组）
            if (Array.isArray(colFilters.cat1) && colFilters.cat1.length > 0) {
                if (!colFilters.cat1.includes(t.cat1)) return false;
            }
            // 二级分类（多选数组）
            if (Array.isArray(colFilters.cat2) && colFilters.cat2.length > 0) {
                if (!colFilters.cat2.includes(t.cat2)) return false;
            }
            // 说明筛选（列头）
            if (colFilters.desc) {
                if (!(t.desc || '').toLowerCase().includes(colFilters.desc.toLowerCase())) return false;
            }
            // 金额范围
            if (colFilters.amountMin !== '') {
                if ((t.amount || 0) < parseFloat(colFilters.amountMin)) return false;
            }
            if (colFilters.amountMax !== '') {
                if ((t.amount || 0) > parseFloat(colFilters.amountMax)) return false;
            }
            return true;
        });
        const sorted = list.sort((a, b) => {
            if (amountSortDir) {
                const diff = (b.amount || 0) - (a.amount || 0);
                return amountSortDir === 'desc' ? diff : -diff;
            }
            const d = new Date(b.date) - new Date(a.date);
            return sortDesc ? d : -d;
        });
        const total = sorted.length;
        const hasAnyFilter = !!filterKey || colFilters.dateMonth.length > 0 || !!colFilters.dateDay || colFilters.type.length > 0 || colFilters.cat1.length > 0 || colFilters.cat2.length > 0 || !!colFilters.desc || colFilters.amountMin !== '' || colFilters.amountMax !== '';
        const limited = !hasAnyFilter && sorted.length > displayLimit ? sorted.slice(0, displayLimit) : sorted;
        return { filteredTxs: limited, totalMatched: total };
    }, [data.txs, filterKey, colFilters, sortDesc, amountSortDir]);

    // ── 颜色映射 ─────────────────────────────────────────
    const colorMap = useMemo(() => getColorMap(data.cats), [data.cats]);

    // 判断某列是否有活动筛选（dateMonth/type/cat1/cat2 为数组）
    const hasDateFilter = !!(Array.isArray(colFilters.dateMonth) && colFilters.dateMonth.length > 0) || !!colFilters.dateDay;
    const hasTypeFilter = Array.isArray(colFilters.type) && colFilters.type.length > 0;
    const hasCat1Filter = Array.isArray(colFilters.cat1) && colFilters.cat1.length > 0;
    const hasCat2Filter = Array.isArray(colFilters.cat2) && colFilters.cat2.length > 0;
    const hasDescFilter = !!colFilters.desc;
    const hasAmountFilter = !!(colFilters.amountMin !== '' || colFilters.amountMax !== '');

    // ── 虚拟滚动 ─────────────────────────────────────────
    const scrollRef = useRef(null);
    const rowVirtualizer = useVirtualizer({
        count: filteredTxs.length,
        getScrollElement: () => scrollRef.current,
        estimateSize: () => 53,
        overscan: 6,
    });

    // ── 删除 ─────────────────────────────────────────────
    const handleDelete = useCallback(async (tx) => {
        if (!window.confirm('确定删除该交易？')) return;
        if (tx.type === 'income') {
            updateData(prev => ({ ...prev, acc: prev.acc.map(a => String(a.id) === String(tx.accId) ? { ...a, bal: a.bal - tx.amount } : a) }));
        } else if (tx.type === 'expense') {
            const targetId = tx.accId === 'auto' ? data.acc[0]?.id : tx.accId;
            updateData(prev => ({ ...prev, acc: prev.acc.map(a => String(a.id) === String(targetId) ? { ...a, bal: a.bal + tx.amount } : a) }));
        } else if (tx.type === 'transfer') {
            updateData(prev => ({
                ...prev, acc: prev.acc.map(a => {
                    if (String(a.id) === String(tx.accId)) return { ...a, bal: a.bal + tx.amount };
                    if (String(a.id) === String(tx.toAccId)) return { ...a, bal: a.bal - tx.amount };
                    return a;
                })
            }));
        }
        await delTx(tx.id);
        showToast('交易已删除');
    }, [data.acc, delTx, updateData, showToast]);

    // ── 行内编辑：开始编辑 ────────────────────────────────
    const handleStartEdit = useCallback((t) => {
        setEditingTxId(t.id);
        setEditFormData({
            date: t.date || '',
            cat2: t.cat2 || '',
            desc: t.desc || '',
            amount: t.amount || 0,
        });
    }, []);

    // ── 行内编辑：取消 ────────────────────────────────────
    const handleCancelEdit = useCallback(() => {
        setEditingTxId(null);
        setEditFormData({ date: '', cat2: '', desc: '', amount: 0 });
    }, []);

    // ── 行内编辑：保存（核心逻辑）─────────────────────────
    const handleSaveEdit = useCallback(async (t) => {
        const oldAmount = t.amount || 0;
        const newAmount = parseFloat(editFormData.amount) || 0;
        const amountDiff = newAmount - oldAmount;

        const newCat = data.cats.find(c => c.id === editFormData.cat2);
        const newType = newCat?.type || t.type;

        if (amountDiff !== 0) {
            if (newType === 'income') {
                updateData(prev => ({
                    ...prev,
                    acc: prev.acc.map(a =>
                        String(a.id) === String(t.accId) ? { ...a, bal: (a.bal || 0) + amountDiff } : a
                    ),
                }));
            } else if (newType === 'expense') {
                const targetId = t.accId === 'auto' ? data.acc[0]?.id : t.accId;
                updateData(prev => ({
                    ...prev,
                    acc: prev.acc.map(a =>
                        String(a.id) === String(targetId) ? { ...a, bal: (a.bal || 0) - amountDiff } : a
                    ),
                }));
            } else if (newType === 'transfer') {
                updateData(prev => ({
                    ...prev,
                    acc: prev.acc.map(a => {
                        if (String(a.id) === String(t.accId)) return { ...a, bal: (a.bal || 0) - amountDiff };
                        if (String(a.id) === String(t.toAccId)) return { ...a, bal: (a.bal || 0) + amountDiff };
                        return a;
                    }),
                }));
            }
        }

        const catMap = getCatMap(data.cats);
        const updatedTx = {
            ...t,
            type: newType,
            date: editFormData.date,
            desc: editFormData.desc,
            cat2: editFormData.cat2,
            cat1: catMap[editFormData.cat2] || '其他',
            amount: newAmount,
            domain: getDomainForCat(data.cats, editFormData.cat2),
            updatedAt: new Date().toISOString(),
        };

        setData(prev => ({
            ...prev,
            txs: prev.txs.map(tx =>
                String(tx.id) === String(t.id) ? updatedTx : tx
            ),
        }));

        try {
            await setDoc(doc(db, 'transactions', String(t.id)), sanitizeForFirestore(updatedTx), { merge: true });
        } catch (e) {
            console.error('edit save failed', e);
        }

        setEditingTxId(null);
        setEditFormData({ date: '', cat2: '', desc: '', amount: 0 });
        showToast('修改成功');
    }, [editFormData, data, setData, updateData, showToast]);

    // ── 复制：使用 selectedCols + selectedTxIds 生成 CSV ────
    const executeCopy = useCallback(async () => {
        const targets = selectedTxIds
            ? filteredTxs.filter(t => selectedTxIds.has(t.id))
            : filteredTxs;
        if (targets.length === 0) {
            showToast('没有可复制的内容');
            return;
        }
        const lines = targets.map(t => {
            const parts = [];
            if (selectedCols.has('month')) parts.push((t.date || '').slice(0, 7));
            if (selectedCols.has('desc')) parts.push(t.desc || '');
            if (selectedCols.has('amount')) parts.push((t.amount || 0).toLocaleString());
            return parts.join(',');
        });
        try {
            await navigator.clipboard.writeText(lines.join('\n'));
            showToast(`已复制 ${lines.length} 条记录`);
        } catch {
            showToast('复制失败，请手动复制');
        }
    }, [filteredTxs, selectedCols, selectedTxIds, showToast]);

    // ── 选择回调 ─────────────────────────────────────────
    const handleToggleRow = useCallback((txId) => {
        setSelectedTxIds(prev => {
            const next = prev ? new Set(prev) : new Set(filteredTxs.map(t => t.id));
            if (next.has(txId)) {
                next.delete(txId);
                return next.size === 0 ? null : next; // 全不选 → null（即全部）
            } else {
                next.add(txId);
                return next.size === totalMatched ? null : next; // 全选 → null
            }
        });
    }, [filteredTxs, totalMatched]);

    const handleSelectAllToggle = useCallback(() => {
        setSelectedTxIds(prev => prev ? null : new Set()); // null ↔ 空 Set（只选部分 → 全选）
    }, []);

    const handleToggleCol = useCallback((key) => {
        setSelectedCols(prev => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
    }, []);

    const handleClearSelection = useCallback(() => {
        setSelectedTxIds(null);
    }, []);

    // 判断全选状态
    const isAllSelected = selectedTxIds === null;
    const isSomeSelected = selectedTxIds !== null && selectedTxIds.size > 0;
    const selectedCount = selectedTxIds ? selectedTxIds.size : totalMatched;

    // ── 各列筛选应用回调（多选字段使用数组）────────────
    const handleDateFilterApply = useCallback((f) => {
        setColFilters(prev => ({
            ...prev,
            dateMonth: Array.isArray(f.dateMonth) ? f.dateMonth : [],
            dateDay: f.dateDay || '',
        }));
    }, []);
    const handleTypeFilterApply = useCallback((f) => {
        setColFilters(prev => ({ ...prev, type: Array.isArray(f.value) ? f.value : [] }));
    }, []);
    const handleCat1FilterApply = useCallback((f) => {
        setColFilters(prev => ({ ...prev, cat1: Array.isArray(f.value) ? f.value : [] }));
    }, []);
    const handleCat2FilterApply = useCallback((f) => {
        setColFilters(prev => ({ ...prev, cat2: Array.isArray(f.value) ? f.value : [] }));
    }, []);
    const handleDescFilterApply = useCallback((f) => {
        setColFilters(prev => ({ ...prev, desc: f.value || '' }));
    }, []);
    const handleAmountFilterApply = useCallback((f) => {
        setColFilters(prev => ({ ...prev, amountMin: f.amountMin || '', amountMax: f.amountMax || '' }));
    }, []);

    return (
        <>
            <div id="details" className="card virt-table-card">
                <div className="card-header">
                    <div className="title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span>收支明细</span>
                        <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--text-sub)' }}>
                            {!filterKey && colFilters.dateMonth.length === 0 && !colFilters.dateDay && colFilters.type.length === 0 && colFilters.cat1.length === 0 && colFilters.cat2.length === 0 && !colFilters.desc && colFilters.amountMin === '' && colFilters.amountMax === '' && totalMatched > displayLimit
                                ? `最近${displayLimit}笔，共${totalMatched}笔`
                                : `共${totalMatched}笔`}
                        </span>
                    </div>
                    <input
                        id="filter-key"
                        className="form-control"
                        style={{ minWidth: 90, width: 200 }}
                        placeholder="搜索"
                        value={searchInput}
                        onChange={handleSearchChange}
                    />
                    <button
                        ref={copyBtnRef}
                        className="btn btn-outline btn-sm"
                        style={{ flexShrink: 0 }}
                        onClick={() => setCopyConfigOpen(v => !v)}
                        title="配置复制字段与选择范围"
                    >
                        <i className="ri-file-copy-line" style={{ marginRight: 4 }} />
                        复制
                    </button>
                    {copyConfigOpen && (
                        <CopyConfigPopover
                            anchorEl={copyBtnRef.current}
                            onClose={() => setCopyConfigOpen(false)}
                            selectedCols={selectedCols}
                            onToggleCol={handleToggleCol}
                            selectedCount={selectedCount}
                            totalCount={totalMatched}
                            onClearSelection={handleClearSelection}
                            onCopy={executeCopy}
                        />
                    )}
                </div>

                {/* 虚拟滚动表格 */}
                <div className="virt-table-container">
                    {/* 表头（固定不滚动） */}
                    <div className="virt-thead">
                        <div className="virt-th virt-th-checkbox">
                            <input
                                type="checkbox"
                                checked={isAllSelected}
                                onChange={handleSelectAllToggle}
                                title="全选/取消全选"
                                style={{ accentColor: 'var(--primary)', cursor: 'pointer' }}
                            />
                        </div>
                        <FilterableTh
                            className="virt-th-date"
                            label="日期"
                            sortable={true}
                            sortDir={sortDesc}
                            onSort={() => { setSortDesc(v => !v); setAmountSortDir(null); }}
                            filterType="date"
                            filterState={{ dateMonth: colFilters.dateMonth, dateDay: colFilters.dateDay }}
                            filterOptions={{ months: filterOptions.months }}
                            onFilterApply={handleDateFilterApply}
                            isFiltered={hasDateFilter}
                        />
                        <FilterableTh
                            className="virt-th-type"
                            label="类型"
                            filterType="multi"
                            filterState={{ value: colFilters.type }}
                            filterOptions={filterOptions.types}
                            onFilterApply={handleTypeFilterApply}
                            isFiltered={hasTypeFilter}
                        />
                        <FilterableTh
                            className="virt-th-cat1"
                            label="一级"
                            filterType="multi"
                            filterState={{ value: colFilters.cat1 }}
                            filterOptions={filterOptions.cat1s}
                            onFilterApply={handleCat1FilterApply}
                            isFiltered={hasCat1Filter}
                        />
                        <FilterableTh
                            className="virt-th-cat2"
                            label="二级"
                            filterType="multi"
                            filterState={{ value: colFilters.cat2 }}
                            filterOptions={filterOptions.cat2s}
                            onFilterApply={handleCat2FilterApply}
                            isFiltered={hasCat2Filter}
                        />
                        <FilterableTh
                            className="virt-th-desc"
                            label="说明"
                            filterType="text"
                            filterState={{ value: colFilters.desc }}
                            onFilterApply={handleDescFilterApply}
                            isFiltered={hasDescFilter}
                        />
                        <FilterableTh
                            className="virt-th-amount"
                            label="金额"
                            sortable={true}
                            sortDir={amountSortDir === 'desc'}
                            onSort={() => { setAmountSortDir(d => d === null ? 'desc' : d === 'desc' ? 'asc' : null); setSortDesc(true); }}
                            filterType="amount"
                            filterState={{ amountMin: colFilters.amountMin, amountMax: colFilters.amountMax }}
                            onFilterApply={handleAmountFilterApply}
                            isFiltered={hasAmountFilter}
                        />
                        <div className="virt-th virt-th-actions" />
                    </div>

                    {/* 虚拟滚动区域 */}
                    <div ref={scrollRef} className="virt-tbody">
                        {filteredTxs.length === 0 ? (
                            <div className="virt-empty">暂无数据</div>
                        ) : (
                            <div
                                className="virt-scroll-space"
                                style={{ height: `${rowVirtualizer.getTotalSize()}px` }}
                            >
                                {rowVirtualizer.getVirtualItems().map(virtualItem => {
                                    const t = filteredTxs[virtualItem.index];
                                    return (
                                        <div
                                            key={virtualItem.key}
                                            className="virt-row"
                                            style={{
                                                height: `${virtualItem.size}px`,
                                                transform: `translateY(${virtualItem.start}px)`,
                                            }}
                                        >
                                            <div className="virt-td virt-td-checkbox">
                                                <input
                                                    type="checkbox"
                                                    checked={isAllSelected || (selectedTxIds && selectedTxIds.has(t.id))}
                                                    onChange={() => handleToggleRow(t.id)}
                                                    title="选择/取消选择此条记录"
                                                />
                                            </div>
                                            <TxRow
                                                tx={t}
                                                colorMap={colorMap}
                                                cats={data.cats}
                                                editingTxId={editingTxId}
                                                editFormData={editFormData}
                                                setEditFormData={setEditFormData}
                                                onStartEdit={handleStartEdit}
                                                onSaveEdit={handleSaveEdit}
                                                onCancelEdit={handleCancelEdit}
                                                onDelete={() => handleDelete(t)}
                                            />
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </>
    );
});

export default Details;

// ── 单行组件（支持行内编辑）+ React.memo ──────────────────
const TxRow = memo(function TxRow({ tx: t, colorMap, cats, editingTxId, editFormData, setEditFormData, onStartEdit, onSaveEdit, onCancelEdit, onDelete }) {
    const c = colorMap[t.cat1] || '#ccc';
    const isEditing = editingTxId === t.id;

    let typeLabel = '支出', typeColor = 'var(--c-survive)', amtPrefix = '-';
    if (t.type === 'income') { typeLabel = '收入'; typeColor = 'var(--c-income)'; amtPrefix = '+'; }
    else if (t.type === 'transfer') { typeLabel = '转账'; typeColor = '#718096'; amtPrefix = ''; }
    else if (t.type === 'adjust') {
        typeLabel = '平账'; typeColor = '#A0AEC0';
        const isInc = t.diffDir === 'inc' || t.cat2 === '平账收入';
        amtPrefix = isInc ? '+' : '-';
    }

    const catOptsHtml = t.type === 'income'
        ? getIncomeOpts(cats)
        : getExpenseOpts(cats);

    return (
        <>
            {/* 桌面端：Grid 布局行 */}
            <div className="virt-td virt-td-date">
                {isEditing ? (
                    <input
                        type="date"
                        className="edit-naked-input"
                        style={{ width: 130 }}
                        value={editFormData.date}
                        onChange={e => setEditFormData(f => ({ ...f, date: e.target.value }))}
                    />
                ) : <span>{t.date}</span>}
            </div>
            <div className="virt-td virt-td-type">
                <span style={{ color: typeColor, fontWeight: 700 }}>{typeLabel}</span>
            </div>
            <div className="virt-td virt-td-cat1">
                <span className="tag" style={{ background: `${c}22`, color: c }}>{t.cat1 || '-'}</span>
            </div>
            <div className="virt-td virt-td-cat2">
                {isEditing ? (
                    <select
                        className="edit-naked-select"
                        style={{ width: 130 }}
                        value={editFormData.cat2}
                        onChange={e => setEditFormData(f => ({ ...f, cat2: e.target.value }))}
                        dangerouslySetInnerHTML={{ __html: '<option value="">(选择分类)</option>' + catOptsHtml }}
                    />
                ) : <span>{getCatName(cats, t.cat2)}</span>}
            </div>
            <div className="virt-td virt-td-desc" style={{ color: '#2D3748', fontWeight: 500 }}>
                {isEditing ? (
                    <input
                        type="text"
                        className="edit-naked-input"
                        style={{ width: '100%', minWidth: 80 }}
                        value={editFormData.desc}
                        onChange={e => setEditFormData(f => ({ ...f, desc: e.target.value }))}
                    />
                ) : <span>{(t.desc || '')}</span>}
            </div>
            <div className="virt-td virt-td-amount" style={{ textAlign: 'right', fontWeight: 'bold', color: typeColor }}>
                {isEditing ? (
                    <input
                        type="number"
                        className="edit-naked-input"
                        style={{ width: 100, textAlign: 'right' }}
                        value={editFormData.amount}
                        onChange={e => setEditFormData(f => ({ ...f, amount: parseFloat(e.target.value) || 0 }))}
                    />
                ) : (
                    <span>{amtPrefix} {(t.amount || 0).toLocaleString()}</span>
                )}
            </div>
            <div className="virt-td virt-td-actions" style={{ whiteSpace: 'nowrap', display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'flex-end' }}>
                {isEditing ? (
                    <>
                        <button onClick={() => onSaveEdit(t)} title="保存"
                            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 4px', fontSize: 16, lineHeight: 1 }}>✅</button>
                        <button onClick={onCancelEdit} title="取消"
                            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 4px', fontSize: 16, lineHeight: 1 }}>❌</button>
                    </>
                ) : (
                    <>
                        <button onClick={() => onStartEdit(t)} title="编辑"
                            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 4px', fontSize: 16, lineHeight: 1 }}>✏️</button>
                        <button onClick={onDelete} title="删除"
                            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 4px', fontSize: 16, lineHeight: 1 }}>🗑️</button>
                    </>
                )}
            </div>
        </>
    );
});