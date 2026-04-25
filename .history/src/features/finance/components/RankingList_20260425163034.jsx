// ============================================================
// Finance Pro — RankingList 消费排行榜
// ============================================================

import { memo } from 'react';
import { getCatName, getColorMap } from '../utils/catMap';

function RankingList({ data, activeMonth, onJumpToCategory }) {
    // 统计当月各 cat2 支出
    const catMap = {};
    let totalExp = 0;
    data.txs.forEach(t => {
        if (t.date?.startsWith(activeMonth) && t.type === 'expense') {
            catMap[t.cat2] = (catMap[t.cat2] || 0) + t.amount;
            totalExp += t.amount;
        }
    });

    const sorted = Object.entries(catMap).sort((a, b) => b[1] - a[1]).slice(0, 8);
    const colorMap = getColorMap(data.cats);

    if (sorted.length === 0) {
        return (
            <div style={{ color:'#aaa', textAlign:'center', padding:30 }}>暂无消费数据</div>
        );
    }

    return (
        <div id="category-ranking-list">
            {sorted.map(([catId, val], idx) => {
                const displayName = getCatName(data.cats, catId);
                const pct = totalExp > 0 ? (val / totalExp * 100).toFixed(1) : 0;
                const cat1 = data.txs.find(t => t.cat2 === catId)?.cat1;
                const color = colorMap[cat1] || '#CBD5E0';

                return (
                    <div
                        key={catId}
                        className="rank-item"
                        style={{ display:'flex', alignItems:'flex-start', marginBottom:15, cursor:'pointer' }}
                        onClick={() => onJumpToCategory?.(catId)}
                    >
                        <div className="rank-idx">{idx + 1}</div>
                        <div style={{ flex:1, minWidth:0 }}>
                            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:5 }}>
                                <span style={{ fontWeight:600, fontSize:13, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                                    {displayName}
                                </span>
                                <span style={{ fontWeight:700, color, fontSize:13, marginLeft:8, whiteSpace:'nowrap' }}>
                                    ¥{val.toFixed(0)}
                                </span>
                            </div>
                            <div style={{ height:4, background:'#EDF2F7', borderRadius:2, overflow:'hidden' }}>
                                <div style={{ width:`${pct}%`, height:'100%', background:color, borderRadius:2 }} />
                            </div>
                            <div style={{ fontSize:11, color:'#A0AEC0', marginTop:3 }}>{pct}%</div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

export default memo(RankingList);
