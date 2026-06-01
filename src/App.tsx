import React, { useEffect, useLayoutEffect, useRef } from 'react';
import Header from './components/layout/Header';
import Sidebar from './components/layout/Sidebar';
import GanttChart from './components/gantt/GanttChart';
import DataView from './components/layout/DataView';
import { useProjectStore } from './store/useProjectStore';
import { Project, Phase, Task } from './types/project';
import { GANTT_HEADER_HEIGHT_PX, GANTT_SUMMARY_BAR_HEIGHT_PX, GANTT_TASK_BAR_HEIGHT_PX, ROW_HEIGHT_PX } from './constants/ui';

const App: React.FC = () => {
  const { setActiveProject, projects, addPhase, addTask, activeView } = useProjectStore();
  const didInitSyncRef = useRef(false);
  const didResolveRemoteStateRef = useRef(false);
  const hasSupabaseSyncRef = useRef(false);

  useLayoutEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--gantt-row-height', `${ROW_HEIGHT_PX}px`);
    root.style.setProperty('--gantt-header-height', `${GANTT_HEADER_HEIGHT_PX}px`);
    root.style.setProperty('--gantt-task-bar-height', `${GANTT_TASK_BAR_HEIGHT_PX}px`);
    root.style.setProperty('--gantt-summary-bar-height', `${GANTT_SUMMARY_BAR_HEIGHT_PX}px`);
  }, []);

  useEffect(() => {
    if (didInitSyncRef.current) return;
    didInitSyncRef.current = true;

    const env: any = (import.meta as any).env ?? {};
    const SUPABASE_URL: string | undefined = env.VITE_SUPABASE_URL;
    const SUPABASE_ANON_KEY: string | undefined = env.VITE_SUPABASE_ANON_KEY;
    const setCloud = (patch: any) => {
      const w: any = window as any;
      const prev = w.__SL_CLOUD ?? {};
      w.__SL_CLOUD = { ...prev, ...patch };
      window.dispatchEvent(new CustomEvent('sl-cloud', { detail: w.__SL_CLOUD }));
    };

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      setCloud({ enabled: false, reason: 'missing-env' });
      return;
    }
    hasSupabaseSyncRef.current = true;

    const base = SUPABASE_URL.replace(/\/+$/, '');
    const workspaceTableUrl = `${base}/rest/v1/workspaces`;
    const localStorageKey = 'sarkar-launch-workspace-id';

    const headers = {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
    };

    const getShareUrl = (id: string) => {
      const url = new URL(window.location.href);
      url.searchParams.set('w', id);
      return url.toString();
    };

    const getWorkspaceId = () => {
      const url = new URL(window.location.href);
      const fromQuery = url.searchParams.get('w');
      if (fromQuery && fromQuery.trim()) return fromQuery.trim();
      const fromLocal = window.localStorage.getItem(localStorageKey);
      if (fromLocal && fromLocal.trim()) return fromLocal.trim();
      const id = (crypto as any).randomUUID ? (crypto as any).randomUUID() : `w_${Date.now()}_${Math.random().toString(16).slice(2)}`;
      return id;
    };

    const setWorkspaceId = (id: string) => {
      window.localStorage.setItem(localStorageKey, id);
      const url = new URL(window.location.href);
      if (url.searchParams.get('w') !== id) {
        url.searchParams.set('w', id);
        window.history.replaceState({}, '', url.toString());
      }
    };

    const exportStoreState = () => {
      const s: any = useProjectStore.getState();
      return {
        projects: s.projects,
        phases: s.phases,
        tasks: s.tasks,
        activeProjectId: s.activeProjectId,
        activeView: s.activeView,
        expandedTasks: s.expandedTasks,
      };
    };

    const applyStoreState = (data: any) => {
      if (!data || typeof data !== 'object') return;
      const next: any = {};
      if (data.projects && typeof data.projects === 'object') next.projects = data.projects;
      if (data.phases && typeof data.phases === 'object') next.phases = data.phases;
      if (data.tasks && typeof data.tasks === 'object') next.tasks = data.tasks;
      if (typeof data.activeProjectId === 'string' || data.activeProjectId === null) next.activeProjectId = data.activeProjectId;
      if (typeof data.activeView === 'string') next.activeView = data.activeView;
      if (data.expandedTasks && typeof data.expandedTasks === 'object') next.expandedTasks = data.expandedTasks;
      useProjectStore.setState(next, false);
    };

    const fetchWorkspace = async (id: string) => {
      const url = `${workspaceTableUrl}?id=eq.${encodeURIComponent(id)}&select=data`;
      const res = await fetch(url, { headers });
      if (!res.ok) return null;
      const json = await res.json();
      if (!Array.isArray(json) || json.length === 0) return null;
      return json[0]?.data ?? null;
    };

    const upsertWorkspace = async (id: string, data: any) => {
      const body = JSON.stringify([{ id, data, updated_at: new Date().toISOString() }]);
      const res = await fetch(workspaceTableUrl, {
        method: 'POST',
        headers: {
          ...headers,
          Prefer: 'resolution=merge-duplicates,return=representation',
        },
        body,
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        throw new Error(`Supabase upsert failed: ${res.status} ${txt}`);
      }
    };

    const patchWorkspace = async (id: string, data: any) => {
      const url = `${workspaceTableUrl}?id=eq.${encodeURIComponent(id)}`;
      const body = JSON.stringify({ data, updated_at: new Date().toISOString() });
      const res = await fetch(url, { method: 'PATCH', headers, body });
      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        throw new Error(`Supabase patch failed: ${res.status} ${txt}`);
      }
    };

    let workspaceId = getWorkspaceId();
    setWorkspaceId(workspaceId);
    setCloud({ enabled: true, workspaceId, lastError: null, lastSyncAt: null, phase: 'init' });

    let suppressSave = false;
    let lastSaved = '';
    let saveTimer: number | null = null;

    const saveNow = async (reason: string) => {
      try {
        const data = exportStoreState();
        const json = JSON.stringify(data);
        lastSaved = json;
        await upsertWorkspace(workspaceId, data);
        setCloud({ lastSyncAt: new Date().toISOString(), lastError: null, phase: `saved:${reason}` });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(e);
        setCloud({ lastError: msg, phase: `save-error:${reason}` });
      }
    };

    (window as any).__SL_SYNC_NOW = () => saveNow('manual');
    (window as any).__SL_SHARE_URL = () => getShareUrl(workspaceId);

    const scheduleSave = () => {
      if (suppressSave) return;
      if (saveTimer) window.clearTimeout(saveTimer);
      saveTimer = window.setTimeout(async () => {
        saveTimer = null;
        try {
          const data = exportStoreState();
          const json = JSON.stringify(data);
          if (json === lastSaved) return;
          lastSaved = json;
          await patchWorkspace(workspaceId, data);
          setCloud({ lastSyncAt: new Date().toISOString(), lastError: null, phase: 'saved' });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          console.error(e);
          setCloud({ lastError: msg, phase: 'save-error' });
        }
      }, 900);
    };

    (async () => {
      try {
        setCloud({ phase: 'loading' });
        const remote = await fetchWorkspace(workspaceId);
        if (remote) {
          suppressSave = true;
          applyStoreState(remote);
          suppressSave = false;
          lastSaved = JSON.stringify(exportStoreState());
          setCloud({ lastSyncAt: new Date().toISOString(), lastError: null, phase: 'loaded' });
        } else {
          await upsertWorkspace(workspaceId, exportStoreState());
          lastSaved = JSON.stringify(exportStoreState());
          setCloud({ lastSyncAt: new Date().toISOString(), lastError: null, phase: 'created' });
        }
        didResolveRemoteStateRef.current = true;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(e);
        setCloud({ lastError: msg, phase: 'load-error' });
        didResolveRemoteStateRef.current = true;
      }
    })();

    const unsub = useProjectStore.subscribe(() => scheduleSave());
    return () => {
      unsub();
      if (saveTimer) window.clearTimeout(saveTimer);
    };
  }, []);

  useEffect(() => {
    if (hasSupabaseSyncRef.current && !didResolveRemoteStateRef.current) return;
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
