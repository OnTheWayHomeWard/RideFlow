import { Link } from 'react-router-dom'
import { LegalLayout, H2, P, UL, useSEO } from '../lib'

const UPDATED = 'May 23, 2026'

export default function PrivacyPolicy({ site }) {
  const brand = site.brandName
  const email = site.settings.company_email || 'privacy@gobellme.com'
  const phone = site.settings.company_phone
  useSEO(
    `Privacy Policy — ${brand}`,
    `How ${brand} collects, uses, and protects your personal information, including booking details, payment data, and SMS communications.`
  )

  return (
    <LegalLayout site={site} title="Privacy Policy" updated={UPDATED}>
      <P>
        This Privacy Policy explains how {brand} ("we," "us," or "our") collects, uses, discloses, and
        safeguards your information when you visit our website, create an account, or book a ride with us.
        By using our services you agree to the practices described here.
      </P>

      <H2>1. Information We Collect</H2>
      <P>We collect the following categories of information:</P>
      <UL>
        <li><b>Account information</b> — your name, phone number, and email address when you create an account or place a booking.</li>
        <li><b>Booking & customer information</b> — pickup and drop-off locations, dates, times, vehicle preferences, passenger and luggage details, room number (where applicable), and any notes you provide.</li>
        <li><b>Payment information</b> — payments are processed by our third-party payment processor (Stripe). We do not store your full card number, CVC, or bank details on our servers. We retain only limited transaction metadata (amount, status, and a payment reference).</li>
        <li><b>SMS communications</b> — your mobile number and the consent status, delivery status, and content category of messages we send you.</li>
        <li><b>Technical & usage data</b> — IP address, browser type, device information, and pages visited, collected automatically via cookies and similar technologies.</li>
        <li><b>Location data</b> — if you grant permission, your device's location to help set your pickup point. You can decline and enter your pickup manually.</li>
      </UL>

      <H2>2. How We Use Your Information</H2>
      <UL>
        <li>To create and manage your account and process your bookings.</li>
        <li>To send booking confirmations, ride reminders, status updates, and authentication (one-time) codes via SMS.</li>
        <li>To provide customer support and respond to your inquiries.</li>
        <li>To process payments and prevent fraud.</li>
        <li>To send occasional service-related or promotional messages, where you have consented.</li>
        <li>To improve our website, services, and operations.</li>
        <li>To comply with legal obligations.</li>
      </UL>

      <H2>3. SMS / Text Messaging</H2>
      <P>
        We use SMS (powered by Twilio) to send booking confirmations, reminders, authentication codes,
        customer-support replies, and occasional promotional messages. Message frequency may vary.
        Message and data rates may apply. You can reply <b>STOP</b> at any time to opt out, or <b>HELP</b> for assistance.
      </P>
      <P>
        <b>Your mobile information will never be sold, rented, or shared with third parties for their own
        marketing or promotional purposes.</b> Full details are in our <Link to="/sms-terms" className="text-[var(--emerald)] underline font-medium">SMS Terms of Service</Link>.
      </P>

      <H2>4. Cookies & Tracking</H2>
      <P>
        We use cookies and similar technologies to keep you signed in, remember your preferences, and
        understand how our site is used. You can disable cookies in your browser settings, though some
        features may not function properly without them. We do not use cookies to sell your data to advertisers.
      </P>

      <H2>5. How We Share Information</H2>
      <P>We share information only as needed to operate the service:</P>
      <UL>
        <li><b>Drivers</b> — the assigned driver receives the details necessary to complete your ride (name, pickup/drop-off, contact number, and special requests).</li>
        <li><b>Service providers</b> — payment processing (Stripe), SMS delivery (Twilio), mapping (Google Maps), and hosting providers, strictly to perform services on our behalf.</li>
        <li><b>Legal & safety</b> — when required by law, regulation, legal process, or to protect the rights and safety of our users and the public.</li>
      </UL>
      <P>We do not sell your personal information.</P>

      <H2>6. Data Retention</H2>
      <P>
        We retain your information for as long as your account is active or as needed to provide services,
        comply with our legal obligations, resolve disputes, and enforce our agreements. We may retain certain
        records (such as transaction history) for longer where required by law.
      </P>

      <H2>7. Your Rights</H2>
      <UL>
        <li>Access the personal information we hold about you.</li>
        <li>Request correction of inaccurate or incomplete data.</li>
        <li>Request deletion of your personal data (see below).</li>
        <li>Withdraw consent to marketing or SMS messages at any time.</li>
        <li>Object to or restrict certain processing of your data.</li>
      </UL>

      <H2>8. Data Deletion Requests</H2>
      <P>
        You may request deletion of your account and associated personal data at any time by emailing{' '}
        <a href={`mailto:${email}`} className="text-[var(--emerald)] underline font-medium">{email}</a>
        {phone ? <> or calling <a href={`tel:${phone}`} className="text-[var(--emerald)] underline font-medium">{phone}</a></> : null}.
        We will process verified requests within a reasonable timeframe, subject to records we are legally
        required to keep. Deleting your data will also opt you out of all SMS communications.
      </P>

      <H2>9. Data Security</H2>
      <P>
        We use industry-standard safeguards — including encryption in transit (HTTPS), restricted access, and
        secure third-party processors — to protect your information. No method of transmission or storage is
        100% secure, and we cannot guarantee absolute security.
      </P>

      <H2>10. Children's Privacy</H2>
      <P>
        Our services are not directed to children under 13 (or the minimum age in your jurisdiction), and we do
        not knowingly collect their personal information.
      </P>

      <H2>11. Changes to This Policy</H2>
      <P>
        We may update this Privacy Policy from time to time. The "Last updated" date at the top reflects the
        latest revision. Material changes will be communicated through our website or via SMS/email where appropriate.
      </P>

      <H2>12. Contact Us</H2>
      <P>
        Questions about this Privacy Policy? Reach us at{' '}
        <a href={`mailto:${email}`} className="text-[var(--emerald)] underline font-medium">{email}</a>
        {phone ? <>, or <a href={`tel:${phone}`} className="text-[var(--emerald)] underline font-medium">{phone}</a></> : null}, or via
        our <Link to="/contact" className="text-[var(--emerald)] underline font-medium">Contact page</Link>.
      </P>
    </LegalLayout>
  )
}
