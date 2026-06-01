import React, { useState } from 'react';
import { 
  ChevronDown, 
  ChevronRight, 
  Plus, 
  CheckCircle2, 
  Circle, 
  Grid3X3,
  Calendar,
  Users,
  PieChart,
  ChevronLeft,
  Search,
  MinusSquare,
  PlusSquare
} from 'lucide-react';
import { useProjectStore } from '../../store/useProjectStore';
import { Task, Phase } from '../../types/project';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { getSummaryDuration, getSummaryEnd, getSummaryStart, normalizeToISODate } from '../../utils/ganttSummary';
import { differenceInCalendarDays, format, isValid, parseISO } from 'date-fns';
import { SIDEBAR_GRID_MIN_WIDTH_PX, SIDEBAR_GRID_TEMPLATE_COLUMNS } from '../../constants/ui';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const Sidebar: React.FC = () => {
  const [hoverTooltip, setHoverTooltip] = useState<{ text: string; x: number; y: number } | null>(null);
  const { 
    activeProjectId, 
    projects, 
    phases, 
    tasks, 
    updatePhase, 
    addTask, 
    addPhase, 
    updateTask,
    expandedTasks,
    toggleExpandTask,
    setAllExpanded
  } = useProjectStore();
  const project = activeProjectId ? projects[activeProjectId] : null;

  if (!project) return <div className="w-[450px] border-r bg-white h-full shrink-0" />;

  const showTooltip = (text: string, x: number, y: number) => {
    setHoverTooltip({
      text,
      x,
      y
    });
  };

  const hideTooltip = () => setHoverTooltip(null);

  const formatShortDate = (iso: string | null) => {
    if (!iso) return '-';
    const d = parseISO(iso);
    if (!isValid(d)) return '-';
    return format(d, 'MMM d');
  };

  // Get all tasks in the project to calculate global indices
  const allTasks = project.phases
    .flatMap(pId => phases[pId]?.tasks.map(tId => tasks[tId]))
    .filter((t): t is Task => !!t);

  // Group children by parentId
  const subTaskMap: Record<string, Task[]> = {};
  allTasks
    .filter(t => !!t.parentId)
    .forEach(t => {
      const pid = t.parentId!;
      if (!subTaskMap[pid]) subTaskMap[pid] = [];
      subTaskMap[pid].push(t);
    });

  const handleToggleStatus = (task: Task) => {
    updateTask(task.id, {
      status: task.status === 'completed' ? 'pending' : 'completed',
      progress: task.status === 'completed' ? 0 : 100
    });
  };

  const handleAddTopLevelTask = (phaseId: string) => {
    const now = new Date().toISOString();
    const today = now.split('T')[0];
    
    const sectionNum = project.phases.indexOf(phaseId) + 1;
    const phaseTopLevelTasks = (phases[phaseId]?.tasks || [])
      .map(tId => tasks[tId])
      .filter((t): t is Task => !!t && !t.parentId);

    const newTask: Task = {
      id: `task-${Date.now()}`,
      phaseId,
      parentId: null,
      name: 'New Task',
      description: '',
      startDate: today,
      endDate: today,
      duration: 1,
      progress: 0,
      status: 'pending',
      isMilestone: false,
      dependencies: [],
      assignee: null,
      vendor: '',
      remark: '',
      sNo: `${sectionNum}.${phaseTopLevelTasks.length + 1}`,
      effort: 0,
      effortUnit: 'hours',
      createdAt: now,
      updatedAt: now,
    };

    addTask(phaseId, newTask);
  };

  const handleAddSubTask = (parentTask: Task, parentSNo: string) => {
    const phaseId = parentTask.phaseId;
    const existingChildren = subTaskMap[parentTask.id] || [];
    const now = new Date().toISOString();
    const today = now.split('T')[0];

    const newTask: Task = {
      id: `task-${Date.now()}`,
      phaseId,
      parentId: parentTask.id,
      name: 'New Sub-task',
      description: '',
      startDate: today,
      endDate: today,
      duration: 1,
      progress: 0,
      status: 'pending',
      isMilestone: false,
      dependencies: [],
      assignee: null,
      vendor: '',
      remark: '',
      sNo: `${parentSNo}.${existingChildren.length + 1}`,
      effort: 0,
      effortUnit: 'hours',
      createdAt: now,
      updatedAt: now,
    };

    addTask(phaseId, newTask);
    // Auto-expand the parent task inside store if collapsed
    if (!expandedTasks[parentTask.id]) {
      toggleExpandTask(parentTask.id);
    }
  };

  const handleAddPhase = () => {
    const newPhaseId = `phase-${Date.now()}`;
    const colors = ['#f87171', '#60a5fa', '#34d399', '#fbbf24', '#a78bfa', '#ec4899'];
    const randomColor = colors[Math.floor(Math.random() * colors.length)];
    
    const newPhase: Phase = {
      id: newPhaseId,
      projectId: project.id,
      name: 'New Section',
      color: randomColor,
      sortOrder: project.phases.length,
      isCollapsed: false,
      tasks: []
    };

    addPhase(project.id, newPhase);
  };

  const gridRowStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: SIDEBAR_GRID_TEMPLATE_COLUMNS,
    alignItems: 'center',
    height: 'var(--gantt-row-height)',
  };

  const getTaskDepth = (task: Task) => {
    let depth = 0;
    let current: Task | undefined = task;
    const seen = new Set<string>();
    while (current?.parentId) {
      if (seen.has(current.id)) break;
      seen.add(current.id);
      const parentId: Task['parentId'] = current.parentId;
      if (typeof parentId !== 'string') break;
      const parentTask: Task | undefined = tasks[parentId];
      if (!parentTask) break;
      depth += 1;
      current = parentTask;
      if (depth > 10) break;
    }
    return depth;
  };

  const formatDurationDays = (task: Pick<Task, 'startDate' | 'endDate'>) => {
    const startIso = normalizeToISODate(task.startDate);
    const endIso = normalizeToISODate(task.endDate);
    if (!startIso || !endIso) return '-';
    const s = parseISO(startIso);
    const e = parseISO(endIso);
    if (!isValid(s) || !isValid(e)) return '-';
    return `${Math.max(1, differenceInCalendarDays(e, s) + 1)}d`;
  };

  const SidebarGridRow: React.FC<{
    className?: string;
    control: React.ReactNode;
    name: React.ReactNode;
    duration: React.ReactNode;
    start: React.ReactNode;
    end: React.ReactNode;
    onClick?: () => void;
    rowHeight?: string;
    dataRowId?: string;
    variant?: 'columnsHeader' | 'phase' | 'task' | 'subtask' | 'actions';
  }> = ({ className, control, name, duration, start, end, onClick, rowHeight, dataRowId, variant = 'task' }) => {
    const metaCellClassName = cn(
      'px-1.5 text-right tabular-nums',
      variant === 'columnsHeader' && 'text-[10px] font-bold text-gray-400 uppercase tracking-wide',
      variant === 'phase' && 'text-[10px] font-bold text-slate-700',
      variant === 'task' && 'text-[8px] font-medium text-slate-600',
      variant === 'subtask' && 'text-[7.5px] font-medium text-slate-500',
      variant === 'actions' && 'text-[8px] font-medium text-slate-500'
    );

    return (
      <div
        onClick={onClick}
        style={rowHeight ? { ...gridRowStyle, height: rowHeight } : gridRowStyle}
        data-row-id={dataRowId}
        className={cn(
          'w-full text-left border-b border-gray-50',
          onClick && 'hover:bg-blue-50/20 transition-colors',
          className
        )}
        role={onClick ? 'button' : undefined}
        tabIndex={onClick ? 0 : undefined}
      >
        <div className="px-2">{control}</div>
        <div className="px-2 min-w-0">{name}</div>
        <div className={metaCellClassName}>{duration}</div>
        <div className={metaCellClassName}>{start}</div>
        <div className={metaCellClassName}>{end}</div>
      </div>
    );
  };

  // Render task item recursively or sequentially with sub-tasks
  const renderTaskItem = (task: Task, sNo: string, isSubTask: boolean, seen: Set<string> = new Set()) => {
    if (seen.has(task.id)) return null;
    seen.add(task.id);
    const children = subTaskMap[task.id] || [];
    const hasChildren = children.length > 0;
    const isExpanded = !!expandedTasks[task.id];

    return (
      <React.Fragment key={task.id}>
        <SidebarGridRow
          className={cn('group', isSubTask && 'bg-slate-50/60')}
          dataRowId={task.id}
          variant={isSubTask ? 'subtask' : 'task'}
          control={
            hasChildren ? (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  toggleExpandTask(task.id);
                }}
                className="w-6 h-6 inline-flex items-center justify-center rounded hover:bg-gray-200 text-slate-500 transition-colors"
              >
                {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              </button>
            ) : (
              <span className={cn('text-[10px] font-medium tabular-nums', isSubTask ? 'text-blue-400' : 'text-gray-300')}>
                {sNo}
              </span>
            )
          }
          name={
            <div className="flex items-center min-w-0 gap-2">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleToggleStatus(task);
                }}
                className="shrink-0 focus:outline-none"
              >
                {task.status === 'completed' ? (
                  <CheckCircle2 className="w-4 h-4 text-green-500 fill-green-50" />
                ) : (
                  <Circle className="w-4 h-4 text-gray-300 group-hover:text-gray-400" />
                )}
              </button>

              <div className="min-w-0 flex-1">
                <div
                  style={{
                    paddingLeft: `${
                      isSubTask ? 12 + getTaskDepth(task) * 12 : 16 + getTaskDepth(task) * 16
                    }px`
                  }}
                  className="min-w-0"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      title={task.name}
                      onMouseEnter={(e) => {
                        const el = e.currentTarget;
                        const isTruncated = el.scrollWidth > el.clientWidth + 1;
                        if (!isTruncated) return;
                        showTooltip(task.name, e.clientX + 12, e.clientY + 12);
                      }}
                      onMouseMove={(e) => {
                        if (!hoverTooltip) return;
                        setHoverTooltip((prev) => (prev ? { ...prev, x: e.clientX + 12, y: e.clientY + 12 } : prev));
                      }}
                      onMouseLeave={() => {
                        hideTooltip();
                      }}
                      className={cn(
                        isSubTask ? 'text-[8.5px] truncate' : 'text-[9px] truncate',
                        task.status === 'completed' ? 'text-gray-400 line-through' : 'text-gray-700 group-hover:text-gray-900',
                        !isSubTask && 'font-semibold',
                        isSubTask && 'font-medium'
                      )}
                    >
                      {task.name}
                    </span>
                    {!isSubTask && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleAddSubTask(task, sNo);
                        }}
                        title="Add sub-task"
                        className="opacity-0 group-hover:opacity-100 transition-opacity px-1.5 py-0.5 rounded text-[10px] font-bold text-blue-600 hover:bg-blue-50"
                      >
                        + sub
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          }
          duration={formatDurationDays(task)}
          start={(() => {
            const iso = normalizeToISODate(task.startDate);
            return formatShortDate(iso);
          })()}
          end={(() => {
            const iso = normalizeToISODate(task.endDate);
            return formatShortDate(iso);
          })()}
        />

        {/* Render child tasks if expanded */}
        {hasChildren && isExpanded && (
          children.map((child, childIndex) => 
            renderTaskItem(child, `${sNo}.${childIndex + 1}`, true, seen)
          )
        )}
      </React.Fragment>
    );
  };

  return (
    <aside className="w-[450px] border-r bg-white h-full flex flex-col overflow-hidden shrink-0 z-10 shadow-sm">
      {/* Sidebar Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b bg-gray-50/50">
        <div className="flex gap-1">
          <button 
            onClick={() => setAllExpanded({})} 
            className="p-1 hover:bg-gray-200 rounded text-gray-500" 
            title="Collapse all"
          >
            <MinusSquare className="w-4 h-4" />
          </button>
          <button 
            onClick={() => {
              const newExpanded: Record<string, boolean> = {};
              allTasks.forEach(t => {
                if (subTaskMap[t.id]?.length > 0) newExpanded[t.id] = true;
              });
              setAllExpanded(newExpanded);
            }} 
            className="p-1 hover:bg-gray-200 rounded text-gray-500" 
            title="Expand all"
          >
            <PlusSquare className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <input 
            type="text" 
            placeholder="Search tasks..." 
            className="w-full pl-7 pr-2 py-1 bg-white border border-gray-200 rounded text-xs focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none"
          />
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-x-auto overflow-y-hidden custom-scrollbar flex flex-col">
        <div className="min-h-0 h-full flex flex-col" style={{ minWidth: `${SIDEBAR_GRID_MIN_WIDTH_PX}px` }}>
          <div className="bg-white border-b border-gray-100">
            <SidebarGridRow
              className="border-b border-gray-100"
              rowHeight="var(--gantt-header-height)"
              dataRowId="sidebar-columns-header"
              variant="columnsHeader"
              control={<span className="text-[10px] font-bold text-gray-400 uppercase"> </span>}
              name={<span className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Task</span>}
              duration={<span className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Duration</span>}
              start={<span className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Start</span>}
              end={<span className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">End</span>}
            />
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden sidebar-scroll-container custom-scrollbar" onScroll={hideTooltip}>
            {project.phases.map((phaseId) => {
              const phase = phases[phaseId];
              if (!phase) return null;

              const phaseAllTasks = phase.tasks
                .map(tId => tasks[tId])
                .filter((t): t is Task => !!t);

              const summaryStart = getSummaryStart(phaseAllTasks);
              const summaryEnd = getSummaryEnd(phaseAllTasks);
              const summaryDuration = getSummaryDuration(phaseAllTasks);

              // Find top-level tasks inside this specific phase
              const phaseTopLevelTasks = phase.tasks
                .map(tId => tasks[tId])
                .filter((t): t is Task => !!t && !t.parentId);

              return (
                <div key={phaseId} className="border-b last:border-b-0">
                  <SidebarGridRow
                    className="bg-slate-100/70"
                    dataRowId={`summary-${phaseId}`}
                    variant="phase"
                    onClick={() => updatePhase(phaseId, { isCollapsed: !phase.isCollapsed })}
                    control={
                      <div className="flex items-center gap-2">
                        <div className="w-1 h-6 rounded-sm" style={{ backgroundColor: phase.color }} />
                        {phase.isCollapsed ? (
                          <ChevronRight className="w-4 h-4 text-gray-600" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-gray-600" />
                        )}
                      </div>
                    }
                    name={
                      <input
                        type="text"
                        value={phase.name}
                        onChange={(e) => updatePhase(phaseId, { name: e.target.value })}
                        onClick={(e) => e.stopPropagation()}
                        className="w-full font-extrabold text-[14px] leading-none text-slate-900 bg-transparent border-none focus:ring-1 focus:ring-blue-500 rounded px-1.5 py-0.5 outline-none tracking-tight"
                        placeholder="Section name..."
                      />
                    }
                    duration={summaryDuration ? `${summaryDuration}d` : '-'}
                    start={formatShortDate(summaryStart)}
                    end={formatShortDate(summaryEnd)}
                  />

                  {!phase.isCollapsed && (
                    <div className="bg-white">
                      {phaseTopLevelTasks.map((task, taskIndex) => {
                        const sectionNum = project.phases.indexOf(phaseId) + 1;
                        const sNo = `${sectionNum}.${taskIndex + 1}`;
                        return renderTaskItem(task, sNo, false, new Set());
                      })}
                      
                      {/* Phase Actions */}
                      <SidebarGridRow
                        className="bg-white"
                        dataRowId={`actions-${phaseId}`}
                        variant="actions"
                        control={<span />}
                        name={
                          <div className="flex items-center gap-2">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleAddTopLevelTask(phaseId);
                              }}
                              className="flex items-center gap-1.5 px-2 py-1 text-[11px] font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 rounded transition-colors"
                            >
                              <Plus className="w-3 h-3" />
                              Add task
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleAddPhase();
                              }}
                              className="flex items-center gap-1.5 px-2 py-1 text-[11px] font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 rounded transition-colors"
                            >
                              <Plus className="w-3 h-3" />
                              Add section
                            </button>
                          </div>
                        }
                        duration={<span />}
                        start={<span />}
                        end={<span />}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Sidebar Footer */}
      <div className="h-12 border-t flex items-center px-4 bg-gray-50/50">
        <div className="flex-1 flex gap-4">
          <button className="p-1.5 hover:bg-gray-200 rounded text-gray-500"><Grid3X3 className="w-5 h-5" /></button>
          <button className="p-1.5 hover:bg-gray-200 rounded text-gray-500"><Calendar className="w-5 h-5" /></button>
          <button className="p-1.5 hover:bg-gray-200 rounded text-gray-500"><Users className="w-5 h-5" /></button>
          <button className="p-1.5 hover:bg-gray-200 rounded text-gray-500"><PieChart className="w-5 h-5" /></button>
        </div>
        <button className="p-1.5 hover:bg-gray-200 rounded text-gray-500"><ChevronLeft className="w-5 h-5" /></button>
      </div>

      {hoverTooltip && (
        <div
          style={{
            position: 'fixed',
            left: `${hoverTooltip.x}px`,
            top: `${hoverTooltip.y}px`,
            transform: 'translateY(-50%)',
            zIndex: 9999,
            pointerEvents: 'none',
          }}
          className="max-w-[420px] whitespace-nowrap overflow-hidden text-ellipsis bg-white border border-gray-200 shadow-sm rounded px-2 py-1 text-[11px] font-semibold text-slate-800"
        >
          {hoverTooltip.text}
        </div>
      )}
    </aside>
  );
};

export default Sidebar;
