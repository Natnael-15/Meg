import React from 'react';
import { Icon } from './icons.jsx';

/* ─────────────── Error Boundary with Recovery ─────────────── */
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ error, errorInfo });
    // eslint-disable-next-line no-console
    console.error('ErrorBoundary caught:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    if (this.props.onReset) this.props.onReset();
  };

  render() {
    if (this.state.hasError) {
      const { error, errorInfo } = this.state;
      const stack = error?.stack || '';
      const componentStack = errorInfo?.componentStack || '';

      return (
        <div style={{
          height: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 32,
          background: 'var(--bg)',
          color: 'var(--text)',
        }}>
          <div style={{
            maxWidth: 560,
            width: '100%',
            textAlign: 'center',
          }}>
            <div style={{
              width: 56,
              height: 56,
              borderRadius: 14,
              background: 'var(--red)15',
              border: '1px solid var(--red)30',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 20px',
            }}>
              <Icon name="alert" size={24} color="var(--red)"/>
            </div>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>
              Something went wrong
            </h2>
            <p style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 24, lineHeight: 1.6 }}>
              An unexpected error occurred in the app. You can try recovering or reload the page.
            </p>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginBottom: 24 }}>
              <button
                onClick={this.handleReset}
                style={{
                  padding: '8px 18px',
                  borderRadius: 7,
                  background: 'var(--accent)',
                  color: '#fff',
                  border: 'none',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  transition: 'opacity 0.15s',
                }}
                onMouseEnter={e => e.currentTarget.style.opacity = '0.85'}
                onMouseLeave={e => e.currentTarget.style.opacity = '1'}
              >
                <Icon name="refresh" size={14} color="#fff"/> Try to recover
              </button>
              <button
                onClick={() => window.location.reload()}
                style={{
                  padding: '8px 18px',
                  borderRadius: 7,
                  background: 'var(--bg-2)',
                  color: 'var(--text)',
                  border: '1px solid var(--border)',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  transition: 'all 0.15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent-border)'; e.currentTarget.style.color = 'var(--accent)'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text)'; }}
              >
                <Icon name="reload" size={14} color="currentColor"/> Reload page
              </button>
            </div>

            {/* Error details - collapsible */}
            <details style={{ textAlign: 'left' }}>
              <summary style={{
                fontSize: 12,
                color: 'var(--text-3)',
                cursor: 'pointer',
                userSelect: 'none',
                listStyle: 'none',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                justifyContent: 'center',
              }}>
                <Icon name="chevronDown" size={10} color="var(--text-3)"/> Error details
              </summary>
              <div style={{
                marginTop: 12,
                padding: 12,
                borderRadius: 8,
                background: 'var(--code-bg)',
                border: '1px solid var(--code-border)',
                textAlign: 'left',
                overflowX: 'auto',
                fontFamily: '"JetBrains Mono", monospace',
                fontSize: 11,
                lineHeight: 1.55,
                color: 'var(--code-text)',
                maxHeight: 240,
                overflowY: 'auto',
              }}>
                <div style={{ color: 'var(--red)', marginBottom: 8, fontWeight: 600 }}>
                  {error?.toString?.() || 'Unknown error'}
                </div>
                {stack && (
                  <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                    {stack}
                  </pre>
                )}
                {componentStack && (
                  <pre style={{ margin: '8px 0 0', whiteSpace: 'pre-wrap', wordBreak: 'break-all', color: 'var(--text-3)' }}>
                    {componentStack}
                  </pre>
                )}
              </div>
            </details>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
