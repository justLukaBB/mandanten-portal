import React, { useEffect, useMemo, useRef, useState } from 'react';
import { DatabaseIcon, UploadIcon, PlusIcon, PencilIcon, TrashIcon, DownloadIcon, Loader2 } from 'lucide-react';
import api from '../../config/api';
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline';

interface Creditor {
  _id: string;
  creditor_name: string;
  address: string;
  email: string;
  phone?: string;
  alternative_names?: string[];
  category?: string;
  notes?: string;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

interface Paginated<T> {
  success: boolean;
  items: T[];
  pagination: { page: number; limit: number; total: number; pages: number };
}

const PAGE_LIMIT = 25;

function useDebounce<T>(value: T, delay = 400) {
  const [debounced, setDebounced] = React.useState(value);

  React.useEffect(() => {
    const handler = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);

  return debounced;
}

const CreditorDatabase: React.FC = () => {
  const [items, setItems] = useState<Creditor[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState<string>('');
  const [page, setPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [editing, setEditing] = useState<Creditor | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const debouncedSearch = useDebounce(search, 400);
  const [importLoading, setImportLoading] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);


  useEffect(() => {
    fetchList({ page: 1, search: debouncedSearch });
  }, [debouncedSearch]);

  const fetchList = async (opts?: { page?: number; search?: string }) => {
    const p = opts?.page ?? page;
    const s = opts?.search ?? search;
    try {
      setLoading(true);
      setError(null);
      const res = await api.get<Paginated<Creditor>>('/api/admin/creditor-database', {
        params: { page: p, limit: PAGE_LIMIT, search: s }
      });
      if (res.data?.success) {
        setItems(res.data.items);
        setPage(res.data.pagination.page);
        setTotalPages(res.data.pagination.pages);
      } else {
        setItems([]);
      }
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Fehler beim Laden der Daten');
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchList({ page: 1 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSearch = async () => {
    await fetchList({ page: 1, search });
  };

  const handleResetSearch = async () => {
    setSearch('');
    await fetchList({ page: 1, search: '' });
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setImportLoading(true);
      setError(null);
      const form = new FormData();
      form.append('file', file);
      const res = await api.post('/api/admin/creditor-database/import', form, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      // Simple feedback
      const imported = res.data?.imported_count ?? 0;
      const skipped = res.data?.skipped_count ?? 0;
      const errs = (res.data?.errors?.length || 0);
      alert(`Import abgeschlossen: ${imported} importiert, ${skipped} übersprungen, ${errs} Fehler.`);
      await fetchList({ page: 1 });
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Import fehlgeschlagen');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
      setImportLoading(false);
    }
  };

  const handleExport = async () => {
    try {
      setExportLoading(true);
      const res = await api.get('/api/admin/creditor-database/export', { responseType: 'blob' });
      const blob = new Blob([res.data], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `creditor_database_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert('Export fehlgeschlagen');
    } finally {
      setExportLoading(false);
    }
  };

  const handleEdit = (item: Creditor) => setEditing(item);

  const handleDelete = async (item: Creditor) => {
    if (!window.confirm(`"${item.creditor_name}" löschen?`)) return;
    try {
      await api.delete(`/api/admin/creditor-database/${item._id}`);
      await fetchList({ page });
    } catch (e: any) {
      alert(e?.response?.data?.error || 'Löschen fehlgeschlagen');
    }
  };

  const handleSave = async () => {
    if (!editing) return;
    try {
      const payload = { ...editing } as any;
      delete payload._id;
      const res = await api.put(`/api/admin/creditor-database/${editing._id}`, payload);
      if (res.data?.success) {
        setEditing(null);
        await fetchList({ page });
      }
    } catch (e: any) {
      alert(e?.response?.data?.error || 'Speichern fehlgeschlagen');
    }
  };

  const handleAdd = () => {
    setEditing({
      _id: '',
      creditor_name: '',
      address: '',
      email: '',
      phone: '',
      alternative_names: [],
      category: '',
      notes: '',
      is_active: true,
    } as Creditor);
  };

  const handleCreate = async () => {
    if (!editing) return;
    try {
      const payload = { ...editing } as any;
      delete payload._id;
      const res = await api.post('/api/admin/creditor-database', payload);
      if (res.data?.success) {
        setEditing(null);
        await fetchList({ page: 1 });
      }
    } catch (e: any) {
      alert(e?.response?.data?.error || 'Anlegen fehlgeschlagen');
    }
  };

  const disabled = loading;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Gläubiger-Datenbank</h1>
          <p className="text-gray-600 mt-1">Verwalten, importieren und exportieren Sie bekannte Gläubiger</p>
          {error && (
            <div className="mt-2 text-sm text-red-600 bg-red-50 px-3 py-1 rounded">{error}</div>
          )}
        </div>
        <div className="flex items-center space-x-3">
          <button onClick={handleExport} className="inline-flex items-center px-3 py-2 border rounded-md text-sm bg-white hover:bg-gray-50">
            {exportLoading ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <DownloadIcon className="w-4 h-4 mr-2" />
            )}
            Export

          </button>
          <button onClick={handleImportClick} className="inline-flex items-center px-3 py-2 border rounded-md text-sm bg-white hover:bg-gray-50">
            {importLoading ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <UploadIcon className="w-4 h-4 mr-2" />
            )}
            Import
          </button>
          <input ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={handleFileChange} />
          <button
            onClick={handleAdd}
            className="inline-flex items-center px-3 py-2 rounded-md text-sm text-white"
            style={{ backgroundColor: '#9f1a1d' }}
          >
            <PlusIcon className="w-4 h-4 mr-2" /> Neu hinzufügen
          </button>

        </div>
      </div>

      <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
        <div className="flex items-end space-x-2">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">Suche</label>
            <div className="flex">
              {/* <input value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSearch()} className="flex-1 border border-gray-300 rounded-l-md px-3 py-2 text-sm" placeholder="Name, E-Mail, Adresse..." /> */}
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="flex-1 border border-gray-300 rounded-l-md px-3 py-2 text-sm"
                placeholder="Name, E-Mail, Adresse..."
              />

              <button onClick={handleSearch} className="px-3 py-2 border border-l-0 rounded-r-md text-sm bg-white hover:bg-gray-50">
                <MagnifyingGlassIcon className="w-4 h-4" />
              </button>
            </div>
          </div>
          <button onClick={handleResetSearch} className="px-3 py-2 border rounded-md text-sm bg-white hover:bg-gray-50">Reset</button>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="px-6 py-3 border-b">
          <h3 className="text-lg font-semibold text-gray-900">Einträge</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Adresse</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">E-Mail</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Kategorie</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Aktionen</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {items.map((c) => (
                <tr key={c._id}>
                  <td className="px-6 py-3">
                    <div className="text-sm font-medium text-gray-900">{c.creditor_name}</div>
                    {c.alternative_names?.length ? (
                      <div className="text-xs text-gray-500">Alt: {c.alternative_names.join(', ')}</div>
                    ) : null}
                  </td>
                  <td className="px-6 py-3 text-sm text-gray-700 max-w-xs truncate">{c.address}</td>
                  <td className="px-6 py-3 text-sm text-gray-700">{c.email}</td>
                  <td className="px-6 py-3 text-sm text-gray-700">{c.category || '-'}</td>
                  <td className="px-6 py-3 whitespace-nowrap text-sm">
                    <button onClick={() => handleEdit(c)} className="text-gray-700 hover:text-gray-900 mr-3"><PencilIcon className="w-4 h-4 inline" /> Bearbeiten</button>
                    <button onClick={() => handleDelete(c)} className="text-red-700 hover:text-red-900"><TrashIcon className="w-4 h-4 inline" /> Löschen</button>
                  </td>
                </tr>
              ))}
              {!loading && items.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-gray-500">Keine Einträge gefunden</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="px-6 py-3 border-t flex items-center justify-between text-sm text-gray-700">
          <span>Seite {page} / {totalPages}</span>
          <div className="space-x-2">
            <button disabled={page <= 1} onClick={() => fetchList({ page: page - 1 })} className="px-2 py-1 border rounded disabled:opacity-50">Zurück</button>
            <button disabled={page >= totalPages} onClick={() => fetchList({ page: page + 1 })} className="px-2 py-1 border rounded disabled:opacity-50">Weiter</button>
          </div>
        </div>
      </div>

      {editing && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-lg w-full max-w-2xl p-6">
            <h3 className="text-lg font-semibold mb-4">{editing._id ? 'Eintrag bearbeiten' : 'Neuen Eintrag anlegen'}</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                <input value={editing.creditor_name} onChange={(e) => setEditing({ ...editing, creditor_name: e.target.value })} className="w-full border border-gray-300 rounded px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">E-Mail</label>
                <input value={editing.email} onChange={(e) => setEditing({ ...editing, email: e.target.value })} className="w-full border border-gray-300 rounded px-3 py-2 text-sm" />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Adresse</label>
                <input value={editing.address} onChange={(e) => setEditing({ ...editing, address: e.target.value })} className="w-full border border-gray-300 rounded px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Telefon</label>
                <input value={editing.phone || ''} onChange={(e) => setEditing({ ...editing, phone: e.target.value })} className="w-full border border-gray-300 rounded px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Kategorie</label>
                <input value={editing.category || ''} onChange={(e) => setEditing({ ...editing, category: e.target.value })} className="w-full border border-gray-300 rounded px-3 py-2 text-sm" />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Alternative Namen (comma-separated)</label>
                <input value={(editing.alternative_names || []).join(', ')} onChange={(e) => setEditing({ ...editing, alternative_names: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })} className="w-full border border-gray-300 rounded px-3 py-2 text-sm" />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Notizen</label>
                <textarea value={editing.notes || ''} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} className="w-full border border-gray-300 rounded px-3 py-2 text-sm" rows={3} />
              </div>
            </div>
            <div className="mt-6 flex items-center justify-end space-x-2">
              <button onClick={() => setEditing(null)} className="px-3 py-2 border rounded-md text-sm bg-white hover:bg-gray-50">Abbrechen</button>
              {editing._id ? (
                <button onClick={handleSave} className="px-3 py-2 rounded-md text-sm text-white" style={{ backgroundColor: '#9f1a1d' }}>Speichern</button>
              ) : (
                <button onClick={handleCreate} className="px-3 py-2 rounded-md text-sm text-white" style={{ backgroundColor: '#9f1a1d' }}>Anlegen</button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CreditorDatabase;
