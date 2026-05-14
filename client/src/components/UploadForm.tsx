import { useState, useRef, DragEvent } from 'react';
import type { MatchResponse } from '../types/api.ts';
import styles from './UploadForm.module.css';

interface Props {
  onResult: (result: MatchResponse) => void;
  onDone: () => void;
}

export default function UploadForm({ onResult, onDone }: Props) {
  const [dragging, setDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f?.type === 'application/pdf') setFile(f);
    else setError('Загрузите PDF файл');
  }

  async function handleSubmit() {
    if (!file) return;
    setLoading(true);
    setError('');

    try {
      const form = new FormData();
      form.append('pdf', file);

      const res = await fetch('/api/match', { method: 'POST', body: form });
      if (!res.ok) throw new Error((await res.json()).error ?? res.statusText);
      const data: MatchResponse = await res.json();
      onResult(data);
      onDone();
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.card}>
      <h2 className={styles.title}>Загрузить WB-баркоды</h2>

      <div
        className={`${styles.dropzone} ${dragging ? styles.active : ''} ${file ? styles.hasFile : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf"
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
            <p className={styles.hint}>{(file.size / 1024).toFixed(0)} KB · нажмите чтобы заменить</p>
          </>
        ) : (
          <>
            <span className={styles.icon}>↑</span>
            <p className={styles.dropText}>Перетащите PDF или нажмите</p>
            <p className={styles.hint}>WB-баркоды, один файл</p>
          </>
        )}
      </div>

      {error && <p className={styles.error}>{error}</p>}

      <button
        className={styles.btn}
        onClick={handleSubmit}
        disabled={!file || loading}
      >
        {loading ? 'Обрабатываем...' : 'Сопоставить'}
      </button>
    </div>
  );
}
