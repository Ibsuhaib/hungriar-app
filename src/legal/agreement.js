// ─── HungriAR Subscription & Service Agreement ────────────────────────────────
// Single source of truth for the agreement text. The modal renders it, the
// signed snapshot stored in `signed_agreements` is generated from it, and the
// downloadable PDF prints the stored snapshot (never this live copy) so the
// record always shows exactly what was signed, even after the text changes.
//
// When you materially change this text, bump AGREEMENT_VERSION — every
// restaurant admin will be asked to re-sign on their next sign-in.

export const AGREEMENT_VERSION = '2.1'

export const SUPPORT_EMAIL = 'hungriar.app@gmail.com'
export const SUPPORT_PHONE = '+91-81970-02978'
export const REGISTERED_ADDRESS =
  '0023, Kerker Complex, VK Road, Canca Bandh, Mapusa, North Goa, Goa 403507, India'
export const UDYAM_NUMBER = 'UDYAM-GA-01-0063058'

export const AGREEMENT_SECTIONS = [
  {
    title: '1. This Agreement',
    body: [
      'This agreement is between HungriAR ("we", "us"), a Micro enterprise registered in India under Udyam Registration No. UDYAM-GA-01-0063058, having its registered office at 0023, Kerker Complex, VK Road, Canca Bandh, Mapusa, North Goa, Goa 403507, India, and the restaurant identified at signature ("you", "the Restaurant"). It covers your use of the HungriAR platform: the restaurant management panel, QR menu and dine-in ordering, kitchen and billing tools, and — where enabled — the hungriOrder online-ordering storefront (together, "the Platform").',
      'By signing electronically below, you accept this agreement on behalf of the Restaurant and confirm you are authorised to do so. Your electronic signature, together with the recorded date, time, and account identity, forms a valid and binding acceptance under the Information Technology Act, 2000.',
    ],
  },
  {
    title: '2. The Service',
    body: [
      'The Platform provides digital menu publishing, QR-code table ordering, waiter/staff order taking, kitchen order tickets (KOT), billing and settlement, sales analytics, day-end reporting, and — depending on your plan — customer self-ordering, menu photography, AR 3D dish previews, and an online ordering storefront for delivery and takeaway.',
      'The features available to you depend on the plan you subscribe to, as shown on your dashboard.',
    ],
  },
  {
    title: '3. Accounts and Security',
    body: [
      'Your admin account and any station accounts (chef, staff, delivery) are created for your Restaurant. You are responsible for keeping login credentials and station PINs confidential and for all activity under your accounts. Tell us immediately if you suspect unauthorised access.',
    ],
  },
  {
    title: '4. Subscription, Fees and Price Revisions',
    body: [
      'You pay a yearly subscription fee for your chosen plan, plus a one-time setup charge quoted for your restaurant. Fees are as agreed with you at signup and recorded on your dashboard, and exclude GST where applicable.',
      'Fees are collected directly by HungriAR via UPI, cash, or bank transfer. The Platform does not process your subscription payment.',
      'Your fee is fixed for the duration of each paid term. Fees for renewal terms may be revised by HungriAR; we will notify you at least 30 days before your renewal date. Continued use of the Platform after renewal constitutes acceptance of the revised fee.',
      'If your subscription lapses, access to the Platform (including your public menu and online storefront) may be suspended until payment is renewed. We will make reasonable efforts to notify you before suspension.',
    ],
  },
  {
    title: '5. Free Trial',
    body: [
      'New restaurants may receive a free trial period at our discretion. After the trial ends, continued access requires an active paid subscription.',
    ],
  },
  {
    title: '6. Your Content and Responsibilities',
    body: [
      'You are responsible for the accuracy of your menu, prices, descriptions, item availability, table setup, and restaurant details, and for keeping them up to date.',
      'You are solely responsible for complying with the laws that apply to running your restaurant, including FSSAI licensing, GST registration and invoicing, and any local trade licences. The Platform displays information you provide (such as your GSTIN and FSSAI number) but does not verify it.',
      'You must not upload or request content that is unlawful, offensive, misleading, or that infringes anyone\'s rights, and you must use the Platform only for lawful restaurant operations.',
    ],
  },
  {
    title: '7. Your Data Belongs to You',
    body: [
      'Your business data — menu, orders, billing records, analytics — and the customer data collected through your storefront belong to your Restaurant. We process this data only to operate the Platform for you. We do not sell it and we do not use it for advertising.',
    ],
  },
  {
    title: '8. Data Retention and Your Books of Account',
    body: [
      'The Platform is an operational tool, not a system of record and not accounting software. Detailed billing history is automatically purged on a rolling schedule (currently 7 days); aggregated totals are retained for analytics.',
      'Maintaining books of account, tax records, and financial records as required by law (including the Income Tax Act and GST law) is solely your responsibility. Keep your own copies of any records you need — printed reports and day-end summaries are provided for this purpose.',
    ],
  },
  {
    title: '9. Disclosure to Authorities',
    body: [
      'We may disclose your data, including order and billing records we hold, to government authorities (such as the Income Tax Department, police, or courts) when we are legally required to do so by a valid notice or order. Where the law permits, we will inform you of such a disclosure.',
    ],
  },
  {
    title: '10. Customer (Diner) Data',
    body: [
      'Where online ordering is enabled, customers provide personal data such as their phone number and delivery address so their orders can be fulfilled. You must use this data only to fulfil and support those orders — not for unsolicited marketing — and handle it in line with applicable Indian data protection law, including the Digital Personal Data Protection Act, 2023.',
    ],
  },
  {
    title: '11. Availability and Liability',
    body: [
      'The Platform is provided on an "as is" and "as available" basis. We aim for high availability but do not guarantee the Platform will be uninterrupted or error-free. Your internet connection, devices, and printers are your responsibility.',
      'To the extent permitted by law, we are not liable for indirect losses such as lost profits or lost business, and our total liability for any claim relating to the Platform is limited to the subscription fees you paid in the three months before the claim arose.',
    ],
  },
  {
    title: '12. Suspension and Termination',
    body: [
      'We may suspend or deactivate access for overdue payments, violation of this agreement, or misuse of the Platform, after reasonable notice where practical. You may discontinue the service at any time by contacting us.',
      'After termination, your data is permanently deleted after 30 days. Export or print anything you need before then.',
    ],
  },
  {
    title: '13. Intellectual Property',
    body: [
      'The Platform — its software, design, and branding — remains the property of HungriAR. You receive a licence to use it for your Restaurant while your subscription is active. Your own branding, menu content, and photos remain yours; AR/3D models created by our team remain associated with your account for as long as you use the Platform.',
    ],
  },
  {
    title: '14. Changes to This Agreement',
    body: [
      'We may update this agreement from time to time. If changes are material, you will be asked to review and re-sign the updated version the next time you sign in, and the new version will apply from your acceptance.',
    ],
  },
  {
    title: '15. Governing Law and Disputes',
    body: [
      'This agreement is governed by the laws of India. Both parties will first try to resolve any dispute in good faith. Failing that, the courts at Mapusa, Goa shall have exclusive jurisdiction.',
    ],
  },
  {
    title: '16. Contact',
    body: [
      `Questions about this agreement: ${SUPPORT_EMAIL} · ${SUPPORT_PHONE}.`,
    ],
  },
]

/**
 * Plain-text render of the agreement, stored verbatim in `signed_agreements`
 * at signing time as the immutable record of exactly what was accepted.
 */
export function buildAgreementText() {
  const header = `HUNGRIAR SUBSCRIPTION & SERVICE AGREEMENT\nVersion ${AGREEMENT_VERSION}\n`
  const body = AGREEMENT_SECTIONS
    .map((s) => `${s.title}\n${s.body.join('\n\n')}`)
    .join('\n\n')
  return `${header}\n${body}`
}
