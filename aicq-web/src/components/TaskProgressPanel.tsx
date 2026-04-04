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
  const { getTaskPlans, clearTaskPlan } = useAICQ();
  const [expanded, setExpanded] = useState(true);
  const [expandedPlanId, setExpandedPlanId] = useState<string | null>(null);

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

  const isAllDone = progressPercent === 100;

  const togglePlan = (planId: string) => {
    setExpandedPlanId((prev) => (prev === planId ? null : planId));
  };

  return (
    <div className={`task-progress-panel ${isAllDone ? 'all-done' : ''}`}>
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
          <span className="task-progress-icon">{isAllDone ? '🎉' : '📋'}</span>
          <span className="task-progress-title">
            {activeTask ? activeTask.title : isAllDone ? '任务全部完成' : '任务计划'}
          </span>
        </div>
        <div className="task-progress-header-right">
          {/* Progress counter: 1/10 */}
          <span className="task-progress-counter">
            {completedCount}/{totalCount}
          </span>
          {/* Progress percentage */}
          <span className={`task-progress-percent ${isAllDone ? 'done' : ''}`}>
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
          className={`task-progress-bar-fill ${isAllDone ? 'complete' : ''}`}
          style={{ width: `${progressPercent}%` }}
        >
          {!isAllDone && (
            <div className="task-progress-bar-glow" />
          )}
        </div>
      </div>

      {/* Expanded task list */}
      {expanded && (
        <div className="task-progress-list">
          {plans.length > 1 && (
            <div className="task-progress-plan-group">
              {plans.map((plan) => {
                const planCompleted = plan.tasks.filter(t => t.status === 'completed').length;
                const planTotal = plan.tasks.length;
                const planPercent = planTotal > 0 ? Math.round((planCompleted / planTotal) * 100) : 0;

                return (
                  <div key={plan.id} className="task-progress-plan-item">
                    <div
                      className="task-progress-plan-header"
                      onClick={() => togglePlan(plan.id)}
                    >
                      <span className="task-progress-plan-title">{plan.title}</span>
                      <div className="task-progress-plan-meta">
                        <span className="task-progress-counter">{planCompleted}/{planTotal}</span>
                        <span className={`task-progress-percent ${planPercent === 100 ? 'done' : ''}`}>
                          {planPercent}%
                        </span>
                        <span className={`task-progress-arrow ${expandedPlanId === plan.id ? 'expanded' : ''}`}>
                          <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                            <path d="M3 5L6 8L9 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </span>
                      </div>
                    </div>
                    {/* Mini progress bar for plan */}
                    <div className="task-progress-bar-container mini">
                      <div
                        className={`task-progress-bar-fill ${planPercent === 100 ? 'complete' : ''}`}
                        style={{ width: `${planPercent}%` }}
                      />
                    </div>
                    {expandedPlanId === plan.id && (
                      <div className="task-progress-steps">
                        {[...plan.tasks]
                          .sort((a, b) => a.order - b.order)
                          .map((task) => (
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
              })}
            </div>
          )}
          {plans.length <= 1 && (
            <div className="task-progress-steps">
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
      )}
    </div>
  );
};

export default TaskProgressPanel;
