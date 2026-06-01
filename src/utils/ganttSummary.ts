import { differenceInCalendarDays, format, isValid, parse, parseISO } from 'date-fns';
import type { Task } from '../types/project';

export const normalizeToISODate = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  const tryParse = (fn: () => Date): Date | null => {
    try {
      const d = fn();
      return isValid(d) ? d : null;
    } catch {
      return null;
    }
  };

  const parsed =
    tryParse(() => parseISO(trimmed)) ??
    tryParse(() => parse(trimmed, 'dd/MM/yyyy', new Date())) ??
    tryParse(() => parse(trimmed, 'd/M/yyyy', new Date())) ??
    tryParse(() => parse(trimmed, 'dd-MM-yyyy', new Date())) ??
    tryParse(() => parse(trimmed, 'd-M-yyyy', new Date())) ??
    tryParse(() => new Date(trimmed));

  if (!parsed) return null;
  return format(parsed, 'yyyy-MM-dd');
};

export const getSummaryStart = (children: Array<Pick<Task, 'startDate'>>): string | null => {
  const starts = children
    .map((t) => normalizeToISODate(t.startDate))
    .filter((d): d is string => !!d)
    .sort();
  return starts.length > 0 ? starts[0] : null;
};

export const getSummaryEnd = (children: Array<Pick<Task, 'endDate'>>): string | null => {
  const ends = children
    .map((t) => normalizeToISODate(t.endDate))
    .filter((d): d is string => !!d)
    .sort();
  return ends.length > 0 ? ends[ends.length - 1] : null;
};

export const getSummaryDuration = (
  children: Array<Pick<Task, 'startDate' | 'endDate'>>
): number | null => {
  const start = getSummaryStart(children);
  const end = getSummaryEnd(children);
  if (!start || !end) return null;

  const startDate = parseISO(start);
  const endDate = parseISO(end);
  if (!isValid(startDate) || !isValid(endDate)) return null;

  return Math.max(1, differenceInCalendarDays(endDate, startDate) + 1);
};

