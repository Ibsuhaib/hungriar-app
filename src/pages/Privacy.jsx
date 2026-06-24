import { Link } from 'react-router-dom'

const SUPPORT_EMAIL = 'bgo83418@gmail.com'
const SUPPORT_PHONE = '+91-81970-02978'

export default function Privacy() {
  return (
    <div className="min-h-screen bg-sand-100 px-4 py-10">
      <div className="mx-auto max-w-2xl rounded-2xl bg-white p-6 shadow-xl sm:p-8">
        <Link to="/" className="text-sm font-medium text-primary-600 hover:underline">
          &larr; Back to HungriAR
        </Link>

        <h1 className="mt-4 text-2xl font-bold text-gray-900">Privacy Policy</h1>
        <p className="mt-1 text-sm text-gray-500">Last updated: 15 June 2026</p>

        <div className="mt-6 space-y-5 text-sm leading-relaxed text-gray-700">
          <section>
            <h2 className="text-base font-semibold text-gray-900">1. Overview</h2>
            <p className="mt-1">
              This policy explains what information HungriAR collects when restaurants and their diners use the
              Service, and how that information is used and stored. HungriAR is built on Supabase (database,
              authentication, and file storage) and, optionally, Cloudflare R2 for media storage.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900">2. Information We Collect from Diners</h2>
            <p className="mt-1">
              Diners do not create accounts and are not asked for their name, phone number, or email address to
              browse a menu or place an order. When a diner places an order via a table QR code, the Service
              stores:
            </p>
            <ul className="mt-1 list-disc space-y-1 pl-5">
              <li>The order items, quantities, and prices.</li>
              <li>The table the order was placed from.</li>
              <li>The time the order was placed and its preparation status.</li>
            </ul>
            <p className="mt-1">
              A diner's browser also keeps a small amount of information in local storage on their own device
              only:
            </p>
            <ul className="mt-1 list-disc space-y-1 pl-5">
              <li>The current cart contents for the restaurant being viewed.</li>
              <li>A signed table session token (so the menu and ordering pages know which table to bill).</li>
              <li>A list of recent order IDs, used to show "My Orders" / order status.</li>
              <li>
                A randomly generated identifier and device fingerprint used only to apply fair-use rate limits and
                detect session replay - this is not used for advertising or cross-site tracking.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900">3. Information We Collect from Restaurant Admins</h2>
            <ul className="mt-1 list-disc space-y-1 pl-5">
              <li>Login email address and password (stored securely and hashed by Supabase Auth - we never see your plaintext password).</li>
              <li>Restaurant profile details: name, slug, logo, contact email, currency, and tax rate.</li>
              <li>Menu data you manage: categories, items, descriptions, prices, photos, and AR / 3D models.</li>
              <li>Table configuration and generated QR tokens.</li>
              <li>Records of agreement acceptance (version and timestamp) and last login time.</li>
              <li>Subscription status, trial/paid-until dates, and internal notes maintained by the HungriAR team.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900">4. How We Use This Information</h2>
            <ul className="mt-1 list-disc space-y-1 pl-5">
              <li>To operate the digital menu, AR viewing, ordering, kitchen display, billing, and analytics features.</li>
              <li>To enforce fair-use rate limits and protect accounts from session replay.</li>
              <li>To track subscription status and notify restaurants about renewals.</li>
              <li>To provide customer support when you contact us.</li>
            </ul>
            <p className="mt-1">We do not sell personal information, and we do not use diner data for advertising.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900">5. Where Data Is Stored</h2>
            <p className="mt-1">
              Restaurant, menu, table, and order data is stored in a Supabase Postgres database with row-level
              security so each restaurant can only access its own data. Images and AR / 3D model files are stored
              in Supabase Storage, or in a Cloudflare R2 bucket if the restaurant's deployment is configured to use
              R2 instead.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900">6. Data Retention</h2>
            <p className="mt-1">
              Active orders remain visible to the restaurant until the table bill is settled, after which they are
              archived into a billing history record. Rate-limit counters and session-replay records expire
              automatically. If a restaurant's account is removed from the platform, its menu, tables, orders, and
              billing history are permanently deleted.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900">7. Your Choices</h2>
            <p className="mt-1">
              Diners can clear their cart, table session, and order history at any time by clearing their browser's
              local storage for the restaurant's site. Restaurant admins can update their profile information and
              change their password from the Settings page, or contact us to request deletion of their account.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900">8. Changes to This Policy</h2>
            <p className="mt-1">
              We may update this policy from time to time. Material changes will be reflected in the "Last
              updated" date above and, where relevant, restaurant admins will be asked to re-accept our terms.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900">9. Contact</h2>
            <p className="mt-1">
              Questions about this policy or your data? Contact us at{' '}
              <a href={`mailto:${SUPPORT_EMAIL}`} className="font-medium text-primary-600 underline">
                {SUPPORT_EMAIL}
              </a>{' '}
              or call {SUPPORT_PHONE}.
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
