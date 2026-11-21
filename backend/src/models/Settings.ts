import { Schema, model, type HydratedDocument, type Model } from 'mongoose';

/** MCI brand colour — the same "MCI rose" as the web app's primary colour. */
export const MCI_ROSE = '#be2f48';

const DEFAULT_SUBJECT = 'UAE Electronic Invoicing (e-Invoicing) – Information Required – {{code}}';
const DEFAULT_BODY = `Dear Valued Customer,

We are writing to you regarding UAE Electronic Invoicing (e-Invoicing).

Kindly open the link below, review our company details carefully and complete the required buyer information form.

Please ensure that the form is completed no later than {{dueDate}}.

{{button}}

If the button does not work, copy this link into your browser:
{{link}}

Regards,
{{contactName}}
{{orgName}}
{{contactEmail}}`;

const DEFAULT_REMINDER_SUBJECT = 'Reminder: UAE e-Invoicing details required – {{code}}';
const DEFAULT_REMINDER_BODY = `Dear Valued Customer,

This is a friendly reminder that we have not yet received your company's UAE e-invoicing details.

Please complete the form by {{dueDate}} so that we can continue to issue your invoices without interruption.

{{button}}

If the button does not work, copy this link into your browser:
{{link}}

Regards,
{{contactName}}
{{orgName}}
{{contactEmail}}`;

/** Vendor (supplier) invite and reminder: same placeholders, supplier wording. */
const DEFAULT_VENDOR_SUBJECT = 'UAE Electronic Invoicing (e-Invoicing) – Supplier Information Required – {{code}}';
const DEFAULT_VENDOR_BODY = `Dear Valued Supplier,

We are writing to you regarding UAE Electronic Invoicing (e-Invoicing).

To continue receiving and processing your invoices under the new requirements, kindly open the link below, review our company details carefully and complete the required supplier information form.

Please ensure that the form is completed no later than {{dueDate}}.

{{button}}

If the button does not work, copy this link into your browser:
{{link}}

Regards,
{{contactName}}
{{orgName}}
{{contactEmail}}`;

const DEFAULT_VENDOR_REMINDER_SUBJECT = 'Reminder: UAE e-Invoicing supplier details required – {{code}}';
const DEFAULT_VENDOR_REMINDER_BODY = `Dear Valued Supplier,

This is a friendly reminder that we have not yet received your company's UAE e-invoicing details.

Please complete the form by {{dueDate}} so that we can continue to process your invoices without interruption.

{{button}}

If the button does not work, copy this link into your browser:
{{link}}

Regards,
{{contactName}}
{{orgName}}
{{contactEmail}}`;

/** The editable invite/reminder templates (one set for customers, one for vendors). */
export interface EmailTemplates {
  inviteSubject: string;
  inviteBody: string;
  reminderSubject: string;
  reminderBody: string;
}

export interface EmailSettings {
  inviteSubject: string;
  inviteBody: string;
  reminderSubject: string;
  reminderBody: string;
  sendConfirmation: boolean;
}

export interface ISettings {
  _id: string;
  orgName: string;
  formTitle: string;
  formSubtitle: string;
  intro: string;
  dueDate?: Date;
  contactName: string;
  contactEmail: string;
  accentColor: string;
  logo?: { storedName?: string; mime?: string };
  sections: { ownership: boolean; bank: boolean };
  linkValidityDays: number;
  autoReminderDays: string; // days before due date, e.g. "7,2"; empty = off
  email: EmailSettings;
  vendorEmail: EmailTemplates;
}

export type SettingsDoc = HydratedDocument<ISettings>;

interface SettingsModel extends Model<ISettings> {
  get(): Promise<SettingsDoc>;
}

const SettingsSchema = new Schema<ISettings, SettingsModel>(
  {
    _id: { type: String, default: 'singleton' },
    orgName: { type: String, default: 'MCI Middle East' },
    formTitle: { type: String, default: 'UAE e-Invoicing Details' },
    formSubtitle: { type: String, default: 'UAE e-invoicing details for MCI Middle East' },
    intro: {
      type: String,
      default:
        "Please provide your company's e-invoicing details accurately. This information will be used for invoice processing and records. Have your Trade Licence, TRN and TIN certificates, signatory IDs, MOA and UBO details ready to upload.",
    },
    dueDate: { type: Date },
    contactName: { type: String, default: 'Finance Team' },
    contactEmail: { type: String, default: '' },
    accentColor: { type: String, default: MCI_ROSE }, // email button and header bar colour
    logo: { storedName: String, mime: String },
    sections: {
      ownership: { type: Boolean, default: true },
      bank: { type: Boolean, default: true },
    },
    linkValidityDays: { type: Number, default: 90 },
    autoReminderDays: { type: String, default: '7,2' },
    email: {
      inviteSubject: { type: String, default: DEFAULT_SUBJECT },
      inviteBody: { type: String, default: DEFAULT_BODY },
      reminderSubject: { type: String, default: DEFAULT_REMINDER_SUBJECT },
      reminderBody: { type: String, default: DEFAULT_REMINDER_BODY },
      sendConfirmation: { type: Boolean, default: true },
    },
    vendorEmail: {
      inviteSubject: { type: String, default: DEFAULT_VENDOR_SUBJECT },
      inviteBody: { type: String, default: DEFAULT_VENDOR_BODY },
      reminderSubject: { type: String, default: DEFAULT_VENDOR_REMINDER_SUBJECT },
      reminderBody: { type: String, default: DEFAULT_VENDOR_REMINDER_BODY },
    },
  },
  { timestamps: true }
);

SettingsSchema.static('get', async function get(): Promise<SettingsDoc> {
  let s = await this.findById('singleton');
  if (!s) s = await this.create({ _id: 'singleton' });
  return s;
});

export const Settings = model<ISettings, SettingsModel>('Settings', SettingsSchema);
