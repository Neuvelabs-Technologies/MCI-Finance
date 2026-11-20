import type { NextFunction, Request, Response } from 'express';

// Azure App Service's front end sends X-Forwarded-For as "1.2.3.4:56789". With the port left in,
// req.ip changes on every connection, so rate limits would never add up attempts from one person.

export function stripPort(entry: string): string {
  const value = entry.trim();
  const v6 = /^\[([^\]]+)\](?::\d+)?$/.exec(value);
  if (v6?.[1]) return v6[1];
  const v4 = /^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/.exec(value);
  if (v4?.[1]) return v4[1];
  return value;
}

export function normalizeForwardedFor(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers['x-forwarded-for'];
  if (header) req.headers['x-forwarded-for'] = String(header).split(',').map(stripPort).join(', ');
  next();
}
