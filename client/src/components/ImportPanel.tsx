import { useState, useRef, DragEvent } from 'react';
import type { ImportResponse } from '../types/api.ts';
import styles from './ImportPanel.module.css';

interface Props {
  onImported: () => void;
}

export default function ImportPanel({ onImported }: Props) {
  const [tab, setTab] = useState<'zip' | 'dir'>('zip');
  const [dir, setDir] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ImportResponse | null>(null);
  const [error, setError] = useState('');
  const [uploadStatus, setUploadStatus] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f?.name.endsWith('.zip')) { setFile(f); setError(''); }
    else setError('Загрузите ZIP архив');
  }

  const CHUNK_SIZE = 5 * 1024 * 1024; // 5 MB

  async function handleSubmit() {
    setLoading(true);
    setError('');
    setResult(null);
    setUploadStatus('');

    try {
      if (tab === 'zip') {
        if (!file) return;
        const jobId = crypto.randomUUID();
        const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
        const totalMB = (file.size / 1024 / 1024).toFixed(1);

        for (let i = 0; i < totalChunks; i++) {
          const start = i * CHUNK_SIZE;
          const chunk = file.slice(start, start + CHUNK_SIZE);
          const uploadedMB = Math.min(((i + 1) * CHUNK_SIZE) / 1024 / 1024, file.size / 1024 / 1024).toFixed(1);
          setUploadStatus(`Загрузка: ${uploadedMB} / ${totalMB} MB`);

          const form = new FormData();
          form.append('chunk', chunk);
          form.append('jobId', jobId);
          form.append('chunkIndex', String(i));
          form.append('totalChunks', String(totalChunks));

          let res: Response | null = null;
          for (let attempt = 0; attempt < 3; attempt++) {
            try {
              res = await fetch('/api/import/zip/chunk', { method: 'POST', body: form });
              if (res.ok) break;
            } catch {
              if (attempt === 2) throw new Error(`Chunk ${i + 1}/${totalChunks} failed after 3 attempts`);
              await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
            }
          }
          if (!res?.ok) throw new Error((await res!.json()).error ?? res!.statusText);
        }

        setUploadStatus('Обработка...');
        while (true) {
          await new Promise((r) => setTimeout(r, 2000));
          const poll = await fetch(`/api/import/zip/status/${jobId}`);
          const job = await poll.json();
          if (job.status === 'done') { setResult({ imported: job.imported, skipped: job.skipped }); onImported(); break; }
          if (job.status === 'error') throw new Error(job.error);
        }
      } else {
        const res = await fetch('/api/import/dir', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dir: dir.trim() }),
        });
        if (!res.ok) throw new Error((await res.json()).error ?? res.statusText);
        const data: ImportResponse = await res.json();
        setResult(data);
        onImported();
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
      setUploadStatus('');
    }
  }

  const canSubmit = tab === 'zip' ? !!file : !!dir.trim();

  return (
    <div className={styles.panel}>
      <h2 className={styles.title}>Загрузить базу ЧЗ</h2>

      <div className={styles.tabs}>
        <button className={`${styles.tab} ${tab === 'zip' ? styles.active : ''}`} onClick={() => setTab('zip')}>
          ZIP архив
        </button>
        <button className={`${styles.tab} ${tab === 'dir' ? styles.active : ''}`} onClick={() => setTab('dir')}>
          Путь к папке
        </button>
      </div>

      {tab === 'zip' ? (
        <div
          className={`${styles.dropzone} ${dragging ? styles.dragging : ''} ${file ? styles.hasFile : ''}`}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".zip"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) { setFile(f); setError(''); }
            }}
          />
          {file ? (
            <>
              <span className={styles.icon}>✓</span>
              <p className={styles.filename}>{file.name}</p>
              <p className={styles.hint}>{(file.size / 1024 / 1024).toFixed(1)} MB · нажмите чтобы заменить</p>
            </>
          ) : (
            <>
              <span className={styles.icon}>↑</span>
              <p className={styles.dropText}>Перетащите ZIP или нажмите</p>
              <p className={styles.hint}>Архив папки wb_orders</p>
            </>
          )}
        </div>
      ) : (
        <>
          <p className={styles.hint}>Абсолютный путь к папке с PDF-файлами</p>
          <input
            className={styles.input}
            type="text"
            placeholder="/path/to/wb_orders"
            value={dir}
            onChange={(e) => setDir(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && canSubmit && handleSubmit()}
          />
        </>
      )}

      {error && <p className={styles.error}>{error}</p>}
      {result && (
        <p className={styles.success}>
          Импортировано: {result.imported}, пропущено: {result.skipped}
        </p>
      )}

      <button
        className={styles.btn}
        onClick={handleSubmit}
        disabled={!canSubmit || loading}
      >
        {uploadStatus || (loading ? 'Импортируем...' : 'Импортировать')}
      </button>
    </div>
  );
}
