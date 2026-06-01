import React, { useEffect, useRef, useState } from 'react';
import { useProjectStore } from '../../store/useProjectStore';
import { Task, Phase } from '../../types/project';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { ROW_HEIGHT_PX } from '../../constants/ui';
import { 
  Plus, 
  Trash2, 
  ChevronDown, 
  ChevronRight, 
  CheckCircle2, 
  Circle,
  FolderPlus
} from 'lucide-react';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const DataView: React.FC = () => {
  const { 
    activeProjectId, 
    projects, 
    phases, 
    tasks, 
    updateProject,
    updateTask, 
    addTask, 
    addPhase, 
    updatePhase,
    deleteTask,
    deletePhase,
    expandedTasks,
    toggleExpandTask 
  } = useProjectStore();

  const project = activeProjectId ? projects[activeProjectId] : null;
  const isSyncingScrollRef = useRef<'sidebar' | 'data' | null>(null);

  if (!project) return null;

  const handleUpdateProject = (field: 'startDate' | 'endDate', value: string) => {
    updateProject(project.id, { [field]: value } as any);
  };

  useEffect(() => {
    const sidebar = document.querySelector('.sidebar-scroll-container') as HTMLElement | null;
    const data = document.querySelector('.data-scroll-container') as HTMLElement | null;

    if (!sidebar || !data) return;

    const onSidebarScroll = () => {
      if (isSyncingScrollRef.current === 'data') return;
      isSyncingScrollRef.current = 'sidebar';
      data.scrollTop = sidebar.scrollTop;
      requestAnimationFrame(() => {
        isSyncingScrollRef.current = null;
      });
    };

    const onDataScroll = () => {
      if (isSyncingScrollRef.current === 'sidebar') return;
      isSyncingScrollRef.current = 'data';
      sidebar.scrollTop = data.scrollTop;
      requestAnimationFrame(() => {
        isSyncingScrollRef.current = null;
      });
    };

    sidebar.addEventListener('scroll', onSidebarScroll);
    data.addEventListener('scroll', onDataScroll);

    return () => {
      sidebar.removeEventListener('scroll', onSidebarScroll);
      data.removeEventListener('scroll', onDataScroll);
    };
  }, [project.id]);

  // Get all tasks in correct sequential order of phases to calculate global S.Nos
  const allTasks = project.phases
    .flatMap(pId => phases[pId]?.tasks.map(tId => tasks[tId]))
    .filter((t): t is Task => !!t);

  const topLevelTasks = allTasks.filter(t => !t.parentId);

  // Map of parentId -> children
  const subTaskMap: Record<string, Task[]> = {};
  allTasks
    .filter(t => !!t.parentId)
    .forEach(t => {
      const pid = t.parentId!;
      if (!subTaskMap[pid]) subTaskMap[pid] = [];
      subTaskMap[pid].push(t);
    });

  const handleUpdate = (taskId: string, field: keyof Task, value: any) => {
    updateTask(taskId, { [field]: value });
  };

  // Add a top-level task in a specific phase
  const handleAddTask = (phaseId: string) => {
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

  // Add a sub-task under a parent task
  const handleAddSubRow = (parentTask: Task, parentSNo: string) => {
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
    // Auto expand the parent task in store if collapsed
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

  const handleToggleStatus = (task: Task) => {
    updateTask(task.id, {
      status: task.status === 'completed' ? 'pending' : 'completed',
      progress: task.status === 'completed' ? 0 : 100
    });
  };

  // Render a single row (parent or sub-task)
  const renderRow = (task: Task, sNo: string, isSubTask: boolean) => {
    const children = subTaskMap[task.id] || [];
    const hasChildren = children.length > 0;
    const isExpanded = !!expandedTasks[task.id];

    return (
      <tr
        key={task.id}
        className={cn(
          'hover:bg-blue-50/30 transition-colors group',
          isSubTask && 'bg-slate-50/50'
        )}
        style={{ height: 'var(--gantt-row-height)' }}
      >
        {/* S.No / Toggle sub-list */}
        <td className="px-4 py-0 border-r text-xs font-medium text-center whitespace-nowrap w-12 align-middle">
          {hasChildren ? (
            <button
              onClick={() => toggleExpandTask(task.id)}
              className="w-5 h-5 inline-flex items-center justify-center rounded hover:bg-slate-200 text-slate-500 font-bold transition-all"
            >
              {isExpanded ? '-' : '+'}
            </button>
          ) : (
            <span className={cn(isSubTask ? 'text-blue-400' : 'text-gray-400')}>
              {sNo}
            </span>
          )}
        </td>

        {/* Task Name Column - Incorporating + Sub-task and Delete Actions on Hover */}
        <td className="px-4 py-0 border-r min-w-[320px] align-middle">
          <div className="flex items-center gap-1.5 w-full" style={{ height: 'var(--gantt-row-height)' }}>
            {isSubTask && (
              <span className="text-blue-300 text-xs flex-shrink-0 select-none">↳</span>
            )}
            
            <button 
              onClick={() => handleToggleStatus(task)}
              className="shrink-0 focus:outline-none"
            >
              {task.status === 'completed' ? (
                <CheckCircle2 className="w-4 h-4 text-green-500 fill-green-50" />
              ) : (
                <Circle className="w-4 h-4 text-gray-300 hover:text-gray-400" />
              )}
            </button>

            <input
              type="text"
              value={task.name}
              onChange={e => handleUpdate(task.id, 'name', e.target.value)}
              className={cn(
                'flex-1 bg-transparent border-none focus:ring-1 focus:ring-blue-500 rounded px-1.5 py-0.5 text-xs outline-none',
                task.status === 'completed' && 'text-gray-400 line-through',
                isSubTask ? 'text-slate-600' : 'font-semibold text-slate-700'
              )}
              placeholder="Task name..."
            />

            {/* Quick Actions (Add Sub-task & Delete Task) right where they are typing! */}
            <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 ml-2 transition-opacity shrink-0">
              {!isSubTask && (
                <button
                  onClick={() => handleAddSubRow(task, sNo)}
                  className="p-1 text-blue-600 hover:bg-blue-100 border border-blue-200 rounded transition-all"
                  title="Add sub-task"
                >
                  <Plus className="w-3 h-3" />
                </button>
              )}
              <button
                onClick={() => deleteTask(task.id)}
                className="p-1 text-red-500 hover:bg-red-50 border border-red-200 rounded transition-all"
                title="Delete task"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          </div>
        </td>

        {/* Owner */}
        <td className="px-4 py-0 border-r min-w-[120px] align-middle">
          <input
            type="text"
            value={task.assignee || ''}
            onChange={e => handleUpdate(task.id, 'assignee', e.target.value)}
            className="w-full bg-transparent border-none focus:ring-1 focus:ring-blue-500 rounded px-1 py-0.5 text-xs text-slate-600 outline-none"
            placeholder="Set owner..."
          />
        </td>

        {/* Dependencies */}
        <td className="px-4 py-0 border-r min-w-[130px] align-middle">
          <input
            type="text"
            value={task.dependencies.join(', ')}
            onChange={e =>
              handleUpdate(task.id, 'dependencies', e.target.value.split(',').map(s => s.trim()))
            }
            className="w-full bg-transparent border-none focus:ring-1 focus:ring-blue-500 rounded px-1 py-0.5 text-xs text-slate-500 outline-none"
            placeholder="e.g. task_id1"
          />
        </td>

        {/* Vendor */}
        <td className="px-4 py-0 border-r min-w-[120px] align-middle">
          <input
            type="text"
            value={task.vendor || ''}
            onChange={e => handleUpdate(task.id, 'vendor', e.target.value)}
            className="w-full bg-transparent border-none focus:ring-1 focus:ring-blue-500 rounded px-1 py-0.5 text-xs text-slate-500 outline-none"
            placeholder="Set vendor..."
          />
        </td>

        {/* Start Date */}
        <td className="px-4 py-0 border-r min-w-[140px] text-center align-middle">
          <input
            type="date"
            value={task.startDate}
            onChange={e => handleUpdate(task.id, 'startDate', e.target.value)}
            className="w-full bg-transparent border-none focus:ring-1 focus:ring-blue-500 rounded px-1 py-0.5 text-xs text-slate-600 outline-none text-center tabular-nums"
          />
        </td>

        {/* End Date */}
        <td className="px-4 py-0 border-r min-w-[140px] text-center align-middle">
          <input
            type="date"
            value={task.endDate}
            onChange={e => handleUpdate(task.id, 'endDate', e.target.value)}
            className="w-full bg-transparent border-none focus:ring-1 focus:ring-blue-500 rounded px-1 py-0.5 text-xs text-slate-600 outline-none text-center tabular-nums"
          />
        </td>

        {/* Status / Remark */}
        <td className="px-4 py-0 align-middle">
          <input
            type="text"
            value={task.remark || ''}
            onChange={e => handleUpdate(task.id, 'remark', e.target.value)}
            className="w-full bg-transparent border-none focus:ring-1 focus:ring-blue-500 rounded px-1 py-0.5 text-xs text-slate-600 italic outline-none"
            placeholder="Add remarks..."
          />
        </td>
      </tr>
    );
  };

  return (
    <div className="flex-1 bg-white overflow-auto custom-scrollbar flex flex-col justify-between h-full data-scroll-container">
      <div className="px-4 py-3 border-b bg-white">
        <div className="flex items-center gap-4">
          <div className="text-[11px] font-bold text-gray-500 uppercase tracking-wide">Project Dates</div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold text-slate-600">Start</span>
            <input
              type="date"
              value={project.startDate}
              onChange={(e) => handleUpdateProject('startDate', e.target.value)}
              className="bg-transparent border border-gray-200 rounded px-2 py-1 text-[11px] font-bold text-slate-700 focus:ring-1 focus:ring-blue-500 outline-none"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold text-slate-600">End</span>
            <input
              type="date"
              value={project.endDate}
              onChange={(e) => handleUpdateProject('endDate', e.target.value)}
              className="bg-transparent border border-gray-200 rounded px-2 py-1 text-[11px] font-bold text-slate-700 focus:ring-1 focus:ring-blue-500 outline-none"
            />
          </div>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left">
          <thead className="sticky top-0 bg-gray-50 z-20 border-b border-gray-200 shadow-sm">
            <tr>
              <th className="px-4 py-3 text-[11px] font-bold text-gray-500 uppercase tracking-wider border-r w-12 text-center">S.No</th>
              <th className="px-4 py-3 text-[11px] font-bold text-gray-500 uppercase tracking-wider border-r min-w-[320px]">Particular (Task)</th>
              <th className="px-4 py-3 text-[11px] font-bold text-gray-500 uppercase tracking-wider border-r min-w-[120px]">Owner</th>
              <th className="px-4 py-3 text-[11px] font-bold text-gray-500 uppercase tracking-wider border-r min-w-[130px]">Dependencies</th>
              <th className="px-4 py-3 text-[11px] font-bold text-gray-500 uppercase tracking-wider border-r min-w-[120px]">Vendor</th>
              <th className="px-4 py-3 text-[11px] font-bold text-gray-500 uppercase tracking-wider border-r min-w-[140px] text-center">Start Date</th>
              <th className="px-4 py-3 text-[11px] font-bold text-gray-500 uppercase tracking-wider border-r min-w-[140px] text-center">End Date</th>
              <th className="px-4 py-3 text-[11px] font-bold text-gray-500 uppercase tracking-wider min-w-[250px]">Status / Remark</th>
            </tr>
          </thead>

          {project.phases.map((phaseId) => {
            const phase = phases[phaseId];
            if (!phase) return null;

            // Fetch tasks inside this phase
            const phaseTopLevelTasks = phase.tasks
              .map(tId => tasks[tId])
              .filter((t): t is Task => !!t && !t.parentId);

            return (
              <tbody 
                key={phaseId} 
                className="divide-y divide-gray-100 border-b border-gray-200"
              >
                {/* Phase/Section Header Row */}
                <tr 
                  className="bg-slate-50/70 hover:bg-slate-100/50 transition-colors group"
                  style={{ borderLeft: `4px solid ${phase.color}` }}
                >
                  <td colSpan={8} className="px-3 py-0 align-middle" style={{ height: 'var(--gantt-row-height)' }}>
                    <div className="flex items-center justify-between w-full" style={{ height: 'var(--gantt-row-height)' }}>
                      <div className="flex items-center gap-2">
                        {/* Expand/Collapse Phase */}
                        <button
                          onClick={() => updatePhase(phaseId, { isCollapsed: !phase.isCollapsed })}
                          className="w-5 h-5 flex items-center justify-center rounded hover:bg-slate-200 text-slate-500"
                        >
                          {phase.isCollapsed ? (
                            <ChevronRight className="w-4 h-4" />
                          ) : (
                            <ChevronDown className="w-4 h-4" />
                          )}
                        </button>

                        {/* Editable Phase Name Input */}
                        <input
                          type="text"
                          value={phase.name}
                          onChange={(e) => updatePhase(phaseId, { name: e.target.value })}
                          className="font-bold text-[12.5px] text-slate-800 bg-transparent border-none focus:ring-1 focus:ring-blue-500 rounded px-1.5 py-0.5 outline-none w-64"
                          placeholder="Section name..."
                        />

                        {/* Task Count Badge */}
                        <span className="text-[10px] bg-slate-200/60 text-slate-600 px-2 py-0.5 rounded-full font-bold">
                          {phase.tasks.length} {phase.tasks.length === 1 ? 'task' : 'tasks'}
                        </span>
                      </div>

                      {/* Delete Section Button on Hover */}
                      <button
                        onClick={() => deletePhase(phaseId)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity p-1 text-red-500 hover:bg-red-50 rounded border border-red-100"
                        title="Delete entire section"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>

                {/* Task rows belonging to this phase */}
                {!phase.isCollapsed && phaseTopLevelTasks.map((task, taskIndex) => {
                  const sectionNum = project.phases.indexOf(phaseId) + 1;
                  const sNo = `${sectionNum}.${taskIndex + 1}`;
                  const children = subTaskMap[task.id] || [];
                  const isExpanded = !!expandedTasks[task.id];

                  return (
                    <React.Fragment key={task.id}>
                      {/* Parent Task Row */}
                      {renderRow(task, sNo, false)}

                      {/* Sub-task Rows */}
                      {isExpanded && children.map((child, childIndex) =>
                        renderRow(child, `${sNo}.${childIndex + 1}`, true)
                      )}
                    </React.Fragment>
                  );
                })}

                {/* Inline Quick Add Task for this specific Phase */}
                {!phase.isCollapsed && (
                  <tr className="bg-white" style={{ height: 'var(--gantt-row-height)' }}>
                    <td colSpan={8} className="px-8 py-0 align-middle">
                      <div className="flex items-center gap-2" style={{ height: 'var(--gantt-row-height)' }}>
                        <button
                          onClick={() => handleAddTask(phaseId)}
                          className="flex items-center gap-1.5 px-2 py-1 text-[11px] font-bold text-blue-500 bg-blue-50 hover:bg-blue-100 rounded transition-all"
                        >
                          <Plus className="w-3 h-3" />
                          Add task
                        </button>
                        <button
                          onClick={handleAddPhase}
                          className="flex items-center gap-1.5 px-2 py-1 text-[11px] font-bold text-blue-500 bg-blue-50 hover:bg-blue-100 rounded transition-all"
                        >
                          <Plus className="w-3 h-3" />
                          Add section
                        </button>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            );
          })}
        </table>
      </div>

      {/* Global Add Section Button at the bottom of Grid */}
      <div className="p-4 bg-slate-50 border-t flex justify-start sticky bottom-0 z-10">
        <button
          onClick={handleAddPhase}
          className="flex items-center gap-2 px-4 py-2 text-xs font-bold text-blue-600 bg-blue-50/80 hover:bg-blue-100 border border-dashed border-blue-300 hover:border-blue-400 rounded-lg shadow-sm transition-all"
        >
          <FolderPlus className="w-4 h-4 text-blue-500" />
          Add new section...
        </button>
      </div>
    </div>
  );
};

export default DataView;
