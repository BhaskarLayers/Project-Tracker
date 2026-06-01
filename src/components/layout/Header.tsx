import React, { useEffect, useMemo, useState } from 'react';
import { 
  Layout, 
  Download, 
  Share2, 
  ZoomIn, 
  ZoomOut, 
  Search, 
  Bell, 
  Settings, 
  ChevronDown, 
  UserPlus, 
  Star, 
  Cloud,
  RotateCcw,
  RotateCw,
  Columns,
  Layers,
  MousePointer2,
  GitBranch,
  Copy,
  Map,
  BookOpen,
  Grid3X3,
  Users,
  CheckCircle2
} from 'lucide-react';
import { useProjectStore } from '../../store/useProjectStore';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const Header: React.FC = () => {
  const activeProjectId = useProjectStore(state => state.activeProjectId);
  const project = activeProjectId ? useProjectStore(state => state.projects[activeProjectId]) : null;
  const activeView = useProjectStore(state => state.activeView);
  const setActiveView = useProjectStore(state => state.setActiveView);
  const setViewMode = useProjectStore(state => state.setViewMode);
  const phases = useProjectStore(state => state.phases);
  const tasks = useProjectStore(state => state.tasks);

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const [cloud, setCloud] = useState<any>(() => (window as any).__SL_CLOUD ?? null);
  useEffect(() => {
    const handler = (e: any) => setCloud(e.detail);
    window.addEventListener('sl-cloud', handler as any);
    return () => window.removeEventListener('sl-cloud', handler as any);
  }, []);

  const parseEndOfDayMs = (isoDate: string | undefined): number | null => {
    if (!isoDate) return null;
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate.trim());
    if (!m) return null;
    const y = Number(m[1]);
    const mo = Number(m[2]) - 1;
    const d = Number(m[3]);
    const dt = new Date(y, mo, d, 23, 59, 59, 999);
    const ms = dt.getTime();
    return Number.isFinite(ms) ? ms : null;
  };

  const formatCountdown = (msRemaining: number | null) => {
    if (msRemaining === null) return '-';
    const clamped = Math.max(0, msRemaining);
    const totalSeconds = Math.floor(clamped / 1000);
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const hh = String(hours).padStart(2, '0');
    const mm = String(minutes).padStart(2, '0');
    const ss = String(seconds).padStart(2, '0');
    return `${days}d ${hh}h ${mm}m ${ss}s`;
  };

  const stats = useMemo(() => {
    if (!project) {
      return {
        totalSections: 0,
        pendingSections: 0,
        countdown: '-',
        overallCompletedPct: 0,
        overallPendingPct: 0,
        sections: [] as Array<{ id: string; name: string; completed: number; total: number; pct: number }>
      };
    }

    const sections = project.phases
      .map((pid) => phases[pid])
      .filter(Boolean)
      .map((p) => {
        const t = (p.tasks ?? [])
          .map((tid) => tasks[tid])
          .filter(Boolean);
        const total = t.length;
        const completed = total === 0 ? 0 : t.filter((x) => x.status === 'completed' || !!(x.remark && x.remark.trim())).length;
        const pct = total === 0 ? 0 : Math.round((completed / total) * 100);
        return { id: p.id, name: p.name, completed, total, pct };
      });

    const totalSections = sections.length;
    const pendingSections = sections.filter((s) => s.completed < s.total).length;

    const allTasks = project.phases
      .flatMap((pid) => phases[pid]?.tasks ?? [])
      .map((tid) => tasks[tid])
      .filter(Boolean);
    const totalTasks = allTasks.length;
    const completedTasks =
      totalTasks === 0
        ? 0
        : allTasks.filter((x) => x.status === 'completed' || !!(x.remark && x.remark.trim())).length;
    const overallCompletedPct = totalTasks === 0 ? 0 : Math.round((completedTasks / totalTasks) * 100);
    const overallPendingPct = 100 - overallCompletedPct;

    const endMs = parseEndOfDayMs(project.endDate);
    const countdown = formatCountdown(endMs === null ? null : endMs - now);

    return { totalSections, pendingSections, countdown, overallCompletedPct, overallPendingPct, sections };
  }, [project, phases, tasks, now]);

  return (
    <div className="flex flex-col shrink-0 z-20 shadow-sm border-b bg-white">
      {/* Top Main Header */}
      <header className="h-14 flex items-center justify-between px-4 border-b border-gray-100">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-slate-900 rounded-xl flex items-center justify-center shadow-lg shadow-slate-200">
              <Layout className="text-white w-5 h-5" />
            </div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold text-slate-800 tracking-tight">Sarkar Launch</h1>
              <Settings className="w-4 h-4 text-gray-400 cursor-pointer hover:text-gray-600 transition-colors" />
            </div>
          </div>
          
          <nav className="flex items-center gap-1 border-l pl-6 border-gray-100">
            {[
              { id: 'Gantt', icon: Layout },
              { id: 'Data', icon: Grid3X3 },
              { id: 'Board', icon: Layout },
              { id: 'Workload', icon: Users },
              { id: 'Overview', icon: CheckCircle2 }
            ].map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveView(item.id as any)}
                className={`flex items-center gap-2 px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                  activeView === item.id 
                    ? 'text-blue-600 bg-blue-50/50' 
                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                }`}
              >
                <item.icon className={cn("w-4 h-4", activeView === item.id ? "text-blue-600" : "text-gray-400")} />
                {item.id}
                {item.id === 'Gantt' && <Star className="w-3 h-3 fill-yellow-400 text-yellow-400" />}
              </button>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-4">
            <div className="flex flex-col items-end">
              <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Remaining</div>
              <div className="text-[22px] font-extrabold text-slate-900 tabular-nums leading-none">{stats.countdown}</div>
              <div
                className={cn(
                  'mt-0.5 text-[10px] font-bold uppercase tracking-wide',
                  cloud?.enabled === false ? 'text-red-500' : cloud?.lastError ? 'text-red-500' : 'text-gray-400'
                )}
                title={cloud?.lastError ? String(cloud.lastError) : undefined}
              >
                {cloud?.enabled === false
                  ? 'Cloud off'
                  : cloud?.lastError
                    ? 'Cloud error'
                    : cloud?.enabled
                      ? 'Cloud on'
                      : 'Cloud'}
              </div>
            </div>
          </div>

          <div className="w-56">
            <div className="flex items-center justify-between text-[10px] font-bold text-gray-400 uppercase tracking-wide">
              <span>Completed</span>
              <span className="tabular-nums text-slate-700">{stats.overallCompletedPct}%</span>
            </div>
            <div className="mt-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full bg-green-500" style={{ width: `${stats.overallCompletedPct}%` }} />
            </div>
            <div className="mt-1 flex items-center justify-between text-[10px] font-bold text-gray-400 uppercase tracking-wide">
              <span>Pending</span>
              <span className="tabular-nums text-slate-700">{stats.overallPendingPct}%</span>
            </div>
          </div>
        </div>
      </header>

      {/* Secondary Toolbar */}
      <div className="h-10 flex items-center justify-between px-4 bg-white">
        <div className="flex items-center gap-1">
          {[
            { label: 'Export & Share', icon: ChevronDown },
            { label: 'Baselines', icon: ChevronDown },
            { label: 'Options', icon: ChevronDown },
            { label: 'Columns', icon: ChevronDown },
            { label: 'Segments', icon: ChevronDown }
          ].map((item) => (
            <button key={item.label} className="flex items-center gap-1.5 px-3 py-1 text-[11px] font-bold text-gray-600 hover:bg-gray-50 rounded-md transition-all">
              {item.label}
              <item.icon className="w-3 h-3 text-gray-400" />
            </button>
          ))}
          
          <div className="h-4 w-px bg-gray-200 mx-2" />
          
          <div className="flex items-center gap-1">
            <button className="p-1.5 hover:bg-gray-50 rounded text-gray-400"><Cloud className="w-4 h-4" /></button>
            <button className="p-1.5 hover:bg-gray-50 rounded text-gray-400"><RotateCcw className="w-4 h-4" /></button>
            <button className="p-1.5 hover:bg-gray-50 rounded text-gray-400"><RotateCw className="w-4 h-4" /></button>
          </div>
          
          <div className="h-4 w-px bg-gray-200 mx-2" />
          
          <button className="flex items-center gap-1.5 px-3 py-1 text-[11px] font-bold text-slate-800 bg-yellow-400 rounded-md shadow-sm">
            <MousePointer2 className="w-3 h-3" />
            Manual
          </button>
          
          <div className="h-4 w-px bg-gray-200 mx-2" />
          
          <div className="flex items-center gap-0.5">
            <button className="p-1.5 hover:bg-gray-50 rounded text-gray-400"><GitBranch className="w-4 h-4" /></button>
            <button className="p-1.5 hover:bg-gray-50 rounded text-gray-400"><Copy className="w-4 h-4" /></button>
            <button className="p-1.5 hover:bg-gray-50 rounded text-gray-400"><Map className="w-4 h-4" /></button>
            <button className="p-1.5 hover:bg-gray-50 rounded text-gray-400"><BookOpen className="w-4 h-4" /></button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            <Layout className="w-3.5 h-3.5 text-gray-400" />
            <span className="text-[11px] font-bold text-gray-500 uppercase tracking-tight">Scale:</span>
            <select 
              className="text-[11px] font-bold bg-transparent border-none focus:ring-0 cursor-pointer text-gray-800 py-0"
              value={project?.settings.viewMode || 'Day'}
              onChange={(e) => project && setViewMode(project.id, e.target.value as any)}
            >
              <option value="Day">Days</option>
              <option value="Week">Weeks</option>
              <option value="Month">Months</option>
            </select>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Header;
