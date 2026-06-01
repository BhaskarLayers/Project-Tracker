export type ViewMode = 'Day' | 'Week' | 'Month';

export interface Project {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  startDate: string;
  endDate: string;
  phases: string[]; // Array of Phase IDs
  settings: {
    viewMode: ViewMode;
    showWeekends: boolean;
    showDependencies: boolean;
    showProgress: boolean;
  };
}

export interface Phase {
  id: string;
  projectId: string;
  name: string;
  color: string;
  sortOrder: number;
  isCollapsed: boolean;
  tasks: string[]; // Array of Task IDs
}

export interface Task {
  id: string;
  phaseId: string;
  parentId?: string | null;
  name: string;
  description: string;
  startDate: string;
  endDate: string;
  duration: number;
  progress: number;
  status: 'completed' | 'pending';
  isMilestone: boolean;
  dependencies: string[];
  assignee: string | null;
  vendor?: string;
  launchQty?: string;
  transitDays?: string;
  etaStella?: string;
  remark?: string;
  sNo?: string;
  effort: number;
  effortUnit: 'hours' | 'days';
  createdAt: string;
  updatedAt: string;
}
