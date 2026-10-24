import mongoose from 'mongoose';
import { isEmail } from './rules.js';

export const isId = (id: unknown): id is string => typeof id === 'string' && mongoose.isValidObjectId(id);

/** Split "a@x.com, b@y.com" (or an array) into a clean, lowercased list. */
export const parseEmails = (v: unknown): string[] =>
  (Array.isArray(v) ? v : String(v ?? '').split(/[;,\s]+/))
    .map((e) => String(e).trim().toLowerCase())
    .filter(Boolean);

export const allEmailsValid = (list: string[]): boolean => list.every(isEmail);

export const escapeRegex = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const str = (v: unknown): string => (v === undefined || v === null ? '' : String(v));

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
