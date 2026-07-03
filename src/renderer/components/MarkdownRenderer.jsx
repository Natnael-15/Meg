import React, { useState, useEffect, useRef, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import rehypeHighlight from 'rehype-highlight';
import rehypeKatex from 'rehype-katex';
import mermaid from 'mermaid';

// KaTeX styles via Vite import — light + dark theme handled by CSS vars
import 'katex/dist/katex.min.css';
import 'highlight.js/styles/github-dark.css';

/* ─────────────── initialise mermaid ─────────────── */
mermaid.initialize({
  startOnLoad: false,
  theme: 'dark',
  themeVariables: {
    primaryColor: '#3b6eff',
    primaryTextColor: '#e2e0ea',
    primaryBorderColor: '#5a84ff',
    lineColor: '#8c8a9e',
    secondaryColor: '#1e1c26',
    tertiaryColor: '#141318',
    fontSize: '14px',
  },
});

/* ─────────────── Code block with Copy & Apply ─────────────── */
const CodeBlockToolbar = ({ lang, code }) => {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard?.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  const apply = () => {
    window.dispatchEvent(new CustomEvent('meg:action', { detail: { action: 'applyCode', value: code } }));
  };

  return (
    <div className="md-code-toolbar"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '6px 12px',
        background: 'var(--bg-panel)',
        borderBottom: '1px solid var(--border-light)',
        flexShrink: 0,
      }}>
      <span style={{ fontSize: 10.5, fontFamily: '"JetBrains Mono", monospace', color: 'var(--text-3)', fontWeight: 600, textTransform: 'lowercase' }}>
        {lang || 'code'}
      </span>
      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
        <button
          onClick={apply}
          style={{ fontSize: 10.5, color: 'var(--accent)', background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, padding: '3px 7px', borderRadius: 5, transition: 'background 0.12s' }}
          onMouseEnter={e=>e.currentTarget.style.background='var(--accent-bg)'}
          onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
          Apply to file
        </button>
        <button
          onClick={copy}
          style={{
            fontSize: 10.5, color: copied ? 'var(--green)' : 'var(--text-3)',
            background: 'transparent', border: 'none', cursor: 'pointer',
            padding: '3px 7px', borderRadius: 5, transition: 'background 0.12s',
          }}
          onMouseEnter={e=>e.currentTarget.style.background='var(--bg-hover)'}
          onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
          {copied ? '✓ Copied' : 'Copy'}
        </button>
      </div>
    </div>
  );
};

export const CodeBlock = ({ lang, code }) => (
  <div
    style={{
      margin: '10px 0',
      borderRadius: 9,
      overflow: 'hidden',
      border: '1px solid var(--border-light)',
      background: 'var(--code-bg)',
    }}>
    <CodeBlockToolbar lang={lang} code={code} />
    <pre
      style={{
        margin: 0,
        padding: '12px 14px',
        fontSize: 12.5,
        fontFamily: '"JetBrains Mono", monospace',
        lineHeight: 1.55,
        overflowX: 'auto',
        background: 'var(--code-bg)',
        color: 'var(--code-text)',
        whiteSpace: 'pre',
      }}>
      <code>{code}</code>
    </pre>
  </div>
);

/* ─────────────── Mermaid renderer ─────────────── */
const MermaidDiagram = ({ content }) => {
  const ref = useRef(null);
  const [svg, setSvg] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    let active = true;
    mermaid.render(`mermaid-${Math.random().toString(36).slice(2)}`, content)
      .then(({ svg }) => {
        if (!active) return;
        setSvg(svg);
      })
      .catch((e) => {
        if (!active) return;
        setErr(e.message);
      });
    return () => { active = false; };
  }, [content]);

  if (err) return <div style={{ color: 'var(--red)', fontSize: 12, padding: 8 }}>[mermaid error: {err}]</div>;
  if (!svg) return <div style={{ padding: 12, color: 'var(--text-3)', fontSize: 12 }}>Rendering diagram…</div>;
  return <div className="md-mermaid" dangerouslySetInnerHTML={{ __html: svg }} />;
};

/* ─────────────── Math (LaTeX) ─────────────── */
const InlineMath = ({ value }) => {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current && typeof katex !== 'undefined') {
      // katex is loaded via rehype-katex already — no-op needed most of the time
    }
  }, [value]);
  return <span ref={ref} className="md-math-inline">{value}</span>;
};

const BlockMath = ({ children }) => (
  <div className="md-math-block" style={{ overflowX: 'auto', margin: '8px 0' }}>
    {children}
  </div>
);

/* ─────────────── Table wrapper for horizontal scroll ─────────────── */
const TableWrapper = ({ children }) => (
  <div style={{ overflowX: 'auto', margin: '8px 0', borderRadius: 6, border: '1px solid var(--border)' }}>
    {children}
  </div>
);

const getText = (node) => {
  if (node === null || node === undefined) return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(getText).join('');
  if (node.props && node.props.children !== undefined) return getText(node.props.children);
  return '';
};

/* ─────────────── Custom ReactMarkdown components ─────────────── */
const components = (escapeKeys) => ({
  code({ node, inline, className, children, ...props }) {
    const lang = /language-(\w+)/.exec(className || '')?.[1] || '';
    const codeStr = getText(children).replace(/\n$/, '');

    if (lang === 'mermaid') {
      return <MermaidDiagram content={codeStr} />;
    }

    // Inline code handled below by <code> component, this covers blocks only
    if (!inline) {
      return <CodeBlock lang={lang} code={codeStr} />;
    }
    return (
      <code className={className} style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.88em', background: 'rgba(128,128,128,0.12)', padding: '1px 5px', borderRadius: 3, color: 'var(--orange)' }} {...props}>
        {children}
      </code>
    );
  },

  pre({ children }) {
    // Override to prevent double pre-rendering when rehype-highlight wraps in <pre>
    return <>{children}</>;
  },

  p({ children }) {
    return <p style={{ fontSize: 13.5, lineHeight: 1.65, color: 'var(--text)', margin: '4px 0' }}>{children}</p>;
  },

  h1({ children }) {
    return <h1 style={{ fontSize: 17, fontWeight: 700, color: 'var(--text)', marginTop: 14, marginBottom: 6 }}>{children}</h1>;
  },
  h2({ children }) {
    return <h2 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginTop: 12, marginBottom: 4 }}>{children}</h2>;
  },
  h3({ children }) {
    return <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginTop: 8, marginBottom: 3 }}>{children}</h3>;
  },
  h4({ children }) { return <h4 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginTop: 6, marginBottom: 2 }}>{children}</h4> },
  h5({ children }) { return <h5 style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text)', marginTop: 4, marginBottom: 2 }}>{children}</h5> },
  h6({ children }) { return <h6 style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', marginTop: 4, marginBottom: 2 }}>{children}</h6> },

  a({ children, href }) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => { e.preventDefault(); window.open(href, '_blank', 'noopener,noreferrer'); }}
        style={{ color: 'var(--accent)', textDecoration: 'none', fontWeight: 500 }}
        onMouseEnter={(e) => e.currentTarget.style.textDecoration = 'underline'}
        onMouseLeave={(e) => e.currentTarget.style.textDecoration = 'none'}
      >
        {children}
      </a>
    );
  },

  blockquote({ children }) {
    return (
      <blockquote
        style={{
          borderLeft: '3px solid var(--accent)',
          paddingLeft: 12,
          margin: '6px 0',
          color: 'var(--text-2)',
        }}>
        {children}
      </blockquote>
    );
  },

  ul({ children }) {
    return <ul style={{ margin: '4px 0', paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 2, fontSize: 13.5, lineHeight: 1.55, color: 'var(--text)' }}>{children}</ul>;
  },

  ol({ children }) {
    return <ol style={{ margin: '4px 0', paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 2, fontSize: 13.5, lineHeight: 1.55, color: 'var(--text)' }}>{children}</ol>;
  },

  li({ children }) {
    return <li style={{ fontSize: 13.5, lineHeight: 1.55, color: 'var(--text)' }}>{children}</li>;
  },

  table({ children }) {
    return (
      <TableWrapper>
        <table
          style={{
            borderCollapse: 'collapse',
            fontSize: 12.5,
            width: '100%',
          }}
        >
          {children}
        </table>
      </TableWrapper>
    );
  },

  thead({ children }) {
    return <thead style={{ borderBottom: '2px solid var(--border)' }}>{children}</thead>;
  },

  th({ children }) {
    return (
      <th
        style={{
          padding: '6px 12px',
          textAlign: 'left',
          fontWeight: 600,
          color: 'var(--text)',
          whiteSpace: 'nowrap',
          fontSize: 12.5,
        }}
      >
        {children}
      </th>
    );
  },

  td({ children }) {
    return (
      <td
        style={{
          padding: '5px 12px',
          borderBottom: '1px solid var(--border-light)',
          color: 'var(--text-2)',
          fontSize: 12.5,
        }}
      >
        {children}
      </td>
    );
  },

  hr() {
    return <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '10px 0' }} />;
  },

  strong({ children }) {
    return <strong style={{ fontWeight: 600 }}>{children}</strong>;
  },

  em({ children }) {
    return <em style={{ fontStyle: 'italic' }}>{children}</em>;
  },

  del({ children }) {
    return <del style={{ textDecoration: 'line-through', color: 'var(--text-3)' }}>{children}</del>;
  },

  input({ type, checked, ...props }) {
    if (type === 'checkbox') {
      return (
        <input
          type="checkbox"
          checked={checked}
          readOnly
          style={{ marginRight: 6, accentColor: 'var(--accent)', cursor: 'default' }}
        />
      );
    }
    return <input type={type} {...props} />;
  },

  img({ src, alt }) {
    return (
      <img
        src={src}
        alt={alt}
        loading="lazy"
        style={{
          maxWidth: '100%',
          borderRadius: 6,
          border: '1px solid var(--border)',
          margin: '4px 0',
        }}
      />
    );
  },
});

/* ─────────────── Main Markdown Renderer ─────────────── */
const MarkdownRenderer = ({ children, className = '' }) => {
  const processed = children || '';
  const escKeys = useRef(0);

  return (
    <div className={`md-renderer ${className}`} style={{ wordBreak: 'break-word' }}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        rehypePlugins={[
          [rehypeHighlight, { detect: true, ignoreMissing: true }],
          rehypeKatex,
        ]}
        components={components(escKeys)}
        skipHtml
      >
        {processed}
      </ReactMarkdown>
    </div>
  );
};

export default MarkdownRenderer;
