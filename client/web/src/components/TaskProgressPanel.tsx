import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
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
  const {
    getTaskPlans,
    clearTaskPlan,
    addTaskItem,
    deleteTaskItem,
    syncTaskPlan,
    updateTaskItem,
    createTaskPlan,
    renameTaskItem,
    reorderTaskItem,
  } = useAICQ();

  const state = useAICQ().state;
  const [expanded, setExpanded] = useState(true);
  const [expandedPlanId, setExpandedPlanId] = useState<string | null>(null);
  const [addingToPlanId, setAddingToPlanId] = useState<string | null>(null);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<{ planId: string; taskId: string } | null>(null);
  const [syncingPlanId, setSyncingPlanId] = useState<string | null>(null);
  const [showActions, setShowActions] = useState<string | null>(null);
  const [popupStyle, setPopupStyle] = useState<React.CSSProperties>({});
  const addInputRef = useRef<HTMLInputElement>(null);

  // ─── Create plan state ───────────────────────────────────
  const [isCreatingPlan, setIsCreatingPlan] = useState(false);
  const [planTitle, setPlanTitle] = useState('');
  const [initialTasks, setInitialTasks] = useState<string[]>(['']);
  const planTitleRef = useRef<HTMLInputElement>(null);

  // ─── Edit task title state ────────────────────────────────
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const editInputRef = useRef<HTMLInputElement>(null);

  // ─── Drag state ───────────────────────────────────────────
  const [dragOverTaskId, setDragOverTaskId] = useState<string | null>(null);
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);

  const plans = useMemo(() => getTaskPlans(friendId), [getTaskPlans, friendId]);

  // Get the friend info to check if it's an AI friend
  const friend = useMemo(() => state.friends.find(f => f.id === friendId), [state.friends, friendId]);
  const isAIFriend = friend?.friendType === 'ai';

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

  // Auto-focus edit input
  useEffect(() => {
    if (editingTaskId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingTaskId]);

  // Auto-focus plan title input
  useEffect(() => {
    if (isCreatingPlan && planTitleRef.current) {
      planTitleRef.current.focus();
    }
  }, [isCreatingPlan]);

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

  // ─── Manual plan creation ────────────────────────────────
  const handleCreatePlan = useCallback(() => {
    const title = planTitle.trim();
    if (!title) return;
    const tasks = initialTasks
      .map(t => t.trim())
      .filter(Boolean)
      .map((t, i) => ({
        title: t,
        status: 'pending' as const,
        order: i,
      }));
    if (tasks.length === 0) return;
    const plan = createTaskPlan(friendId, title, tasks);
    setIsCreatingPlan(false);
    setPlanTitle('');
    setInitialTasks(['']);
    setExpanded(true);
    setExpandedPlanId(plan.id);
  }, [planTitle, initialTasks, createTaskPlan, friendId]);

  const handleAddInitialTask = useCallback(() => {
    setInitialTasks(prev => [...prev, '']);
  }, []);

  const handleRemoveInitialTask = useCallback((index: number) => {
    setInitialTasks(prev => {
      if (prev.length <= 1) return prev;
      return prev.filter((_, i) => i !== index);
    });
  }, []);

  const handleUpdateInitialTask = useCallback((index: number, value: string) => {
    setInitialTasks(prev => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  }, []);

  // ─── Status toggle logic ─────────────────────────────────
  const handleStatusToggle = useCallback((planId: string, taskId: string, currentStatus: TaskItem['status']) => {
    let newStatus: TaskItem['status'];
    switch (currentStatus) {
      case 'pending':
        newStatus = 'in_progress';
        break;
      case 'in_progress':
        newStatus = 'completed';
        break;
      case 'completed':
        newStatus = 'pending';
        break;
      case 'failed':
        newStatus = 'pending';
        break;
      default:
        newStatus = 'pending';
    }
    updateTaskItem(planId, taskId, { status: newStatus });
  }, [updateTaskItem]);

  // ─── Edit task title ─────────────────────────────────────
  const startEditingTask = useCallback((taskId: string, currentTitle: string) => {
    setEditingTaskId(taskId);
    setEditingTitle(currentTitle);
    setShowActions(null);
  }, []);

  const saveEditingTask = useCallback((planId: string) => {
    if (editingTaskId && editingTitle.trim()) {
      renameTaskItem(planId, editingTaskId, editingTitle.trim());
    }
    setEditingTaskId(null);
    setEditingTitle('');
  }, [editingTaskId, editingTitle, renameTaskItem]);

  const cancelEditingTask = useCallback(() => {
    setEditingTaskId(null);
    setEditingTitle('');
  }, []);

  // ─── Drag & Drop handlers ────────────────────────────────
  const handleDragStart = useCallback((e: React.DragEvent, taskId: string) => {
    setDraggedTaskId(taskId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', taskId);
    // Add dragging class after a small delay so the ghost image isn't affected
    setTimeout(() => {
      const el = document.querySelector(`[data-task-id="${taskId}"]`);
      if (el) el.classList.add('task-dragging');
    }, 0);
  }, []);

  const handleDragEnd = useCallback((e: React.DragEvent, taskId: string) => {
    setDraggedTaskId(null);
    setDragOverTaskId(null);
    const el = document.querySelector(`[data-task-id="${taskId}"]`);
    if (el) el.classList.remove('task-dragging');
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, taskId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (taskId !== draggedTaskId) {
      setDragOverTaskId(taskId);
    }
  }, [draggedTaskId]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    // Only clear if we're leaving the task item itself
    const target = e.currentTarget as HTMLElement;
    const relatedTarget = e.relatedTarget as HTMLElement;
    if (!target.contains(relatedTarget)) {
      setDragOverTaskId(null);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, planId: string, targetTaskId: string) => {
    e.preventDefault();
    setDragOverTaskId(null);
    if (!draggedTaskId || draggedTaskId === targetTaskId) return;
    // Find the target task's order in the sorted list
    const plan = plans.find(p => p.id === planId);
    if (!plan) return;
    const sortedTasks = [...plan.tasks].sort((a, b) => a.order - b.order);
    const targetIndex = sortedTasks.findIndex(t => t.id === targetTaskId);
    if (targetIndex >= 0) {
      reorderTaskItem(planId, draggedTaskId, targetIndex);
    }
    setDraggedTaskId(null);
  }, [draggedTaskId, plans, reorderTaskItem]);

  // ─── No plans: show create plan button ───────────────────
  if (plans.length === 0 && !isCreatingPlan) {
    if (!isAIFriend) return null;
    return (
      <div className="task-progress-panel task-create-panel">
        <button
          className="task-create-plan-btn"
          onClick={() => setIsCreatingPlan(true)}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          创建任务计划
        </button>
      </div>
    );
  }

  // ─── Creating plan form ──────────────────────────────────
  if (isCreatingPlan) {
    return (
      <div className="task-progress-panel task-create-panel">
        <div className="task-create-form">
          <div className="task-create-form-header">
            <span className="task-create-form-icon">📋</span>
            <span className="task-create-form-title">创建任务计划</span>
          </div>
          <div className="task-create-form-body">
            <input
              ref={planTitleRef}
              className="task-create-title-input"
              type="text"
              placeholder="计划标题..."
              value={planTitle}
              onChange={(e) => setPlanTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleCreatePlan();
                } else if (e.key === 'Escape') {
                  setIsCreatingPlan(false);
                  setPlanTitle('');
                  setInitialTasks(['']);
                }
              }}
              maxLength={100}
            />
            <div className="task-create-initial-tasks">
              <span className="task-create-tasks-label">初始任务列表：</span>
              {initialTasks.map((task, index) => (
                <div key={index} className="task-create-initial-task-row">
                  <span className="task-create-task-index">{index + 1}.</span>
                  <input
                    className="task-create-task-input"
                    type="text"
                    placeholder={`任务 ${index + 1}...`}
                    value={task}
                    onChange={(e) => handleUpdateInitialTask(index, e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddInitialTask();
                      } else if (e.key === 'Escape') {
                        e.preventDefault();
                        setIsCreatingPlan(false);
                        setPlanTitle('');
                        setInitialTasks(['']);
                      }
                    }}
                    maxLength={200}
                  />
                  {initialTasks.length > 1 && (
                    <button
                      className="task-create-task-remove"
                      onClick={() => handleRemoveInitialTask(index)}
                      title="移除"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" />
                      </svg>
                    </button>
                  )}
                </div>
              ))}
              <button className="task-create-add-task" onClick={handleAddInitialTask}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                添加任务
              </button>
            </div>
          </div>
          <div className="task-create-form-footer">
            <button
              className="task-create-cancel"
              onClick={() => {
                setIsCreatingPlan(false);
                setPlanTitle('');
                setInitialTasks(['']);
              }}
            >
              取消
            </button>
            <button
              className="task-create-confirm"
              onClick={handleCreatePlan}
              disabled={!planTitle.trim() || initialTasks.filter(t => t.trim()).length === 0}
            >
              创建计划
            </button>
          </div>
        </div>
      </div>
    );
  }

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
    const isEditing = editingTaskId === task.id;
    const isDragging = draggedTaskId === task.id;
    const isDragOver = dragOverTaskId === task.id && !isDragging;

    return (
      <div
        key={task.id}
        data-task-id={task.id}
        className={`task-progress-item ${task.status} ${task.status === 'in_progress' ? 'active' : ''} ${isDragging ? 'task-dragging' : ''} ${isDragOver ? 'task-drag-over' : ''}`}
        draggable={!!draggedTaskId || false}
        onDragStart={(e) => handleDragStart(e, task.id)}
        onDragEnd={(e) => handleDragEnd(e, task.id)}
        onDragOver={(e) => handleDragOver(e, task.id)}
        onDragLeave={handleDragLeave}
        onDrop={(e) => handleDrop(e, planId, task.id)}
      >
        {/* Drag handle */}
        <span
          className="task-drag-handle"
          title="拖拽排序"
          onMouseDown={() => setDraggedTaskId(task.id)}
          onMouseUp={() => setDraggedTaskId(null)}
        >
          ⠿
        </span>
        {/* Status icon - clickable for toggle */}
        <span
          className="task-progress-item-icon task-status-toggle"
          title="点击切换状态"
          onClick={() => handleStatusToggle(planId, task.id, task.status)}
        >
          {statusIcons[task.status]}
        </span>
        {/* Task title - double-click to edit */}
        {isEditing ? (
          <input
            ref={editInputRef}
            className="task-edit-title-input"
            type="text"
            value={editingTitle}
            onChange={(e) => setEditingTitle(e.target.value)}
            onBlur={() => saveEditingTask(planId)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                saveEditingTask(planId);
              } else if (e.key === 'Escape') {
                e.preventDefault();
                cancelEditingTask();
              }
            }}
            maxLength={200}
          />
        ) : (
          <span
            className="task-progress-item-title"
            title="双击编辑标题"
            onDoubleClick={() => startEditingTask(task.id, task.title)}
          >
            {task.title}
          </span>
        )}
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
            {/* Edit title action */}
            <button
              className="task-action-item"
              onClick={(e) => {
                e.stopPropagation();
                startEditingTask(task.id, task.title);
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              编辑标题
            </button>
            {/* Status toggle actions */}
            {task.status === 'pending' && (
              <button
                className="task-action-item"
                onClick={(e) => {
                  e.stopPropagation();
                  handleStatusToggle(planId, task.id, task.status);
                  setShowActions(null);
                }}
              >
                <span>🔄</span>
                标记为进行中
              </button>
            )}
            {task.status === 'in_progress' && (
              <>
                <button
                  className="task-action-item"
                  onClick={(e) => {
                    e.stopPropagation();
                    updateTaskItem(planId, task.id, { status: 'completed' });
                    setShowActions(null);
                  }}
                >
                  <span>✅</span>
                  标记为已完成
                </button>
                <button
                  className="task-action-item"
                  onClick={(e) => {
                    e.stopPropagation();
                    updateTaskItem(planId, task.id, { status: 'failed' });
                    setShowActions(null);
                  }}
                >
                  <span>❌</span>
                  标记为失败
                </button>
              </>
            )}
            {task.status === 'completed' && (
              <button
                className="task-action-item"
                onClick={(e) => {
                  e.stopPropagation();
                  handleStatusToggle(planId, task.id, task.status);
                  setShowActions(null);
                }}
              >
                <span>⬜</span>
                重置为待处理
              </button>
            )}
            {task.status === 'failed' && (
              <button
                className="task-action-item"
                onClick={(e) => {
                  e.stopPropagation();
                  handleStatusToggle(planId, task.id, task.status);
                  setShowActions(null);
                }}
              >
                <span>⬜</span>
                重置为待处理
              </button>
            )}
            {/* Delete action */}
            {canDelete ? (
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
            ) : (
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
              {/* Create new plan button */}
              <button
                className="task-add-btn task-add-plan-btn"
                onClick={() => setIsCreatingPlan(true)}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                创建新计划
              </button>
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
