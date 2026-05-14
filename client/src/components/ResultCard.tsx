import type { MatchResponse } from '../types/api.ts';
import styles from './ResultCard.module.css';

interface Props {
  result: MatchResponse;
  onReset: () => void;
}

export default function ResultCard({ result, onReset }: Props) {
  const pct = result.total > 0 ? Math.round((result.matched / result.total) * 100) : 0;

  return (
    <div className={styles.card}>
      <div className={styles.header}>
        <h2>Результат</h2>
        <button className={styles.backBtn} onClick={onReset}>← Новый файл</button>
      </div>

      <div className={styles.counters}>
        <Counter label="Всего страниц" value={result.total} />
        <Counter label="Сопоставлено" value={result.matched} accent="green" />
        <Counter label="Нет ЧЗ" value={result.notFound} accent={result.notFound > 0 ? 'red' : undefined} />
      </div>

      <div className={styles.bar}>
        <div className={styles.fill} style={{ width: `${pct}%` }} />
      </div>
      <p className={styles.barLabel}>{pct}% найдено</p>

      <a className={styles.downloadBtn} href={result.downloadUrl} download>
        Скачать PDF
      </a>
    </div>
  );
}

function Counter({ label, value, accent }: { label: string; value: number; accent?: 'red' | 'green' }) {
  return (
    <div className={styles.counter}>
      <span className={`${styles.value} ${accent ? styles[accent] : ''}`}>{value}</span>
      <span className={styles.label}>{label}</span>
    </div>
  );
}
