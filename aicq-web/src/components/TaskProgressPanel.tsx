import React, { useState, useMemo } from 'react';
import { useAICQ } from '../hooks/useAICQ';
import type { TaskPlan, TaskItem } from '../types';

/** Status icon mapping */
const statusIcons: Record<TaskItem['status'], string> = {
  pending: '⬜',
  in_progress: '🔄',
  completed: '✅',
  failed: '❌',
};

const statusLabels: Record<TaskItem['status'], string> = {
  pending: '待处理',
  in_progress: '进行中',
  completed: '已完成',
  failed: '失败',
};

interface TaskProgressPanelProps {
  friendId: string;
}

const TaskProgressPanel: React.FC<TaskProgressPanelProps> = ({ friendId }) => {
  const { getTaskPlans } = useAICQ();
  const [expanded, setExpanded] = useState(true);

  const plans = useMemo(() => getTaskPlans(friendId), [getTaskPlans, friendId]);

  // Aggregate all task items from all plans for this friend
  const allTasks = useMemo(() => {
    return plans.flatMap((p) => p.tasks);
  }, [plans]);

  const completedCount = useMemo(
    () => allTasks.filter((t) => t.status === 'completed').length,
    [allTasks]
  );

  const totalCount = allTasks.length;

  // Don't render if no tasks exist
  if (totalCount === 0) return null;

  const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  // Find the currently active (in_progress) task
  const activeTask = allTasks.find((t) => t.status === 'in_progress');

  // Sort tasks by order
  const sortedTasks = useMemo(() => {
    return [...allTasks].sort((a, b) => a.order - b.order);
  }, [allTasks]);

  return (
    <div className="task-progress-panel">
      {/* Collapsible Header */}
      <div
        className="task-progress-header"
        onClick={() => setExpanded((prev) => !prev)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setExpanded((prev) => !prev);
          }
        }}
      >
        <div className="task-progress-header-left">
          <span className="task-progress-icon">📋</span>
          <span className="task-progress-title">
            {activeTask ? activeTask.title : '任务计划'}
          </span>
        </div>
        <div className="task-progress-header-right">
          {/* Progress counter: 1/10 */}
          <span className="task-progress-counter">
            {completedCount}/{totalCount}
          </span>
          {/* Progress percentage */}
          <span className={`task-progress-percent ${progressPercent === 100 ? 'done' : ''}`}>
            {progressPercent}%
          </span>
          {/* Expand/collapse arrow */}
          <span className={`task-progress-arrow ${expanded ? 'expanded' : ''}`}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M3 5L6 8L9 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="task-progress-bar-container">
        <div
          className={`task-progress-bar-fill ${progressPercent === 100 ? 'complete' : ''}`}
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      {/* Expanded task list */}
      {expanded && (
        <div className="task-progress-list">
          {sortedTasks.map((task) => (
            <div
              key={task.id}
              className={`task-progress-item ${task.status} ${task.status === 'in_progress' ? 'active' : ''}`}
            >
              <span className="task-progress-item-icon">{statusIcons[task.status]}</span>
              <span className="task-progress-item-title">{task.title}</span>
              <span className="task-progress-item-status">{statusLabels[task.status]}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default TaskProgressPanel;
