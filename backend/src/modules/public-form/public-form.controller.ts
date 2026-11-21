import type { Request, Response } from 'express';
import { Entity } from '../../models/Entity.js';
import { Settings } from '../../models/Settings.js';
import { cleanupTemp, openLogo, sendStoredFile, storeCustomerFile } from '../../services/storage.service.js';
import { ApiError } from '../../utils/ApiError.js';
import { audit } from '../../utils/audit.js';
import { str } from '../../utils/http.js';
import { FILE_FIELDS, isEmail, normalise, validate, type FileField } from '../../utils/rules.js';
import * as service from './public-form.service.js';

type UploadedFiles = Partial<Record<FileField, Express.Multer.File[]>>;

export async function info(_req: Request, res: Response) {
  const s = await Settings.get();
  res.json({ settings: service.publicSettings(s) });
}

export async function logo(_req: Request, res: Response) {
  const s = await Settings.get();
  const file = s.logo?.storedName ? await openLogo(s.logo.storedName) : null;
  if (!file) {
    res.status(404).end();
    return;
  }
  res.type(s.logo?.mime || 'image/png');
  res.set('Cache-Control', 'public, max-age=300');
  await sendStoredFile(res, file);
}

export async function getForm(req: Request, res: Response) {
  const s = await Settings.get();
  const c = await service.loadByToken(str(req.params.token));
  if (!c || c === 'expired') {
    res.status(404).json({ error: c === 'expired' ? 'expired' : 'invalid', settings: service.publicSettings(s) });
    return;
  }
  const now = new Date();
  if (!c.openedAt) {
    c.openedAt = now;
    if (c.status === 'invited' || c.status === 'new') c.status = 'opened';
    await audit(req, 'form.opened', { customer: c._id, actor: `customer:${c.code}` });
  }
  c.lastOpenedAt = now;
  await c.save();

  const entities = await Entity.find({ active: true }).sort({ sortOrder: 1, name: 1 });
  res.json({
    settings: service.publicSettings(s),
    entities: entities.map(service.publicEntity),
    customer: {
      type: c.type ?? 'customer',
      code: c.code,
      name: c.name,
      status: c.status,
      submittedAt: c.submittedAt,
      reviewStatus: c.reviewStatus,
      reviewNote: c.reviewStatus === 'needs_correction' ? c.reviewNote : undefined,
      data: service.customerFormData(c),
      files: service.customerFiles(c),
    },
  });
}

/**
 * "Send my link again" on the home page. Always answers the same way, before doing any work,
 * so it can't be used to find out which addresses are registered.
 */
export async function resendLink(req: Request, res: Response) {
  const email = str(req.body?.email).trim();
  if (!isEmail(email)) throw new ApiError(400, 'Enter a valid email address.');
  res.json({ ok: true });
  service.resendLinks(email).catch((e: unknown) => req.log.error({ err: e }, '[resend] link resend failed'));
}

export async function submitForm(req: Request, res: Response) {
  const uploaded = (req.files ?? {}) as UploadedFiles;
  const tmpFiles = Object.values(uploaded).flat();
  try {
    const c = await service.loadByToken(str(req.params.token));
    if (!c || c === 'expired') throw new ApiError(404, 'This link is invalid or has expired.');
    const s = await Settings.get();

    let raw: Record<string, unknown>;
    try {
      raw = JSON.parse(str(req.body?.data) || '{}') as Record<string, unknown>;
    } catch {
      throw new ApiError(400, 'Invalid form data');
    }
    const d = normalise(raw);

    const activeEntities = await Entity.find({ active: true }).select('_id');
    const activeIds = new Set(activeEntities.map((e) => String(e._id)));
    d.entities = d.entities.filter((id) => activeIds.has(id));

    const fileState: Partial<Record<FileField, boolean>> = {};
    for (const f of FILE_FIELDS) fileState[f] = !!(c.files?.[f]?.storedName || uploaded[f]?.[0]);

    const result = validate(d, { sections: s.sections, hasEntities: activeIds.size > 0 }, fileState);
    if (Object.keys(result.errors).length) {
      await cleanupTemp(tmpFiles);
      res.status(422).json({ error: 'Please correct the highlighted fields.', errors: result.errors, warnings: result.warnings });
      return;
    }

    // Store new files (old versions are kept on disk and in fileHistory)
    const replaced: FileField[] = [];
    for (const f of FILE_FIELDS) {
      const file = uploaded[f]?.[0];
      if (!file) continue;
      const meta = await storeCustomerFile(c._id, f, file);
      const previous = c.toObject().files?.[f];
      if (previous?.storedName) c.fileHistory.push({ field: f, ...previous });
      c.set(`files.${f}`, meta);
      replaced.push(f);
    }

    const changed = service.changedFields(c.toObject().data ?? {}, d);
    const firstSubmission = c.status !== 'submitted';
    c.data = { ...d, tradeLicenceExpiry: d.tradeLicenceExpiry ? new Date(d.tradeLicenceExpiry) : undefined };
    c.status = 'submitted';
    c.submittedAt = new Date();
    c.submitCount = (c.submitCount || 0) + 1;
    c.reviewStatus = 'pending';
    await c.save();

    await audit(req, firstSubmission ? 'form.submitted' : 'form.resubmitted', {
      customer: c._id,
      actor: `customer:${c.code}`,
      details: { changed, filesReplaced: replaced, declarant: d.declarantName },
    });

    // Fire-and-forget notifications
    service.notifySubmission(c, s, d, firstSubmission).catch((e: unknown) => req.log.error({ err: e }, '[notify] submission emails failed'));

    res.json({ ok: true, submittedAt: c.submittedAt, warnings: result.warnings });
  } catch (err) {
    await cleanupTemp(tmpFiles);
    throw err;
  }
}
