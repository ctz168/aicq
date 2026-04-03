import React, { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';

interface MarkdownRendererProps {
  content: string;
  isOwn?: boolean;
}

const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content, isOwn = false }) => {
  const components = useMemo(() => ({
    code({ node, inline, className, children, ...props }: any) {
      const match = /language-(\w+)/.exec(className || '');
      const codeString = String(children).replace(/\n$/, '');

      if (!inline && (match || codeString.includes('\n'))) {
        return (
          <div className="markdown-code-block">
            <div className="markdown-code-header">
              <span className="markdown-code-lang">{match ? match[1] : 'code'}</span>
              <button
                className="markdown-code-copy"
                onClick={() => {
                  navigator.clipboard.writeText(codeString);
                }}
                title="复制代码"
              >
                复制
              </button>
            </div>
            <SyntaxHighlighter
              style={oneDark}
              language={match ? match[1] : 'text'}
              PreTag="div"
              customStyle={{
                margin: 0,
                borderRadius: '0 0 8px 8px',
                fontSize: '13px',
                lineHeight: '1.5',
                background: '#0d1117',
              }}
              {...props}
            >
              {codeString}
            </SyntaxHighlighter>
          </div>
        );
      }

      return (
        <code className="markdown-inline-code" {...props}>
          {children}
        </code>
      );
    },
    table({ children, ...props }: any) {
      return (
        <div className="markdown-table-wrapper">
          <table {...props}>{children}</table>
        </div>
      );
    },
    a({ href, children, ...props }: any) {
      return (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="markdown-link"
          {...props}
        >
          {children}
        </a>
      );
    },
    blockquote({ children, ...props }: any) {
      return (
        <blockquote className="markdown-blockquote" {...props}>
          {children}
        </blockquote>
      );
    },
    img({ src, alt, ...props }: any) {
      return (
        <div className="markdown-image-wrapper">
          <img
            src={src}
            alt={alt || ''}
            className="markdown-image"
            loading="lazy"
            {...props}
          />
          {alt && <span className="markdown-image-caption">{alt}</span>}
        </div>
      );
    },
    ul({ children, ...props }: any) {
      return <ul className="markdown-list markdown-ul" {...props}>{children}</ul>;
    },
    ol({ children, ...props }: any) {
      return <ol className="markdown-list markdown-ol" {...props}>{children}</ol>;
    },
    h1({ children, ...props }: any) {
      return <h1 className="markdown-h markdown-h1" {...props}>{children}</h1>;
    },
    h2({ children, ...props }: any) {
      return <h2 className="markdown-h markdown-h2" {...props}>{children}</h2>;
    },
    h3({ children, ...props }: any) {
      return <h3 className="markdown-h markdown-h3" {...props}>{children}</h3>;
    },
    p({ children, ...props }: any) {
      return <p className="markdown-p" {...props}>{children}</p>;
    },
    hr({ ...props }: any) {
      return <hr className="markdown-hr" {...props} />;
    },
  }), [isOwn]);

  return (
    <div className={`markdown-body ${isOwn ? 'markdown-own' : 'markdown-other'}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
};

export default MarkdownRenderer;
