import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Project, Phase, Task, ViewMode } from '../types/project';

interface ProjectState {
  projects: Record<string, Project>;
  phases: Record<string, Phase>;
  tasks: Record<string, Task>;
  activeProjectId: string | null;
  activeView: 'Gantt' | 'Board' | 'Workload' | 'Overview' | 'Data';
  
  // Actions
  setActiveProject: (id: string) => void;
  setActiveView: (view: 'Gantt' | 'Board' | 'Workload' | 'Overview' | 'Data') => void;
  updateProject: (projectId: string, updates: Partial<Project>) => void;
  updateTask: (taskId: string, updates: Partial<Task>) => void;
  updatePhase: (phaseId: string, updates: Partial<Phase>) => void;
  setViewMode: (projectId: string, mode: ViewMode) => void;
  addTask: (phaseId: string, task: Task) => void;
  addPhase: (projectId: string, phase: Phase) => void;
  deleteTask: (taskId: string) => void;
  deletePhase: (phaseId: string) => void;
  expandedTasks: Record<string, boolean>;
  toggleExpandTask: (taskId: string) => void;
  setAllExpanded: (expanded: Record<string, boolean>) => void;
}

export const useProjectStore = create<ProjectState>()(
  persist(
    (set) => ({
      projects: {},
      phases: {},
      tasks: {},
      activeProjectId: null,
      activeView: 'Gantt',
      expandedTasks: {},

      setActiveProject: (id) => set({ activeProjectId: id }),
      
      setActiveView: (view) => set({ activeView: view }),

      updateProject: (projectId, updates) =>
        set((state) => ({
          projects: {
            ...state.projects,
            [projectId]: {
              ...state.projects[projectId],
              ...updates,
              updatedAt: new Date().toISOString()
            }
          }
        })),

      updateTask: (taskId, updates) => 
        set((state) => ({
          tasks: {
            ...state.tasks,
            [taskId]: { ...state.tasks[taskId], ...updates, updatedAt: new Date().toISOString() }
          }
        })),

      updatePhase: (phaseId, updates) =>
        set((state) => ({
          phases: {
            ...state.phases,
            [phaseId]: { ...state.phases[phaseId], ...updates }
          }
        })),

      setViewMode: (projectId, mode) =>
        set((state) => ({
          projects: {
            ...state.projects,
            [projectId]: {
              ...state.projects[projectId],
              settings: { ...state.projects[projectId].settings, viewMode: mode }
            }
          }
        })),

      addTask: (phaseId, task) =>
        set((state) => ({
          tasks: { ...state.tasks, [task.id]: task },
          phases: {
            ...state.phases,
            [phaseId]: {
              ...state.phases[phaseId],
              tasks: [...state.phases[phaseId].tasks, task.id]
            }
          }
        })),

      addPhase: (projectId, phase) =>
        set((state) => ({
          phases: { ...state.phases, [phase.id]: phase },
          projects: {
            ...state.projects,
            [projectId]: {
              ...state.projects[projectId],
              phases: [...state.projects[projectId].phases, phase.id]
            }
          }
        })),

      deleteTask: (taskId) =>
        set((state) => {
          const taskToDelete = state.tasks[taskId];
          if (!taskToDelete) return state;

          const nextTasks = { ...state.tasks };
          delete nextTasks[taskId];

          // Also delete any sub-tasks that have this parentId
          Object.keys(nextTasks).forEach(tId => {
            if (nextTasks[tId].parentId === taskId) {
              delete nextTasks[tId];
            }
          });

          // Remove task from phase.tasks
          const phaseId = taskToDelete.phaseId;
          const nextPhases = { ...state.phases };
          if (nextPhases[phaseId]) {
            nextPhases[phaseId] = {
              ...nextPhases[phaseId],
              tasks: nextPhases[phaseId].tasks.filter(tId => tId !== taskId)
            };
          }

          return { tasks: nextTasks, phases: nextPhases };
        }),

      deletePhase: (phaseId) =>
        set((state) => {
          const phaseToDelete = state.phases[phaseId];
          if (!phaseToDelete) return state;

          const nextPhases = { ...state.phases };
          delete nextPhases[phaseId];

          const nextTasks = { ...state.tasks };
          // Delete all tasks associated with this phase
          phaseToDelete.tasks.forEach(tId => {
            delete nextTasks[tId];
          });

          // Remove phase from project.phases
          const projectId = phaseToDelete.projectId;
          const nextProjects = { ...state.projects };
          if (nextProjects[projectId]) {
            nextProjects[projectId] = {
              ...nextProjects[projectId],
              phases: nextProjects[projectId].phases.filter(pId => pId !== phaseId)
            };
          }

          return { projects: nextProjects, phases: nextPhases, tasks: nextTasks };
        }),

      toggleExpandTask: (taskId) =>
        set((state) => ({
          expandedTasks: {
            ...state.expandedTasks,
            [taskId]: !state.expandedTasks[taskId]
          }
        })),

      setAllExpanded: (expanded) =>
        set(() => ({ expandedTasks: expanded })),
    }),
    {
      name: 'antigravity-storage',
    }
  )
);
