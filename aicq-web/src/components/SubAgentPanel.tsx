import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useAICQ } from '../hooks/useAICQ';
import type { SubAgentSession } from '../types';

interface SubAgentCardProps {
  session: SubAgentSession;
  onAbort: (id: string) => void;
  onSendInput: (id: string, input: string) => void;
}

const SubAgentCard: React.FC<SubAgentCardProps> = ({ session, onAbort, onSendInput }) => {
  const [expanded, setExpanded] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const outputRef = useRef<HTMLDivElement>(null);

  const isWaitingHuman = session.status === 'waiting_human';
  const isRunning = session.status === 'running';
  const isCompleted = session.status === 'completed';
  const isError = session.status === 'error';

  // Auto-scroll output to bottom
  useEffect(() => {
    if (expanded && outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [session.output, expanded]);

  // Auto-expand when waiting for human input
  useEffect(() => {
    if (isWaitingHuman && !expanded) {
      setExpanded(true);
    }
  }, [isWaitingHuman, expanded]);

  const handleSend = useCallback(() => {
    const trimmed = inputValue.trim();
    if (!trimmed) return;
    onSendInput(session.id, trimmed);
    setInputValue('');
  }, [inputValue, session.id, onSendInput]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  return (
    <div className={`subagent-card${isWaitingHuman ? ' waiting' : ''}${isError ? ' error' : ''}`}>
      {/* Header - always visible */}
      <div className="subagent-card-header" onClick={() => setExpanded((prev) => !prev)}>
        <span className="subagent-title">
          {isCompleted && '✅ '}
          {isError && '❌ '}
          {session.task}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {/* Status dot */}
          <div className={`subagent-status ${session.status}`} title={session.status} />

          {/* Collapse/expand indicator */}
          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
            {expanded ? '▼' : '▶'}
          </span>

          {/* Abort button for running/waiting tasks */}
          {(isRunning || isWaitingHuman) && (
            <button
              className="subagent-abort"
              onClick={(e) => {
                e.stopPropagation();
                onAbort(session.id);
              }}
              title="中止"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Expanded body */}
      {expanded && (
        <div className="subagent-body" ref={outputRef}>
          <div className="subagent-output">
            {session.output || (isRunning ? '处理中...' : isError ? '执行出错' : '')}
          </div>
        </div>
      )}

      {/* Input row for waiting_human status */}
      {isWaitingHuman && (
        <div className="subagent-input-row">
          <input
            className="subagent-input"
            type="text"
            placeholder="输入回复..."
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            autoFocus
          />
          <button className="subagent-send-btn" onClick={handleSend} disabled={!inputValue.trim()}>
            发送
          </button>
        </div>
      )}
    </div>
  );
};

const SubAgentPanel: React.FC = () => {
  const { state, startSubAgent, sendSubAgentInput, abortSubAgent } = useAICQ();
  const { subAgents, activeFriendId, friends } = state;

  // Check if the current active friend is an AI
  const isAIFriend = useMemo(() => {
    if (!activeFriendId) return false;
    const friend = friends.find((f) => f.id === activeFriendId);
    return friend?.friendType === 'ai';
  }, [activeFriendId, friends]);

  // Don't render if not an AI friend
  if (!isAIFriend) return null;

  // Don't render if no sub-agents and no way to create them
  if (subAgents.length === 0) return null;

  const handleAbort = useCallback(
    async (subAgentId: string) => {
      try {
        await abortSubAgent(subAgentId);
      } catch (err) {
        console.error('[SubAgentPanel] Abort failed:', err);
      }
    },
    [abortSubAgent]
  );

  const handleSendInput = useCallback(
    async (subAgentId: string, input: string) => {
      try {
        await sendSubAgentInput(subAgentId, input);
      } catch (err) {
        console.error('[SubAgentPanel] Send input failed:', err);
      }
    },
    [sendSubAgentInput]
  );

  const handleAddNew = useCallback(async () => {
    try {
      // Create a new sub-agent with a default task; the parent message is the latest from context
      await startSubAgent('', '新任务', '');
    } catch (err) {
      console.error('[SubAgentPanel] Start sub-agent failed:', err);
    }
  }, [startSubAgent]);

  return (
    <div className="subagent-panel">
      {/* Add new sub-agent button */}
      <button className="subagent-add-btn" onClick={handleAddNew} title="新建子任务">
        +
      </button>

      {/* Sub-agent cards */}
      {subAgents.map((session) => (
        <SubAgentCard
          key={session.id}
          session={session}
          onAbort={handleAbort}
          onSendInput={handleSendInput}
        />
      ))}
    </div>
  );
};

export default SubAgentPanel;
