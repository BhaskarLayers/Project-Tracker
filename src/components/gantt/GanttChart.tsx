import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import Gantt from 'frappe-gantt';
import 'frappe-gantt/dist/frappe-gantt.css';
import { useProjectStore } from '../../store/useProjectStore';
import { getSummaryEnd, getSummaryStart, normalizeToISODate } from '../../utils/ganttSummary';
import type { Task } from '../../types/project';
import { GANTT_HEADER_HEIGHT_PX, GANTT_SUMMARY_BAR_HEIGHT_PX, GANTT_TASK_BAR_HEIGHT_PX, ROW_HEIGHT_PX } from '../../constants/ui';

const GanttChart: React.FC = () => {
  const HEADER_HEIGHT = GANTT_HEADER_HEIGHT_PX;
  const ROW_HEIGHT = ROW_HEIGHT_PX;
  const TASK_BAR_HEIGHT = GANTT_TASK_BAR_HEIGHT_PX;
  const TASK_ROW_PADDING_PX = Math.max(0, ROW_HEIGHT - TASK_BAR_HEIGHT);
  const ganttRef = useRef<HTMLDivElement>(null);
  const ganttHeaderRef = useRef<HTMLDivElement>(null);
  const ganttBodyScrollRef = useRef<HTMLDivElement>(null);
  const ganttHeaderSvgRef = useRef<SVGSVGElement | null>(null);
  const ganttInnerScrollRef = useRef<HTMLElement | null>(null);
  const ganttInnerScrollHandlerRef = useRef<(() => void) | null>(null);
  const barMutationObserverRef = useRef<MutationObserver | null>(null);
  const todayTimerRef = useRef<number | null>(null);
  const lastTodayKeyRef = useRef<string>('');
  const ganttInstance = useRef<any>(null);
  const lastProjectIdRef = useRef<string | null>(null);
  const didInitialScrollToTodayRef = useRef(false);
  const lastTaskIdsHashRef = useRef<string>('');
  const [panelTopSpacerPx, setPanelTopSpacerPx] = useState(0);
  const headerMutationObserverRef = useRef<MutationObserver | null>(null);
  const headerSyncRafRef = useRef<number | null>(null);
  const headerRetryCountRef = useRef(0);
  
  const { activeProjectId, projects, phases, tasks, updateTask, expandedTasks } = useProjectStore();
  const project = activeProjectId ? projects[activeProjectId] : null;

  const getTimelineScrollEl = () =>
    (ganttRef.current?.querySelector('.gantt-container') as HTMLElement | null) ?? null;

  // Event listener to synchronize scroll between Sidebar and Gantt Chart
  useEffect(() => {
    const sidebar = document.querySelector('.sidebar-scroll-container') as HTMLElement | null;
    if (!sidebar) return;

    let timelineEl: HTMLElement | null = null;
    let detach: (() => void) | null = null;

    const attach = () => {
      const next = getTimelineScrollEl();
      if (!next) return;
      if (timelineEl === next) return;

      detach?.();
      timelineEl = next;

      let isSyncing: 'sidebar' | 'gantt' | null = null;

      const getMaxCommonScrollTop = () => {
        const sidebarMax = Math.max(0, sidebar.scrollHeight - sidebar.clientHeight);
        const timelineMax = Math.max(0, timelineEl!.scrollHeight - timelineEl!.clientHeight);
        return Math.min(sidebarMax, timelineMax);
      };

      const clampScrollTop = (v: number) => {
        const max = getMaxCommonScrollTop();
        if (!Number.isFinite(v)) return 0;
        if (v < 0) return 0;
        if (v > max) return max;
        return v;
      };

      const handleSidebarScroll = () => {
        if (isSyncing === 'gantt') return;
        isSyncing = 'sidebar';
        const nextTop = clampScrollTop(sidebar.scrollTop);
        if (sidebar.scrollTop !== nextTop) sidebar.scrollTop = nextTop;
        timelineEl!.scrollTop = nextTop;
        requestAnimationFrame(() => {
          isSyncing = null;
        });
      };

      const handleGanttScroll = () => {
        if (isSyncing === 'sidebar') return;
        isSyncing = 'gantt';
        const nextTop = clampScrollTop(timelineEl!.scrollTop);
        if (timelineEl!.scrollTop !== nextTop) timelineEl!.scrollTop = nextTop;
        sidebar.scrollTop = nextTop;
        requestAnimationFrame(() => {
          isSyncing = null;
        });
      };

      requestAnimationFrame(() => handleSidebarScroll());

      sidebar.addEventListener('scroll', handleSidebarScroll);
      timelineEl.addEventListener('scroll', handleGanttScroll);

      detach = () => {
        sidebar.removeEventListener('scroll', handleSidebarScroll);
        timelineEl?.removeEventListener('scroll', handleGanttScroll);
      };
    };

    attach();

    const host = ganttRef.current;
    const observer = host ? new MutationObserver(() => attach()) : null;
    if (host && observer) observer.observe(host, { childList: true, subtree: true });

    return () => {
      observer?.disconnect();
      detach?.();
      detach = null;
      timelineEl = null;
    };
  }, [project?.id]);

  useLayoutEffect(() => {
    if (!project) return;
    const sidebarBody = document.querySelector<HTMLElement>('.sidebar-scroll-container');
    const timelineBody = ganttBodyScrollRef.current;
    if (!sidebarBody || !timelineBody) return;

    const measure = () => {
      const sidebarBodyTop = sidebarBody.getBoundingClientRect().top;
      const timelineBodyTop = timelineBody.getBoundingClientRect().top;
      const delta = sidebarBodyTop - timelineBodyTop;
      if (!Number.isFinite(delta)) return;
      const next = delta > 0 ? Math.round(delta * 2) / 2 : 0;
      setPanelTopSpacerPx((prev) => (Math.abs(prev - next) > 0.25 ? next : prev));
    };

    measure();
    window.addEventListener('resize', measure, { passive: true });
    return () => {
      window.removeEventListener('resize', measure);
    };
  }, [project?.id, project?.settings?.viewMode]);

  useEffect(() => {
    return () => {
      barMutationObserverRef.current?.disconnect();
      barMutationObserverRef.current = null;
      headerMutationObserverRef.current?.disconnect();
      headerMutationObserverRef.current = null;
      if (headerSyncRafRef.current) {
        window.cancelAnimationFrame(headerSyncRafRef.current);
        headerSyncRafRef.current = null;
      }

      const prevEl = ganttInnerScrollRef.current;
      const prevHandler = ganttInnerScrollHandlerRef.current;
      if (prevEl && prevHandler) prevEl.removeEventListener('scroll', prevHandler);
      ganttInnerScrollHandlerRef.current = null;
      ganttInnerScrollRef.current = null;

      if (todayTimerRef.current) {
        window.clearInterval(todayTimerRef.current);
        todayTimerRef.current = null;
      }
    };
  }, [project?.id]);

  useEffect(() => {
    const ganttBody = ganttBodyScrollRef.current;
    if (!ganttBody) return;

    return () => {
      barMutationObserverRef.current?.disconnect();
      barMutationObserverRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!ganttRef.current || !project) return;

    if (lastProjectIdRef.current !== project.id) {
      lastProjectIdRef.current = project.id;
      didInitialScrollToTodayRef.current = false;
      lastTaskIdsHashRef.current = '';
    }

    const defaultDate = new Date().toISOString().split('T')[0];
    const projectStart = normalizeToISODate(project.startDate) ?? defaultDate;

    const clampRange = (startIso: string, endIso: string) => {
      const s = Date.parse(startIso);
      const e = Date.parse(endIso);
      if (!Number.isFinite(s) || !Number.isFinite(e)) return { start: startIso, end: endIso };
      if (e < s) return { start: startIso, end: startIso };
      return { start: startIso, end: endIso };
    };

    // Build flat array of visible Gantt tasks including dummy spacer rows for Headers and Actions
    const ganttTasks: any[] = [];

    const allTasks = project.phases
      .flatMap((pId) => phases[pId]?.tasks.map((tId) => tasks[tId]) ?? [])
      .filter((t): t is Task => !!t);

    const subTaskMap: Record<string, Task[]> = {};
    allTasks
      .filter((t) => !!t.parentId)
      .forEach((t) => {
        const pid = t.parentId as string;
        if (!subTaskMap[pid]) subTaskMap[pid] = [];
        subTaskMap[pid].push(t);
      });

    project.phases.forEach(phaseId => {
      const phase = phases[phaseId];
      if (!phase) return;

      // Find first and last task dates in this phase to anchor dummy tasks nicely, or fallback to today
      const phaseTasks = phase.tasks
        .map(tId => tasks[tId])
        .filter((t): t is Task => !!t)
        .map((t) => {
          const startIso = normalizeToISODate(t.startDate);
          const endIso = normalizeToISODate(t.endDate);
          if (!startIso || !endIso) return t;
          const fixed = clampRange(startIso, endIso);
          if (fixed.start === startIso && fixed.end === endIso) return t;
          return { ...t, startDate: fixed.start, endDate: fixed.end };
        });

      const minDate = getSummaryStart(phaseTasks) ?? projectStart;
      const maxDate = getSummaryEnd(phaseTasks) ?? minDate;
      const fixedSummary = clampRange(minDate, maxDate);

      // 1. SUMMARY ROW representing the Phase header on the left
      ganttTasks.push({
        id: `summary-${phaseId}`,
        type: 'summary',
        name: phase.name,
        start: fixedSummary.start,
        end: fixedSummary.end,
        progress: 0,
        dependencies: '',
        custom_class: `gantt-summary gantt-task-${phaseId}`
      });

      const pushTaskRecursive = (task: Task, depth: number) => {
        const start = normalizeToISODate(task.startDate) ?? projectStart;
        const end = normalizeToISODate(task.endDate) ?? start;
        const fixed = clampRange(start, end);
        const isCompleted = task.status === 'completed' || !!(task.remark && task.remark.trim());
        const isMilestone = task.isMilestone || fixed.start === fixed.end;

        ganttTasks.push({
          id: task.id,
          name: task.name,
          start: fixed.start,
          end: fixed.end,
          progress: task.progress,
          dependencies: task.dependencies.join(', '),
          custom_class: `gantt-task-${phaseId}${depth > 0 ? ` gantt-subtask-row gantt-depth-${depth}` : ''}${
            isCompleted ? ' gantt-task-completed' : ''
          }${isMilestone ? ' milestone' : ''}`
        });

        if (!expandedTasks[task.id]) return;

        const children = subTaskMap[task.id] ?? [];
        if (children.length === 0) return;

        const seen = new Set<string>();
        const walk = (parent: Task, d: number) => {
          if (seen.has(parent.id)) return;
          seen.add(parent.id);
          const kids = subTaskMap[parent.id] ?? [];
          kids.forEach((child) => {
            const childStart = normalizeToISODate(child.startDate) ?? projectStart;
            const childEnd = normalizeToISODate(child.endDate) ?? childStart;
            const fixedChild = clampRange(childStart, childEnd);
            const childCompleted = child.status === 'completed' || !!(child.remark && child.remark.trim());
            const childIsMilestone = child.isMilestone || fixedChild.start === fixedChild.end;

            ganttTasks.push({
              id: child.id,
              name: child.name,
              start: fixedChild.start,
              end: fixedChild.end,
              progress: child.progress,
              dependencies: child.dependencies.join(', '),
              custom_class: `gantt-task-${phaseId} gantt-subtask-row gantt-depth-${d}${
                childCompleted ? ' gantt-task-completed' : ''
              }${childIsMilestone ? ' milestone' : ''}`
            });

            if (expandedTasks[child.id]) walk(child, d + 1);
          });
        };

        walk(task, depth + 1);
      };

      // If phase is expanded, render visible tasks
      if (!phase.isCollapsed) {
        // Separate top level tasks in this phase
        const topLevel = phase.tasks
          .map(tId => tasks[tId])
          .filter((t): t is Task => !!t && !t.parentId);

        topLevel.forEach((task) => pushTaskRecursive(task, 0));

        // 2. DUMMY ACTION ROW representing "+ Add task / section" buttons
        ganttTasks.push({
          id: `actions-${phaseId}`,
          name: '',
          start: fixedSummary.end,
          end: fixedSummary.end,
          progress: 0,
          dependencies: '',
          custom_class: `gantt-dummy-row gantt-dummy-actions gantt-task-${phaseId}`
        });
      }
    });

    if (ganttTasks.length === 0) {
      if (ganttInstance.current) {
        if (ganttRef.current) ganttRef.current.innerHTML = '';
        ganttInstance.current = null;
      }
      return;
    }

    const nextTaskIdsHash = ganttTasks.map(t => String(t.id)).join('|');
    const prevScrollTop = getTimelineScrollEl()?.scrollTop ?? 0;
    const prevInnerScrollLeft = ganttInnerScrollRef.current?.scrollLeft ?? 0;

    const rebuildStickyHeader = () => {
      if (!ganttRef.current || !ganttHeaderRef.current || !ganttBodyScrollRef.current) return;

      const mainSvg = ganttRef.current.querySelector('svg') as SVGSVGElement | null;
      if (!mainSvg) return;

      mainSvg.style.display = 'block';
      mainSvg.style.marginTop = '0px';

      const headerGroups = Array.from(mainSvg.querySelectorAll<SVGGElement>('g.date, g.upper-header, g.lower-header'));
      const hasHeaderText = headerGroups.some((g) => g.querySelector('text'));
      if (headerGroups.length === 0 || !hasHeaderText) {
        headerRetryCountRef.current += 1;
        if (headerRetryCountRef.current <= 240) {
          requestAnimationFrame(() => rebuildStickyHeader());
        }
        return;
      }
      headerRetryCountRef.current = 0;

      const headerHost = ganttHeaderRef.current;
      headerHost.innerHTML = '';

      const headerSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      headerSvg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      headerSvg.setAttribute('class', 'gantt');
      headerSvg.setAttribute('data-view-mode', project.settings.viewMode);
      headerSvg.setAttribute('height', String(HEADER_HEIGHT));

      const instance: any = ganttInstance.current;
      const datesCount: number = Array.isArray(instance?.dates) ? instance.dates.length : 0;
      const columnWidth: number = typeof instance?.options?.column_width === 'number' ? instance.options.column_width : 30;
      const parseViewBoxWidth = (svg: SVGSVGElement): number | null => {
        const vb = svg.getAttribute('viewBox');
        if (!vb) return null;
        const parts = vb.trim().split(/\s+/).map(Number);
        if (parts.length !== 4) return null;
        const w = parts[2];
        return Number.isFinite(w) && w > 0 ? w : null;
      };

      const gridWidthFromDates = Math.max(0, datesCount * columnWidth);
      const gridWidthFromViewBox = parseViewBoxWidth(mainSvg) ?? null;
      const gridWidthFromBBox = (() => {
        try {
          const w = mainSvg.getBBox().width;
          return Number.isFinite(w) && w > 0 ? w : null;
        } catch {
          return null;
        }
      })();

      const gridWidth = gridWidthFromDates || gridWidthFromViewBox || gridWidthFromBBox || 0;
      if (gridWidth > 0) {
        headerSvg.setAttribute('viewBox', `0 0 ${gridWidth} ${HEADER_HEIGHT}`);
        headerSvg.setAttribute('width', String(gridWidth));
        headerSvg.setAttribute('preserveAspectRatio', 'xMinYMin meet');
        headerSvg.style.width = `${gridWidth}px`;
      }
      headerSvg.style.display = 'block';

      const headerContent = document.createElementNS('http://www.w3.org/2000/svg', 'g');

      headerGroups.forEach((g) => headerContent.appendChild(g.cloneNode(true)));
      headerSvg.appendChild(headerContent);

      const headerRect = mainSvg.querySelector<SVGRectElement>('rect.grid-header');
      const hideOriginalHeader = () => {
        headerGroups.forEach((g) => {
          g.style.display = 'none';
        });
        if (headerRect) headerRect.style.display = 'none';
      };

      const showOriginalHeader = () => {
        headerGroups.forEach((g) => {
          g.style.display = '';
        });
        if (headerRect) headerRect.style.display = '';
      };

      const fitHeaderContent = () => {
        const paddingTop = 2;
        const paddingBottom = 2;
        const available = Math.max(0, HEADER_HEIGHT - paddingTop - paddingBottom);
        const bbox = headerContent.getBBox();
        if (!Number.isFinite(bbox.y) || !Number.isFinite(bbox.height) || bbox.height <= 0) return;

        if (bbox.height <= available) {
          const targetY = paddingTop + (available - bbox.height) / 2;
          const ty = targetY - bbox.y;
          headerContent.setAttribute('transform', `translate(0, ${ty})`);
          return;
        }

        const scaleY = available / bbox.height;
        const targetY = paddingTop;
        const ty = targetY - bbox.y * scaleY;
        headerContent.setAttribute('transform', `translate(0, ${ty}) scale(1, ${scaleY})`);
      };

      const translateBodyLayersUp = () => {
        const shiftY = -(HEADER_HEIGHT + TASK_ROW_PADDING_PX / 2);
        const applyShift = (g: SVGGElement) => {
          const base = g.getAttribute('data-base-transform') ?? g.getAttribute('transform') ?? '';
          if (!g.hasAttribute('data-base-transform')) g.setAttribute('data-base-transform', base);
          const next = `translate(0, ${shiftY})${base ? ` ${base}` : ''}`.trim();
          g.setAttribute('transform', next);
        };

        const isHeaderGroup = (g: SVGGElement) =>
          g.classList.contains('date') || g.classList.contains('upper-header') || g.classList.contains('lower-header');

        const topLevelGroups = Array.from(mainSvg.querySelectorAll<SVGGElement>(':scope > g'));
        const candidates = (topLevelGroups.length > 0 ? topLevelGroups : Array.from(mainSvg.querySelectorAll<SVGGElement>('g')))
          .filter((g) => !isHeaderGroup(g));

        candidates.forEach(applyShift);
      };

      translateBodyLayersUp();

      const scrollLeft = ganttInnerScrollRef.current?.scrollLeft ?? 0;
      headerSvg.style.transform = `translateX(${-scrollLeft}px)`;

      const attachTodayBadge = () => {
        const instance: any = ganttInstance.current;
        if (!instance) return;

        headerSvg.querySelectorAll('.today-badge').forEach((n) => n.remove());

        const getTodayX = (): number | null => {
          const ganttStart: Date | undefined = instance?.gantt_start;
          const stepHours: number | undefined = instance?.options?.step;
          const columnWidth: number | undefined = instance?.options?.column_width;
          const mode: string | undefined = instance?.options?.view_mode;
          if (!ganttStart || typeof columnWidth !== 'number' || typeof stepHours !== 'number') return null;

          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const diffMs = today.getTime() - ganttStart.getTime();
          const diffHours = diffMs / (1000 * 60 * 60);

          if (mode === 'Month') {
            const diffDays = diffMs / (1000 * 60 * 60 * 24);
            return (diffDays * columnWidth) / 30;
          }

          return (diffHours / stepHours) * columnWidth;
        };

        const x = getTodayX();
        if (x === null || !Number.isFinite(x)) return;

        const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        g.setAttribute('class', 'today-badge');
        g.setAttribute('pointer-events', 'none');

        const badgeText = 'TODAY';
        const paddingY = 2;
        const fontSize = 10;
        const badgeHeight = fontSize + paddingY * 2;
        const badgeWidth = 36;
        const y = 6;
        const rx = 4;

        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.setAttribute('x', String(x - badgeWidth / 2));
        rect.setAttribute('y', String(y));
        rect.setAttribute('width', String(badgeWidth));
        rect.setAttribute('height', String(badgeHeight));
        rect.setAttribute('rx', String(rx));
        rect.setAttribute('ry', String(rx));
        rect.setAttribute('fill', '#f59e0b');
        rect.setAttribute('opacity', '0.95');

        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.textContent = badgeText;
        text.setAttribute('x', String(x));
        text.setAttribute('y', String(y + paddingY + fontSize - 1));
        text.setAttribute('fill', '#ffffff');
        text.setAttribute('font-size', String(fontSize));
        text.setAttribute('font-weight', '600');
        text.setAttribute('text-anchor', 'middle');

        g.appendChild(rect);
        g.appendChild(text);
        headerSvg.appendChild(g);
      };

      attachTodayBadge();
      headerHost.appendChild(headerSvg);
      ganttHeaderSvgRef.current = headerSvg;

      const scheduleHeaderFit = () => {
        requestAnimationFrame(() => {
          try {
            fitHeaderContent();
            const bbox = headerContent.getBBox();
            const ok = Number.isFinite(bbox.height) && bbox.height > 0 && Number.isFinite(bbox.width) && bbox.width > 0;
            if (ok) {
              hideOriginalHeader();
            } else {
              showOriginalHeader();
            }
          } catch {
            showOriginalHeader();
          }
        });
      };

      scheduleHeaderFit();
      const fonts: any = (document as any).fonts;
      if (fonts?.ready && typeof fonts.ready.then === 'function') {
        fonts.ready.then(() => scheduleHeaderFit()).catch(() => {});
      }
    };

    const decorateTimelineBands = () => {
      const instance: any = ganttInstance.current;
      if (!ganttRef.current || !instance) return;
      const svg = ganttRef.current.querySelector('svg');
      if (!svg) return;

      const gridLayer = svg.querySelector<SVGGElement>('g.grid');
      if (!gridLayer) return;

      gridLayer.querySelectorAll('.timeline-bands').forEach((n) => n.remove());

      const heightAttr = svg.getAttribute('height');
      const svgHeight = heightAttr ? Number(heightAttr) : NaN;
      const totalHeight = Number.isFinite(svgHeight) ? svgHeight : svg.getBBox().height;

      const headerHeight = instance?.options?.header_height ?? HEADER_HEIGHT;
      const y = headerHeight;
      const h = Math.max(0, totalHeight - headerHeight);

      const dates: Date[] = instance?.dates || [];
      const columnWidth: number = instance?.options?.column_width ?? 30;
      const mode: string = instance?.options?.view_mode ?? 'Day';
      if (dates.length === 0 || !Number.isFinite(columnWidth)) return;

      const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      group.setAttribute('class', 'timeline-bands');

      const makeRect = (x: number, width: number, cls: string) => {
        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.setAttribute('x', String(x));
        rect.setAttribute('y', String(y));
        rect.setAttribute('width', String(width));
        rect.setAttribute('height', String(h));
        rect.setAttribute('class', cls);
        group.appendChild(rect);
      };

      if (mode === 'Week') {
        for (let i = 0; i < dates.length; i++) {
          makeRect(i * columnWidth, columnWidth, i % 2 === 0 ? 'timeline-band-a' : 'timeline-band-b');
        }
      } else if (mode === 'Month') {
        for (let i = 0; i < dates.length; i++) {
          makeRect(i * columnWidth, columnWidth, i % 2 === 0 ? 'timeline-band-a' : 'timeline-band-b');
        }
      } else {
        const bandCols = 7;
        const bandWidth = bandCols * columnWidth;
        const bands = Math.ceil(dates.length / bandCols);
        for (let b = 0; b < bands; b++) {
          makeRect(b * bandWidth, bandWidth, b % 2 === 0 ? 'timeline-band-a' : 'timeline-band-b');
        }
      }

      const first = gridLayer.firstChild;
      if (first && first.nextSibling) {
        gridLayer.insertBefore(group, first.nextSibling);
      } else {
        gridLayer.insertBefore(group, first);
      }
    };

    const decorateTodayIndicator = () => {
      const instance: any = ganttInstance.current;
      if (!ganttRef.current || !instance) return;
      const svg = ganttRef.current.querySelector('svg');
      if (!svg) return;

      const gridLayer = svg.querySelector<SVGGElement>('g.grid');
      if (!gridLayer) return;

      gridLayer.querySelectorAll('.today-indicator').forEach((n) => n.remove());

      const ganttStart: Date | undefined = instance?.gantt_start;
      const stepHours: number | undefined = instance?.options?.step;
      const columnWidth: number | undefined = instance?.options?.column_width;
      const headerHeight: number = instance?.options?.header_height ?? HEADER_HEIGHT;
      const mode: string = instance?.options?.view_mode ?? 'Day';
      if (!ganttStart || typeof columnWidth !== 'number' || typeof stepHours !== 'number') return;

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const diffMs = today.getTime() - ganttStart.getTime();
      const diffHours = diffMs / (1000 * 60 * 60);

      let x = (diffHours / stepHours) * columnWidth;
      if (mode === 'Month') {
        const diffDays = diffMs / (1000 * 60 * 60 * 24);
        x = (diffDays * columnWidth) / 30;
      }

      if (!Number.isFinite(x)) return;

      const heightAttr = svg.getAttribute('height');
      const svgHeight = heightAttr ? Number(heightAttr) : NaN;
      const totalHeight = Number.isFinite(svgHeight) ? svgHeight : svg.getBBox().height;
      const y1 = headerHeight;
      const y2 = totalHeight;

      const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      group.setAttribute('class', 'today-indicator');
      group.setAttribute('pointer-events', 'none');

      if (mode === 'Day') {
        const tint = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        tint.setAttribute('x', String(x));
        tint.setAttribute('y', String(y1));
        tint.setAttribute('width', String(columnWidth));
        tint.setAttribute('height', String(Math.max(0, y2 - y1)));
        tint.setAttribute('fill', 'rgba(245,158,11,0.06)');
        tint.setAttribute('class', 'today-tint');
        group.appendChild(tint);
      }

      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', String(x));
      line.setAttribute('x2', String(x));
      line.setAttribute('y1', String(y1));
      line.setAttribute('y2', String(y2));
      line.setAttribute('stroke', '#f59e0b');
      line.setAttribute('stroke-width', '2');
      line.setAttribute('opacity', '0.9');
      line.setAttribute('class', 'today-line-custom');
      group.appendChild(line);

      gridLayer.appendChild(group);
    };

    const decorateTaskLabels = () => {
      if (!ganttRef.current) return;
      const svg = ganttRef.current.querySelector('svg');
      if (!svg) return;

      const wrappers = svg.querySelectorAll<SVGGElement>('.bar-wrapper');
      wrappers.forEach((wrapper) => {
        if (wrapper.classList.contains('gantt-summary')) return;
        if (wrapper.classList.contains('gantt-dummy-row')) return;

        const bar = wrapper.querySelector<SVGRectElement>('.bar');
        const originalLabel = wrapper.querySelector<SVGTextElement>('text.bar-label');
        if (!bar || !originalLabel) return;

        const x = Number(bar.getAttribute('x') || 0);
        const y = Number(bar.getAttribute('y') || 0);
        const width = Number(bar.getAttribute('width') || 0);
        const height = Number(bar.getAttribute('height') || 0);
        if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(width) || !Number.isFinite(height)) return;

        const rowCenterY = y + height / 2;
        const barGroup = wrapper.querySelector<SVGGElement>('g.bar-group');
        if (!barGroup) return;

        let outsideLabel = barGroup.querySelector<SVGTextElement>('text.task-label-outside');
        if (!outsideLabel) {
          outsideLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
          outsideLabel.setAttribute('class', 'task-label-outside');
          outsideLabel.setAttribute('pointer-events', 'none');
          barGroup.appendChild(outsideLabel);
        }

        outsideLabel.textContent = originalLabel.textContent || '';
        outsideLabel.setAttribute('x', String(x + width + 12));
        outsideLabel.setAttribute('y', String(rowCenterY));
        outsideLabel.setAttribute('text-anchor', 'start');
      });
    };

    const decorateMilestones = () => {
      if (!ganttRef.current) return;
      const svg = ganttRef.current.querySelector('svg');
      if (!svg) return;

      const wrappers = svg.querySelectorAll<SVGGElement>('.bar-wrapper.milestone');
      wrappers.forEach((wrapper) => {
        if (wrapper.classList.contains('gantt-summary')) return;
        if (wrapper.classList.contains('gantt-dummy-row')) return;

        const bar = wrapper.querySelector<SVGGraphicsElement>('.bar');
        if (!bar) return;

        const x = Number((bar as any).getAttribute?.('x') ?? 0);
        const y = Number((bar as any).getAttribute?.('y') ?? 0);
        const width = Number((bar as any).getAttribute?.('width') ?? 0);
        const height = Number((bar as any).getAttribute?.('height') ?? 0);
        if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(width) || !Number.isFinite(height)) return;

        const cx = x + width / 2;
        const cy = y + height / 2;
        const size = Math.round(TASK_BAR_HEIGHT * 1.35);

        wrapper.querySelectorAll('.milestone-marker').forEach((n) => n.remove());

        const marker = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        marker.setAttribute('class', 'milestone-marker');
        marker.setAttribute('x', String(cx - size / 2));
        marker.setAttribute('y', String(cy - size / 2));
        marker.setAttribute('width', String(size));
        marker.setAttribute('height', String(size));
        marker.setAttribute('rx', '2');
        marker.setAttribute('ry', '2');
        marker.setAttribute('transform', `rotate(45 ${cx} ${cy})`);
        marker.setAttribute('pointer-events', 'none');

        const computed = window.getComputedStyle(bar as any);
        if (computed?.fill) marker.setAttribute('fill', computed.fill);

        const barGroup = wrapper.querySelector<SVGGElement>('g.bar-group');
        if (barGroup) barGroup.appendChild(marker);
        else wrapper.appendChild(marker);

        (bar as any).style.opacity = '0';
        const progress = wrapper.querySelector<SVGGraphicsElement>('.bar-progress');
        if (progress) (progress as any).style.opacity = '0';
      });
    };

    const decorateSummaryBars = () => {
      if (!ganttRef.current) return;
      const svg = ganttRef.current.querySelector('svg');
      if (!svg) return;

      const wrappers = svg.querySelectorAll<SVGGElement>('.bar-wrapper.gantt-summary');
      wrappers.forEach((wrapper) => {
        const bar = wrapper.querySelector<SVGRectElement>('.bar');
        if (!bar) return;

        const x = Number(bar.getAttribute('x') || 0);
        const y = Number(bar.getAttribute('y') || 0);
        const width = Number(bar.getAttribute('width') || 0);
        const height = Number(bar.getAttribute('height') || 0);
        if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(width) || !Number.isFinite(height)) return;
        if (width <= 0 || height <= 0) return;

        wrapper.querySelectorAll('.summary-bar-main, .summary-bar-cap').forEach((el) => el.remove());

        const rowCenterY = y + height / 2;
        const summaryHeight = GANTT_SUMMARY_BAR_HEIGHT_PX;
        const barY = rowCenterY - summaryHeight / 2;

        const main = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        main.setAttribute('class', 'summary-bar-main');
        main.setAttribute('x', String(x));
        main.setAttribute('y', String(barY));
        main.setAttribute('width', String(width));
        main.setAttribute('height', String(summaryHeight));
        main.setAttribute('rx', '2');
        main.setAttribute('ry', '2');
        main.setAttribute('vector-effect', 'non-scaling-stroke');
        main.setAttribute('pointer-events', 'none');

        const capSize = 6;
        const capStroke = 1.5;
        const capHeight = summaryHeight + 4;
        const capYTop = rowCenterY - capHeight / 2;
        const capYBottom = rowCenterY + capHeight / 2;

        const leftCap = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        leftCap.setAttribute('class', 'summary-bar-cap');
        leftCap.setAttribute(
          'd',
          `M ${x} ${capYTop} V ${capYBottom} M ${x} ${capYTop} H ${x + capSize} M ${x} ${capYBottom} H ${x + capSize}`
        );
        leftCap.setAttribute('stroke-width', String(capStroke));
        leftCap.setAttribute('fill', 'none');
        leftCap.setAttribute('vector-effect', 'non-scaling-stroke');
        leftCap.setAttribute('pointer-events', 'none');

        const rightX = x + width;
        const rightCap = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        rightCap.setAttribute('class', 'summary-bar-cap');
        rightCap.setAttribute(
          'd',
          `M ${rightX} ${capYTop} V ${capYBottom} M ${rightX} ${capYTop} H ${rightX - capSize} M ${rightX} ${capYBottom} H ${rightX - capSize}`
        );
        rightCap.setAttribute('stroke-width', String(capStroke));
        rightCap.setAttribute('fill', 'none');
        rightCap.setAttribute('vector-effect', 'non-scaling-stroke');
        rightCap.setAttribute('pointer-events', 'none');

        const label = wrapper.querySelector<SVGTextElement>('text.bar-label');
        if (label) {
          label.setAttribute('x', String(x + width / 2));
          label.setAttribute('y', String(rowCenterY));
          label.setAttribute('text-anchor', 'middle');
        }
        const barGroup = wrapper.querySelector<SVGGElement>('g.bar-group');
        if (barGroup && label && label.parentNode === barGroup) {
          barGroup.insertBefore(main, label);
          barGroup.insertBefore(leftCap, label);
          barGroup.insertBefore(rightCap, label);
        } else if (barGroup) {
          barGroup.appendChild(main);
          barGroup.appendChild(leftCap);
          barGroup.appendChild(rightCap);
        } else {
          wrapper.appendChild(main);
          wrapper.appendChild(leftCap);
          wrapper.appendChild(rightCap);
        }

        bar.style.opacity = '0';
        const progress = wrapper.querySelector<SVGRectElement>('.bar-progress');
        if (progress) progress.style.opacity = '0';
      });
    };

    try {
      const shouldRecreate = !!ganttInstance.current && lastTaskIdsHashRef.current !== nextTaskIdsHash;

      if (shouldRecreate) {
        if (ganttRef.current) ganttRef.current.innerHTML = '';
        ganttInstance.current = null;
      }

      if (ganttInstance.current) {
        ganttInstance.current.refresh(ganttTasks);
        ganttInstance.current.change_view_mode(project.settings.viewMode);
      } else {
        ganttInstance.current = new Gantt(ganttRef.current, ganttTasks, {
          header_height: HEADER_HEIGHT,
          column_width: 30,
          step: 24,
          view_modes: ['Day', 'Week', 'Month'],
          infinite_padding: true,
          scroll_to: 'start',
          bar_height: TASK_BAR_HEIGHT,
          bar_corner_radius: 7,
          arrow_curve: 5,
          padding: TASK_ROW_PADDING_PX,
          view_mode: project.settings.viewMode,
          on_date_change: (task: any, start: Date, end: Date) => {
            // Don't allow modification of dummy rows
            if (task.id.startsWith('summary-') || task.id.startsWith('actions-')) return;
            updateTask(task.id, {
              startDate: start.toISOString().split('T')[0],
              endDate: end.toISOString().split('T')[0]
            });
          },
          on_progress_change: (task: any, progress: number) => {
            if (task.id.startsWith('summary-') || task.id.startsWith('actions-')) return;
            updateTask(task.id, { progress });
          },
          on_click: (task: any) => {
            console.log('Task clicked:', task);
          }
        });
      }

      lastTaskIdsHashRef.current = nextTaskIdsHash;

      if (!didInitialScrollToTodayRef.current) {
        const instance: any = ganttInstance.current;
        const oldest: Date | undefined = instance?.get_oldest_starting_date?.();
        const ganttStart: Date | undefined = instance?.gantt_start;
        const stepHours: number | undefined = instance?.options?.step;
        const columnWidth: number | undefined = instance?.options?.column_width;
        const inner = ganttRef.current?.querySelector('.gantt-container') as HTMLElement | null;

        if (oldest && ganttStart && typeof stepHours === 'number' && typeof columnWidth === 'number') {
          const hoursBefore = (oldest.getTime() - ganttStart.getTime()) / (1000 * 60 * 60);
          const scrollLeft = Math.max(0, (hoursBefore / stepHours) * columnWidth);
          if (inner) inner.scrollLeft = scrollLeft;
        }

        if (inner) inner.scrollTop = 0;
        didInitialScrollToTodayRef.current = true;
      } else {
        requestAnimationFrame(() => {
          const el = getTimelineScrollEl();
          if (el) el.scrollTop = prevScrollTop;
        });
      }

      requestAnimationFrame(() => {
        const inner = ganttRef.current?.querySelector('.gantt-container') as HTMLElement | null;
        if (inner) {
          const prevEl = ganttInnerScrollRef.current;
          const prevHandler = ganttInnerScrollHandlerRef.current;
          if (prevEl && prevHandler) prevEl.removeEventListener('scroll', prevHandler);

          inner.style.height = '100%';
          inner.style.overflowX = 'auto';
          inner.style.overflowY = 'auto';
          inner.style.scrollBehavior = 'smooth';
          ganttInnerScrollRef.current = inner;

          if (typeof prevInnerScrollLeft === 'number') {
            inner.scrollLeft = prevInnerScrollLeft;
          }

          const onInnerScroll = () => {
            const headerSvg = ganttHeaderSvgRef.current;
            if (!headerSvg) return;
            headerSvg.style.transform = `translateX(${-inner.scrollLeft}px)`;
          };

          ganttInnerScrollHandlerRef.current = onInnerScroll;
          inner.addEventListener('scroll', onInnerScroll, { passive: true });
          onInnerScroll();
        }

        rebuildStickyHeader();
        decorateTimelineBands();
        decorateTodayIndicator();
        decorateSummaryBars();
        decorateMilestones();
        decorateTaskLabels();

        const svg = ganttRef.current?.querySelector('svg') as SVGSVGElement | null;
        if (svg) {
          svg.setAttribute('data-view-mode', project.settings.viewMode);

          headerMutationObserverRef.current?.disconnect();
          if (headerSyncRafRef.current) {
            window.cancelAnimationFrame(headerSyncRafRef.current);
            headerSyncRafRef.current = null;
          }

          const scheduleHeaderSync = () => {
            if (headerSyncRafRef.current) return;
            headerSyncRafRef.current = window.requestAnimationFrame(() => {
              headerSyncRafRef.current = null;
              rebuildStickyHeader();
            });
          };

          const headerObserver = new MutationObserver((mutations) => {
            for (const m of mutations) {
              if (m.type !== 'childList') continue;
              if ((m.addedNodes?.length ?? 0) === 0 && (m.removedNodes?.length ?? 0) === 0) continue;
              scheduleHeaderSync();
              break;
            }
          });
          headerObserver.observe(svg, { subtree: true, childList: true });
          headerMutationObserverRef.current = headerObserver;

          barMutationObserverRef.current?.disconnect();
          const observer = new MutationObserver((mutations) => {
            const touched = new Set<SVGGElement>();
            for (const m of mutations) {
              if (m.type !== 'attributes') continue;
              const el = m.target as Element;
              if (!el.classList || !el.classList.contains('bar')) continue;
              const wrapper = el.closest('.bar-wrapper') as SVGGElement | null;
              if (wrapper) touched.add(wrapper);
            }
            if (touched.size === 0) return;
            requestAnimationFrame(() => {
              touched.forEach((wrapper) => {
                if (wrapper.classList.contains('gantt-summary')) return;
                if (wrapper.classList.contains('gantt-dummy-row')) return;
                const bar = wrapper.querySelector<SVGRectElement>('.bar');
                const barGroup = wrapper.querySelector<SVGGElement>('g.bar-group');
                const originalLabel = wrapper.querySelector<SVGTextElement>('text.bar-label');
                if (!bar || !barGroup || !originalLabel) return;
                let outsideLabel = barGroup.querySelector<SVGTextElement>('text.task-label-outside');
                if (!outsideLabel) {
                  outsideLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                  outsideLabel.setAttribute('class', 'task-label-outside');
                  outsideLabel.setAttribute('pointer-events', 'none');
                  barGroup.appendChild(outsideLabel);
                }
                const x = Number(bar.getAttribute('x') || 0);
                const y = Number(bar.getAttribute('y') || 0);
                const width = Number(bar.getAttribute('width') || 0);
                const height = Number(bar.getAttribute('height') || 0);
                if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(width) || !Number.isFinite(height)) return;
                outsideLabel.textContent = originalLabel.textContent || '';
                outsideLabel.setAttribute('x', String(x + width + 12));
                outsideLabel.setAttribute('y', String(y + height / 2));
                outsideLabel.setAttribute('text-anchor', 'start');
              });
            });
          });
          observer.observe(svg, {
            subtree: true,
            attributes: true,
            attributeFilter: ['x', 'y', 'width', 'height'],
          });
          barMutationObserverRef.current = observer;
        }

        if (!todayTimerRef.current) {
          lastTodayKeyRef.current = new Date().toDateString();
          todayTimerRef.current = window.setInterval(() => {
            const nowKey = new Date().toDateString();
            if (nowKey === lastTodayKeyRef.current) return;
            lastTodayKeyRef.current = nowKey;
            requestAnimationFrame(() => {
              decorateTodayIndicator();
              rebuildStickyHeader();
            });
          }, 60_000);
        }
      });
    } catch (error) {
      console.error('Failed to initialize/refresh Gantt chart:', error);
    }

    // Dynamic style injection for custom color coding and hiding dummy rows
    const styleId = 'gantt-custom-styles';
    let styleElement = document.getElementById(styleId);
    if (!styleElement) {
      styleElement = document.createElement('style');
      styleElement.id = styleId;
      document.head.appendChild(styleElement);
    }

    styleElement.innerHTML = `
      /* Hide Gantt Bars & Connectors for Dummy Spacers */
      .gantt-dummy-row.bar-wrapper {
        opacity: 0 !important;
        pointer-events: none !important;
      }
      .gantt-dummy-row.bar-wrapper * {
        opacity: 0 !important;
      }
      .gantt-dummy-row .handle-group,
      .gantt-dummy-row .bar-label,
      .gantt-dummy-row .bar-progress {
        opacity: 0 !important;
        pointer-events: none !important;
      }

      .gantt .bar-label {
        dominant-baseline: middle;
        alignment-baseline: middle;
      }

      .gantt-summary .bar-progress,
      .gantt-summary .handle-group {
        opacity: 0 !important;
        pointer-events: none !important;
      }
      .gantt .bar-wrapper.gantt-summary .bar-label {
        fill: #ffffff;
        font-weight: 700;
        font-size: 11px;
        text-anchor: middle;
      }
      .gantt-summary .summary-bar-main {
        opacity: 0.9;
      }
      .gantt-summary .summary-bar-cap {
        opacity: 0.9;
      }
      .gantt .bar-label {
        fill: #111827;
        font-weight: 600;
      }

      .gantt .bar-wrapper:not(.gantt-summary):not(.gantt-dummy-row) .bar {
        opacity: 0.78;
      }

      .gantt .bar-wrapper:not(.gantt-summary):not(.gantt-dummy-row) .bar-progress {
        opacity: 0.65;
      }

      .gantt .bar-wrapper:not(.gantt-summary):not(.gantt-dummy-row) .bar-label {
        opacity: 0 !important;
      }

      .gantt .task-label-outside {
        fill: #111827;
        font-weight: 600;
        font-size: 9px;
        dominant-baseline: middle;
      }
      
      /* Style normal task bars based on phase colors */
      ${project.phases.map(phaseId => `
        .gantt-task-${phaseId} .bar { fill: ${phases[phaseId]?.color || '#3b82f6'}; }
        .gantt-task-${phaseId} .bar-progress { fill: rgba(0,0,0,0.12); }
        .gantt-task-${phaseId} .bar-label { fill: #111827; font-weight: 600; font-size: 11px; }
      `).join('\n')}

      .gantt-summary .summary-bar-main { fill: #1f2937; }
      .gantt-summary .summary-bar-cap { stroke: #1f2937; }

      .gantt .milestone-marker {
        opacity: 0.95;
      }

      .gantt-task-completed .bar { fill: #22c55e !important; }
      .gantt-task-completed .bar-progress { fill: rgba(0,0,0,0.12) !important; }
      .gantt-task-completed .bar-label { fill: #064e3b !important; }
      .gantt-task-completed .task-label-outside { fill: #064e3b !important; }
    `;

  }, [project, phases, tasks, updateTask, expandedTasks]);

  if (!project) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-50 text-gray-400 font-medium italic">
        Select a project to view the Gantt chart
      </div>
    );
  }

  return (
    <div className="flex-1 bg-white relative border-l border-gray-100 h-full flex flex-col overflow-hidden">
      {panelTopSpacerPx > 0 && <div style={{ height: `${panelTopSpacerPx}px` }} />}
      <div ref={ganttHeaderRef} className="sticky top-0 z-20 bg-white border-b border-gray-100" style={{ height: `${HEADER_HEIGHT}px`, overflow: 'hidden' }} />
      <div ref={ganttBodyScrollRef} className="flex-1 overflow-hidden gantt-scroll-container gantt-body-scroll-container">
        <div ref={ganttRef} className="w-full h-full" />
      </div>
      
      {/* Sync Badge */}
      <div className="absolute top-0 right-4 p-4 z-10">
        <div className="bg-green-50 text-green-600 text-[11px] font-bold px-2 py-1 rounded border border-green-100 flex items-center gap-1.5 shadow-sm">
          <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
          In Sync
        </div>
      </div>
    </div>
  );
};

export default GanttChart;
