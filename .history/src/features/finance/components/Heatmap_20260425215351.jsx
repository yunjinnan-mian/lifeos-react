// ============================================================
// Finance Pro — Heatmap 年度行迹热力图
// 保留原版 DOM 拼接逻辑，用 useEffect 在 ref 容器中挂载
// ============================================================

import { useRef, useEffect, useState, useCallback, memo } from 'react';
import { createPortal } from 'react-dom';

function Heatmap({ data, activeYear }) {
    const containerRef = useRef(null);
    const [tooltip, setTooltip] = useState({ visible: false, html: '', x: 0, y: 0 });

    const buildHeatmap = useCallback(() => {
        const container = containerRef.current;
        if (!container) return;

        const year = parseInt(activeYear) || new Date().getFullYear();
        const startDate = new Date(year, 0, 1);
        const endDate   = new Date(year, 11, 31);

        // ── 汇总每日数据 ──────────────────────────────────
        const dailyData = {};
        for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
            const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
            dailyData[key] = { income:0, expense:0, count:0, txs:[] };
        }
        data.txs.forEach(t => {
            let stdDate = String(t.date).trim().replace(/\//g, '-');
            const parts = stdDate.split('-');
            if (parts.length === 3) stdDate = `${parts[0]}-${parts[1].padStart(2,'0')}-${parts[2].padStart(2,'0')}`;
            if (!stdDate.startsWith(year.toString()) || !dailyData[stdDate]) return;
            let effectiveType = t.type;
            if (effectiveType === 'merged') effectiveType = t.amount >= 0 ? 'income' : 'expense';
            if (t.cat2 && t.cat2.includes('平账')) return;
            if (effectiveType === 'income')  dailyData[stdDate].income  += Math.abs(t.amount);
            else if (effectiveType === 'expense') dailyData[stdDate].expense += Math.abs(t.amount);
            dailyData[stdDate].count++;
            dailyData[stdDate].txs.push({ desc: t.desc, amount: t.amount, type: effectiveType });
        });

        let maxIncome = 1, maxExpense = 1;
        Object.values(dailyData).forEach(d => {
            if (d.income  > maxIncome)  maxIncome  = d.income;
            if (d.expense > maxExpense) maxExpense = d.expense;
        });

        // ── 按周分组 ──────────────────────────────────────
        const weeks = []; let currentWeek = [];
        for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
            const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
            const dayData = dailyData[key];
            const rawDay  = d.getDay();
            const weekday = rawDay === 0 ? 6 : rawDay - 1; // 周一=0，周日=6
            const inc = dayData.income, exp = dayData.expense;
            let cls = 'heatmap-cell ';
            if (inc === 0 && exp === 0) cls += 'empty';
            else if (inc > 0 && exp > 0) cls += 'mixed';
            else if (inc > 0) cls += inc > maxIncome * 0.5 ? 'income-high' : 'income';
            else cls += exp > maxExpense * 0.5 ? 'expense-high' : 'expense';
            currentWeek.push({ date: key, weekday, cls, data: dayData });
            if (weekday === 6 || (d.getMonth() === 11 && d.getDate() === 31)) {
                while (currentWeek.length < 7) currentWeek.push(null);
                weeks.push(currentWeek);
                currentWeek = [];
            }
        }

        // ── 月份标签定位 ──────────────────────────────────
        const colWidth = 17, leftOffset = 36;
        const monthRanges = {};
        weeks.forEach((week, index) => {
            const validDay = week.find(d => d?.date);
            if (validDay) {
                const mIndex = parseInt(validDay.date.split('-')[1]) - 1;
                if (!monthRanges[mIndex]) monthRanges[mIndex] = { start: index, end: index };
                else monthRanges[mIndex].end = index;
            }
        });

        // ── 构建 DOM ──────────────────────────────────────
        let html = '<div class="heatmap-months">';
        const monthNames = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];
        Object.keys(monthRanges).forEach(key => {
            const m = parseInt(key), range = monthRanges[m];
            const centerPos = ((range.start + range.end) / 2 * colWidth) + leftOffset;
            html += `<div class="heatmap-month" style="left:${centerPos}px">${monthNames[m]}</div>`;
            if (m > 0) {
                const linePos = (range.start * colWidth) + leftOffset - (colWidth / 2);
                html += `<div class="heatmap-divider" style="left:${linePos}px"></div>`;
            }
        });
        html += '</div>';

        const weekdayLabels = ['一','二','三','四','五','六','日'];
        for (let w = 0; w < 7; w++) {
            html += `<div class="heatmap-row"><div class="heatmap-weekday">${weekdayLabels[w]}</div><div class="heatmap-days">`;
            weeks.forEach(week => {
                const day = week.find(d => d?.weekday === w);
                if (day) {
                    const top3 = (day.data.txs || []).sort((a, b) => b.amount - a.amount).slice(0, 3);
                    html += `<div class="${day.cls}"
                        data-date="${day.date}"
                        data-income="${day.data.income.toFixed(2)}"
                        data-expense="${day.data.expense.toFixed(2)}"
                        data-count="${day.data.count}"
                        data-details="${encodeURIComponent(JSON.stringify(top3))}"
                    ></div>`;
                } else {
                    html += `<div class="heatmap-cell empty" style="visibility:hidden"></div>`;
                }
            });
            html += '</div></div>';
        }
        container.innerHTML = html;

        // ── 绑定 tooltip 事件 ─────────────────────────────
        container.querySelectorAll('.heatmap-cell[data-date]').forEach(cell => {
            cell.addEventListener('mouseenter', (e) => {
                const date    = cell.dataset.date;
                const income  = parseFloat(cell.dataset.income);
                const expense = parseFloat(cell.dataset.expense);
                const count   = parseInt(cell.dataset.count);
                let details   = [];
                try { if (cell.dataset.details) details = JSON.parse(decodeURIComponent(cell.dataset.details)); } catch {}

                let content = `<div style="font-weight:800;margin-bottom:6px;border-bottom:1px solid rgba(255,255,255,0.2);padding-bottom:4px;">${date}</div>`;
                if (count === 0) {
                    content += '<div style="color:#A0AEC0;font-size:11px;">无交易记录</div>';
                } else {
                    if (income  > 0) content += `<div style="color:#68D391;font-weight:600;font-size:12px;margin-bottom:2px;">收入: +¥${income.toLocaleString()}</div>`;
                    if (expense > 0) content += `<div style="color:#F56565;font-weight:600;font-size:12px;margin-bottom:2px;">支出: -¥${expense.toLocaleString()}</div>`;
                    content += '<div style="height:1px;background:rgba(255,255,255,0.1);margin:6px 0;"></div><div style="display:flex;flex-direction:column;gap:4px;">';
                    details.forEach(t => {
                        const color = t.type === 'income' ? '#68D391' : '#F56565';
                        const sign  = t.type === 'income' ? '+' : '-';
                        const desc  = (t.desc || '').length > 5 ? (t.desc || '').substring(0,5)+'..' : (t.desc || '');
                        content += `<div style="display:flex;justify-content:space-between;font-size:11px;align-items:center;"><span style="color:#E2E8F0;margin-right:10px;">${desc}</span><span style="color:${color};font-family:monospace;">${sign}${t.amount.toLocaleString()}</span></div>`;
                    });
                    content += '</div>';
                    if (count > 3) content += `<div style="text-align:center;color:#718096;font-size:10px;margin-top:6px;border-top:1px dashed rgba(255,255,255,0.1);padding-top:2px;">... 还有 ${count-3} 笔 ...</div>`;
                }

                const rect = cell.getBoundingClientRect();
                let left = rect.left + window.scrollX + 20;
                let top  = rect.top  + window.scrollY - 10;
                if (left + 170 > window.innerWidth) left = rect.left + window.scrollX - 175;

                setTooltip({ visible: true, html: content, x: left, y: top });
            });
            cell.addEventListener('mouseleave', () => setTooltip(t => ({ ...t, visible: false })));
        });
    }, [data, activeYear]);

    useEffect(() => { buildHeatmap(); }, [buildHeatmap]);

    return (
        <>
            <div ref={containerRef} className="heatmap-container" />
            {tooltip.visible && createPortal(
                <div
                    className="heatmap-tooltip"
                    style={{ left: tooltip.x, top: tooltip.y, display: 'block', position: 'fixed' }}
                    dangerouslySetInnerHTML={{ __html: tooltip.html }}
                />,
                document.body
            )}
        </>
    );
}

export default memo(Heatmap);
