import type { StatsResponse } from '../types/api.ts';
import styles from './StatsPanel.module.css';

interface Props {
  stats: StatsResponse;
  onReset: () => void;
}

export default function StatsPanel({ stats, onReset }: Props) {
  const pct = stats.totalCodes > 0
    ? Math.round((stats.usedCodes / stats.totalCodes) * 100)
    : 0;

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <h2>База честных знаков</h2>
        <button className={styles.resetBtn} onClick={onReset}>Сбросить использованные</button>
      </div>

      <div className={styles.counters}>
        <Stat label="Всего кодов" value={stats.totalCodes} />
        <Stat label="Использовано" value={stats.usedCodes} accent="red" />
        <Stat label="Доступно" value={stats.availableCodes} accent="green" />
        <Stat label="Файлов в базе" value={stats.totalFiles} />
      </div>

      <div className={styles.bar}>
        <div className={styles.fill} style={{ width: `${pct}%` }} />
      </div>
      <p className={styles.barLabel}>{pct}% использовано</p>

      {Object.keys(stats.byProduct).length > 0 && (
        <table className={styles.table}>
          <thead>
            <tr><th>Тип</th><th>Всего</th><th>Использовано</th><th>Остаток</th></tr>
          </thead>
          <tbody>
            {Object.entries(stats.byProduct).map(([type, s]) => (
              <tr key={type}>
                <td>{type}</td>
                <td>{s.total}</td>
                <td>{s.used}</td>
                <td>{s.total - s.used}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: 'red' | 'green' }) {
  return (
    <div className={styles.stat}>
      <span className={`${styles.statValue} ${accent ? styles[accent] : ''}`}>
        {value.toLocaleString('ru')}
      </span>
      <span className={styles.statLabel}>{label}</span>
    </div>
  );
}
