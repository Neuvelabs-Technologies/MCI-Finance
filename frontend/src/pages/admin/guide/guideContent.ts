/**
 * The in-app guide: what the system does and how to use it, topic by topic.
 *
 * Every rule here describes what the app does today — keep it in step when
 * behaviour changes (validation lives in lib/rules.ts / backend utils/rules.ts).
 * Text wrapped in **…** renders bold; live values from Settings are inserted
 * that way, so a changed setting changes the guide with it.
 *
 * Block types: p, h, list, steps, table, callout.
 */

export type Block =
  | { type: 'p'; text: string }
  | { type: 'h'; text: string }
  | { type: 'list'; items: string[] }
  | { type: 'steps'; items: { title: string; text: string }[] }
  | { type: 'table'; head: string[]; rows: string[][] }
  | { type: 'callout'; tone: 'info' | 'warning' | 'tip'; title: string; text?: string; items?: string[] };

export interface Topic {
  id: string;
  group: string;
  title: string;
  summary: string;
  blocks: Block[];
  /** Admin page this topic is about, for the "Open" button. */
  link?: { to: string; label: string };
}

export const GUIDE_GROUPS = [
  { id: 'start', title: 'Getting started' },
  { id: 'tasks', title: 'Day-to-day work' },
  { id: 'customer', title: 'The customer’s side' },
  { id: 'reference', title: 'Reference' },
  { id: 'help', title: 'Help' },
];

export interface GuideFacts {
  orgName: string;
  dueDate?: string;
  linkValidityDays: number;
  autoReminderDays: string;
  ownership: boolean;
  bank: boolean;
  maxFileMb: number;
  smtpConfigured: boolean;
  contactEmail: string;
}

const fmt = (d?: string) => (d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '');

export function buildGuide(f: GuideFacts): Topic[] {
  const due = f.dueDate ? `**${fmt(f.dueDate)}**` : '**not set yet** (Settings → Form)';
  const reminders = f.autoReminderDays.trim()
    ? `**${f.autoReminderDays
        .split(',')
        .map((d) => d.trim())
        .filter(Boolean)
        .join(' and ')} days** before the due date`
    : '**off**';
  const sectionsOn = [f.ownership && 'Ownership and signatories', f.bank && 'Bank details'].filter(Boolean).join(' and ');

  return [
    // ---------------------------------------------------------------- start
    {
      id: 'what',
      group: 'start',
      title: 'What this system does',
      summary: 'Why it exists and what it replaces.',
      blocks: [
        {
          type: 'p',
          text: `From UAE e-invoicing (PINT AE), every invoice ${f.orgName} issues must carry the buyer’s legal identifiers — TRN, TIN, PEPPOL ID and licence details — exactly as the authorities hold them. This system collects those details from every customer, with the supporting documents, so finance can load them into the ERP and the e-invoicing provider (ASP).`,
        },
        { type: 'h', text: 'In one sentence' },
        {
          type: 'p',
          text: 'Each customer gets a **personal link** by email, fills in one form, uploads their documents, and the finance team **reviews** and **exports** the result to Excel.',
        },
        { type: 'h', text: 'What it replaces' },
        {
          type: 'list',
          items: [
            'Spreadsheets emailed back and forth, and PDFs saved in shared folders.',
            'Chasing customers one by one — reminders can be sent in bulk, or automatically.',
            'Retyping identifiers — the form checks formats as the customer types, so the export is clean.',
          ],
        },
        {
          type: 'callout',
          tone: 'info',
          title: 'Two kinds of people use it',
          items: ['**Finance team (admins)** sign in at /admin with an email and password.', '**Customers** never sign in. Their personal link is their key, and it expires.'],
        },
      ],
    },
    {
      id: 'journey',
      group: 'start',
      title: 'How it works, end to end',
      summary: 'The five steps every customer goes through.',
      link: { to: '/admin', label: 'Open Overview' },
      blocks: [
        {
          type: 'steps',
          items: [
            { title: 'Add customers', text: 'Import the customer list from Excel, or add customers one by one. Each one gets a personal form link straight away — nothing is emailed yet.' },
            { title: 'Send invites', text: 'Email the link to each customer from Customers (one, a selection, or everyone not yet sent). Status changes to **Sent**.' },
            { title: 'Customer fills in the form', text: 'They open the link (status **Opened**), review MCI’s entity details, enter theirs and upload documents. When they submit, status becomes **Submitted** and finance is notified.' },
            { title: 'Finance reviews', text: 'Open the customer, compare the details with the documents, then **Mark as verified** — or **Request correction** with a note the customer will see.' },
            { title: 'Export', text: 'Customers → Export gives an Excel file with every field, plus a **PEPPOL buyer master** sheet to load into the ERP or ASP.' },
          ],
        },
        {
          type: 'callout',
          tone: 'tip',
          title: 'Where you are right now',
          text: `The due date is ${due}. Automatic reminders are ${reminders}. New links last **${f.linkValidityDays} days**.`,
        },
      ],
    },
    {
      id: 'golive',
      group: 'start',
      title: 'Before you go live',
      summary: 'The checklist for the first real invites.',
      link: { to: '/admin/settings', label: 'Open Settings' },
      blocks: [
        {
          type: 'steps',
          items: [
            { title: 'Check “Our entities”', text: 'The TRN, TIN, PEPPOL ID, licence number and address must match MCI’s trade licence and FTA certificates exactly. Customers copy them into their supplier records.' },
            { title: 'Settings → Form', text: 'Set the due date, contact name and contact email, and decide whether you need the bank and ownership sections.' },
            { title: 'Settings → Emails', text: `Read the invite and reminder text, send yourself a test email, and set automatic reminders. Email sending is currently **${f.smtpConfigured ? 'connected' : 'not connected — ask IT to add the SMTP settings'}**.` },
            { title: 'Remove demo data', text: 'If sample customers (codes starting DEMO-) are loaded, remove them under Settings → System.' },
            { title: 'Change the starting password', text: 'Settings → Users. Add each finance team member with their own account.' },
            { title: 'Try it yourself', text: 'Add yourself as a customer, open the link with “Open as customer”, submit, then review and export it. Delete the test customer afterwards.' },
          ],
        },
        { type: 'p', text: 'The Overview page shows this checklist until every step is done.' },
      ],
    },

    // ---------------------------------------------------------------- tasks
    {
      id: 'import',
      group: 'tasks',
      title: 'Adding and importing customers',
      summary: 'Excel import, the template, and how updates work.',
      link: { to: '/admin/customers', label: 'Open Customers' },
      blocks: [
        { type: 'p', text: 'Customers → **Import** takes an Excel (.xlsx) or CSV file. Download the template from the import window for the exact layout.' },
        {
          type: 'table',
          head: ['Column', 'Required', 'Notes'],
          rows: [
            ['Code', 'Yes', 'Your ERP account code. It is the key: a code already on the list is **updated**, a new code is **added**.'],
            ['Company name', 'Yes', 'The name on your records. The customer can correct their legal name on the form.'],
            ['Email', 'No', 'One or more addresses, separated by commas. Without an email, the customer can’t be invited.'],
            ['Contact name', 'No', 'For your reference.'],
          ],
        },
        {
          type: 'list',
          items: [
            'Rows with a missing code or name, an invalid email, or a duplicated code are skipped — the import tells you which row and why.',
            'Importing again is safe: existing customers are updated, their submissions and documents are kept.',
            'The example row in the template (code EXAMPLE) is ignored.',
          ],
        },
      ],
    },
    {
      id: 'invites',
      group: 'tasks',
      title: 'Sending invites and reminders',
      summary: 'Bulk emails, Outlook, automatic reminders and expired links.',
      link: { to: '/admin/customers?status=new', label: 'Customers not sent' },
      blocks: [
        { type: 'h', text: 'From the system' },
        {
          type: 'list',
          items: [
            '**One customer**: open them and click Send invite (or Send reminder once invited).',
            '**A selection**: tick customers in the list, then Send invite / Send reminder in the dark bar.',
            '**Everyone**: Customers → Email → “Invite everyone not yet sent” or “Remind everyone awaiting reply”.',
            'Reminders skip anyone who has already submitted. Expired links are renewed automatically before an email goes out.',
          ],
        },
        { type: 'h', text: 'From Outlook instead' },
        {
          type: 'p',
          text: 'Copy the customer’s link (the copy icon in the list, or the Form link card), paste it into your own email, then choose **Mark as sent manually** so the status and reports stay right.',
        },
        { type: 'h', text: 'Automatic reminders' },
        {
          type: 'p',
          text: `Currently ${reminders}. Once a day at most per customer, only to customers who were invited and haven’t submitted, and only when a due date is set and email sending is connected.`,
        },
        {
          type: 'callout',
          tone: 'warning',
          title: 'When an email fails',
          text: 'The customer shows “Last email failed” and appears under Overview → Needs attention. Open them to see the reason in History (often a mistyped address), fix the email under Edit, and send again.',
        },
      ],
    },
    {
      id: 'review',
      group: 'tasks',
      title: 'Reviewing submissions',
      summary: 'What to check, verifying, and asking for corrections.',
      link: { to: '/admin/customers?review=pending', label: 'Submissions to review' },
      blocks: [
        { type: 'p', text: 'Every submission starts as **To review**. Open the customer, open each document (View) and compare it with what they typed.' },
        { type: 'h', text: 'What to check' },
        {
          type: 'list',
          items: [
            'The **legal name** and **licence number** match the trade licence, and the licence hasn’t expired (an expired date shows in red).',
            'The **TRN** matches the VAT certificate and belongs to this company (not a sister company).',
            'The **TIN** is normally the first 10 digits of the TRN. VAT group members are the exception — they tick “member of a VAT group”.',
            'The **PEPPOL ID** is 0235: followed by the TIN.',
            'For bank details: the IBAN belongs to the company named on the form.',
          ],
        },
        { type: 'h', text: 'Then' },
        {
          type: 'list',
          items: [
            '**Mark as verified** when everything matches.',
            '**Request correction** with a short note. The customer sees your note at the top of their form the next time they open the link. Then click **Email customer to correct** so they know.',
            'When they resubmit, the review goes back to To review, the History shows exactly which fields changed, and replaced files are kept under “Earlier versions”.',
          ],
        },
      ],
    },
    {
      id: 'export',
      group: 'tasks',
      title: 'Exporting to the ERP or ASP',
      summary: 'What is in the Excel file and how to use it.',
      link: { to: '/admin/customers', label: 'Open Customers' },
      blocks: [
        { type: 'p', text: 'Customers → **Export** downloads an Excel file. With filters applied, it exports only the matching customers (e.g. only Verified).' },
        {
          type: 'table',
          head: ['Sheet', 'Contents', 'Use it for'],
          rows: [
            ['Customers', 'Every field and status, file names, link, invite and reminder dates, review note.', 'Reporting and follow-up.'],
            ['PEPPOL buyer master', 'Code, legal name, country, TRN, TIN, endpoint scheme and ID, legal ID type/number/authority, address, invoice email — submitted customers only.', 'Loading the buyer master into the ERP or the e-invoicing provider.'],
          ],
        },
        { type: 'callout', tone: 'tip', title: 'Long numbers stay intact', text: 'TRN, TIN and licence numbers are stored as text, so Excel doesn’t turn them into 1.00E+14.' },
        { type: 'p', text: 'Every export is recorded in Activity.' },
      ],
    },
    {
      id: 'entities',
      group: 'tasks',
      title: 'Our entities',
      summary: 'MCI’s own details shown to customers.',
      link: { to: '/admin/entities', label: 'Open Our entities' },
      blocks: [
        {
          type: 'p',
          text: 'These are MCI’s own legal entities. At the top of the form, the customer ticks the entities they buy from and sees their e-invoicing details, so they can update their supplier records too.',
        },
        {
          type: 'list',
          items: [
            'Typing a 10-digit TIN fills the PEPPOL ID in for you.',
            'Turn off “Show on the customer form” to hide an entity. Entities customers have already picked can’t be deleted — hide them instead.',
            'Display order controls the order on the form.',
          ],
        },
      ],
    },

    // ---------------------------------------------------------------- customer
    {
      id: 'customer-form',
      group: 'customer',
      title: 'What customers see',
      summary: 'The form, step by step.',
      blocks: [
        { type: 'p', text: 'The customer opens their personal link on a computer or phone. No account or password is needed.' },
        {
          type: 'steps',
          items: [
            { title: `${f.orgName} entities`, text: 'They tick the MCI companies they deal with and see each one’s TRN, TIN, PEPPOL ID and licence.' },
            { title: 'Company details', text: 'Country, legal name, licence type (trade licence, Emirates ID, passport or decree), number, authority, expiry, emirate, free zone, and the licence upload.' },
            { title: 'Tax details', text: 'VAT registration, VAT group, TRN and certificate, TIN and certificate, PEPPOL ID (filled in from the TIN).' },
            { title: 'Contact details', text: 'Official email, accounts-payable email, phone, address, P.O. Box, city, website.' },
            { title: 'Declaration', text: 'Name, designation and a tick to confirm the details are accurate.' },
          ],
        },
        { type: 'p', text: sectionsOn ? `Also switched on: **${sectionsOn}** (Settings → Form → Sections).` : 'The optional ownership and bank sections are **switched off** (Settings → Form → Sections).' },
        { type: 'h', text: 'Helpful touches' },
        {
          type: 'list',
          items: [
            'A progress bar shows “23 of 25 required answers complete” and the due date.',
            'Typed answers are saved in the browser as they go, so closing the tab loses nothing. Files are uploaded only when they submit.',
            'They can come back to the same link to update their answers. Files already uploaded show “On file” with a Replace button.',
            'If finance asked for a correction, the note is shown at the top.',
            'After submitting they get a confirmation email (if switched on) with their TRN, TIN and PEPPOL ID.',
          ],
        },
      ],
    },
    {
      id: 'rules',
      group: 'customer',
      title: 'The e-invoicing rules the form checks',
      summary: 'Formats, exceptions and warnings.',
      blocks: [
        {
          type: 'table',
          head: ['Field', 'Rule'],
          rows: [
            ['TRN', 'Exactly 15 digits. Required only if the company is VAT registered.'],
            ['TIN', 'Exactly 10 digits. Required for every UAE company, VAT registered or not.'],
            ['PEPPOL ID (UAE)', '0235: followed by the 10-digit TIN, e.g. 0235:1234567890. Filled in automatically.'],
            ['PEPPOL ID (overseas)', 'Optional. Format scheme:identifier, e.g. 0088:5790000435951.'],
            ['IBAN', 'Checked with the international mod-97 check. UAE IBANs start with AE and have 23 characters.'],
            ['SWIFT', '8 or 11 characters.'],
            ['Emails', 'Must be valid addresses. The invoice email field takes several, separated by commas.'],
            [
              'Documents',
              `Any document or photo — PDF, Word, Excel, scans, phone photos, zip files${f.maxFileMb > 0 ? `, up to **${f.maxFileMb} MB** each` : ', **no size limit**'}. Programs and scripts are refused, even if renamed.`,
            ],
          ],
        },
        { type: 'h', text: 'Warnings (the customer can still submit)' },
        {
          type: 'list',
          items: [
            'TIN isn’t the first 10 digits of the TRN — normal for VAT group members, otherwise a likely typo.',
            'PEPPOL ID doesn’t end with the TIN.',
            'The licence expiry date is in the past.',
          ],
        },
        { type: 'h', text: 'Overseas customers' },
        { type: 'p', text: 'Choosing a country other than the UAE removes the UAE-only fields (emirate, TRN, TIN). They give their company registration number, an optional tax number and an optional PEPPOL ID instead.' },
      ],
    },

    // ---------------------------------------------------------------- reference
    {
      id: 'statuses',
      group: 'reference',
      title: 'Statuses explained',
      summary: 'What each status and review state means.',
      blocks: [
        {
          type: 'table',
          head: ['Status', 'Means', 'Next step'],
          rows: [
            ['Not sent', 'On the list; the invite hasn’t been emailed.', 'Send the invite, or send the link yourself and mark as sent.'],
            ['Sent', 'Invite emailed; the link hasn’t been opened.', 'Wait, then remind.'],
            ['Opened', 'They opened the form but haven’t submitted.', 'A reminder usually does it.'],
            ['Submitted', 'Details and documents received.', 'Review.'],
          ],
        },
        {
          type: 'table',
          head: ['Review', 'Means'],
          rows: [
            ['To review', 'Submitted (or resubmitted) and not checked yet.'],
            ['Verified', 'Checked by finance; ready to use.'],
            ['Needs correction', 'Finance asked the customer to fix something; waiting for them to resubmit.'],
          ],
        },
      ],
    },
    {
      id: 'activity',
      group: 'reference',
      title: 'Activity and audit trail',
      summary: 'What is recorded and where to find it.',
      link: { to: '/admin/activity', label: 'Open Activity' },
      blocks: [
        {
          type: 'p',
          text: 'Every meaningful event is recorded with who did it and when: forms opened and submitted (with the fields that changed), emails, reviews, imports, exports, entity and settings changes, sign-ins and user changes.',
        },
        { type: 'list', items: ['Activity shows everything, with search and a filter by type.', 'Each customer’s page has its own History, including every email and whether it was delivered to the mail server.'] },
      ],
    },
    {
      id: 'settings',
      group: 'reference',
      title: 'Settings reference',
      summary: 'What each settings tab controls.',
      link: { to: '/admin/settings', label: 'Open Settings' },
      blocks: [
        {
          type: 'table',
          head: ['Tab', 'Controls'],
          rows: [
            ['Form', 'Title, introduction, due date, link validity, contact details, optional sections, form logo, email button colour.'],
            ['Emails', 'Invite and reminder wording with live preview, test email, automatic reminders, confirmation emails.'],
            ['Users', 'Who can sign in to the admin panel; change your password.'],
            ['System', 'Server version and health (read-only), and demo data.'],
          ],
        },
        { type: 'p', text: 'Email server, web address, upload limit and similar technical settings are set by IT on the server (see docs/OPERATIONS.md).' },
      ],
    },
    {
      id: 'security',
      group: 'reference',
      title: 'Security and privacy',
      summary: 'How customer data and documents are protected.',
      blocks: [
        {
          type: 'list',
          items: [
            'Documents (licences, Emirates IDs, passports, bank details) are stored privately on the server. They are never public and open only for signed-in admins.',
            `Customer links are long random codes that expire after **${f.linkValidityDays} days**. Generating a new link stops the old one immediately.`,
            'Admin sessions last 12 hours. Changing your password signs you out everywhere else. Removing a user signs them out at once.',
            'Sign-in and form submissions are rate-limited against guessing and abuse.',
            'Customers can upload any document, but programs and scripts are refused — the file’s contents are checked, so renaming one doesn’t help.',
            'PDFs and images open in the browser; every other file (Word, Excel, zip…) is downloaded instead of opened, so nothing uploaded can run inside the admin panel.',
          ],
        },
        { type: 'callout', tone: 'warning', title: 'Treat exports with care', text: 'The Excel export contains bank details and identifiers. Store it in a restricted finance folder, not in email.' },
      ],
    },
    {
      id: 'demo',
      group: 'reference',
      title: 'Demo data',
      summary: 'Sample customers for training.',
      link: { to: '/admin/settings?tab=system', label: 'Open System settings' },
      blocks: [
        {
          type: 'p',
          text: 'Demo data adds about 20 sample customers (codes starting **DEMO-**) in every state, with sample PDFs stamped “SAMPLE — DEMO DATA”, history and one sample entity. Use it to train the team or to try things without touching real customers.',
        },
        {
          type: 'list',
          items: [
            'Demo customers use made-up .example addresses and are **never emailed** — sending is simulated.',
            'A yellow banner shows on every page while demo data is loaded.',
            'Settings → System → Remove demo data deletes only the sample records.',
            'On the live server, loading demo data is off unless IT allows it.',
          ],
        },
      ],
    },

    // ---------------------------------------------------------------- help
    {
      id: 'faq',
      group: 'help',
      title: 'Troubleshooting and FAQ',
      summary: 'The questions customers and the team ask most.',
      blocks: [
        {
          type: 'table',
          head: ['Situation', 'What to do'],
          rows: [
            ['“The link says it has expired.”', 'Send them a reminder — expired links are renewed automatically. Or generate a new link on their page.'],
            ['“The link is not valid.”', 'They probably copied it partly, or a newer link replaced it. Copy the current link from their page and send it again.'],
            ['They didn’t receive the email.', 'Check History on their page: “sent” means the mail server accepted it — ask them to check junk mail. “FAILED” shows the reason.'],
            ['The link went to the wrong person.', 'Generate a new link on their page. The old one stops working at once.'],
            ['They need to change something after submitting.', 'They open the same link, change it, and submit again. You’ll see what changed in History.'],
            ['A customer appears twice.', 'Imports match on code. Delete the duplicate and keep codes consistent with the ERP.'],
            [
              'Delete a customer and their documents.',
              'On the customer’s page: ⋯ → Delete customer. For several at once: tick them in Customers, then Delete in the dark bar. This removes their details, every uploaded file (including earlier versions) and their link. It can’t be undone; Activity keeps one line per deletion.',
            ],
            ['Emails only appear in the server log.', 'Email sending isn’t connected — IT needs to add the SMTP settings.'],
          ],
        },
        {
          type: 'p',
          text: f.contactEmail ? `Customers are told to contact **${f.contactEmail}** with questions.` : 'Set a contact email under Settings → Form so customers know who to ask.',
        },
      ],
    },
  ];
}

/** Plain text of a topic, for search. */
export function topicText(t: Topic): string {
  const parts: string[] = [t.title, t.summary];
  for (const b of t.blocks) {
    if (b.type === 'p' || b.type === 'h') parts.push(b.text);
    else if (b.type === 'list') parts.push(...b.items);
    else if (b.type === 'steps') parts.push(...b.items.flatMap((i) => [i.title, i.text]));
    else if (b.type === 'table') parts.push(...b.head, ...b.rows.flat());
    else parts.push(b.title, b.text ?? '', ...(b.items ?? []));
  }
  return parts.join(' ').replace(/\*\*/g, '').toLowerCase();
}
