import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useAICQ } from '../context/AICQContext';
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
  const { getTaskPlans, clearTaskPlan, addTaskItem, deleteTaskItem, syncTaskPlan } = useAICQ();
  const [expanded, setExpanded] = useState(true);
  const [expandedPlanId, setExpandedPlanId] = useState<string | null>(null);
  const [addingToPlanId, setAddingToPlanId] = useState<string | null>(null);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<{ planId: string; taskId: string } | null>(null);
  const [syncingPlanId, setSyncingPlanId] = useState<string | null>(null);
  const [showActions, setShowActions] = useState<string | null>(null);
  const [popupStyle, setPopupStyle] = useState<React.CSSProperties>({});
  const addInputRef = useRef<HTMLInputElement>(null);

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

  // Auto-focus input when adding
  useEffect(() => {
    if (addingToPlanId && addInputRef.current) {
      addInputRef.current.focus();
    }
  }, [addingToPlanId]);

  // Close actions popup on outside click or scroll
  useEffect(() => {
    if (!showActions) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.task-action-popup') && !target.closest('.task-item-actions-btn')) {
        setShowActions(null);
        setConfirmDeleteId(null);
      }
    };
    const scrollHandler = () => {
      setShowActions(null);
      setConfirmDeleteId(null);
    };
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handler);
      window.addEventListener('scroll', scrollHandler, true);
    }, 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handler);
      window.removeEventListener('scroll', scrollHandler, true);
    };
  }, [showActions]);

  // Don't render if no plans exist at all
  // (But still render if plans exist with 0 tasks, so user can add tasks)
  if (plans.length === 0) return null;

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

  const handleAddTask = (planId: string) => {
    const title = newTaskTitle.trim();
    if (!title) return;
    addTaskItem(planId, title);
    setNewTaskTitle('');
    setAddingToPlanId(null);
  };

  const handleAddTaskKeyDown = (e: React.KeyboardEvent, planId: string) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddTask(planId);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setAddingToPlanId(null);
      setNewTaskTitle('');
    }
  };

  const handleDeleteTask = (planId: string, taskId: string) => {
    if (confirmDeleteId?.taskId === taskId) {
      deleteTaskItem(planId, taskId);
      setConfirmDeleteId(null);
      setShowActions(null);
    } else {
      setConfirmDeleteId({ planId, taskId });
    }
  };

  const handleSync = (planId: string) => {
    setSyncingPlanId(planId);
    syncTaskPlan(planId, friendId);
    setTimeout(() => setSyncingPlanId(null), 1500);
    setShowActions(null);
  };

  const toggleActions = (taskId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (showActions === taskId) {
      setShowActions(null);
      setConfirmDeleteId(null);
      return;
    }
    setShowActions(taskId);
    setConfirmDeleteId(null);
    // Calculate fixed position from button's bounding rect
    const btn = (e.currentTarget as HTMLElement);
    const rect = btn.getBoundingClientRect();
    setPopupStyle({
      position: 'fixed',
      top: `${rect.bottom + 4}px`,
      right: `${window.innerWidth - rect.right}px`,
    });
  };

  const renderTaskItem = (task: TaskItem, planId: string) => {
    const isConfirmingDelete = confirmDeleteId?.taskId === task.id;
    const canDelete = task.status !== 'in_progress'; // Don't allow deleting in-progress tasks

    return (
      <div
        key={task.id}
        className={`task-progress-item ${task.status} ${task.status === 'in_progress' ? 'active' : ''}`}
      >
        <span className="task-progress-item-icon">{statusIcons[task.status]}</span>
        <span className="task-progress-item-title">{task.title}</span>
        <span className="task-progress-item-status">{statusLabels[task.status]}</span>
        <button
          className="task-item-actions-btn"
          onClick={(e) => toggleActions(task.id, e)}
          title="操作"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <circle cx="12" cy="5" r="2" />
            <circle cx="12" cy="12" r="2" />
            <circle cx="12" cy="19" r="2" />
          </svg>
        </button>
        {/* Actions popup - position:fixed to avoid overflow clipping */}
        {showActions === task.id && (
          <div className="task-action-popup" style={popupStyle}>
            {canDelete && (
              <button
                className={`task-action-item ${isConfirmingDelete ? 'danger-confirm' : ''}`}
                onClick={(e) => {
                  e.stopPropagation();
                  handleDeleteTask(planId, task.id);
                }}
              >
                {isConfirmingDelete ? (
                  <>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 9v4M12 17h.01" strokeLinecap="round" />
                      <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    确认删除？
                  </>
                ) : (
                  <>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    删除任务
                  </>
                )}
              </button>
            )}
            {!canDelete && (
              <span className="task-action-disabled">执行中，无法删除</span>
            )}
          </div>
        )}
      </div>
    );
  };

  const renderAddInput = (planId: string) => {
    if (addingToPlanId !== planId) return null;
    return (
      <div className="task-add-input-row">
        <input
          ref={addInputRef}
          className="task-add-input"
          type="text"
          placeholder="输入新任务名称，回车确认..."
          value={newTaskTitle}
          onChange={(e) => setNewTaskTitle(e.target.value)}
          onKeyDown={(e) => handleAddTaskKeyDown(e, planId)}
          maxLength={200}
        />
        <button
          className="task-add-confirm-btn"
          onClick={() => handleAddTask(planId)}
          disabled={!newTaskTitle.trim()}
          title="确认添加"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <button
          className="task-add-cancel-btn"
          onClick={() => { setAddingToPlanId(null); setNewTaskTitle(''); }}
          title="取消"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
    );
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
                          .map((task) => renderTaskItem(task, plan.id))}
                        {/* Add task button for this plan */}
                        {addingToPlanId !== plan.id && (
                          <button
                            className="task-add-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              setAddingToPlanId(plan.id);
                              setShowActions(null);
                            }}
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <line x1="12" y1="5" x2="12" y2="19" />
                              <line x1="5" y1="12" x2="19" y2="12" />
                            </svg>
                            添加任务
                          </button>
                        )}
                        {renderAddInput(plan.id)}
                        {/* Sync and clear buttons for plan */}
                        <div className="task-plan-actions">
                          <button
                            className={`task-sync-btn ${syncingPlanId === plan.id ? 'syncing' : ''}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSync(plan.id);
                            }}
                            title="同步任务计划到AI"
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M23 4v6h-6M1 20v-6h6" strokeLinecap="round" strokeLinejoin="round" />
                              <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                            {syncingPlanId === plan.id ? '已同步' : '同步到AI'}
                          </button>
                          <button
                            className="task-clear-plan-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              clearTaskPlan(plan.id);
                            }}
                            title="清除整个计划"
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                            清除计划
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          {plans.length <= 1 && (
            <div className="task-progress-steps">
              {sortedTasks.map((task) => {
                const plan = plans[0];
                return renderTaskItem(task, plan.id);
              })}
              {/* Add task button */}
              {addingToPlanId !== plans[0]?.id && (
                <button
                  className="task-add-btn"
                  onClick={() => {
                    setAddingToPlanId(plans[0]?.id || null);
                    setShowActions(null);
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                  添加任务
                </button>
              )}
              {plans[0] && renderAddInput(plans[0].id)}
              {/* Sync and clear buttons */}
              {plans[0] && (
                <div className="task-plan-actions">
                  <button
                    className={`task-sync-btn ${syncingPlanId === plans[0].id ? 'syncing' : ''}`}
                    onClick={() => handleSync(plans[0].id)}
                    title="同步任务计划到AI"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M23 4v6h-6M1 20v-6h6" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    {syncingPlanId === plans[0].id ? '已同步' : '同步到AI'}
                  </button>
                  <button
                    className="task-clear-plan-btn"
                    onClick={() => clearTaskPlan(plans[0].id)}
                    title="清除整个计划"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    清除计划
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default TaskProgressPanel;
