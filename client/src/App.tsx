import { useState } from 'react';
import UploadForm from './components/UploadForm.tsx';
import ResultCard from './components/ResultCard.tsx';
import StatsPanel from './components/StatsPanel.tsx';
import ImportPanel from './components/ImportPanel.tsx';
import { useStats } from './hooks/useStats.ts';
import type { MatchResponse } from './types/api.ts';
import styles from './App.module.css';

export default function App() {
  const { stats, loading: statsLoading, refetch } = useStats();
  const [result, setResult] = useState<MatchResponse | null>(null);

  async function handleReset() {
    await fetch('/api/stats/reset', { method: 'POST' });
    refetch();
  }

  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <h1>WB × ЧЗ Matcher</h1>
        <p>Сопоставление WB-баркодов с Честным знаком</p>
      </header>

      <main className={styles.main}>
        <div className={styles.left}>
          {result ? (
            <ResultCard result={result} onReset={() => { setResult(null); refetch(); }} />
          ) : (
            <UploadForm onResult={setResult} onDone={refetch} />
          )}
          <ImportPanel onImported={refetch} />
        </div>

        <div className={styles.right}>
          {statsLoading ? (
            <div className={styles.loading}>Загрузка...</div>
          ) : stats ? (
            <StatsPanel stats={stats} onReset={handleReset} />
          ) : (
            <div className={styles.empty}>База пуста — импортируйте ЧЗ-файлы</div>
          )}
        </div>
      </main>
    </div>
  );
}
