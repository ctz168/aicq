import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import type { AgentExecutionState } from '../types';
import { useAICQ } from '../context/AICQContext';
import MessageBubble, { DateSeparator } from '../components/MessageBubble';
import StreamingMessage from '../components/StreamingMessage';
import StatusBadge from '../components/StatusBadge';
import FileTransferProgress from '../components/FileTransferProgress';
import ForwardMessageModal from '../components/ForwardMessageModal';
import SubAgentPanel from '../components/SubAgentPanel';
import TaskProgressPanel from '../components/TaskProgressPanel';
import BotMenuPanel from '../components/BotMenuPanel';
import type { ChatMessage, StreamingState } from '../types';

const ChatScreen: React.FC = () => {
  const {
    state,
    navigate,
    sendMessage,
    sendTyping,
    getMessages,
    sendFile,
    sendImage,
    sendVideo,
    pauseTransfer,
    resumeTransfer,
    cancelTransfer,
    markMessagesRead,
    getStreamingState,
    abortAgent,
    abortStreaming,
    addSystemMessage,
    isAgentExecuting,
    getAgentExecutionState,
    messageQueue,
    loadMoreMessages,
    getMessageCount,
  } = useAICQ();

  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [abortConfirm, setAbortConfirm] = useState(false);
  const [abortCountdown, setAbortCountdown] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [showAttachmentMenu, setShowAttachmentMenu] = useState(false);
  const [showBotMenu, setShowBotMenu] = useState(false);
  const [botMenuFilter, setBotMenuFilter] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [forwardMessage, setForwardMessage] = useState<ChatMessage | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; message: ChatMessage } | null>(null);
  const [displayCount, setDisplayCount] = useState(50);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMoreMessages, setHasMoreMessages] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const attachmentMenuRef = useRef<HTMLDivElement>(null);
  const botMenuPanelRef = useRef<HTMLDivElement>(null);
  const autoScrollRef = useRef(true);
  const topSentinelRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);

  const friendId = state.activeFriendId;
  const friend = state.friends.find((f) => f.id === friendId);
  // Depend on messageVersion to ensure re-render after loadMoreMessages updates the ref
  const _msgVersion = state.messageVersion;
  const messages = getMessages(friendId || '');
  void _msgVersion;
  const isTyping = state.typingState[friendId || ''];
  const streamingState = friendId ? getStreamingState(friendId) : null;

  // Determine if this is an AI friend
  const isAiFriend = friend?.friendType === 'ai';

  const agentExecuting = isAiFriend ? isAgentExecuting(friendId || '') : false;
  const agentExecState: AgentExecutionState | null = isAiFriend ? getAgentExecutionState(friendId || '') : null;
  const queuedCount = messageQueue.filter(m => m.toId === friendId).length;

  // Phase display mapping
  const phaseMap: Record<string, { label: string; icon: string }> = useMemo(() => ({
    started: { label: '准备中', icon: '\u23F3' },
    streaming: { label: '生成回复中', icon: '\uD83D\uDCAC' },
    tool_executing: { label: '执行工具中', icon: '\uD83D\uDD27' },
    thinking: { label: '思考中', icon: '\uD83E\uDDE0' },
    completed: { label: '已完成', icon: '\u2705' },
    error: { label: '出错', icon: '\u274C' },
    cancelled: { label: '已取消', icon: '\uD83D\uDED1' },
  }), []);

  // Elapsed time counter
  useEffect(() => {
    if (!agentExecuting || !agentExecState?.startedAt) {
      setElapsedSeconds(0);
      return;
    }
    const startTime = agentExecState.startedAt;
    const tick = () => setElapsedSeconds(Math.floor((Date.now() - startTime) / 1000));
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [agentExecuting, agentExecState?.startedAt]);

  // Abort confirmation countdown
  useEffect(() => {
    if (!abortConfirm) {
      setAbortCountdown(0);
      return;
    }
    setAbortCountdown(3);
    const timer = setTimeout(() => {
      setAbortConfirm(false);
      setAbortCountdown(0);
    }, 3000);
    return () => clearTimeout(timer);
  }, [abortConfirm]);

  // Format elapsed time as mm:ss
  const formatTime = useCallback((seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }, []);

  // Scroll to bottom on new messages (only if already near bottom)
  const scrollToBottom = useCallback((force = false) => {
    if (!messagesContainerRef.current) return;
    const container = messagesContainerRef.current;
    const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 150;
    if (force || isNearBottom || autoScrollRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages.length, isTyping, streamingState?.content, scrollToBottom, elapsedSeconds]);

  // Compute visible messages (slice from the end for incremental loading)
  const visibleMessages = useMemo(() => {
    if (messages.length <= displayCount) {
      return messages;
    }
    return messages.slice(messages.length - displayCount);
  }, [messages, displayCount]);

  // Load more messages handler (maintains scroll position)
  const handleLoadMore = useCallback(async () => {
    if (isLoadingMore || !friendId) return;
    setIsLoadingMore(true);
    // Remember scroll position to maintain visual position
    const container = messagesContainerRef.current;
    const prevScrollHeight = container?.scrollHeight ?? 0;

    if (messages.length <= displayCount) {
      // All in-memory messages are displayed, try loading from IndexedDB
      try {
        const oldestMsg = messages.length > 0 ? messages[0] : null;
        const result = await loadMoreMessages(friendId, oldestMsg?.timestamp);
        if (!result.hasMore) {
          setHasMoreMessages(false);
        }
        // Increase displayCount to include the newly loaded messages
        // After loadMoreMessages, messagesRef will have more messages (prepended)
        // so we need to show them by increasing displayCount
        const newTotal = result.messages.length;
        setDisplayCount(Math.min(newTotal, displayCount + 30));
      } catch (err) {
        console.error('Failed to load more from cache:', err);
      }
    } else {
      setDisplayCount(prev => Math.min(prev + 30, messages.length));
    }

    // Restore scroll position after loading more
    requestAnimationFrame(() => {
      if (container) {
        const newScrollHeight = container.scrollHeight;
        container.scrollTop = newScrollHeight - prevScrollHeight;
      }
      setIsLoadingMore(false);
    });
  }, [isLoadingMore, messages.length, displayCount, friendId, loadMoreMessages]);

  // Track if user scrolls up (disable auto-scroll)
  const handleScroll = useCallback(() => {
    if (!messagesContainerRef.current) return;
    const container = messagesContainerRef.current;
    const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 150;
    autoScrollRef.current = isNearBottom;
  }, []);

  // Reset display window when switching friends
  useEffect(() => {
    setDisplayCount(50);
    setHasMoreMessages(true);
    autoScrollRef.current = true;
    // Load total count from IndexedDB to determine if there are more messages
    if (friendId) {
      getMessageCount(friendId).then(count => {
        const msgs = getMessages(friendId);
        setHasMoreMessages(msgs.length < count);
 }).catch(() => {});
    }
  }, [friendId]);

  // IntersectionObserver for infinite scroll - detect when top sentinel is visible
  useEffect(() => {
    if (!topSentinelRef.current || !hasMoreMessages) return;

    // Cleanup previous observer
    if (observerRef.current) {
      observerRef.current.disconnect();
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasMoreMessages && !isLoadingMore) {
          handleLoadMore();
        }
      },
      {
        root: messagesContainerRef.current,
        rootMargin: '100px',
        threshold: 0,
      }
    );

    observer.observe(topSentinelRef.current);
    observerRef.current = observer;

    return () => {
      observer.disconnect();
      observerRef.current = null;
    };
  }, [hasMoreMessages, isLoadingMore, handleLoadMore]);

  // Mark messages as read when opening chat
  useEffect(() => {
    if (friendId) {
      markMessagesRead(friendId);
    }
  }, [friendId, markMessagesRead]);

  // Close menus on click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (attachmentMenuRef.current && !attachmentMenuRef.current.contains(e.target as Node)) {
        setShowAttachmentMenu(false);
      }
    };
    if (showAttachmentMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showAttachmentMenu]);

  // Detect "/" input to trigger bot menu
  const handleInputChangeForBotMenu = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    // Show bot menu when user types "/" at the beginning of input
    if (value === '/') {
      setShowBotMenu(true);
      setBotMenuFilter('');
      setShowAttachmentMenu(false);
    } else if (value.startsWith('/') && showBotMenu) {
      // Update filter as user types
      setBotMenuFilter(value.slice(1));
    } else if (showBotMenu) {
      // Close bot menu if user types something else
      setShowBotMenu(false);
      setBotMenuFilter('');
    }
  }, [showBotMenu]);

  // Handle bot command selection
  const handleBotCommandSelect = useCallback((commandText: string) => {
    setInputText(commandText);
    setShowBotMenu(false);
    setBotMenuFilter('');
    inputRef.current?.focus();
  }, []);

  // Close bot menu on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && showBotMenu) {
        e.stopPropagation();
        setShowBotMenu(false);
        setBotMenuFilter('');
      }
    };
    if (showBotMenu) {
      document.addEventListener('keydown', handleKeyDown, true);
      return () => document.removeEventListener('keydown', handleKeyDown, true);
    }
  }, [showBotMenu]);

  // Close context menu on click anywhere
  useEffect(() => {
    if (!contextMenu) return;
    const handler = () => setContextMenu(null);
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [contextMenu]);

  const handleSend = useCallback(async () => {
    if (!friendId || !inputText.trim()) return;
    setIsSending(true);
    try {
      sendMessage(friendId, inputText.trim());
      setInputText('');
      autoScrollRef.current = true;
      if (inputRef.current) {
        inputRef.current.style.height = 'auto';
      }
      inputRef.current?.focus();
    } finally {
      setIsSending(false);
    }
  }, [friendId, inputText, sendMessage]);

  const handleTyping = useCallback(() => {
    if (!friendId) return;
    sendTyping(friendId);
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
  }, [friendId, sendTyping]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Auto-resize textarea
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputText(e.target.value);
    handleTyping();
    handleInputChangeForBotMenu(e);
    const textarea = e.target;
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 200) + 'px';
  };

  // Context menu handler for message bubbles
  const handleMessageContextMenu = useCallback((e: React.MouseEvent, message: ChatMessage) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, message });
  }, []);

  const handleForward = useCallback((message: ChatMessage) => {
    setContextMenu(null);
    setForwardMessage(message);
  }, []);

  // File handling
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || !friendId) return;
    for (const file of Array.from(files)) {
      try {
        await sendFile(friendId, file);
      } catch (err) {
        console.error('File send failed:', err);
      }
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
    setShowAttachmentMenu(false);
  };

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || !friendId) return;
    for (const file of Array.from(files)) {
      if (file.type.startsWith('image/')) {
        try {
          await sendImage(friendId, file);
        } catch (err) {
          console.error('Image send failed:', err);
        }
      }
    }
    if (imageInputRef.current) imageInputRef.current.value = '';
    setShowAttachmentMenu(false);
  };

  const handleVideoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || !friendId) return;
    for (const file of Array.from(files)) {
      if (file.type.startsWith('video/')) {
        try {
          await sendVideo(friendId, file);
        } catch (err) {
          console.error('Video send failed:', err);
        }
      }
    }
    if (videoInputRef.current) videoInputRef.current.value = '';
    setShowAttachmentMenu(false);
  };

  // Drag and drop support
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    if (!friendId) return;

    const files = Array.from(e.dataTransfer.files);
    for (const file of files) {
      try {
        if (file.type.startsWith('image/')) {
          await sendImage(friendId, file);
        } else if (file.type.startsWith('video/')) {
          await sendVideo(friendId, file);
        } else {
          await sendFile(friendId, file);
        }
      } catch (err) {
        console.error('Drop send failed:', err);
      }
    }
  }, [friendId, sendImage, sendVideo, sendFile]);

  // Handle agent abort
  const handleAbort = useCallback(async () => {
    if (!friendId) return;
    try {
      await abortAgent(friendId);
      addSystemMessage(friendId, '\uD83D\uDED1 已停止 Agent 执行');
    } catch (err) {
      console.error('[ChatScreen] Abort failed:', err);
    }
  }, [friendId, abortAgent, addSystemMessage]);

  // Handle agent abort with confirmation
  const handleAbortClick = useCallback(() => {
    if (abortConfirm) {
      // Second click within 3s - actually abort
      handleAbort();
      setAbortConfirm(false);
      setAbortCountdown(0);
    } else {
      // First click - enter confirmation state
      setAbortConfirm(true);
    }
  }, [abortConfirm, handleAbort]);

  // Handle streaming abort
  const handleStreamingAbort = useCallback(() => {
    if (!friendId) return;
    abortStreaming(friendId);
    addSystemMessage(friendId, '\uD83D\uDED1 已停止 AI 回复生成');
  }, [friendId, abortStreaming, addSystemMessage]);

  // Build message list with date separators
  const messageElements = useMemo(() => {
    const elements: React.ReactNode[] = [];
    let lastDate = '';

    for (const msg of visibleMessages) {
      // Skip streaming messages that are being shown via StreamingMessage component
      if (msg.type === 'streaming' && !msg.streamingActive) continue;

      const msgDate = new Date(msg.timestamp).toDateString();
      if (msgDate !== lastDate) {
        elements.push(<DateSeparator key={`date-${msg.id}`} date={new Date(msg.timestamp)} />);
        lastDate = msgDate;
      }

      if (msg.type === 'streaming' && msg.streamingActive) {
        elements.push(
          <StreamingMessage
            key={`stream-${msg.id}`}
            content={msg.content}
            isOwn={msg.fromId === state.userId}
            isComplete={false}
          />
        );
      } else {
        elements.push(
          <div
            key={msg.id}
            onContextMenu={(e) => handleMessageContextMenu(e, msg)}
          >
            <MessageBubble
              message={msg}
              isOwn={msg.fromId === state.userId}
              userId={state.userId}
            />
          </div>
        );
      }
    }

    // Add top sentinel for IntersectionObserver-based infinite scroll
    elements.unshift(
      <div key="load-more" ref={topSentinelRef} className="load-more-indicator" onClick={handleLoadMore}>
        {isLoadingMore ? '加载中...' : (hasMoreMessages ? '↑ 加载更多消息' : '')}
      </div>
    );

    return elements;
  }, [visibleMessages, state.userId, handleMessageContextMenu, hasMoreMessages, isLoadingMore]);

  if (!friendId || !friend) {
    return (
      <div className="chat-screen">
        <div className="empty-state">
          <span className="empty-icon">💬</span>
          <h3>选择一个聊天</h3>
          <p>从左侧列表选择好友开始聊天</p>
          <p className="empty-hint">支持文本、图片、视频、文件传输和 Markdown 格式</p>
        </div>
      </div>
    );
  }

  // Active file transfers for this friend
  const activeTransfers = state.fileTransfers.filter(
    (t) => t.status === 'transferring' || t.status === 'paused'
  );

  return (
    <div
      className="chat-screen"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Header */}
      <div className="chat-header">
        <button className="btn-back" onClick={() => navigate('chatList', null)}>
          ←
        </button>
        <div className="chat-header-info">
          <div className="chat-header-avatar">
            {friend.friendType === 'ai' ? '🤖' : '👤'}
          </div>
          <div className="chat-header-details">
            <span className="chat-header-name">
              {friend.aiName || friend.fingerprint.slice(0, 8)}
            </span>
            <div className="chat-header-status">
              <StatusBadge isOnline={friend.isOnline} size="small" />
              {isAiFriend && <span className="chat-header-ai-badge">AI</span>}
            </div>
          </div>
        </div>
        <span className="chat-header-encrypt">🔒 E2E</span>
      </div>

      {/* Messages area */}
      <div
        className="chat-messages"
        ref={messagesContainerRef}
        onScroll={handleScroll}
      >
        {messageElements}

        {/* Active streaming from AI */}
        {streamingState && !streamingState.isComplete && (
          <div className="streaming-with-controls">
            <StreamingMessage
              key={`active-stream-${streamingState.messageId}`}
              content={streamingState.content}
              isOwn={false}
              isComplete={false}
              error={streamingState.error}
            />
            <button
              className="btn-stop-streaming"
              onClick={handleStreamingAbort}
              title="停止生成"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="6" width="12" height="12" rx="2" />
              </svg>
              停止生成
            </button>
          </div>
        )}

        {/* SubAgent Panel for AI friends */}
        {isAiFriend && messages.length > 0 && (
          <SubAgentPanel />
        )}

        {/* Typing indicator */}
        {isTyping && (
          <div className="message-row other">
            <div className="message-bubble other typing-indicator">
              <span className="typing-dots">
                <span className="typing-dot" />
                <span className="typing-dot" />
                <span className="typing-dot" />
              </span>
            </div>
          </div>
        )}

        {/* Scroll anchor */}
        <div ref={messagesEndRef} />
      </div>

      {/* Drag overlay */}
      {dragOver && (
        <div className="chat-drag-overlay">
          <div className="chat-drag-content">
            <span className="chat-drag-icon">📤</span>
            <span className="chat-drag-text">释放以发送文件</span>
          </div>
        </div>
      )}

      {/* File transfer progress */}
      {activeTransfers.length > 0 && (
        <div className="chat-transfers">
          {activeTransfers.map((t) => (
            <FileTransferProgress
              key={t.sessionId}
              transfer={t}
              onPause={() => pauseTransfer(t.sessionId)}
              onResume={() => resumeTransfer(t.sessionId)}
              onCancel={() => cancelTransfer(t.sessionId)}
            />
          ))}
        </div>
      )}

      {/* Task progress panel - above input area */}
      <TaskProgressPanel friendId={friendId || ''} />

      {/* Agent execution state bar */}
      {agentExecuting && (
        <div className="agent-execution-bar">
          <div className="agent-execution-info">
            <div className={`agent-execution-phase-icon ${agentExecState?.phase || 'started'}`}>
              {(agentExecState?.phase && phaseMap[agentExecState.phase]) ? phaseMap[agentExecState.phase].icon : '⏳'}
            </div>
            <div className="agent-execution-details">
              <span className="agent-execution-phase">
                {(agentExecState?.phase && phaseMap[agentExecState.phase]) ? phaseMap[agentExecState.phase].label : '执行中'}
              </span>
              <span className="agent-execution-timer">{formatTime(elapsedSeconds)}</span>
            </div>
            {queuedCount > 0 && (
              <span className="agent-queue-badge">{queuedCount} 条消息排队中</span>
            )}
          </div>
          <button
            className={`btn-abort-agent ${abortConfirm ? 'confirming' : ''}`}
            onClick={handleAbortClick}
            title={abortConfirm ? '再次点击确认停止' : '停止执行'}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="6" width="12" height="12" rx="2" />
            </svg>
            {abortConfirm ? `确认停止？(${abortCountdown})` : '停止'}
          </button>
        </div>
      )}

      {/* Input area */}
      <div className="chat-input-area" style={{ position: 'relative' }}>
        {/* Bot menu panel - at input-area level for proper positioning */}
        {isAiFriend && showBotMenu && (
          <BotMenuPanel
            isOpen={showBotMenu}
            onClose={() => { setShowBotMenu(false); setBotMenuFilter(''); }}
            onSelect={handleBotCommandSelect}
            filterText={botMenuFilter}
            position="top"
          />
        )}

        <div className="chat-input-row">
          {/* Bot menu button ("/" trigger) */}
          <div className="chat-input-actions">
            {isAiFriend && (
              <button
                className="btn-attach bot-menu-trigger"
                onClick={() => {
                  setShowBotMenu(!showBotMenu);
                  setShowAttachmentMenu(false);
                  setBotMenuFilter('');
                  inputRef.current?.focus();
                }}
                title="命令菜单"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 2L2 7l10 5 10-5-10-5z" />
                  <path d="M2 17l10 5 10-5" />
                  <path d="M2 12l10 5 10-5" />
                </svg>
              </button>
            )}

            {/* Attachment button */}
            <button
              className="btn-attach"
              onClick={() => { setShowAttachmentMenu(!showAttachmentMenu); setShowBotMenu(false); }}
              title="发送附件"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="16" />
                <line x1="8" y1="12" x2="16" y2="12" />
              </svg>
            </button>

            {/* Attachment dropdown menu */}
            {showAttachmentMenu && (
              <div className="attachment-menu" ref={attachmentMenuRef}>
                <button className="attachment-menu-item" onClick={() => imageInputRef.current?.click()}>
                  <span className="attachment-menu-icon">🖼️</span>
                  <span className="attachment-menu-label">发送图片</span>
                  <span className="attachment-menu-desc">JPG, PNG, GIF, WebP</span>
                </button>
                <button className="attachment-menu-item" onClick={() => videoInputRef.current?.click()}>
                  <span className="attachment-menu-icon">🎬</span>
                  <span className="attachment-menu-label">发送视频</span>
                  <span className="attachment-menu-desc">MP4, WebM, MOV</span>
                </button>
                <button className="attachment-menu-item" onClick={() => fileInputRef.current?.click()}>
                  <span className="attachment-menu-icon">📁</span>
                  <span className="attachment-menu-label">发送文件</span>
                  <span className="attachment-menu-desc">支持断点续传</span>
                </button>
              </div>
            )}
          </div>

          {/* Text input */}
          <textarea
            ref={inputRef}
            className="chat-input-textarea"
            placeholder={
              isAiFriend
                ? "输入消息... (支持 Markdown，Shift+Enter 换行)"
                : "输入消息... (Shift+Enter 换行)"
            }
            value={inputText}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            rows={1}
          />

          {/* Queue indicator */}
          {agentExecuting && queuedCount > 0 && (
            <span className="send-queue-badge" title={`${queuedCount} 条消息排队中`}>
              {queuedCount}
            </span>
          )}

          {/* Send button */}
          <button
            className={`btn-send ${inputText.trim() ? 'active' : 'disabled'}`}
            onClick={handleSend}
            disabled={!inputText.trim() || isSending}
            title="发送"
          >
            {isSending ? (
              <div className="btn-send-spinner" />
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
              </svg>
            )}
          </button>
        </div>

        {/* Hidden file inputs */}
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          multiple
          onChange={handleFileSelect}
        />
        <input
          ref={imageInputRef}
          type="file"
          className="hidden"
          accept="image/*"
          multiple
          onChange={handleImageSelect}
        />
        <input
          ref={videoInputRef}
          type="file"
          className="hidden"
          accept="video/*"
          onChange={handleVideoSelect}
        />
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <div
          className="context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <div className="context-menu-item" onClick={() => handleForward(contextMenu.message)}>
            ↪️ 转发消息
          </div>
          <div
            className="context-menu-item"
            onClick={() => {
              navigator.clipboard.writeText(contextMenu.message.content);
              setContextMenu(null);
            }}
          >
            📋 复制内容
          </div>
        </div>
      )}

      {/* Forward Message Modal */}
      {forwardMessage && (
        <ForwardMessageModal
          message={forwardMessage}
          onClose={() => setForwardMessage(null)}
        />
      )}
    </div>
  );
};

export default ChatScreen;
