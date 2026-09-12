import { Link } from 'react-router-dom'

const SUPPORT_EMAIL = 'hungriar.app@gmail.com'
const SUPPORT_PHONE = '+91-92252-49945'
const REGISTERED_ADDRESS =
  '0023, Kerker Complex, VK Road, Canca Bandh, Mapusa, North Goa, Goa 403507, India'
const UDYAM_NUMBER = 'UDYAM-GA-01-0063058'

export default function Privacy() {
  return (
    <div className="min-h-screen bg-sand-100 px-4 py-10">
      <div className="mx-auto max-w-2xl rounded-2xl bg-white p-6 shadow-xl sm:p-8">
        <Link to="/" className="text-sm font-medium text-primary-600 hover:underline">
          &larr; Back to HungriAR
        </Link>

        <h1 className="mt-4 text-2xl font-bold text-gray-900">Privacy Policy</h1>
        <p className="mt-1 text-sm text-gray-500">Last updated: 13 July 2026</p>

        <div className="mt-6 space-y-5 text-sm leading-relaxed text-gray-700">
          <section>
            <h2 className="text-base font-semibold text-gray-900">1. Overview</h2>
            <p className="mt-1">
              HungriAR, a registered Micro enterprise operating from Mapusa, Goa, India, provides restaurant management
              software: the HungriAR restaurant panel with QR-code dine-in ordering, and the
              hungriOrder online-ordering storefront for delivery and takeaway (together, "the
              Platform"). This policy explains what information the Platform collects from diners,
              online-ordering customers, and restaurant admins, and how it is used and stored. The
              Platform is built on Supabase (database, authentication, and file storage) and,
              optionally, Cloudflare R2 for media storage.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900">2. Dine-In Diners (QR Menu)</h2>
            <p className="mt-1">
              Diners scanning a table QR code do not create accounts and are not asked for their
              name, phone number, or email address to browse a menu or place a dine-in order. When a
              dine-in order is placed, the Platform stores:
            </p>
            <ul className="mt-1 list-disc space-y-1 pl-5">
              <li>The order items, quantities, and prices.</li>
              <li>The table the order was placed from.</li>
              <li>The time the order was placed and its preparation status.</li>
            </ul>
            <p className="mt-1">
              A diner's browser also keeps a small amount of information in local storage on their
              own device only: the current cart, a signed table session token, a list of recent
              order IDs (for order status), and a randomly generated identifier used to apply
              fair-use rate limits. None of this is used for advertising or cross-site tracking.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900">
              3. Online Ordering Customers (hungriOrder)
            </h2>
            <p className="mt-1">
              When you order delivery or takeaway through a restaurant's hungriOrder storefront, we
              collect what is needed to fulfil your order:
            </p>
            <ul className="mt-1 list-disc space-y-1 pl-5">
              <li>Your mobile number, so the restaurant can contact you about your order.</li>
              <li>Your name (optional).</li>
              <li>Your delivery address, for delivery orders.</li>
              <li>
                Your approximate location, only if you grant permission — used to show nearby
                restaurants and help delivery. You can decline and search your area manually.
              </li>
              <li>Your order items, payment method choice, and any special instructions.</li>
            </ul>
            <p className="mt-1">
              This information is shared with the restaurant you order from, which needs it to
              prepare and deliver your order. Restaurants are required to use it only for fulfilling
              your orders — not for unsolicited marketing. We do not sell your information and we do
              not use it for advertising. Payment happens directly between you and the restaurant
              (cash, UPI, or card on delivery) — the Platform does not process or store payment card
              details.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900">
              4. Information We Collect from Restaurant Admins
            </h2>
            <ul className="mt-1 list-disc space-y-1 pl-5">
              <li>
                Login email address and password (stored securely and hashed by Supabase Auth — we
                never see your plaintext password).
              </li>
              <li>
                Restaurant profile details: name, slug, logo, contact details, address, location
                coordinates, GSTIN, FSSAI licence number, currency, and tax rate.
              </li>
              <li>Menu data: categories, items, descriptions, prices, photos, and AR/3D models.</li>
              <li>Table configuration, generated QR tokens, and station (chef/staff) accounts.</li>
              <li>
                Your signed service agreement: the agreement text, your typed name, your drawn
                signature, and the signing timestamp.
              </li>
              <li>Subscription status, trial/paid-until dates, and last login time.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900">5. How We Use This Information</h2>
            <ul className="mt-1 list-disc space-y-1 pl-5">
              <li>
                To operate the Platform: menus, ordering, kitchen display, billing, delivery
                management, analytics, and reports.
              </li>
              <li>To let restaurants fulfil and manage the orders you place.</li>
              <li>To enforce fair-use rate limits and protect accounts.</li>
              <li>To track subscription status and notify restaurants about renewals.</li>
              <li>To provide support when you contact us.</li>
            </ul>
            <p className="mt-1">
              We do not sell personal information, and we do not use diner or customer data for
              advertising.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900">6. Where Data Is Stored</h2>
            <p className="mt-1">
              Data is stored in a Supabase Postgres database with row-level security, so each
              restaurant can only access its own data — including its own customers' order data.
              Images and AR/3D model files are stored in Supabase Storage or Cloudflare R2.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900">7. Data Retention</h2>
            <ul className="mt-1 list-disc space-y-1 pl-5">
              <li>
                Active orders remain visible to the restaurant until settled, then are archived into
                a billing history record. Detailed billing history is automatically purged on a
                rolling schedule (currently 7 days); aggregated sales totals are retained for
                analytics.
              </li>
              <li>Rate-limit counters and session records expire automatically.</li>
              <li>
                Signed agreements and subscription records are retained for as long as legally
                appropriate.
              </li>
              <li>
                If a restaurant leaves the Platform, its data — menu, tables, orders, billing
                history, and its customers' order data — is permanently deleted within 30 days.
              </li>
            </ul>
            <p className="mt-1">
              The Platform is an operational tool, not a system of record: restaurants are
              responsible for maintaining their own books of account and tax records.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900">8. Disclosure to Authorities</h2>
            <p className="mt-1">
              We may disclose data we hold to government authorities (such as the Income Tax
              Department, police, or courts) when legally required to do so by a valid notice or
              order. Where the law permits, we will inform the affected restaurant or person.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900">9. Your Rights</h2>
            <p className="mt-1">
              In line with applicable Indian law, including the Digital Personal Data Protection
              Act, 2023, you can ask us to access, correct, or delete personal data we hold about
              you. Diners and customers can also clear their device's local storage at any time.
              Restaurant admins can update their details from Settings or contact us to delete
              their account. To make any request, contact our grievance contact below — we aim to
              acknowledge within 48 hours.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900">10. Changes to This Policy</h2>
            <p className="mt-1">
              We may update this policy from time to time. Material changes will be reflected in the
              "Last updated" date above and, where relevant, restaurant admins will be asked to
              re-accept our terms.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900">11. Contact &amp; Grievances</h2>
            <p className="mt-1">
              Questions about this policy, your data, or a complaint? Contact our grievance
              contact at{' '}
              <a href={`mailto:${SUPPORT_EMAIL}`} className="font-medium text-primary-600 underline">
                {SUPPORT_EMAIL}
              </a>{' '}
              or call {SUPPORT_PHONE}.
            </p>
            <p className="mt-2 text-xs text-gray-500">
              HungriAR · Udyam Registration No. {UDYAM_NUMBER}
              <br />
              {REGISTERED_ADDRESS}
            </p>
          </section>
        </div>

        <p className="mt-8 text-center text-xs text-gray-400">
          See also our{' '}
          <Link to="/terms" className="font-medium text-primary-600 underline">
            Terms of Service
          </Link>
          .
        </p>
      </div>
    </div>
  )
}
