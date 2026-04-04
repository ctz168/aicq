import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';

/**
 * BotMenuPanel - Telegram Bot style command menu for AI chat.
 *
 * Features:
 * - Triggered by clicking the "/" menu button or typing "/" in input
 * - Commands organized in categories
 * - Search/filter support
 * - Keyboard navigation (up/down arrows, Enter to select, Esc to close)
 * - Smooth animations matching Telegram's style
 */

export interface BotCommand {
  /** Command string (e.g. "/help") */
  command: string;
  /** Display description */
  description: string;
  /** Optional parameter hint (e.g. "<text>") */
  paramHint?: string;
  /** Category for grouping */
  category: 'general' | 'ai_tools' | 'content' | 'dev';
}

/** Predefined bot commands */
const DEFAULT_COMMANDS: BotCommand[] = [
  // General
  { command: '/start', description: '开始对话', category: 'general' },
  { command: '/help', description: '查看帮助信息', category: 'general' },
  { command: '/clear', description: '清空当前对话', category: 'general' },
  { command: '/history', description: '查看对话历史摘要', category: 'general' },
  { command: '/settings', description: '对话设置', category: 'general' },

  // AI Tools
  { command: '/translate', description: '翻译文本', paramHint: '<目标语言> <文本>', category: 'ai_tools' },
  { command: '/summarize', description: '总结内容', paramHint: '<文本或URL>', category: 'ai_tools' },
  { command: '/analyze', description: '深度分析', paramHint: '<主题>', category: 'ai_tools' },
  { command: '/compare', description: '对比分析', paramHint: '<A> vs <B>', category: 'ai_tools' },
  { command: '/brainstorm', description: '头脑风暴', paramHint: '<主题>', category: 'ai_tools' },
  { command: '/explain', description: '解释概念', paramHint: '<概念>', category: 'ai_tools' },
  { command: '/rewrite', description: '改写文本', paramHint: '<风格> <文本>', category: 'ai_tools' },
  { command: '/qna', description: '问答模式', paramHint: '<问题>', category: 'ai_tools' },

  // Content Creation
  { command: '/code', description: '生成代码', paramHint: '<语言> <描述>', category: 'content' },
  { command: '/image', description: '生成图片', paramHint: '<描述>', category: 'content' },
  { command: '/write', description: '撰写文章', paramHint: '<主题> <大纲>', category: 'content' },
  { command: '/email', description: '撰写邮件', paramHint: '<收件人> <主题>', category: 'content' },
  { command: '/outline', description: '生成大纲', paramHint: '<主题>', category: 'content' },
  { command: '/table', description: '生成表格', paramHint: '<描述>', category: 'content' },

  // Developer
  { command: '/debug', description: '调试代码', paramHint: '<代码> <错误信息>', category: 'dev' },
  { command: '/review', description: '代码审查', paramHint: '<代码或文件>', category: 'dev' },
  { command: '/test', description: '生成测试用例', paramHint: '<代码>', category: 'dev' },
  { command: '/doc', description: '生成文档', paramHint: '<代码或描述>', category: 'dev' },
  { command: '/sql', description: '生成SQL', paramHint: '<描述>', category: 'dev' },
  { command: '/regex', description: '生成正则表达式', paramHint: '<描述>', category: 'dev' },
];

const CATEGORY_LABELS: Record<string, { label: string; icon: string }> = {
  general: { label: '通用', icon: '💬' },
  ai_tools: { label: 'AI 工具', icon: '🤖' },
  content: { label: '内容创作', icon: '✨' },
  dev: { label: '开发工具', icon: '🔧' },
};

interface BotMenuPanelProps {
  /** Whether the menu is visible */
  isOpen: boolean;
  /** Close the menu */
  onClose: () => void;
  /** Called when a command is selected */
  onSelect: (command: string) => void;
  /** Current input text for filtering (the part after "/") */
  filterText?: string;
  /** Position relative to input (for CSS positioning) */
  position?: 'bottom' | 'top';
}

const BotMenuPanel: React.FC<BotMenuPanelProps> = ({
  isOpen,
  onClose,
  onSelect,
  filterText = '',
  position = 'bottom',
}) => {
  const [activeIndex, setActiveIndex] = useState(0);
  const menuRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
  const scrollIntoViewRef = useRef(false);

  // Filter commands by text
  const filteredCommands = useMemo(() => {
    if (!filterText) return DEFAULT_COMMANDS;
    const query = filterText.toLowerCase();
    return DEFAULT_COMMANDS.filter(
      (cmd) =>
        cmd.command.toLowerCase().includes(query) ||
        cmd.description.toLowerCase().includes(query)
    );
  }, [filterText]);

  // Group by category
  const groupedCommands = useMemo(() => {
    const groups: { category: string; commands: BotCommand[] }[] = [];
    const seen = new Set<string>();
    for (const cmd of filteredCommands) {
      if (!seen.has(cmd.category)) {
        seen.add(cmd.category);
        groups.push({ category: cmd.category, commands: [] });
      }
      groups[groups.length - 1].commands.push(cmd);
    }
    return groups;
  }, [filteredCommands]);

  // Reset active index when filter changes
  useEffect(() => {
    setActiveIndex(0);
    itemRefs.current = [];
  }, [filterText]);

  // Scroll active item into view
  useEffect(() => {
    if (scrollIntoViewRef.current && itemRefs.current[activeIndex]) {
      itemRefs.current[activeIndex]?.scrollIntoView({ block: 'nearest' });
      scrollIntoViewRef.current = false;
    }
  }, [activeIndex]);

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!isOpen) return;

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          e.stopPropagation();
          scrollIntoViewRef.current = true;
          setActiveIndex((prev) => Math.min(prev + 1, filteredCommands.length - 1));
          break;
        case 'ArrowUp':
          e.preventDefault();
          e.stopPropagation();
          scrollIntoViewRef.current = true;
          setActiveIndex((prev) => Math.max(prev - 1, 0));
          break;
        case 'Enter':
          e.preventDefault();
          e.stopPropagation();
          if (filteredCommands[activeIndex]) {
            const cmd = filteredCommands[activeIndex];
            const paramPart = cmd.paramHint ? ` ` : '';
            onSelect(cmd.command + paramPart);
          }
          break;
        case 'Escape':
          e.preventDefault();
          e.stopPropagation();
          onClose();
          break;
      }
    },
    [isOpen, filteredCommands, activeIndex, onSelect, onClose]
  );

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown, true);
      return () => document.removeEventListener('keydown', handleKeyDown, true);
    }
  }, [isOpen, handleKeyDown]);

  // Click outside to close
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        // Don't close if clicking on the textarea or menu button
        const target = e.target as HTMLElement;
        if (
          !target.closest('.bot-menu-trigger') &&
          !target.closest('.chat-input-textarea')
        ) {
          onClose();
        }
      }
    };
    // Use setTimeout to avoid closing immediately after opening
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handler);
    }, 10);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handler);
    };
  }, [isOpen, onClose]);

  const handleSelect = useCallback(
    (cmd: BotCommand) => {
      const paramPart = cmd.paramHint ? ' ' : '';
      onSelect(cmd.command + paramPart);
    },
    [onSelect]
  );

  if (!isOpen) return null;

  let globalIndex = -1;

  return (
    <div
      ref={menuRef}
      className={`bot-menu-panel ${position === 'top' ? 'bot-menu-panel-top' : ''}`}
      style={{ zIndex: 40 }}
    >
      {/* Search bar at top */}
      <div className="bot-menu-search">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <span className="bot-menu-search-text">
          {filterText ? (
            <>
              /<strong>{filterText}</strong>
            </>
          ) : (
            '输入命令名称搜索...'
          )}
        </span>
        <span className="bot-menu-count">{filteredCommands.length}</span>
      </div>

      {/* Command list */}
      <div className="bot-menu-list">
        {groupedCommands.length === 0 ? (
          <div className="bot-menu-empty">
            <span className="bot-menu-empty-icon">🔍</span>
            <span>未找到匹配的命令</span>
          </div>
        ) : (
          groupedCommands.map((group) => (
            <div key={group.category}>
              <div className="bot-menu-category">
                <span className="bot-menu-category-icon">
                  {CATEGORY_LABELS[group.category]?.icon || '📋'}
                </span>
                <span className="bot-menu-category-label">
                  {CATEGORY_LABELS[group.category]?.label || group.category}
                </span>
              </div>
              {group.commands.map((cmd) => {
                globalIndex++;
                const isActive = globalIndex === activeIndex;
                return (
                  <div
                    key={cmd.command}
                    ref={(el) => { itemRefs.current[globalIndex] = el; }}
                    className={`bot-menu-item ${isActive ? 'active' : ''}`}
                    onClick={() => handleSelect(cmd)}
                    onMouseEnter={() => setActiveIndex(globalIndex)}
                  >
                    <div className="bot-menu-item-left">
                      <span className="bot-menu-command">{cmd.command}</span>
                      {cmd.paramHint && (
                        <span className="bot-menu-param">{cmd.paramHint}</span>
                      )}
                    </div>
                    <span className="bot-menu-desc">{cmd.description}</span>
                  </div>
                );
              })}
            </div>
          ))
        )}
      </div>

      {/* Footer hint */}
      <div className="bot-menu-footer">
        <span>↑↓ 选择</span>
        <span>↵ 确认</span>
        <span>Esc 关闭</span>
      </div>
    </div>
  );
};

export default BotMenuPanel;
