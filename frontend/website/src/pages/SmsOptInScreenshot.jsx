import { Link } from 'react-router-dom'
import { LegalLayout, H2, P, useSEO } from '../lib'

// Publicly accessible page that walks an A2P 10DLC / TCR reviewer through the
// three booking-flow screens where SMS consent is captured. Linked from the
// Twilio campaign's message_flow / "End User Consent" field so reviewers can
// verify the opt-in without having to complete a real booking.
//
// Route: /sms-optin-screenshot

const UPDATED = 'June 6, 2026'

export default function SmsOptInScreenshot({ site }) {
  const brand = site.brandName
  useSEO(
    `SMS Opt-In Flow — ${brand}`,
    `Public reference of the optional SMS consent checkbox shown on the ${brand} booking form. Provided for A2P 10DLC campaign verification.`,
  )

  const Step = ({ n, title, src, alt, children }) => (
    <div className="mb-10">
      <div className="flex items-center gap-3 mb-3">
        <span className="w-8 h-8 rounded-full bg-[var(--emerald)] text-white font-bold flex items-center justify-center text-sm shrink-0">{n}</span>
        <h3 className="font-display text-xl text-[var(--emerald-deep)]">{title}</h3>
      </div>
      <P>{children}</P>
      <div className="bg-white border border-slate-200 rounded-2xl p-3 lg:p-4 shadow-sm">
        <img src={src} alt={alt} loading="lazy"
          className="w-full max-w-md mx-auto block rounded-xl border border-slate-100" />
      </div>
    </div>
  )

  return (
    <LegalLayout site={site} title="SMS Opt-In — Booking Flow" updated={UPDATED}>
      <div className="bg-[var(--cream-warm)] border border-[var(--gold)]/30 rounded-xl p-4 mb-6">
        <p className="text-sm text-slate-700 leading-relaxed">
          <b>Purpose of this page.</b> This page is published for A2P 10DLC campaign reviewers (and anyone else
          who wants to verify) to see exactly where and how riders consent to receive transactional SMS from
          {' '}{brand}. The booking app at <a href="https://ride.gobellme.com" target="_blank" rel="noopener noreferrer"
          className="text-[var(--emerald)] underline">https://ride.gobellme.com</a> is an interactive multi-step
          flow that requires a pickup, destination, and contact details before the consent checkbox is shown.
          The three screenshots below capture each step verbatim from the live product.
        </p>
      </div>

      <P>
        Consent to receive SMS from {brand} is <b>optional</b>. Bookings and payment complete whether or not the
        consent checkbox is ticked. SMS is sent only to riders who tick the box; the choice is recorded per
        booking. See our <Link to="/sms-terms" className="text-[var(--emerald)] underline">SMS Terms</Link> and
        {' '}<Link to="/privacy-policy" className="text-[var(--emerald)] underline">Privacy Policy</Link> for
        the messaging program details, frequency, and "Message and data rates may apply" disclosure.
      </P>

      <H2>Booking flow — step by step</H2>

      <Step n={1}
        src="/sms-flow/step-1-destination.png"
        alt={`${brand} booking flow step 1: rider has set a pickup location and is selecting a destination from popular routes near them.`}
        title="Step 1 — Enter your destination">
        After opening <code>ride.gobellme.com</code>, the rider sets a pickup (auto-detected or typed) and chooses a
        destination, either by typing one or tapping a popular route near them. Restricted to configured service
        areas.
      </Step>

      <Step n={2}
        src="/sms-flow/step-2-choose-ride.png"
        alt={`${brand} booking flow step 2: rider sees a summary of pickup and destination with a horizontally scrollable list of vehicle options and prices.`}
        title="Step 2 — Choose your vehicle">
        The rider sees the route summary and a list of vehicles with up-front prices. They tap the vehicle they
        want and continue to the confirmation step.
      </Step>

      <Step n={3}
        src="/sms-flow/step-3-confirm-consent.png"
        alt={`${brand} booking flow step 3: confirmation screen showing trip summary, pickup time, the rider's name and phone number fields, optional add-ons, and the OPTIONAL SMS consent checkbox highlighted with a red bracket.`}
        title="Step 3 — Confirm + (Optional) SMS consent checkbox">
        On the confirmation step the rider sees the trip summary, picks a pickup time, enters their name and
        phone number, and may add optional extras. <b>The OPTIONAL, unchecked-by-default SMS consent
        checkbox</b> appears just above the Pay button (highlighted in red on the screenshot). The booking and
        payment complete whether or not the box is ticked.
      </Step>

      <H2>Exact consent checkbox label</H2>
      <P>
        The label shown on the booking form (step 3 above) reads, verbatim:
      </P>
      <div className="bg-white border border-slate-200 rounded-xl p-4 mb-6">
        <p className="italic text-slate-700 leading-relaxed">
          "<b>(Optional)</b> Send me booking confirmations, ride reminders, and status updates by text message
          from {brand} at the number provided. Message frequency varies. Message &amp; data rates may apply.
          Reply <b>STOP</b> to opt out, <b>HELP</b> for help. Booking does not require text-message consent —
          you can leave this unchecked. See our <Link to="/sms-terms" className="text-[var(--emerald)] underline">SMS Terms</Link>
          {' '}and <Link to="/privacy-policy" className="text-[var(--emerald)] underline">Privacy Policy</Link>."
        </p>
      </div>

      <H2>How consent is honored</H2>
      <P>
        When the rider submits the booking, the state of the consent checkbox is recorded on the booking
        record as a boolean (<code>sms_consent</code>). The backend's SMS dispatch checks this flag before
        sending any rider-facing transactional SMS (booking confirmation, pre-ride reminders, driver
        on-the-way / arrived alerts, ride started / completed notices). If the rider did not tick the box, no
        SMS is sent for that booking.
      </P>
      <P>
        Riders may also reply <b>STOP</b> to any message at any time to opt out of all messaging from {brand};
        STOP and HELP keywords are managed by the underlying messaging provider (Twilio) according to A2P
        10DLC best practices.
      </P>

      <H2>Required legal references</H2>
      <P>
        <b>Privacy Policy:</b>{' '}
        <Link to="/privacy-policy" className="text-[var(--emerald)] underline">/privacy-policy</Link>{' '}
        — explicitly states that mobile information is never sold or shared with third parties for marketing
        purposes, and discloses message frequency and "Message and data rates may apply."
        <br />
        <b>SMS Terms of Service:</b>{' '}
        <Link to="/sms-terms" className="text-[var(--emerald)] underline">/sms-terms</Link>
        {' '}— the full SMS program disclosure including message types, frequency, opt-out, help, and rate
        information.
        <br />
        <b>General Terms &amp; Conditions:</b>{' '}
        <Link to="/terms-and-conditions" className="text-[var(--emerald)] underline">/terms-and-conditions</Link>.
      </P>
    </LegalLayout>
  )
}
