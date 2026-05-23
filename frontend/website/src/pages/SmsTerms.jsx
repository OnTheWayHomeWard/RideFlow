import { Link } from 'react-router-dom'
import { LegalLayout, H2, P, UL, useSEO } from '../lib'

const UPDATED = 'May 23, 2026'

export default function SmsTerms({ site }) {
  const brand = site.brandName
  const email = site.settings.company_email || 'support@gobellme.com'
  const phone = site.settings.company_phone
  useSEO(
    `SMS Terms of Service — ${brand}`,
    `${brand} SMS messaging program terms: message types, frequency, STOP/HELP keywords, rates, and privacy. A2P 10DLC compliant.`
  )

  return (
    <LegalLayout site={site} title="SMS Terms of Service" updated={UPDATED}>
      <P>
        These SMS Terms of Service ("SMS Terms") govern the {brand} text-messaging program (the "Program").
        By providing your mobile phone number and opting in, you agree to these SMS Terms. The Program is
        delivered using Twilio and is intended for recipients in the United States and other supported regions.
      </P>

      <H2>1. Program Description</H2>
      <P>
        When you opt in, {brand} may send you recurring text messages related to your account and bookings. Message types include:
      </P>
      <UL>
        <li><b>Booking confirmations</b> — confirmation that your ride is reserved.</li>
        <li><b>Ride reminders</b> — reminders before your scheduled pickup.</li>
        <li><b>Ride status updates</b> — e.g., when your driver is on the way, has arrived, or your ride has started/completed.</li>
        <li><b>Authentication codes</b> — one-time passcodes to verify your identity or secure your account.</li>
        <li><b>Customer support</b> — replies and follow-ups to your support requests.</li>
        <li><b>Occasional promotional messages</b> — offers or service announcements, only where you have consented.</li>
      </UL>

      <H2>2. Consent / Opt-In</H2>
      <P>
        You opt in by providing your mobile number and agreeing to receive text messages — for example, when
        creating an account, booking a ride, or checking a consent box on our forms. Consent to receive
        marketing or promotional texts is <b>not a condition</b> of purchasing any goods or services. Message
        and data rates may apply.
      </P>

      <H2>3. Message Frequency</H2>
      <P>
        <b>Message frequency may vary</b> based on your activity — for example, the number of bookings you make
        and the status updates tied to each ride. You may receive multiple messages per booking.
      </P>

      <H2>4. Message & Data Rates</H2>
      <P>
        <b>Message and data rates may apply.</b> These charges are set by your wireless carrier and are your
        responsibility. {brand} does not charge for the messages themselves. Check your mobile plan for details.
      </P>

      <H2>5. Opt-Out — Reply STOP</H2>
      <P>
        You can cancel the SMS Program at any time by replying <b>STOP</b> to any message. After you send STOP,
        we will send you a one-time confirmation that you have been unsubscribed, and you will no longer receive
        SMS messages from that program. To rejoin, opt in again as you did originally. Note that opting out of
        SMS may affect time-sensitive ride notifications.
      </P>

      <H2>6. Help — Reply HELP</H2>
      <P>
        For help at any time, reply <b>HELP</b> to any message, and we will respond with support information.
        You can also contact us at{' '}
        <a href={`mailto:${email}`} className="text-[var(--emerald)] underline font-medium">{email}</a>
        {phone ? <> or <a href={`tel:${phone}`} className="text-[var(--emerald)] underline font-medium">{phone}</a></> : null}.
      </P>

      <H2>7. Privacy — Your Mobile Information</H2>
      <P>
        <b>Mobile information will not be sold, rented, or shared with third parties or affiliates for their
        marketing or promotional purposes.</b> Information may be shared only with the vendors and providers that
        help us operate the messaging program (such as our SMS provider, Twilio) and solely to deliver the
        messages you have requested. All handling of your information is described in our{' '}
        <Link to="/privacy-policy" className="text-[var(--emerald)] underline font-medium">Privacy Policy</Link>.
      </P>

      <H2>8. Supported Carriers</H2>
      <P>
        Supported carriers may include AT&amp;T, Verizon, T-Mobile, and other major U.S. carriers, as well as
        select smaller carriers. Carriers are not liable for delayed or undelivered messages. Message delivery
        is subject to effective transmission by your wireless provider and is not guaranteed.
      </P>

      <H2>9. Eligibility</H2>
      <P>
        You must be the account holder or authorized user of the mobile number you provide, and at least 18
        years old (or the age of majority in your jurisdiction), to enroll in the Program.
      </P>

      <H2>10. Changes</H2>
      <P>
        We may update these SMS Terms at any time. Continued participation in the Program after changes take
        effect constitutes acceptance of the updated SMS Terms.
      </P>

      <H2>11. Contact</H2>
      <P>
        For questions about the messaging program, contact{' '}
        <a href={`mailto:${email}`} className="text-[var(--emerald)] underline font-medium">{email}</a>
        {phone ? <> or <a href={`tel:${phone}`} className="text-[var(--emerald)] underline font-medium">{phone}</a></> : null},
        or visit our <Link to="/contact" className="text-[var(--emerald)] underline font-medium">Contact page</Link>.
      </P>
    </LegalLayout>
  )
}
