'use client';

import { useState, useRef } from 'react';
import Link from 'next/link';
import { Upload, FileText, Check, AlertCircle, Loader2, Database, Download } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ImportResult {
  imported: number;
  duplicates: number;
  errors: number;
  total: number;
}

export default function ImportPage() {
  const [file, setFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = (f: File) => {
    if (!f.name.endsWith('.csv')) { setError('Please upload a CSV file'); return; }
    setFile(f); setError(null); setResult(null);
  };

  const handleDrop = (e: React.DragEvent) => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]); };
  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setDragOver(true); };
  const handleDragLeave = () => setDragOver(false);

  const handleImport = async () => {
    if (!file) return;
    setImporting(true); setError(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const response = await fetch('/api/import', { method: 'POST', body: formData });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Import failed');
      setResult(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Import failed');
    } finally { setImporting(false); }
  };

  const downloadTemplate = () => {
    const csv = 'business_name,email,phone,website,address,city,country,instagram,rating,reviews\n"Example Med Spa","hello@example.com","+44 7700 900000","https://example.com","123 High Street","London","United Kingdom","https://instagram.com/example","4.5","47"\n';
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'prospex-import-template.csv'; a.click(); URL.revokeObjectURL(url);
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-mono font-bold text-prospex-text flex items-center gap-3"><Upload className="w-6 h-6 text-prospex-cyan" />Import Leads</h1>
        <p className="text-sm text-prospex-dim mt-1">Upload a CSV file to import leads into your database</p>
      </div>

      {/* Template Download */}
      <div className="card p-4 flex items-center justify-between">
        <div>
          <p className="text-sm text-prospex-text font-medium">Need a template?</p>
          <p className="text-xs text-prospex-dim mt-0.5">Download our CSV template with the correct column headers</p>
        </div>
        <button onClick={downloadTemplate} className="btn-ghost text-xs"><Download className="w-3.5 h-3.5" /> Download Template</button>
      </div>

      {/* Drop Zone */}
      <div
        onDrop={handleDrop} onDragOver={handleDragOver} onDragLeave={handleDragLeave}
        onClick={() => inputRef.current?.click()}
        className={cn('card p-12 text-center cursor-pointer border-2 border-dashed transition-all',
          dragOver ? 'border-prospex-cyan bg-prospex-cyan/5' : 'border-prospex-border hover:border-prospex-dim')}>
        <input ref={inputRef} type="file" accept=".csv" onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} className="hidden" />
        {file ? (
          <div>
            <FileText className="w-12 h-12 text-prospex-cyan mx-auto mb-3" />
            <p className="text-sm text-prospex-text font-medium">{file.name}</p>
            <p className="text-xs text-prospex-dim mt-1">{(file.size / 1024).toFixed(1)} KB</p>
            <button onClick={(e) => { e.stopPropagation(); setFile(null); setResult(null); }} className="text-xs text-prospex-red mt-2 hover:underline">Remove</button>
          </div>
        ) : (
          <div>
            <Upload className="w-12 h-12 text-prospex-dim mx-auto mb-3" />
            <p className="text-sm text-prospex-muted">Drop your CSV here or click to browse</p>
            <p className="text-xs text-prospex-dim mt-2">Supports: business_name, email, phone, website, address, city, country</p>
          </div>
        )}
      </div>

      {error && (
        <div className="p-3 bg-prospex-red/10 border border-prospex-red/30 rounded-lg flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-prospex-red shrink-0" /><p className="text-sm text-prospex-red">{error}</p>
        </div>
      )}

      {/* Import Button */}
      {file && !result && (
        <button onClick={handleImport} disabled={importing} className="btn-primary w-full py-3">
          {importing ? <><Loader2 className="w-4 h-4 animate-spin" /> Importing...</> : <><Database className="w-4 h-4" /> Import Leads</>}
        </button>
      )}

      {/* Results */}
      {result && (
        <div className="card p-6 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-prospex-green/20 flex items-center justify-center"><Check className="w-5 h-5 text-prospex-green" /></div>
            <div><p className="text-sm font-semibold text-prospex-text">Import Complete</p><p className="text-xs text-prospex-dim">{result.total} rows processed</p></div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="p-3 bg-prospex-green/10 border border-prospex-green/30 rounded-lg text-center">
              <p className="text-2xl font-mono font-bold text-prospex-green">{result.imported}</p>
              <p className="text-xs text-prospex-dim mt-1">Imported</p>
            </div>
            <div className="p-3 bg-prospex-amber/10 border border-prospex-amber/30 rounded-lg text-center">
              <p className="text-2xl font-mono font-bold text-prospex-amber">{result.duplicates}</p>
              <p className="text-xs text-prospex-dim mt-1">Duplicates</p>
            </div>
            <div className="p-3 bg-prospex-red/10 border border-prospex-red/30 rounded-lg text-center">
              <p className="text-2xl font-mono font-bold text-prospex-red">{result.errors}</p>
              <p className="text-xs text-prospex-dim mt-1">Errors</p>
            </div>
          </div>
          <div className="flex gap-3">
            <Link href="/leads" className="btn-primary flex-1 justify-center"><Database className="w-4 h-4" /> View Leads</Link>
            <button onClick={() => { setFile(null); setResult(null); }} className="btn-ghost flex-1">Import More</button>
          </div>
        </div>
      )}

      {/* Column Mapping Info */}
      <div className="card p-6">
        <h2 className="font-mono font-semibold text-prospex-text text-sm mb-3">Supported Column Names</h2>
        <div className="grid grid-cols-2 gap-2 text-xs">
          {[
            { field: 'Business Name', aliases: 'business_name, company, name' },
            { field: 'Email', aliases: 'email, email address, e-mail' },
            { field: 'Phone', aliases: 'phone, telephone, mobile' },
            { field: 'Website', aliases: 'website, url, domain' },
            { field: 'Address', aliases: 'address, full address, street' },
            { field: 'City', aliases: 'city, town, area' },
            { field: 'Country', aliases: 'country, nation' },
            { field: 'Instagram', aliases: 'instagram, ig, instagram_url' },
            { field: 'Rating', aliases: 'rating, google_rating, stars' },
            { field: 'Reviews', aliases: 'reviews, review_count' },
          ].map(item => (
            <div key={item.field} className="p-2 bg-prospex-bg rounded">
              <p className="font-mono text-prospex-text font-medium">{item.field}</p>
              <p className="text-prospex-dim mt-0.5">{item.aliases}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
