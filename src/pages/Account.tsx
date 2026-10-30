import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/auth-context';
import {
  bundleToCsvFiles, bundleToJson, deleteAccount, exportUserData,
} from '../data/account';
import { Button, Card } from '../components/ui';
import { Page } from '../components/Layout';

function download(filename: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function Account() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmText, setConfirmText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<string | null>(null);

  async function handleExport(format: 'json' | 'csv') {
    if (!user) return;
    setBusy(format);
    setError(null);
    try {
      const bundle = await exportUserData(user.uid);
      if (format === 'json') {
        download('milo-iq-export.json', bundleToJson(bundle), 'application/json');
      } else {
        for (const file of bundleToCsvFiles(bundle)) {
          download(file.name, file.content, 'text/csv');
        }
      }
    } catch {
      setError('Export failed. Check your connection and try again.');
    } finally {
      setBusy(null);
    }
  }

  async function handleDelete() {
    if (!user || confirmText !== 'DELETE') return;
    setBusy('delete');
    setError(null);
    try {
      await deleteAccount(user, (progress) => setStep(progress.step));
      navigate('/', { replace: true });
    } catch (err) {
      const code = (err as { code?: string }).code ?? '';
      setError(
        code === 'auth/requires-recent-login'
          ? 'For your security, please sign out and sign back in, then delete again.'
          : 'Deletion did not finish. Nothing was lost — please try again.',
      );
      setBusy(null);
      setStep(null);
    }
  }

  return (
    <Page title="Your data">
      <Link
        to="/more"
        className="mb-4 inline-block text-sm font-medium text-slate-500 hover:text-slate-700"
      >
        &larr; Back
      </Link>

      <Card>
        <h2 className="text-sm font-semibold text-slate-900">Export everything</h2>
        <p className="mt-2 text-sm text-slate-600">
          Your logs, weights, foods, rules, workouts and photo records. It is your data;
          take a copy whenever you like.
        </p>
        <div className="mt-4 flex gap-3">
          <Button variant="secondary" onClick={() => handleExport('json')} disabled={busy !== null}>
            {busy === 'json' ? 'Preparing…' : 'Download JSON'}
          </Button>
          <Button variant="secondary" onClick={() => handleExport('csv')} disabled={busy !== null}>
            {busy === 'csv' ? 'Preparing…' : 'Download CSV'}
          </Button>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          CSV downloads as three files: days, workouts and foods.
        </p>
      </Card>

      <Card className="mt-4 border-red-200">
        <h2 className="text-sm font-semibold text-red-900">Delete your account</h2>
        <p className="mt-2 text-sm text-slate-600">
          This removes every log, weight, workout, rule and photo, takes you out of any
          groups you are in, and closes your account. It cannot be undone, and we cannot
          recover it for you afterwards.
        </p>
        <p className="mt-2 text-sm font-medium text-slate-700">
          Export your data first if you might want it.
        </p>

        <label className="mt-4 block">
          <span className="mb-1.5 block text-sm text-slate-600">
            Type <strong>DELETE</strong> to confirm
          </span>
          <input
            value={confirmText}
            onChange={(event) => setConfirmText(event.target.value)}
            placeholder="DELETE"
            className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-slate-900
              outline-none focus:border-red-500 focus:ring-2 focus:ring-red-200"
          />
        </label>

        <button
          type="button"
          onClick={handleDelete}
          disabled={confirmText !== 'DELETE' || busy !== null}
          className="mt-3 w-full rounded-xl bg-red-600 px-4 py-3 text-base font-semibold
            text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy === 'delete' ? (step ?? 'Deleting…') : 'Delete my account permanently'}
        </button>
      </Card>

      {error && (
        <p role="alert" className="mt-3 text-sm text-red-600">
          {error}
        </p>
      )}

      <div className="mt-8 flex justify-center gap-6 text-sm">
        <Link to="/privacy" className="font-medium text-slate-500 hover:text-slate-700">
          Privacy
        </Link>
        <Link to="/terms" className="font-medium text-slate-500 hover:text-slate-700">
          Terms
        </Link>
      </div>
    </Page>
  );
}
