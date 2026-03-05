// ============================================================
// Finance Pro — ReceiptModal 月度小票打印机
// 依赖 window.html2canvas（CDN 引入）
// ============================================================

import { useRef, useEffect } from 'react';
import { useFinance } from '../index';
import { getCatName } from '../utils/catMap';

export default function ReceiptModal({ open, onClose }) {
    const { data, showToast } = useFinance();
    const paperRef = useRef(null);

    if (!open) return null;

    const curM = new Date().toISOString().slice(0, 7);
    let totalInc = 0, totalExp = 0;
    const expMap = {}, fixedExp = [];

    data.txs.forEach(t => {
        if (!t.date?.startsWith(curM)) return;
        if (t.type === 'income') totalInc += t.amount;
        else if (t.type === 'expense') {
            totalExp += t.amount;
            expMap[t.cat2] = (expMap[t.cat2] || 0) + t.amount;
            if ((t.desc || '').includes('[订阅]'))
                fixedExp.push({ n: t.desc.replace('[订阅]', '').trim(), v: t.amount });
        }
    });
    const top3 = Object.entries(expMap).sort((a, b) => b[1] - a[1]).slice(0, 3);

    const handleDownload = () => {
        const el = paperRef.current;
        if (!el || !window.html2canvas) { showToast('html2canvas 未加载', 'error'); return; }
        showToast('正在打印...');

        const clone = el.cloneNode(true);
        clone.style.cssText = 'position:fixed;top:-10000px;left:0;z-index:-1;height:auto;max-height:none;overflow:visible;transform:none;animation:none;border-radius:0;';
        const btn = clone.querySelector('.receipt-btn');
        if (btn) btn.remove();
        document.body.appendChild(clone);

        window.html2canvas(clone, {
            backgroundColor: '#ffffff', scale: 4, logging: false,
            useCORS: true, scrollY: 0,
            windowHeight: document.documentElement.scrollHeight,
        }).then(canvas => {
            document.body.removeChild(clone);
            canvas.toBlob(blob => {
                const url = URL.createObjectURL(blob);
                const a   = document.createElement('a');
                a.href = url; a.download = `财务小票_${curM}.png`;
                document.body.appendChild(a); a.click(); document.body.removeChild(a);
                URL.revokeObjectURL(url);
                showToast('✅ 小票已保存');
                setTimeout(onClose, 1000);
            }, 'image/png');
        }).catch(err => {
            if (clone.parentNode) document.body.removeChild(clone);
            console.error(err);
            showToast('打印失败，请重试', 'error');
        });
    };

    return (
        <div className="receipt-overlay open" onClick={e => e.target === e.currentTarget && onClose()}>
            <div className="receipt-paper" ref={paperRef}>
                <div className="receipt-header">
                    <div className="receipt-title">FINANCE PRO</div>
                    <div className="receipt-date">结单日期: {new Date().toLocaleDateString()}</div>
                    <div className="receipt-date">账单周期: {curM}</div>
                </div>

                <div className="receipt-section">
                    <span className="receipt-sec-title">本月概况 (OVERVIEW)</span>
                    <div className="receipt-row"><span>总收入</span><span>+{totalInc.toLocaleString()}</span></div>
                    <div className="receipt-row"><span>总支出</span><span>-{totalExp.toLocaleString()}</span></div>
                    <div className="receipt-row" style={{ fontWeight:'bold', marginTop:5 }}>
                        <span>结余</span><span>{(totalInc - totalExp).toLocaleString()}</span>
                    </div>
                </div>

                <div className="receipt-section">
                    <span className="receipt-sec-title">固定支出 (FIXED)</span>
                    {fixedExp.length
                        ? fixedExp.map((item, i) => (
                            <div key={i} className="receipt-row">
                                <span>{item.n}</span><span>-{item.v}</span>
                            </div>
                        ))
                        : <div style={{ fontSize:12, color:'#999' }}>- 无订阅记录 -</div>
                    }
                </div>

                <div className="receipt-section">
                    <span className="receipt-sec-title">消费榜单 (TOP 3)</span>
                    {top3.map(([catId, val], idx) => (
                        <div key={catId} className="receipt-row">
                            <span>#{idx + 1} {getCatName(data.cats, catId)}</span>
                            <span>-{val.toLocaleString()}</span>
                        </div>
                    ))}
                </div>

                <div className="receipt-section">
                    <span className="receipt-sec-title">资产快照 (ASSETS)</span>
                    {data.acc.map(a => (
                        <div key={a.id} className="receipt-row">
                            <span>{a.name}</span><span>{a.bal.toLocaleString()}</span>
                        </div>
                    ))}
                </div>

                <div className="receipt-footer">
                    *********** END ***********<br />
                    生活是自己的，请继续保持热爱
                    <button className="receipt-btn" onClick={handleDownload}>💾 收下小票</button>
                </div>
            </div>
        </div>
    );
}
