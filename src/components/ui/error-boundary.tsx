import { Component, type ErrorInfo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from './button';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}
interface State {
  error: Error | null;
}

function ErrorFallback({ error }: { error: Error }) {
  const { t } = useTranslation();
  return (
    <main className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-background text-foreground">
      <section
        className="max-w-md w-full p-6 rounded-3xl border border-border flex flex-col items-center text-center"
        role="alert"
      >
        <AlertCircle size={24} className="text-destructive mb-4" />
        <h1 className="text-lg font-semibold mb-2">{t('errorBoundary.title')}</h1>
        <p className="text-sm text-muted-foreground mb-4">{t('errorBoundary.description')}</p>
        <pre className="w-full text-xs p-3 rounded-xl bg-muted overflow-auto text-left max-h-40 mb-4">
          {error.message}
        </pre>
        <Button onClick={() => window.location.reload()}>
          <RefreshCw size={14} />
          {t('errorBoundary.reload')}
        </Button>
      </section>
    </main>
  );
}

export class ErrorBoundary extends Component<Props, State> {
  public override state: State = { error: null };
  public static getDerivedStateFromError(error: Error): State {
    return { error };
  }
  public override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('RayTab render error', error, info);
  }
  public override render() {
    return this.state.error
      ? (this.props.fallback ?? <ErrorFallback error={this.state.error} />)
      : this.props.children;
  }
}
