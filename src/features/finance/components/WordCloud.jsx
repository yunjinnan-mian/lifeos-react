// ============================================================
// Finance Pro — WordCloud 消费关键词词云
// ============================================================

const TAG_PALETTE = [
    { bg:'#FFF3D8', text:'#8B5A1A', border:'#D4A017' },
    { bg:'#E8F5E9', text:'#2E7D32', border:'#66BB6A' },
    { bg:'#FBE9E7', text:'#BF360C', border:'#FF7043' },
    { bg:'#E3F2FD', text:'#1565C0', border:'#42A5F5' },
    { bg:'#F3E5F5', text:'#6A1B9A', border:'#AB47BC' },
    { bg:'#E0F2F1', text:'#00695C', border:'#26A69A' },
    { bg:'#FFF8E1', text:'#E65100', border:'#FFA726' },
    { bg:'#FCE4EC', text:'#880E4F', border:'#F06292' },
];

export default function WordCloud({ data, activeYear }) {
    // 统计词频（当年支出 desc 分词）
    const words = {};
    const year = activeYear || new Date().getFullYear().toString();
    data.txs.forEach(t => {
        if (t.type === 'expense' && t.date?.startsWith(year)) {
            (t.desc || '').split(/[\s,，]+/).forEach(w => {
                if (w.length > 1) words[w] = (words[w] || 0) + 1;
            });
        }
    });

    const sorted = Object.entries(words).sort((a, b) => b[1] - a[1]).slice(0, 18);

    if (sorted.length === 0) {
        return (
            <div className="word-cloud-container">
                <div style={{ color:'#B8A88A', fontFamily:'var(--font-pixel)', fontSize:11 }}>暂无消费数据</div>
            </div>
        );
    }

    return (
        <div className="word-cloud-container">
            {sorted.map(([word, count], i) => {
                const p    = TAG_PALETTE[i % TAG_PALETTE.length];
                const size = Math.min(11 + count * 1.5, 19);
                return (
                    <span
                        key={word}
                        className="word-tag"
                        style={{ background: p.bg, color: p.text, borderColor: p.border, fontSize: size }}
                    >
                        {word}
                    </span>
                );
            })}
        </div>
    );
}
