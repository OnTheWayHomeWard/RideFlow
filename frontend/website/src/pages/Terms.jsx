import { Link } from 'react-router-dom'
import { LegalLayout, H2, P, UL, useSEO } from '../lib'

const UPDATED = 'May 23, 2026'

export default function Terms({ site }) {
  const brand = site.brandName
  const email = site.settings.company_email || 'support@gobellme.com'
  const phone = site.settings.company_phone
  useSEO(
    `Terms & Conditions — ${brand}`,
    `The terms governing your use of ${brand} ride-reservation services, including bookings, payments, cancellations, and your responsibilities.`
  )

  return (
    <LegalLayout site={site} title="Terms & Conditions" updated={UPDATED}>
      <P>
        These Terms &amp; Conditions ("Terms") govern your access to and use of {brand}'s website and
        ride-reservation services (the "Services"). By creating an account, booking a ride, or otherwise using
        the Services, you agree to these Terms. If you do not agree, please do not use the Services.
      </P>

      <H2>1. The Service</H2>
      <P>
        {brand} provides a platform to pre-book private vehicle rides from a pickup location to a destination.
        We arrange transportation through professional drivers. We are a reservation and coordination service;
        the ride itself is performed by the assigned driver.
      </P>

      <H2>2. Eligibility & Accounts</H2>
      <UL>
        <li>You must be at least 18 years old (or the age of majority in your jurisdiction) to create an account or book.</li>
        <li>You are responsible for the accuracy of the information you provide, including your phone number and pickup/drop-off details.</li>
        <li>You are responsible for keeping your account credentials secure and for all activity under your account.</li>
      </UL>

      <H2>3. Bookings</H2>
      <UL>
        <li>A booking is confirmed once payment is completed and you receive a confirmation.</li>
        <li>Prices are shown before you confirm. Fixed-price "popular routes" are charged at the displayed flat rate; custom routes are calculated by distance plus any selected add-ons.</li>
        <li>Certain pickup locations (e.g., airports) may automatically include required add-ons, which are shown before payment.</li>
        <li>You must be ready at the pickup location at the scheduled time. Drivers may wait only a reasonable period.</li>
      </UL>

      <H2>4. Pricing & Payment</H2>
      <UL>
        <li>All fares are displayed in the applicable currency before booking and are charged at the time of reservation.</li>
        <li>Payments are securely processed by our third-party payment processor (Stripe). By paying, you authorize the charge for the total shown.</li>
        <li>Add-ons, tolls, or special requests may affect the final price and are presented before checkout.</li>
      </UL>

      <H2>5. Cancellations & Refunds</H2>
      <P>
        Cancellation windows and any applicable refund amounts are determined by our then-current cancellation
        policy and shown during or after booking where relevant. Refunds, when due, are returned to your
        original payment method and may take several business days to appear. For cancellation help, contact us at{' '}
        <a href={`mailto:${email}`} className="text-[var(--emerald)] underline font-medium">{email}</a>.
      </P>

      <H2>6. Your Responsibilities</H2>
      <UL>
        <li>Provide accurate pickup/drop-off information and a reachable phone number.</li>
        <li>Treat drivers and vehicles with respect; no illegal, dangerous, or abusive conduct.</li>
        <li>Do not transport prohibited or illegal items.</li>
        <li>You are responsible for your belongings during the ride.</li>
      </UL>

      <H2>7. SMS Communications</H2>
      <P>
        By providing your mobile number and consenting, you agree to receive SMS messages related to your
        bookings and account as described in our{' '}
        <Link to="/sms-terms" className="text-[var(--emerald)] underline font-medium">SMS Terms of Service</Link>.
        Message frequency may vary, and message and data rates may apply. Reply STOP to opt out or HELP for help.
      </P>

      <H2>8. Service Availability</H2>
      <P>
        Services are available only within our published service areas and are subject to driver availability.
        We may modify, suspend, or discontinue any part of the Services at any time.
      </P>

      <H2>9. Disclaimers & Limitation of Liability</H2>
      <P>
        The Services are provided "as is" and "as available" without warranties of any kind, to the maximum
        extent permitted by law. To the fullest extent permitted by law, {brand} is not liable for any indirect,
        incidental, special, or consequential damages arising from your use of the Services. Nothing in these
        Terms limits liability that cannot be limited under applicable law.
      </P>

      <H2>10. Indemnification</H2>
      <P>
        You agree to indemnify and hold {brand} harmless from any claims, losses, or expenses arising out of
        your misuse of the Services or violation of these Terms.
      </P>

      <H2>11. Changes to These Terms</H2>
      <P>
        We may update these Terms from time to time. Continued use of the Services after changes take effect
        constitutes acceptance of the revised Terms.
      </P>

      <H2>12. Contact</H2>
      <P>
        Questions about these Terms? Email{' '}
        <a href={`mailto:${email}`} className="text-[var(--emerald)] underline font-medium">{email}</a>
        {phone ? <>, call <a href={`tel:${phone}`} className="text-[var(--emerald)] underline font-medium">{phone}</a>,</> : null}{' '}
        or use our <Link to="/contact" className="text-[var(--emerald)] underline font-medium">Contact page</Link>.
      </P>
    </LegalLayout>
  )
}
