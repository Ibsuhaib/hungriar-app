import { Link } from 'react-router-dom'

const SUPPORT_EMAIL = 'support@goanaar.example'
const SUPPORT_PHONE = '+91-90000-00000'

export default function Terms() {
  return (
    <div className="min-h-screen bg-sand-100 px-4 py-10">
      <div className="mx-auto max-w-2xl rounded-2xl bg-white p-6 shadow-xl sm:p-8">
        <Link to="/" className="text-sm font-medium text-primary-600 hover:underline">
          &larr; Back to Goana AR
        </Link>

        <h1 className="mt-4 text-2xl font-bold text-gray-900">Terms of Service</h1>
        <p className="mt-1 text-sm text-gray-500">Last updated: 15 June 2026</p>

        <div className="mt-6 space-y-5 text-sm leading-relaxed text-gray-700">
          <section>
            <h2 className="text-base font-semibold text-gray-900">1. The Service</h2>
            <p className="mt-1">
              Goana AR ("the Service") is a digital menu and ordering platform that lets restaurants publish a
              menu - including photos and AR / 3D models of dishes - that diners can browse and order from by
              scanning a table QR code. The Service is operated and provided to your restaurant ("you", "the
              Restaurant") by the Goana AR team.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900">2. Accounts and Access</h2>
            <p className="mt-1">
              Restaurant admin accounts are created by the Goana AR team. You are responsible for keeping your
              login credentials confidential and for all activity that occurs under your account. Notify us
              immediately at {SUPPORT_EMAIL} if you suspect unauthorised access.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900">3. Subscriptions and Payments</h2>
            <ul className="mt-1 list-disc space-y-1 pl-5">
              <li>
                Subscription fees and any one-time AR model creation fees are collected directly by Goana AR via
                UPI, cash, or bank transfer, as agreed with you separately. The Service does not process card or
                online payments.
              </li>
              <li>
                New restaurants receive a free trial period. After the trial ends, continued access requires an
                active paid subscription.
              </li>
              <li>
                Payments are recorded manually by the Goana AR team. Your admin dashboard always shows your
                current subscription status and the date your access is paid until.
              </li>
              <li>
                If your subscription lapses, your public menu and ordering pages may be temporarily deactivated
                until payment is renewed. We will make reasonable efforts to notify you before this happens.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900">4. Your Content</h2>
            <p className="mt-1">
              You are responsible for the accuracy of your menu items, descriptions, prices, categories, table
              setup, and item availability. AR / 3D models and product photos are created and uploaded by the
              Goana AR team using materials and information you provide, and remain associated with your
              restaurant account for as long as you use the Service.
            </p>
            <p className="mt-1">
              You must not upload or request the upload of content that is unlawful, offensive, misleading, or
              that infringes the intellectual property or other rights of any third party.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900">5. Orders Placed by Diners</h2>
            <p className="mt-1">
              Diners place orders through the Service without creating an account. Orders, order items, and table
              assignments are visible to your restaurant's admin dashboard in real time so your staff can prepare
              and serve them. The Service does not process payments for orders - payment for food and drink
              remains a matter between you and your customers.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900">6. Fair Use and Rate Limits</h2>
            <p className="mt-1">
              To keep the Service reliable for everyone, automated request limits apply to both diner-facing pages
              and the admin dashboard. Excessive or abusive use, including attempts to circumvent table tokens,
              rate limits, or access another restaurant's data, is prohibited and may result in suspension.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900">7. Suspension and Termination</h2>
            <p className="mt-1">
              Goana AR may suspend or deactivate a restaurant's access for overdue payments, violation of these
              terms, or misuse of the platform, after reasonable notice where practical. You may request
              discontinuation of the Service at any time by contacting us.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900">8. Disclaimer and Liability</h2>
            <p className="mt-1">
              The Service is provided on an "as is" and "as available" basis. While we aim for high availability,
              we do not guarantee the Service will be uninterrupted or error-free. To the extent permitted by law,
              Goana AR's liability for any claim relating to the Service is limited to the subscription fees paid
              by you in the three months preceding the claim.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900">9. Changes to These Terms</h2>
            <p className="mt-1">
              We may update these terms from time to time. If changes are material, restaurant admins will be
              asked to review and re-accept them the next time they sign in.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900">10. Contact</h2>
            <p className="mt-1">
              Questions about these terms? Contact us at{' '}
              <a href={`mailto:${SUPPORT_EMAIL}`} className="font-medium text-primary-600 underline">
                {SUPPORT_EMAIL}
              </a>{' '}
              or call {SUPPORT_PHONE}.
            </p>
          </section>
        </div>

        <p className="mt-8 text-center text-xs text-gray-400">
          See also our{' '}
          <Link to="/privacy" className="font-medium text-primary-600 underline">
            Privacy Policy
          </Link>
          .
        </p>
      </div>
    </div>
  )
}
