import { Link } from 'react-router-dom'

const SUPPORT_EMAIL = 'hungriar.app@gmail.com'
const SUPPORT_PHONE = '+91-81970-02978'

export default function Terms() {
  return (
    <div className="min-h-screen bg-sand-100 px-4 py-10">
      <div className="mx-auto max-w-2xl rounded-2xl bg-white p-6 shadow-xl sm:p-8">
        <Link to="/" className="text-sm font-medium text-primary-600 hover:underline">
          &larr; Back to HungriAR
        </Link>

        <h1 className="mt-4 text-2xl font-bold text-gray-900">Terms of Service</h1>
        <p className="mt-1 text-sm text-gray-500">Last updated: 13 July 2026</p>

        <div className="mt-6 space-y-5 text-sm leading-relaxed text-gray-700">
          <section>
            <h2 className="text-base font-semibold text-gray-900">1. The Service</h2>
            <p className="mt-1">
              HungriAR ("the Platform"), operated from Mangalore, Karnataka, India, is restaurant
              management software: a digital menu and dine-in ordering system (including photos and
              AR/3D dish previews) that diners use by scanning a table QR code, restaurant tools for
              orders, kitchen tickets, billing, and analytics, and — where a restaurant enables it —
              the hungriOrder online storefront for delivery and takeaway orders. These terms apply
              to restaurants using the Platform ("you", "the Restaurant") and, where stated, to
              diners and customers who order through it.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900">2. Accounts and Access</h2>
            <p className="mt-1">
              Restaurant admin accounts are created by the HungriAR team. You are responsible for
              keeping your login credentials and station PINs confidential and for all activity that
              occurs under your accounts. Notify us immediately at {SUPPORT_EMAIL} if you suspect
              unauthorised access. Restaurant admins additionally sign a Subscription &amp; Service
              Agreement inside the Platform; if these terms and that agreement differ, the signed
              agreement prevails for that restaurant.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900">3. Subscriptions and Payments</h2>
            <ul className="mt-1 list-disc space-y-1 pl-5">
              <li>
                Subscription fees and any one-time setup or AR model creation fees are collected
                directly by HungriAR via UPI, cash, or bank transfer, as agreed with you. The
                Platform does not process subscription payments.
              </li>
              <li>
                New restaurants may receive a free trial period. After the trial ends, continued
                access requires an active paid subscription.
              </li>
              <li>
                Your fee is fixed for each paid term. Fees for renewal terms may be revised; we will
                notify you at least 30 days before your renewal date, and continued use after
                renewal constitutes acceptance of the revised fee.
              </li>
              <li>
                If your subscription lapses, your admin panel, public menu, and online storefront
                may be temporarily deactivated until payment is renewed. We will make reasonable
                efforts to notify you before this happens.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900">4. Your Content and Compliance</h2>
            <p className="mt-1">
              You are responsible for the accuracy of your menu items, descriptions, prices,
              categories, table setup, item availability, and restaurant details. AR/3D models and
              product photos created by the HungriAR team from your materials remain associated with
              your restaurant account for as long as you use the Platform.
            </p>
            <p className="mt-1">
              You are solely responsible for complying with the laws that apply to your restaurant,
              including FSSAI licensing, GST registration and invoicing, and local trade licences.
              The Platform displays information you provide (such as your GSTIN and FSSAI number)
              but does not verify it. You must not upload content that is unlawful, offensive,
              misleading, or that infringes the rights of any third party.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900">5. Dine-In Orders</h2>
            <p className="mt-1">
              Diners place dine-in orders through the QR menu without creating an account. Orders
              are visible to your restaurant's dashboard in real time so your staff can prepare and
              serve them. The Platform does not process payments for dine-in orders — payment for
              food and drink remains a matter between you and your customers.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900">6. Online Orders (hungriOrder)</h2>
            <ul className="mt-1 list-disc space-y-1 pl-5">
              <li>
                Online orders placed through a restaurant's storefront are transmitted to that
                restaurant, which is solely responsible for accepting, preparing, and delivering
                them, and for food quality and safety. The sale is a contract between the customer
                and the restaurant; HungriAR is the technology provider, not the seller.
              </li>
              <li>
                Payment for online orders is made directly to the restaurant on delivery or pickup
                (cash, UPI, or card). The Platform does not collect or process customer payments.
              </li>
              <li>
                Customers provide a phone number and, for delivery, an address so the restaurant can
                fulfil the order. Restaurants must use this information only to fulfil orders — see
                our <Link to="/privacy" className="font-medium text-primary-600 underline">Privacy Policy</Link>.
              </li>
              <li>
                Order cancellations and refunds for online orders are handled by the restaurant.
                Customers can contact the restaurant directly using the phone number shown on the
                order tracking page, or reach our grievance contact below for platform issues.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900">
              7. Data, Retention, and Books of Account
            </h2>
            <ul className="mt-1 list-disc space-y-1 pl-5">
              <li>
                Your business data and your customers' order data belong to you. We process them
                only to operate the Platform and do not sell them or use them for advertising.
              </li>
              <li>
                The Platform is an operational tool, not a system of record or accounting software.
                Detailed billing history is automatically purged on a rolling schedule (currently 7
                days). Maintaining books of account and tax records as required by law is your
                responsibility — keep your own copies of the reports you need.
              </li>
              <li>
                We may disclose data we hold to government authorities when legally required by a
                valid notice or order.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900">8. Fair Use and Rate Limits</h2>
            <p className="mt-1">
              To keep the Platform reliable for everyone, automated request limits apply to both
              customer-facing pages and the admin dashboard. Excessive or abusive use, including
              attempts to circumvent table tokens, rate limits, or access another restaurant's data,
              is prohibited and may result in suspension.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900">9. Suspension and Termination</h2>
            <p className="mt-1">
              HungriAR may suspend or deactivate a restaurant's access for overdue payments,
              violation of these terms, or misuse of the Platform, after reasonable notice where
              practical. You may request discontinuation of the service at any time by contacting
              us. After termination, restaurant data is permanently deleted within 30 days.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900">10. Disclaimer and Liability</h2>
            <p className="mt-1">
              The Platform is provided on an "as is" and "as available" basis. While we aim for high
              availability, we do not guarantee the Platform will be uninterrupted or error-free.
              Your internet connection, devices, and printers are your responsibility. To the extent
              permitted by law, HungriAR is not liable for indirect losses such as lost profits, and
              its total liability for any claim relating to the Platform is limited to the
              subscription fees paid by the Restaurant in the three months preceding the claim.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900">11. Governing Law</h2>
            <p className="mt-1">
              These terms are governed by the laws of India. Both parties will first try to resolve
              any dispute in good faith; failing that, the courts at Mangalore, Karnataka shall have
              exclusive jurisdiction.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900">12. Changes to These Terms</h2>
            <p className="mt-1">
              We may update these terms from time to time. If changes are material, restaurant
              admins will be asked to review and re-accept them the next time they sign in.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900">13. Contact &amp; Grievances</h2>
            <p className="mt-1">
              Questions or complaints about these terms or the Platform? Contact our grievance
              contact at{' '}
              <a href={`mailto:${SUPPORT_EMAIL}`} className="font-medium text-primary-600 underline">
                {SUPPORT_EMAIL}
              </a>{' '}
              or call {SUPPORT_PHONE} — we aim to acknowledge complaints within 48 hours. HungriAR ·
              Mangalore, Karnataka, India.
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
