import React, { useEffect, useRef } from 'react';
import MarkdownRenderer from './MarkdownRenderer';

interface StreamingMessageProps {
  content: string;
  isOwn: boolean;
  isComplete: boolean;
  /** Error message if streaming failed */
  error?: string;
}

/**
 * Renders a streaming AI response with animated cursor and Markdown support.
 * Content is updated incrementally as tokens arrive.
 */
const StreamingMessage: React.FC<StreamingMessageProps> = ({
  content,
  isOwn,
  isComplete,
  error,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to show new content as it streams in
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [content]);

  // If complete, switch to regular markdown rendering
  if (isComplete && !error) {
    return (
      <div className={`message-row ${isOwn ? 'own' : 'other'}`}>
        <div className={`message-bubble ${isOwn ? 'own' : 'other'} message-streaming-complete`}>
          <MarkdownRenderer content={content} isOwn={isOwn} />
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className={`message-row ${isOwn ? 'own' : 'other'}`}>
        <div className={`message-bubble ${isOwn ? 'own' : 'other'} message-streaming-error`}>
          <MarkdownRenderer content={content} isOwn={isOwn} />
          <div className="streaming-error">
            <span className="streaming-error-icon">⚠️</span>
            <span className="streaming-error-text">{error}</span>
          </div>
        </div>
      </div>
    );
  }

  // Active streaming state
  return (
    <div className={`message-row ${isOwn ? 'own' : 'other'}`}>
      <div className={`message-bubble ${isOwn ? 'own' : 'other'} message-streaming-active`}>
        <div className="streaming-content">
          <MarkdownRenderer content={content} isOwn={isOwn} />
          <span className="streaming-cursor" />
        </div>
        <div className="streaming-indicator">
          <span className="streaming-dot" />
          <span className="streaming-dot" />
          <span className="streaming-dot" />
          <span className="streaming-label">AI 正在思考</span>
        </div>
      </div>
      <div ref={scrollRef} />
    </div>
  );
};

export default StreamingMessage;
