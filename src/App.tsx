import React, { useEffect, useLayoutEffect } from 'react';
import Header from './components/layout/Header';
import Sidebar from './components/layout/Sidebar';
import GanttChart from './components/gantt/GanttChart';
import DataView from './components/layout/DataView';
import { useProjectStore } from './store/useProjectStore';
import { Project, Phase, Task } from './types/project';
import { GANTT_HEADER_HEIGHT_PX, GANTT_SUMMARY_BAR_HEIGHT_PX, GANTT_TASK_BAR_HEIGHT_PX, ROW_HEIGHT_PX } from './constants/ui';

const App: React.FC = () => {
  const { setActiveProject, projects, addPhase, addTask, activeView } = useProjectStore();

  useLayoutEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--gantt-row-height', `${ROW_HEIGHT_PX}px`);
    root.style.setProperty('--gantt-header-height', `${GANTT_HEADER_HEIGHT_PX}px`);
    root.style.setProperty('--gantt-task-bar-height', `${GANTT_TASK_BAR_HEIGHT_PX}px`);
    root.style.setProperty('--gantt-summary-bar-height', `${GANTT_SUMMARY_BAR_HEIGHT_PX}px`);
  }, []);

  useEffect(() => {
    // Seed sample data from spreadsheet screenshot if none exists
    if (Object.keys(projects).length === 0) {
      const sampleProjectId = 'proj_001';
      const sampleProject: Project = {
        id: sampleProjectId,
        name: 'Production & Logistics Tracker',
        description: 'Tracker for 100ml production and logistics',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        startDate: '2026-01-25',
        endDate: '2026-06-10',
        phases: [],
        settings: {
          viewMode: 'Week',
          showWeekends: true,
          showDependencies: true,
          showProgress: true
        }
      };

      useProjectStore.setState(state => ({
        projects: { ...state.projects, [sampleProjectId]: sampleProject }
      }));

      // Phase 1: Production (Strategy-ish)
      const phase1: Phase = {
        id: 'phase_001',
        projectId: sampleProjectId,
        name: 'Production (1.x)',
        color: '#f87171', // Reddish
        sortOrder: 0,
        isCollapsed: false,
        tasks: []
      };
      addPhase(sampleProjectId, phase1);

      const tasks1: Task[] = [
        {
          id: 'task_1_1',
          phaseId: 'phase_001',
          sNo: '1.1',
          name: '100ml (Glass Bottle, Cap, Fragrances)',
          startDate: '2026-02-25',
          endDate: '2026-03-17',
          assignee: 'Saquib',
          vendor: 'AGI/Chirag Pack/SKFF...',
          status: 'completed',
          progress: 100,
          remark: 'Completed',
          etaStella: '17th Mar',
          duration: 21,
          isMilestone: false,
          dependencies: [],
          description: '',
          effort: 0,
          effortUnit: 'hours',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        },
        {
          id: 'task_1_2',
          phaseId: 'phase_001',
          sNo: '1.2',
          name: 'IFRA Certification',
          startDate: '2026-02-25',
          endDate: '2026-02-25',
          assignee: 'Saquib',
          vendor: 'SKFF/Iberchem/Firmenich',
          status: 'completed',
          progress: 100,
          remark: 'Completed',
          duration: 1,
          isMilestone: true,
          dependencies: [],
          description: '',
          effort: 0,
          effortUnit: 'hours',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        },
        {
          id: 'task_1_3',
          phaseId: 'phase_001',
          sNo: '1.3',
          name: 'FDA Certification',
          startDate: '2026-01-25',
          endDate: '2026-02-25',
          assignee: 'Saquib',
          vendor: 'Stella',
          status: 'completed',
          progress: 100,
          remark: 'Completed',
          duration: 31,
          isMilestone: false,
          dependencies: [],
          description: '',
          effort: 0,
          effortUnit: 'hours',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      ];

      tasks1.forEach(t => addTask('phase_001', t));

      // Phase 2: Logistics
      const phase2: Phase = {
        id: 'phase_002',
        projectId: sampleProjectId,
        name: 'Logistics-100ml (2.x)',
        color: '#60a5fa', // Blueish
        sortOrder: 1,
        isCollapsed: false,
        tasks: []
      };
      addPhase(sampleProjectId, phase2);

      const tasks2: Task[] = [
        {
          id: 'task_2_1',
          phaseId: 'phase_002',
          sNo: '2.1',
          name: 'DEL- WH (Transportation + GRN + Testing)',
          startDate: '2026-05-23',
          endDate: '2026-05-28',
          assignee: 'Lovekesh',
          vendor: 'Shiprocket (D2C)',
          status: 'pending',
          progress: 0,
          remark: 'The loading will take place on 23rd May.',
          dependencies: ['task_1_1'],
          duration: 5,
          isMilestone: false,
          description: '',
          effort: 0,
          effortUnit: 'hours',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      ];

      tasks2.forEach(t => addTask('phase_002', t));

      setActiveProject(sampleProjectId);
    }
  }, []);

  return (
    <div className="flex flex-col h-screen bg-white font-sans text-gray-900 overflow-hidden">
      <Header />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 flex flex-col overflow-hidden">
          {activeView === 'Gantt' && <GanttChart />}
          {activeView === 'Data' && <DataView />}
          {(activeView !== 'Gantt' && activeView !== 'Data') && (
            <div className="flex-1 flex items-center justify-center bg-gray-50 text-gray-400 italic">
              {activeView} view is coming soon...
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

export default App;
