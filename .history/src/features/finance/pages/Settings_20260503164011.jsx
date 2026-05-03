// ============================================================
// Finance Pro — Settings 系统设置（分类管理）
// 功能：可视化编辑一级/二级分类，支持增删改查
// 设计：一级=group, 二级=cat, 通过 cat.group 自然映射
// 布局：支出大类在左，收入大类在右，两列并排
// ============================================================

import { useState, useMemo, useCallback, memo } from 'react';
import { useFinance } from '../index';

// ── 预设图标列表 ───────────────────────────────────────────
const ICON_OPTIONS = [
    '🍚', '🍜', '🍔', '🍕', '🥗', '🎂', '☕', '🍺',
    '🏠', '🚗', '🚌', '✈️', '🏥', '📚', '🎮', '🎬',
    '🎵', '🏋️', '👕', '💄', '🎁', '💊', '🐱', '🛒',
    '📱', '💻', '⚡', '💡', '🔧', '💰', '📌', '⭐',
];

// ── 预设颜色列表 ───────────────────────────────────────────
const COLOR_OPTIONS = [
    '#E05A3A', '#2BBFCC', '#D4A017', '#4CAF7D',
    '#6C5CE7', '#E84393', '#00B894', '#FDCB6E',
    '#636E72', '#0984E3', '#B71540', '#3D3D3D',
    '#1DD1A1', '#FF6348', '#7BED9F', '#70A1FF',
];

function Settings() {
    const { data, setData, saveData, showToast } = useFinance();

    // ── 本地编辑状态（深拷贝 cats，防止直接修改原数据）───
    const [localCats, setLocalCats] = useState(null);
    const [editCatId, setEditCatId] = useState(null); // 正在编辑的 cat id
    const [editGroup, setEditGroup] = useState(null);  // 正在编辑的 group name
    const [showNewCat, setShowNewCat] = useState(null); // 在哪个 group 里新建 cat
    const [newCatName, setNewCatName] = useState('');
    const [newGroupName, setNewGroupName] = useState('');
    const [showNewGroup, setShowNewGroup] = useState(false);

    // 删除确认
    const [deleteTarget, setDeleteTarget] = useState(null); // { type: 'cat'|'group', id/name }
    const [migrateTo, setMigrateTo] = useState('');

    // 实际使用的 cats 列表
    const cats = localCats || data.cats;

    // ── 一级（group）列表及其下的二级 ─────────────────────
    const groupsMap = useMemo(() => {
        const map = new Map();
        cats.forEach(c => {
            const g = c.group || '其他';
            if (!map.has(g)) map.set(g, []);
            map.get(g).push(c);
        });
        // 按 sort 排序每组内的 cats
        for (const [g, list] of map) {
            list.sort((a, b) => (a.sort || 0) - (b.sort || 0));
        }
        return map;
    }, [cats]);

    const groupNames = useMemo(() => [...groupsMap.keys()].sort(), [groupsMap]);

    // ── 按 type 分流 groups：支出在左 / 收入在右 ────────────
    const { expenseGroups, incomeGroups } = useMemo(() => {
        const exp = [];
        const inc = [];
        groupNames.forEach(g => {
            const catsInG = groupsMap.get(g) || [];
            // 只要组内有非 income 的 cat，就归入支出列（expense 优先）
            const hasExpense = catsInG.some(c => c.type !== 'income');
            if (hasExpense) exp.push(g);
            else inc.push(g);
        });
        return { expenseGroups: exp, incomeGroups: inc };
    }, [groupNames, groupsMap]);

    // ── 所有 cat 名称列表（用于删除迁移目标选择）─────────
    const allCatOpts = useMemo(() => cats.map(c => ({ id: c.id, name: c.name })).sort((a, b) => a.name.localeCompare(b.name)), [cats]);

    // ── 开始编辑 ──────────────────────────────────────────
    const handleStartEdit = useCallback(() => {
        setLocalCats(data.cats.map(c => ({ ...c })));
    }, [data.cats]);

    const handleCancelEdit = useCallback(() => {
        setLocalCats(null);
        setEditCatId(null);
        setEditGroup(null);
        setShowNewCat(null);
        setNewCatName('');
        setShowNewGroup(false);
        setNewGroupName('');
    }, []);

    // ── 保存全部更改到 store + Firebase ──────────────────
    const handleSave = useCallback(() => {
        if (!localCats) return;
        setData(prev => {
            const next = { ...prev, cats: localCats.map(c => ({ ...c })) };
            return next;
        });
        saveData({ ...data, cats: localCats });
        setLocalCats(null);
        setEditCatId(null);
        setEditGroup(null);
        setShowNewCat(null);
        setNewCatName('');
        setShowNewGroup(false);
        setNewGroupName('');
        showToast('✅ 分类设置已保存');
    }, [localCats, setData, saveData, data, showToast]);

    // ── 编辑单个 cat 字段 ────────────────────────────────
    const handleCatFieldChange = useCallback((catId, field, value) => {
        setLocalCats(prev => prev.map(c => c.id === catId ? { ...c, [field]: value } : c));
    }, []);

    // ── 新建 cat ──────────────────────────────────────────
    const handleAddCat = useCallback((group) => {
        if (!newCatName.trim()) return;
        const newId = 'cat_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
        const newCat = {
            id: newId,
            name: newCatName.trim(),
            icon: '📌',
            color: '#999',
            group,
            type: 'expense',
            domain: '',
            sort: 0,
        };
        setLocalCats(prev => [...prev, newCat]);
        setNewCatName('');
        setShowNewCat(null);
        showToast(`已添加二级分类：${newCatName.trim()}`);
    }, [newCatName, showToast]);

    // ── 新建 group ────────────────────────────────────────
    const handleAddGroup = useCallback(() => {
        if (!newGroupName.trim()) return;
        // 新建 group 本质是新建一个 cat 作为该 group 的第一个成员
        const newId = 'cat_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
        const newCat = {
            id: newId,
            name: newGroupName.trim() + '（默认）',
            icon: '📌',
            color: '#999',
            group: newGroupName.trim(),
            type: 'expense',
            domain: '',
            sort: 0,
        };
        setLocalCats(prev => [...prev, newCat]);
        setNewGroupName('');
        setShowNewGroup(false);
        showToast(`已添加一级分类：${newGroupName.trim()}`);
    }, [newGroupName, showToast]);

    // ── 删除 cat ──────────────────────────────────────────
    const handleDeleteCatConfirm = useCallback(() => {
        if (!deleteTarget || deleteTarget.type !== 'cat') return;
        const targetCatId = deleteTarget.id;
        const targetCat = cats.find(c => c.id === targetCatId);
        const fromGroup = groupsMap;
        const catsInGroup = fromGroup.get(targetCat?.group || '其他') || [];
        const otherCatsInGroup = catsInGroup.filter(c => c.id !== targetCatId);
        const otherCatsOutside = cats.filter(c => c.id !== targetCatId && c.group !== (targetCat?.group || '其他'));

        // 迁移目标：用户选择的 cat，如果没选则自动选同组的第一个或全部其他 cat 的第一个
        let targetMigrateId = migrateTo;
        if (!targetMigrateId) {
            if (otherCatsInGroup.length > 0) targetMigrateId = otherCatsInGroup[0].id;
            else if (otherCatsOutside.length > 0) targetMigrateId = otherCatsOutside[0].id;
        }

        if (!targetMigrateId) {
            showToast('❌ 无法删除：需要至少保留一个分类', 'error');
            setDeleteTarget(null);
            setMigrateTo('');
            return;
        }

        const targetMigrateCat = cats.find(c => c.id === targetMigrateId);

        // 迁移涉及该 cat2 的所有交易
        setData(prev => {
            const newTxs = prev.txs.map(t => {
                if (t.cat2 === targetCatId) {
                    return {
                        ...t,
                        cat2: targetMigrateId,
                        cat1: targetMigrateCat?.group || '其他',
                        domain: targetMigrateCat?.domain || '',
                    };
                }
                return t;
            });
            const newCats = prev.cats.filter(c => c.id !== targetCatId);
            return { ...prev, txs: newTxs, cats: newCats };
        });

        // 如果编辑模式已开启，也更新 localCats
        if (localCats) {
            setLocalCats(prev => prev.filter(c => c.id !== targetCatId));
        }

        saveData({ ...data, cats: cats.filter(c => c.id !== targetCatId), txs: data.txs.map(t => {
            if (t.cat2 === targetCatId) return { ...t, cat2: targetMigrateId, cat1: targetMigrateCat?.group || '其他', domain: targetMigrateCat?.domain || '' };
            return t;
        })});

        setDeleteTarget(null);
        setMigrateTo('');
        showToast(`已删除分类并迁移交易到「${targetMigrateCat?.name || '其他'}」`);
    }, [deleteTarget, migrateTo, cats, groupsMap, localCats, setData, data, saveData, showToast]);

    // ── 删除 group（删除整组所有 cats）───────────────────
    const handleDeleteGroupConfirm = useCallback(() => {
        if (!deleteTarget || deleteTarget.type !== 'group') return;
        const groupName = deleteTarget.name;
        const catIdsToDelete = (groupsMap.get(groupName) || []).map(c => c.id);

        // 迁移目标：必须迁移到另一个 group 的某个 cat
        const otherCats = cats.filter(c => c.group !== groupName);
        let targetMigrateId = migrateTo;
        if (!targetMigrateId && otherCats.length > 0) targetMigrateId = otherCats[0].id;

        if (!targetMigrateId) {
            showToast('❌ 无法删除：至少保留一个分类', 'error');
            setDeleteTarget(null);
            setMigrateTo('');
            return;
        }

        const targetMigrateCat = cats.find(c => c.id === targetMigrateId);

        setData(prev => {
            const newTxs = prev.txs.map(t => {
                if (catIdsToDelete.includes(t.cat2)) {
                    return {
                        ...t,
                        cat2: targetMigrateId,
                        cat1: targetMigrateCat?.group || '其他',
                        domain: targetMigrateCat?.domain || '',
                    };
                }
                return t;
            });
            const newCats = prev.cats.filter(c => c.group !== groupName);
            return { ...prev, txs: newTxs, cats: newCats };
        });

        if (localCats) {
            setLocalCats(prev => prev.filter(c => c.group !== groupName));
        }

        saveData({ ...data, cats: cats.filter(c => c.group !== groupName), txs: data.txs.map(t => {
            if (catIdsToDelete.includes(t.cat2)) return { ...t, cat2: targetMigrateId, cat1: targetMigrateCat?.group || '其他', domain: targetMigrateCat?.domain || '' };
            return t;
        })});

        setDeleteTarget(null);
        setMigrateTo('');
        showToast(`已删除一级分类「${groupName}」并迁移交易到「${targetMigrateCat?.name || '其他'}」`);
    }, [deleteTarget, migrateTo, groupsMap, cats, localCats, setData, data, saveData, showToast]);

    // ── 获取属于某个 group 的 tx 数量 ─────────────────────
    const getTxCountForCat = useCallback((catId) => {
        return data.txs.filter(t => t.cat2 === catId).length;
    }, [data.txs]);

    const getTxCountForGroup = useCallback((groupName) => {
        const catIds = (groupsMap.get(groupName) || []).map(c => c.id);
        return data.txs.filter(t => catIds.includes(t.cat2)).length;
    }, [data.txs, groupsMap]);

    // ── 是否处于编辑模式 ─────────────────────────────────
    const isEditing = localCats !== null;

    // ════════════════════════════════════════════════════════
    // ── 渲染单个分组卡片（由下方两列布局调用）────────────
    // ════════════════════════════════════════════════════════
    const renderGroupCard = (groupName) => {
        const catList = groupsMap.get(groupName) || [];
        const txCount = getTxCountForGroup(groupName);
        return (
            <div key={groupName} className="card settings-group-card" style={{ marginBottom: 16, padding: 16, breakInside: 'avoid' }}>
                {/* ── 一级标题行 ───────────────────── */}
                <div className="settings-group-header">
                    <div className="settings-group-title">
                        <span className="settings-group-icon">📁</span>
                        {isEditing && editGroup === groupName ? (
                            <input
                                type="text"
                                className="settings-inline-input"
                                value={groupName}
                                onChange={e => {
                                    const newName = e.target.value;
                                    catList.forEach(c => handleCatFieldChange(c.id, 'group', newName));
                                    setEditGroup(newName);
                                }}
                                onBlur={() => setEditGroup(null)}
                                autoFocus
                                style={{ fontSize: 16, fontWeight: 700, width: 200 }}
                            />
                        ) : (
                            <span
                                className="settings-group-name"
                                onDoubleClick={() => isEditing && setEditGroup(groupName)}
                                title={isEditing ? '双击编辑一级名称' : ''}
                            >
                                {groupName}
                            </span>
                        )}
                        <span className="settings-tx-count">{txCount} 笔交易</span>
                    </div>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        {isEditing && (
                            <>
                                <button
                                    className="btn btn-outline btn-sm"
                                    style={{ fontSize: 11, padding: '3px 10px' }}
                                    onClick={() => { setShowNewCat(groupName); setNewCatName(''); }}
                                >
                                    + 新增二级
                                </button>
                                <button
                                    className="btn btn-outline btn-sm"
                                    style={{ fontSize: 11, padding: '3px 10px', borderColor: 'var(--c-survive)', color: 'var(--c-survive)' }}
                                    onClick={() => setDeleteTarget({ type: 'group', name: groupName })}
                                >
                                    <i className="ri-delete-bin-line" />
                                </button>
                            </>
                        )}
                    </div>
                </div>

                {/* ── 新建 cat 输入框 ──────────────── */}
                {isEditing && showNewCat === groupName && (
                    <div className="settings-new-cat-row">
                        <input
                            type="text"
                            className="form-control"
                            placeholder="新分类名称..."
                            value={newCatName}
                            onChange={e => setNewCatName(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') handleAddCat(groupName); }}
                            style={{ height: 32, fontSize: 13, flex: 1 }}
                        />
                        <button className="btn btn-primary btn-sm" onClick={() => handleAddCat(groupName)}>添加</button>
                        <button className="btn btn-outline btn-sm" onClick={() => { setShowNewCat(null); setNewCatName(''); }}>取消</button>
                    </div>
                )}

                {/* ── 二级列表 ─────────────────────── */}
                <div className="settings-cat-list">
                    {catList.map(cat => {
                        const isEditingThis = editCatId === cat.id;
                        const catTxCount = getTxCountForCat(cat.id);
                        return (
                            <div key={cat.id} className="settings-cat-item">
                                {/* 图标选择器 */}
                                <div className="settings-cat-icon-col">
                                    {isEditing && isEditingThis ? (
                                        <IconPicker
                                            value={cat.icon}
                                            onChange={v => handleCatFieldChange(cat.id, 'icon', v)}
                                        />
                                    ) : (
                                        <span className="settings-cat-icon">{cat.icon || '📌'}</span>
                                    )}
                                </div>

                                {/* 名称 */}
                                <div className="settings-cat-name-col">
                                    {isEditing && isEditingThis ? (
                                        <input
                                            type="text"
                                            className="settings-inline-input"
                                            value={cat.name}
                                            onChange={e => handleCatFieldChange(cat.id, 'name', e.target.value)}
                                            style={{ width: '100%' }}
                                        />
                                    ) : (
                                        <span>{cat.name}</span>
                                    )}
                                </div>

                                {/* 颜色 */}
                                <div className="settings-cat-color-col">
                                    {isEditing && isEditingThis ? (
                                        <ColorPicker
                                            value={cat.color}
                                            onChange={v => handleCatFieldChange(cat.id, 'color', v)}
                                        />
                                    ) : (
                                        <span className="settings-color-swatch" style={{ backgroundColor: cat.color }} />
                                    )}
                                </div>

                                {/* 类型 */}
                                <div className="settings-cat-type-col">
                                    {isEditing && isEditingThis ? (
                                        <select
                                            className="form-control"
                                            style={{ height: 30, fontSize: 12 }}
                                            value={cat.type}
                                            onChange={e => handleCatFieldChange(cat.id, 'type', e.target.value)}
                                        >
                                            <option value="expense">支出</option>
                                            <option value="income">收入</option>
                                        </select>
                                    ) : (
                                        <span className={`settings-type-badge ${cat.type === 'income' ? 'type-inc' : 'type-exp'}`}>
                                            {cat.type === 'income' ? '收入' : '支出'}
                                        </span>
                                    )}
                                </div>

                                {/* 交易数 */}
                                <span className="settings-cat-tx-count">{catTxCount} 笔</span>

                                {/* 操作按钮 */}
                                <div className="settings-cat-actions">
                                    {isEditing && (
                                        <>
                                            {isEditingThis ? (
                                                <button
                                                    className="btn-icon"
                                                    onClick={() => setEditCatId(null)}
                                                    title="完成编辑"
                                                    style={{ color: 'var(--primary)' }}
                                                >
                                                    ✅
                                                </button>
                                            ) : (
                                                <button
                                                    className="btn-icon"
                                                    onClick={() => setEditCatId(cat.id)}
                                                    title="编辑此分类"
                                                >
                                                    <i className="ri-edit-line" />
                                                </button>
                                            )}
                                            {!isEditingThis && (
                                                <button
                                                    className="btn-icon"
                                                    onClick={() => setDeleteTarget({ type: 'cat', id: cat.id, name: cat.name })}
                                                    title="删除此分类"
                                                    style={{ color: 'var(--c-survive)' }}
                                                >
                                                    <i className="ri-delete-bin-line" />
                                                </button>
                                            )}
                                        </>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    };

    // ════════════════════════════════════════════════════════
    return (
        <div className="settings-page">
            {/* ── 标题栏 ───────────────────────────────── */}
            <div className="card" style={{ marginBottom: 20 }}>
                <div className="card-header">
                    <div className="title">
                        <i className="ri-settings-3-line" style={{ marginRight: 8 }} />
                        分类管理
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                        {isEditing ? (
                            <>
                                <button className="btn btn-outline btn-sm" onClick={handleCancelEdit}>
                                    取消
                                </button>
                                <button className="btn btn-primary btn-sm" onClick={handleSave}>
                                    保存设置
                                </button>
                            </>
                        ) : (
                            <button className="btn btn-primary btn-sm" onClick={handleStartEdit}>
                                <i className="ri-edit-line" style={{ marginRight: 4 }} />
                                编辑分类
                            </button>
                        )}
                    </div>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-sub)', lineHeight: 1.6 }}>
                    <p style={{ margin: 0 }}>
                        💡 <strong>一级分类</strong> = 分组名称（如"生存底座"、"生活消耗"），由二级分类的所属分组自动确定。
                    </p>
                    <p style={{ margin: '4px 0 0' }}>
                        💡 <strong>二级分类</strong> = 具体分类（如"餐饮"、"房租"），导入账单时选择的目标分类。二级会自动映射到对应的一级。
                    </p>
                </div>
            </div>

            {/* ── 两列布局：支出左 / 收入右 ─────────────── */}
            <div className="settings-columns">
                {/* 左列：支出大类 */}
                <div className="settings-col settings-col-expense">
                    <div className="settings-col-header" style={{ color: 'var(--c-survive)' }}>
                        🔥 支出分类
                    </div>
                    {expenseGroups.length === 0 && (
                        <div className="card" style={{ padding: 20, textAlign: 'center', color: 'var(--text-sub)', fontSize: 13 }}>
                            暂无支出分类
                        </div>
                    )}
                    {expenseGroups.map(renderGroupCard)}
                </div>

                {/* 右列：收入大类 */}
                <div className="settings-col settings-col-income">
                    <div className="settings-col-header" style={{ color: 'var(--c-income)' }}>
                        💰 收入分类
                    </div>
                    {incomeGroups.length === 0 && (
                        <div className="card" style={{ padding: 20, textAlign: 'center', color: 'var(--text-sub)', fontSize: 13 }}>
                            暂无收入分类
                        </div>
                    )}
                    {incomeGroups.map(renderGroupCard)}
                </div>
            </div>

            {/* ── 新增一级 ─────────────────────────────────── */}
            {isEditing && (
                <div className="card" style={{ marginTop: 8, marginBottom: 16, padding: 16, textAlign: 'center', borderStyle: 'dashed' }}>
                    {showNewGroup ? (
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'center' }}>
                            <input
                                type="text"
                                className="form-control"
                                placeholder="新一级名称..."
                                value={newGroupName}
                                onChange={e => setNewGroupName(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') handleAddGroup(); }}
                                style={{ height: 32, fontSize: 13, maxWidth: 200 }}
                            />
                            <button className="btn btn-primary btn-sm" onClick={handleAddGroup}>添加</button>
                            <button className="btn btn-outline btn-sm" onClick={() => { setShowNewGroup(false); setNewGroupName(''); }}>取消</button>
                        </div>
                    ) : (
                        <button className="btn btn-outline" onClick={() => setShowNewGroup(true)}>
                            + 新增一级分类
                        </button>
                    )}
                </div>
            )}

            {/* ── 删除确认弹窗 ─────────────────────────────── */}
            {deleteTarget && (
                <DeleteConfirmModal
                    target={deleteTarget}
                    cats={cats}
                    groupsMap={groupsMap}
                    allCatOpts={allCatOpts}
                    migrateTo={migrateTo}
                    setMigrateTo={setMigrateTo}
                    getTxCountForCat={getTxCountForCat}
                    getTxCountForGroup={getTxCountForGroup}
                    onConfirm={deleteTarget.type === 'cat' ? handleDeleteCatConfirm : handleDeleteGroupConfirm}
                    onCancel={() => { setDeleteTarget(null); setMigrateTo(''); }}
                />
            )}
        </div>
    );
}

export default memo(Settings);

// ════════════════════════════════════════════════════════════
// 图标选择器（支持 emoji 预设 + 自定义输入）
// ════════════════════════════════════════════════════════════
const IconPicker = memo(function IconPicker({ value, onChange }) {
    const [customInput, setCustomInput] = useState('');
    const [showCustom, setShowCustom] = useState(false);

    const handleCustomConfirm = () => {
        const trimmed = customInput.trim();
        if (trimmed) {
            onChange(trimmed);
        }
        setCustomInput('');
        setShowCustom(false);
    };

    return (
        <div className="icon-picker">
            <div className="icon-picker-current" onClick={() => setShowCustom(v => !v)} title="点击切换自定义输入">
                {value || '📌'}
            </div>
            <div className="icon-picker-grid">
                {ICON_OPTIONS.map(icon => (
                    <button
                        key={icon}
                        className={`icon-picker-btn ${icon === value ? 'selected' : ''}`}
                        onClick={() => onChange(icon)}
                    >
                        {icon}
                    </button>
                ))}
                {/* 自定义输入按钮 */}
                <button
                    className={`icon-picker-btn icon-picker-custom-btn ${showCustom ? 'active' : ''}`}
                    onClick={() => setShowCustom(v => !v)}
                    title="自定义图标"
                >
                    ✏️
                </button>
            </div>
            {showCustom && (
                <div className="icon-picker-custom-row">
                    <input
                        type="text"
                        className="settings-inline-input"
                        placeholder="输入 emoji 或文字..."
                        value={customInput}
                        onChange={e => setCustomInput(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') handleCustomConfirm(); }}
                        style={{ flex: 1, fontSize: 13 }}
                        autoFocus
                    />
                    <button className="btn btn-primary btn-sm" onClick={handleCustomConfirm}>确定</button>
                </div>
            )}
        </div>
    );
});

// ════════════════════════════════════════════════════════════
// 颜色选择器
// ════════════════════════════════════════════════════════════
const ColorPicker = memo(function ColorPicker({ value, onChange }) {
    return (
        <div className="color-picker">
            <div className="color-picker-swatches">
                {COLOR_OPTIONS.map(color => (
                    <button
                        key={color}
                        className={`color-picker-swatch ${color === value ? 'selected' : ''}`}
                        style={{ backgroundColor: color }}
                        onClick={() => onChange(color)}
                        title={color}
                    />
                ))}
            </div>
        </div>
    );
});

// ════════════════════════════════════════════════════════════
// 删除确认弹窗
// ════════════════════════════════════════════════════════════
function DeleteConfirmModal({
    target, cats, groupsMap, allCatOpts, migrateTo, setMigrateTo,
    getTxCountForCat, getTxCountForGroup, onConfirm, onCancel,
}) {
    const isGroup = target.type === 'group';
    const title = isGroup ? `删除一级分类「${target.name}」` : `删除二级分类「${target.name}」`;
    const affectedCatIds = isGroup
        ? (groupsMap.get(target.name) || []).map(c => c.id)
        : [target.id];
    const affectedCatList = isGroup
        ? (groupsMap.get(target.name) || [])
        : [cats.find(c => c.id === target.id)].filter(Boolean);
    const affectedTxCount = isGroup
        ? getTxCountForGroup(target.name)
        : getTxCountForCat(target.id);

    // 可迁移到的目标（排除被删除的 cats）
    const availableTargets = allCatOpts.filter(c => !affectedCatIds.includes(c.id));

    return (
        <div className="modal-overlay open" onClick={onCancel}>
            <div className="modal" style={{ maxWidth: 460 }} onClick={e => e.stopPropagation()}>
                <div className="card-header">
                    <div className="title" style={{ color: 'var(--c-survive)' }}>
                        <i className="ri-alert-line" style={{ marginRight: 6 }} />
                        {title}
                    </div>
                </div>

                <div style={{ marginBottom: 16 }}>
                    <p style={{ margin: '0 0 8px', color: 'var(--text-main)', fontWeight: 600 }}>
                        将要删除的分类：
                    </p>
                    {affectedCatList.map(c => (
                        <span key={c.id} className="settings-delete-tag">
                            {c.icon} {c.name}
                        </span>
                    ))}
                </div>

                {affectedTxCount > 0 && (
                    <div style={{ marginBottom: 16, padding: 12, background: '#FFF5F5', borderRadius: 8, border: '1px solid #FED7D7' }}>
                        <p style={{ margin: 0, color: 'var(--c-survive)', fontSize: 13, fontWeight: 600 }}>
                            ⚠️ 有 {affectedTxCount} 笔交易关联此分类
                        </p>
                        <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-sub)' }}>
                            请选择迁移目标分类，否则无法删除。
                        </p>
                    </div>
                )}

                <div className="form-group" style={{ marginBottom: 20 }}>
                    <label className="edit-label" style={{ marginBottom: 6, display: 'block', fontWeight: 600, fontSize: 13 }}>
                        迁移交易到：
                    </label>
                    <select
                        className="form-control"
                        value={migrateTo}
                        onChange={e => setMigrateTo(e.target.value)}
                        style={{ height: 36 }}
                    >
                        <option value="">请选择目标分类...</option>
                        {availableTargets.map(c => (
                            <option key={c.id} value={c.id}>
                                {c.name} [{getTxCountForCat(c.id)} 笔]
                            </option>
                        ))}
                    </select>
                </div>

                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                    <button className="btn btn-outline" onClick={onCancel}>取消</button>
                    <button
                        className="btn btn-primary"
                        style={{ background: 'var(--c-survive)', borderColor: '#C0392B' }}
                        onClick={onConfirm}
                        disabled={affectedTxCount > 0 && !migrateTo}
                    >
                        确认删除
                    </button>
                </div>
            </div>
        </div>
    );
}