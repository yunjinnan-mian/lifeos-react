// ============================================================
// Finance Pro — useWxParser
// 微信 / 支付宝账单解析 + 清洗台状态管理
// ============================================================

import { useState, useCallback } from 'react';

// ── 查找账户 id ────────────────────────────────────────────
function findAccId(acc, txt) {
    if (!txt || typeof txt !== 'string') return '';
    const byName = acc.find(a => txt.includes(a.name) || (a.name.length > 2 && a.name.includes(txt)));
    if (byName) return byName.id;
    const numMatch = txt.match(/\d{4}/);
    if (numMatch) { const byNum = acc.find(a => a.name.includes(numMatch[0])); if (byNum) return byNum.id; }
    return '';
}

// ── CSV 原始行解析 ─────────────────────────────────────────
function parseCsvLine(line) {
    const cols = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
    return cols.map(c => c.trim().replace(/^"|"$/g, '').replace(/""/g, '"'));
}

// ── 微信账单行处理 ─────────────────────────────────────────
function processWeChatRows(rows) {
    const bills = [];
    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row.length < 5) continue;
        let date = String(row[0]).trim().replace(/\/|年|月/g, '-').replace('日', '').split(' ')[0];
        if (!date || date.length < 8) continue;
        const typeStr = String(row[1]), counterparty = String(row[2]);
        const item = String(row[3]), dir = String(row[4]);
        const amtStr = String(row[5]).replace(/[¥￥,]/g, '');
        const amt = parseFloat(amtStr);
        const method = String(row[6]), status = String(row[7]);
        const wxId = String(row[8]), remark = String(row[10] || '');
        const isContra = dir === '收入' && (typeStr.includes('退款') || remark.includes('退款') || item.includes('退款'));
        if (['支付成功', '已转账', '已存入零钱', '对方已收钱'].includes(status)) {
            bills.push({ rawDate: date, typeStr, counterparty, item, dir, amt, method, wxId, remark, isContra, source: 'wechat' });
        }
    }
    return bills;
}

// ── 支付宝账单行处理 ───────────────────────────────────────
function processAlipayRows(rows) {
    const bills = [];
    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row.length < 5) continue;
        const firstCol = String(row[0]);
        if (!firstCol || firstCol.startsWith('----------------') || (firstCol.includes('共') && firstCol.includes('笔'))) continue;
        const status = String(row[8] || '').trim();
        if (status === '交易关闭') continue;
        const date = firstCol.replace(/\//g, '-').split(' ')[0];
        if (!date.match(/\d{4}-\d{1,2}-\d{1,2}/)) continue;
        const typeStr = String(row[1]), counterparty = String(row[2]), item = String(row[4]);
        const dir = String(row[5] || '').trim();
        const amt = parseFloat(String(row[6]).replace(/[¥￥,]/g, ''));
        const method = String(row[7]), orderId = String(row[9] || '').trim(), remark = String(row[11] || '').trim();
        if (dir === '不计收支') continue;
        const isContra = dir === '收入' && (remark.includes('退款') || item.includes('退款') || typeStr.includes('退款'));
        if (!isNaN(amt)) bills.push({ rawDate: date, typeStr, counterparty, item, dir, amt, method, wxId: orderId, remark, isContra, source: 'alipay' });
    }
    return bills;
}

// ── 识别账单格式 + 解析 ────────────────────────────────────
function parseRawData(rawData, type, acc, existingTxs, rules, parsedBills) {
    let allRows = [];
    if (type === 'csv') {
        const lines = rawData.split('\n');
        allRows = lines.map(line => line.trim() ? parseCsvLine(line) : []);
    } else {
        allRows = rawData;
    }

    let headerIndex = -1, source = 'unknown';
    for (let i = 0; i < Math.min(allRows.length, 100); i++) {
        const row = allRows[i].map(x => String(x).trim());
        if (row.includes('交易时间') && (row.includes('交易类型') || row.includes('金额(元)'))) { headerIndex = i; source = 'wechat'; break; }
        if (row.includes('交易时间') && (row.includes('交易分类') || row.includes('商品说明') || row.includes('商家订单号'))) { headerIndex = i; source = 'alipay'; break; }
    }
    if (headerIndex === -1) return { error: '无法识别账单格式：未找到"交易时间"列' };

    const dataRows = allRows.slice(headerIndex + 1);
    const rawBills = source === 'wechat' ? processWeChatRows(dataRows) : processAlipayRows(dataRows);

    return normalizeBills(rawBills, acc, existingTxs, rules, parsedBills);
}

// ── 标准化 + 去重 ──────────────────────────────────────────
function normalizeBills(rawBills, acc, existingTxs, rules, parsedBills) {
    const newBills = [];
    let addedCount = 0;

    rawBills.forEach(b => {
        // 已在 DB 里
        const isExistInDb = existingTxs.some(t => {
            if (b.wxId && t.wxId === b.wxId) return true;
            if (!b.wxId && t.date === b.rawDate && Math.abs(t.amount - b.amt) < 0.01 && t.desc?.includes(b.item)) return true;
            return false;
        });
        if (isExistInDb) return;
        // 已在临时池里
        const isExistInPool = parsedBills.some(t => b.wxId && t.wxId === b.wxId);
        if (isExistInPool) return;

        // 组合 desc
        let desc = b.counterparty;
        if (b.source === 'wechat') {
            if (['微信支付', '/'].includes(desc) || desc.includes('美团')) desc = b.item || b.typeStr;
        } else {
            desc = (b.item && b.item !== '/') ? b.item : b.counterparty;
        }
        if (b.remark && b.remark !== '/') desc += ` ${b.remark}`;

        // 模式判断
        let mode = 'tx', finalType = '', fromAcc = '', toAcc = '', cat = '';
        if (b.isContra) {
            finalType = 'expense'; mode = 'tx';
        } else if (
            b.typeStr.includes('转入零钱') || b.typeStr.includes('提现') ||
            b.item.includes('信用卡还款') || b.typeStr.includes('充值')
        ) {
            mode = 'transfer'; finalType = 'transfer';
            if (b.source === 'wechat') {
                if (b.typeStr.includes('转入零钱')) { fromAcc = findAccId(acc, b.method); toAcc = findAccId(acc, '微信'); }
                else if (b.typeStr.includes('提现')) { fromAcc = findAccId(acc, '微信'); toAcc = findAccId(acc, b.method); }
            } else {
                if (b.typeStr.includes('充值'))  { desc = '资产: 银行卡→支付宝'; fromAcc = findAccId(acc, b.method); toAcc = findAccId(acc, '支付宝'); }
                else if (b.typeStr.includes('提现')) { desc = '资产: 支付宝→银行卡'; fromAcc = findAccId(acc, '支付宝'); toAcc = findAccId(acc, b.method); }
            }
        } else {
            finalType = b.dir === '收入' ? 'income' : 'expense';
            // 规则匹配
            for (const k in rules) {
                if (desc.includes(k) || b.counterparty.includes(k) || b.item.includes(k)) { cat = rules[k]; break; }
            }
            if (!cat && b.source === 'alipay' && b.typeStr && rules[b.typeStr]) cat = rules[b.typeStr];
            if (finalType === 'expense') fromAcc = findAccId(acc, b.method);
        }

        newBills.push({
            id: Date.now() + Math.random(),
            date: b.rawDate,
            desc: b.isContra ? `[退款] ${desc}` : desc,
            type: b.typeStr,
            dir: b.dir,
            amount: b.isContra ? -Math.abs(b.amt) : b.amt,
            mode, fromAcc, toAcc, cat,
            isIgnored: false,
            wxId: b.wxId,
            realType: finalType,
            method: b.method,
            source: b.source,
        });
        addedCount++;
    });

    return { newBills, addedCount };
}

// ════════════════════════════════════════════════════════════
export function useWxParser() {
    const [parsedBills, setParsedBills] = useState([]);
    const [showCleanZone, setShowCleanZone] = useState(false);

    // ── 读取文件（入口）──────────────────────────────────
    const handleFile = useCallback((file, { acc, txs, rules }) => {
        if (!file) return Promise.resolve({ error: '无文件' });

        return new Promise((resolve) => {
            const isAlipay = file.name.toLowerCase().includes('alipay') || file.name.includes('支付宝');

            if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
                const reader = new FileReader();
                reader.readAsArrayBuffer(file);
reader.onload = (ev) => {
    try {
        console.log('[1] window.XLSX:', typeof window.XLSX);
        const workbook = window.XLSX.read(ev.target.result, { type: 'array' });
        console.log('[2] sheets:', workbook.SheetNames);
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = window.XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false });
        console.log('[3] rows:', rows.length, '| row17:', rows[17]);
        const result = parseRawData(rows, 'excel', acc, txs, rules, []);
        console.log('[4] result:', result);
        resolve(result);
    } catch (e) {
        console.error('[CATCH]', e);
        resolve({ error: 'Excel 文件读取失败' });
    }
};
                return;
            }

            const reader = new FileReader();
            reader.readAsText(file, 'UTF-8');
            reader.onload = (ev) => {
                const content = ev.target.result;
                if (isAlipay && !content.includes('交易')) {
                    const retryReader = new FileReader();
                    retryReader.readAsText(file, 'GBK');
                    retryReader.onload = (ev2) => resolve(parseRawData(ev2.target.result, 'csv', acc, txs, rules, []));
                    return;
                }
                resolve(parseRawData(content, 'csv', acc, txs, rules, []));
            };
        });
    }, []);

    // ── 处理解析结果，合并到 parsedBills ─────────────────
    const applyParsed = useCallback(({ newBills, addedCount, error }, currentParsed = []) => {
        if (error) return { ok: false, msg: error };
        const merged = [...currentParsed, ...newBills];
        if (merged.length > 0) {
            setParsedBills(merged);
            setShowCleanZone(true);
            return { ok: true, msg: addedCount > 0 ? `已添加 ${addedCount} 笔新记录` : '文件已读取 (未发现新记录)' };
        }
        return { ok: false, msg: '没有记录可显示' };
    }, []);

    // ── 行操作 ────────────────────────────────────────────
    const toggleRow = useCallback((idx, checked) => {
        setParsedBills(prev => prev.map((b, i) => i === idx ? { ...b, isIgnored: !checked } : b));
    }, []);

    const toggleAll = useCallback((checked) => {
        setParsedBills(prev => prev.map(b => ({ ...b, isIgnored: !checked })));
    }, []);

    const updateRow = useCallback((idx, patch) => {
        setParsedBills(prev => prev.map((b, i) => i === idx ? { ...b, ...patch, isIgnored: false } : b));
    }, []);

    const switchRowType = useCallback((idx) => {
        setParsedBills(prev => prev.map((b, i) => {
            if (i !== idx) return b;
            const newType = b.realType === 'income' ? 'expense' : 'income';
            return { ...b, realType: newType, dir: newType === 'income' ? '收入' : '支出', cat: '' };
        }));
    }, []);

    const mergeSelected = useCallback((newDesc) => {
        setParsedBills(prev => {
            const selected = prev.filter(b => !b.isIgnored);
            if (selected.length < 2) return prev;
            let netAmount = 0;
            selected.forEach(b => {
                if (b.realType === 'income') netAmount += b.amount;
                else netAmount -= b.amount;
            });
            const selectedIds = new Set(selected.map(b => b.id));
            const remaining = prev.filter(b => !selectedIds.has(b.id));
            const merged = {
                id: Date.now(), date: selected[0].date, desc: newDesc,
                amount: parseFloat(Math.abs(netAmount).toFixed(2)),
                type: 'merged', dir: netAmount >= 0 ? '收入' : '支出',
                realType: netAmount >= 0 ? 'income' : 'expense',
                isIgnored: false, source: 'merged', cat: '', fromAcc: '', toAcc: '',
            };
            return [merged, ...remaining];
        });
    }, []);

    const cancelCleaning = useCallback(() => {
        setParsedBills([]);
        setShowCleanZone(false);
    }, []);

    const removeImported = useCallback((importedIds) => {
        setParsedBills(prev => {
            const remaining = prev.filter(b => !importedIds.has(String(b.id)));
            if (remaining.length === 0) setShowCleanZone(false);
            return remaining;
        });
    }, []);

    // ── 汇总统计 ──────────────────────────────────────────
    const getSummary = useCallback((bills) => {
        let totalInc = 0, totalExp = 0, count = 0, readyCount = 0;
        bills.forEach(b => {
            if (b.isIgnored) return;
            count++;
            if (b.mode === 'transfer') {
                if (b.fromAcc && b.toAcc && b.fromAcc !== b.toAcc) readyCount++;
            } else {
                if (b.cat && b.amount > 0) readyCount++;
                if (b.realType === 'income') totalInc += b.amount;
                else totalExp += b.amount;
            }
        });
        return { totalInc, totalExp, count, readyCount };
    }, []);

    return {
        parsedBills, setParsedBills,
        showCleanZone, setShowCleanZone,
        handleFile, applyParsed,
        toggleRow, toggleAll, updateRow, switchRowType,
        mergeSelected, cancelCleaning, removeImported,
        getSummary,
    };
}
