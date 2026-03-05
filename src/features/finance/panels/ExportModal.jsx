// ============================================================
// Finance Pro — ExportModal 年终封存
// 生成独立只读 HTML，可离线查阅
// ============================================================

import { useMemo } from 'react';
import { useFinance } from '../index';
import { getCatName } from '../utils/catMap';

export default function ExportModal({ open, onClose }) {
    const { data, showToast } = useFinance();

    const years = useMemo(() => {
        const s = new Set();
        data.txs.forEach(t => { if (t.date) s.add(t.date.slice(0, 4)); });
        s.add(new Date().getFullYear().toString());
        return [...s].sort((a, b) => b - a);
    }, [data.txs]);

    if (!open) return null;

    const handleExport = (year) => {
        if (!window.confirm(`确定生成 ${year} 年封存文件？\n\n该文件包含 ${year} 年全量数据，可在任意设备离线查看（只读）。`)) return;

        const yearStr  = String(year);
        const yearTxs  = data.txs.filter(t => t.date?.startsWith(yearStr));
        const txCount  = yearTxs.length;
        const totalExp = yearTxs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
        const totalInc = yearTxs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
        const totalNet = data.acc.reduce((s, a) => s + a.bal, 0);

        // 月度汇总
        const monthMap = {};
        yearTxs.forEach(t => {
            if (t.type === 'transfer' || t.type === 'adjust') return;
            const m = t.date?.slice(0, 7) || 'unknown';
            if (!monthMap[m]) monthMap[m] = { inc:0, exp:0 };
            if (t.type === 'income') monthMap[m].inc += t.amount;
            else monthMap[m].exp += t.amount;
        });
        const monthRows = Object.entries(monthMap).sort((a, b) => a[0].localeCompare(b[0])).map(([m, v]) => `
            <tr>
                <td>${m}</td>
                <td style="color:#1DD1A1">+${v.inc.toLocaleString('zh-CN', { minimumFractionDigits:0 })}</td>
                <td style="color:#FF6B6B">-${v.exp.toLocaleString('zh-CN', { minimumFractionDigits:0 })}</td>
                <td style="color:${v.inc - v.exp >= 0 ? '#1DD1A1' : '#FF6B6B'};font-weight:700">${(v.inc - v.exp >= 0 ? '+' : '') + (v.inc - v.exp).toLocaleString('zh-CN', { minimumFractionDigits:0 })}</td>
            </tr>`).join('');

        const accRows = data.acc.map(a =>
            `<tr><td>${a.name}</td><td style="font-weight:700">¥${a.bal.toLocaleString('zh-CN', { minimumFractionDigits:2 })}</td></tr>`
        ).join('');

        const txRows = [...yearTxs].sort((a, b) => new Date(b.date) - new Date(a.date)).map(t => {
            let typeColor = '#FF6B6B', typeTxt = '支出', sign = '-';
            if (t.type === 'income')   { typeColor = '#1DD1A1'; typeTxt = '收入'; sign = '+'; }
            else if (t.type === 'transfer') { typeColor = '#718096'; typeTxt = '转账'; sign = ''; }
            else if (t.type === 'adjust')   { typeColor = '#A0AEC0'; typeTxt = '平账'; sign = ''; }
            return `<tr>
                <td style="color:#718096;font-size:12px">${t.date || ''}</td>
                <td><span style="color:${typeColor};font-weight:700;font-size:12px">${typeTxt}</span></td>
                <td style="font-size:12px">${t.cat2 ? getCatName(data.cats, t.cat2) : '-'}</td>
                <td style="font-size:13px">${t.desc || ''}</td>
                <td style="text-align:right;font-weight:700;color:${typeColor}">${sign}${(t.amount || 0).toLocaleString()}</td>
            </tr>`;
        }).join('');

        const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>${yearStr} 财务封存档案 (只读)</title>
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;500;700&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:"Noto Sans SC",-apple-system,sans-serif;background:#F4F6F8;color:#1A202C;padding:30px;font-size:14px}
.container{max-width:960px;margin:0 auto}
.header{background:linear-gradient(135deg,#5F27CD,#a29bfe);color:#fff;padding:32px;border-radius:16px;margin-bottom:28px;text-align:center}
.header h1{font-size:28px;font-weight:800;margin-bottom:6px}
.kpi-row{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:28px}
.kpi{background:#fff;padding:20px;border-radius:12px;box-shadow:0 1px 3px rgba(0,0,0,.06);text-align:center}
.kpi-label{font-size:12px;color:#718096;margin-bottom:6px}
.kpi-val{font-size:22px;font-weight:800}
.card{background:#fff;border-radius:12px;padding:24px;box-shadow:0 1px 3px rgba(0,0,0,.06);margin-bottom:24px}
.card h2{font-size:15px;font-weight:700;margin-bottom:18px;padding-bottom:10px;border-bottom:1px solid #EDF2F7}
table{width:100%;border-collapse:collapse}
th{text-align:left;padding:10px 12px;font-size:12px;color:#718096;border-bottom:2px solid #EDF2F7;font-weight:700}
td{padding:10px 12px;border-bottom:1px solid #F7F7F7;vertical-align:middle}
tr:hover td{background:#F8FAFC}
.footer{text-align:center;color:#A0AEC0;font-size:12px;margin-top:32px;padding:20px 0;border-top:1px solid #EDF2F7}
@media(max-width:600px){.kpi-row{grid-template-columns:repeat(2,1fr)}}
</style>
</head>
<body>
<div class="container">
<div class="header">
    <h1>📦 ${yearStr} 财务封存档案</h1>
    <p>封存日期：${new Date().toLocaleDateString('zh-CN')} &nbsp;|&nbsp; 共 ${txCount} 笔记录 &nbsp;|&nbsp; 只读存档</p>
</div>
<div class="kpi-row">
    <div class="kpi"><div class="kpi-label">累计收入</div><div class="kpi-val" style="color:#1DD1A1">+${totalInc.toLocaleString('zh-CN', { minimumFractionDigits:0 })}</div></div>
    <div class="kpi"><div class="kpi-label">累计支出</div><div class="kpi-val" style="color:#FF6B6B">-${totalExp.toLocaleString('zh-CN', { minimumFractionDigits:0 })}</div></div>
    <div class="kpi"><div class="kpi-label">累计结余</div><div class="kpi-val" style="color:#5F27CD">${(totalInc - totalExp).toLocaleString('zh-CN', { minimumFractionDigits:0 })}</div></div>
    <div class="kpi"><div class="kpi-label">封存净资产</div><div class="kpi-val">${totalNet.toLocaleString('zh-CN', { minimumFractionDigits:0 })}</div></div>
</div>
<div class="card"><h2>📅 月度概览</h2>
    <table><thead><tr><th>月份</th><th>收入</th><th>支出</th><th>结余</th></tr></thead><tbody>${monthRows}</tbody></table>
</div>
<div class="card"><h2>🏦 账户快照</h2>
    <table><thead><tr><th>账户</th><th>余额</th></tr></thead><tbody>${accRows}</tbody></table>
</div>
<div class="card"><h2>📋 完整流水 (${txCount} 笔)</h2>
    <div style="overflow-x:auto">
    <table><thead><tr><th>日期</th><th>类型</th><th>分类</th><th>说明</th><th style="text-align:right">金额</th></tr></thead><tbody>${txRows}</tbody></table>
    </div>
</div>
<div class="footer">Finance Pro · ${yearStr} 年终封存档案 · 本文件为只读存档</div>
</div></body></html>`;

        const blob = new Blob([html], { type:'text/html' });
        const a    = document.createElement('a');
        a.href     = URL.createObjectURL(blob);
        a.download = `Finance_封存_${yearStr}_${new Date().toISOString().slice(0, 10)}.html`;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        URL.revokeObjectURL(a.href);
        showToast(`📦 ${yearStr} 年封存文件已生成！`);
        onClose();
    };

    return (
        <div className="modal-overlay open" onClick={e => e.target === e.currentTarget && onClose()}>
            <div className="modal" style={{ width:380 }}>
                <h3 style={{ marginTop:0, borderBottom:'1px solid #eee', paddingBottom:12 }}>📦 年终封存</h3>
                <p style={{ fontSize:13, color:'#718096', marginBottom:16 }}>
                    选择要封存的年份，将生成该年全量数据的独立只读 HTML 文件。
                </p>
                <div style={{ display:'grid', gap:6, marginBottom:20 }}>
                    {years.map(y => {
                        const yTxs = data.txs.filter(t => t.date?.startsWith(y));
                        const yExp = yTxs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
                        const yInc = yTxs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
                        const has  = yTxs.length > 0;
                        return (
                            <div key={y} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 16px', border:'1px solid #EDF2F7', borderRadius:10, background: has ? '#fff' : '#F8FAFC' }}>
                                <div>
                                    <span style={{ fontWeight:700, fontSize:15 }}>{y} 年</span>
                                    <span style={{ fontSize:12, color:'#A0AEC0', marginLeft:8 }}>{yTxs.length} 笔</span>
                                </div>
                                <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                                    {has ? (
                                        <>
                                            <span style={{ fontSize:12, color:'#1DD1A1' }}>+{yInc.toLocaleString('zh-CN', { maximumFractionDigits:0 })}</span>
                                            <span style={{ fontSize:12, color:'#FF6B6B' }}>-{yExp.toLocaleString('zh-CN', { maximumFractionDigits:0 })}</span>
                                        </>
                                    ) : <span style={{ fontSize:12, color:'#CBD5E0' }}>暂无数据</span>}
                                    <button className="btn btn-primary" style={{ padding:'6px 14px', fontSize:12 }} onClick={() => handleExport(y)}>导出</button>
                                </div>
                            </div>
                        );
                    })}
                </div>
                <div style={{ textAlign:'right' }}>
                    <button className="btn btn-outline" onClick={onClose}>取消</button>
                </div>
            </div>
        </div>
    );
}
