// ============================================================
// Finance Pro — 极简 Excel 样式记账表
// 纯二维数组 · 点哪写哪 · 失去焦点自动保存至 Firebase
// ============================================================

import { useState, useEffect, useCallback } from 'react';
import { db } from '../../../lib/firebase'; // 请确保路径正确
import { doc, getDoc, setDoc } from 'firebase/firestore';

// ── Firebase 数据层 ───────────────────────────────────────
// 我们把整个表格当作一个二维数组，存在单个 Document 里即可（最大支持 1MB，对于个人记账绰绰有余）
const SHEET_REF = doc(db, 'finance', 'excel_sheet'); 

// 初始模板（完全按照你的截图仿制）
const DEFAULT_GRID = [
    ["余额", "114,787.78", "77,783.39", "0.00", "0.00", "980.30", "301.39", "1.42", "172.00", "4,126.14", "1,423.14", "30,000.00", "0.00", "0.00", "", ""],
    ["说明", "收入", "支出", "报销/借款", "成都银行", "招商银行", "中国银行", "建设银行", "微信", "支付宝", "现金", "公积金", "医保", "基金", "购物卡", "农商银行"],
    ["24年结余", "-52,103.33", "", "", "42,852.00", "", "", "1,000.00", "1,000.00", "0.17", "482.00", "4,294.80", "845.11", "", "", "1,629.25"],
    ["兼职", "-120.00", "", "", "", "", "", "", "", "", "120.00", "", "", "", "", ""],
    ["2501工资", "-6,282.99", "", "", "2,500.00", "", "2,700.00", "", "", "", "", "", "", "", "", "1,082.99"],
    ["", "", "", "", "", "", "", "", "", "", "", "", "", "", "", ""] // 预留空行
];

export default function SimpleExcelAssets() {
    const [grid, setGrid] = useState([]);
    const [loaded, setLoaded] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    // ── 初始化加载 ──────────────────────────────────────────
    useEffect(() => {
        const loadData = async () => {
            try {
                const snap = await getDoc(SHEET_REF);
                if (snap.exists() && snap.data().data) {
                    setGrid(snap.data().data);
                } else {
                    // 如果云端没有数据，使用默认模板并初始化
                    setGrid(DEFAULT_GRID);
                    await setDoc(SHEET_REF, { data: DEFAULT_GRID });
                }
                setLoaded(true);
            } catch (err) {
                console.error(err);
                setError('加载数据失败，请刷新重试');
                setLoaded(true);
            }
        };
        loadData();
    }, []);

    // ── 保存数据 (失去焦点时触发) ─────────────────────────────
    const saveToFirebase = useCallback(async (newGrid) => {
        setSaving(true);
        try {
            await setDoc(SHEET_REF, { data: newGrid, updatedAt: new Date().toISOString() });
        } catch (err) {
            console.error(err);
            setError('保存失败，请检查网络');
        } finally {
            setSaving(false);
        }
    }, []);

    // ── 单元格内容变化 (只更新本地) ───────────────────────────
    const handleChange = (rowIndex, colIndex, value) => {
        const newGrid = [...grid];
        newGrid[rowIndex] = [...newGrid[rowIndex]];
        newGrid[rowIndex][colIndex] = value;
        setGrid(newGrid);
    };

    // ── 增加行列操作 ──────────────────────────────────────────
    const addRow = () => {
        const colCount = grid[0]?.length || 16;
        const newRow = Array(colCount).fill("");
        const newGrid = [...grid, newRow];
        setGrid(newGrid);
        saveToFirebase(newGrid);
    };

    const addColumn = () => {
        const newGrid = grid.map(row => [...row, ""]);
        setGrid(newGrid);
        saveToFirebase(newGrid);
    };

    if (!loaded) return <div style={{ padding: 40, color: '#666' }}>表格加载中...</div>;

    return (
        <div style={{ padding: 20, fontFamily: 'sans-serif' }}>
            
            {/* 顶栏操作区 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                <h2 style={{ margin: 0, fontSize: 18 }}>📝 简易记账本</h2>
                <button onClick={addRow} style={BTN_STYLE}>+ 添加一行</button>
                <button onClick={addColumn} style={BTN_STYLE}>+ 添加一列</button>
                {saving && <span style={{ fontSize: 12, color: '#ff9800' }}>保存中...</span>}
                {error && <span style={{ fontSize: 12, color: 'red' }}>{error}</span>}
                <div style={{ flex: 1 }}></div>
                <span style={{ fontSize: 12, color: '#999' }}>💡 像Excel一样直接点击输入，点别处自动保存</span>
            </div>

            {/* 表格容器 */}
            <div style={{ overflowX: 'auto', border: '1px solid #ccc' }}>
                <table style={{ borderCollapse: 'collapse', whiteSpace: 'nowrap', width: '100%' }}>
                    <tbody>
                        {grid.map((row, rowIndex) => {
                            // 判断当前行是否是表头或特殊行（按图片逻辑渲染底色）
                            const isTopSumRow = rowIndex === 0;
                            const isHeaderRow = rowIndex === 1;

                            return (
                                <tr key={rowIndex}>
                                    {row.map((cellValue, colIndex) => {
                                        // 设置图片里那一抹淡淡的绿色区域 (收入、支出、报销区)
                                        const isGreenCol = colIndex >= 1 && colIndex <= 3 && rowIndex >= 2;
                                        
                                        return (
                                            <td 
                                                key={colIndex} 
                                                style={{
                                                    border: '1px solid #dcdcdc',
                                                    background: isTopSumRow && colIndex === 0 ? '#9CCC65' : // 余额标题背景
                                                                isTopSumRow ? '#f0f0f0' : // 顶部总计行背景
                                                                isHeaderRow ? '#f9f9f9' : // 列标题行背景
                                                                isGreenCol ? '#E8F5E9' :  // 收支区域背景
                                                                '#fff',
                                                    padding: 0, // padding写在input里，这样点击热区更大
                                                    minWidth: colIndex === 0 ? 100 : 80,
                                                }}
                                            >
                                                <input
                                                    value={cellValue || ''}
                                                    onChange={(e) => handleChange(rowIndex, colIndex, e.target.value)}
                                                    onBlur={() => saveToFirebase(grid)} // 失去焦点保存
                                                    style={{
                                                        width: '100%',
                                                        boxSizing: 'border-box',
                                                        border: 'none',
                                                        outline: 'none',
                                                        background: 'transparent',
                                                        padding: '6px 10px',
                                                        textAlign: isHeaderRow ? 'center' : (colIndex === 0 ? 'center' : 'right'),
                                                        fontSize: 13,
                                                        fontWeight: (isTopSumRow || isHeaderRow) ? 'bold' : 'normal',
                                                        color: '#333'
                                                    }}
                                                />
                                            </td>
                                        );
                                    })}
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

// 按钮样式
const BTN_STYLE = {
    padding: '4px 10px',
    border: '1px solid #ccc',
    background: '#f9f9f9',
    borderRadius: 4,
    cursor: 'pointer',
    fontSize: 13
};