import { Card } from '../components/ui';
import { Page } from '../components/Layout';

/** Stands in for a tab whose feature lands in a later phase. */
export function Placeholder({ title, note }: { title: string; note: string }) {
  return (
    <Page title={title}>
      <Card>
        <p className="text-sm text-slate-600">{note}</p>
      </Card>
    </Page>
  );
}
