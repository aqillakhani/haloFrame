import { motion } from 'framer-motion';
import type { Screen } from '../lib/navigation';
import { useNavigation } from '../lib/navigation';
import { heroText } from '../lib/motion';

/**
 * One component renders both Privacy and Terms — the only delta is the
 * title + body text. The copy itself is intentionally template-y with
 * explicit `{{placeholder}}` tokens so the user's lawyer has clear edit
 * targets during morning review.
 */
export type LegalKind = 'privacy' | 'terms';

interface LegalScreenProps {
  kind: LegalKind;
}

const PLACEHOLDER_COMPANY = '{{COMPANY_LEGAL_NAME}}';
const PLACEHOLDER_CONTACT = '{{CONTACT_EMAIL}}';
const PLACEHOLDER_JURISDICTION = '{{JURISDICTION}}';
const LAST_UPDATED = 'April 21, 2026';

const PRIVACY = {
  title: 'Privacy Policy',
  sections: [
    {
      heading: 'Who we are',
      body: `haloFrame is operated by ${PLACEHOLDER_COMPANY}. We make AI-assisted memorial tributes from photos you choose. This policy explains what we collect, why, and what you can ask us to do with it. Questions? Write to ${PLACEHOLDER_CONTACT}.`,
    },
    {
      heading: 'What we collect',
      body: `Account information (email + display name), the photos you upload, the tributes you save, usage metadata (device type, timestamps, error traces), and payment metadata from our processor (we never store your card number). If you sign in with Google or Apple, we receive the identifier they send us — nothing more.`,
    },
    {
      heading: 'How we use it',
      body: `To deliver the product you asked for: process your photo through our AI pipeline, save the finished tribute to your gallery, fulfill canvas orders, and support you if something goes wrong. We never train models on your photos, and we never sell your personal information.`,
    },
    {
      heading: 'Where it lives',
      body: `Photos and tributes live in our Supabase storage. Payment records live with our payment processor. Usage logs live in our operational analytics. Retention: tributes are kept until you delete them or delete your account. Operational logs are kept for 90 days.`,
    },
    {
      heading: 'Your rights',
      body: `You can download a copy of your data anytime (Settings → Export my data), edit your display name, delete individual tributes, or delete your entire account (Settings → Delete account). We honor GDPR and CCPA requests; write to ${PLACEHOLDER_CONTACT} if you need help.`,
    },
    {
      heading: 'Third parties we rely on',
      body: `Supabase (auth, database, storage), fal.ai (AI model inference), Stripe (payments), Resend (transactional email), Vercel (web hosting), Railway (API hosting). Each of them has their own privacy policy and is contractually bound to handle your data only for the purpose we asked them to.`,
    },
    {
      heading: 'Changes to this policy',
      body: `If we change anything material, we'll notify you by email and update the "Last updated" date above. Continued use after the effective date means you accept the update.`,
    },
    {
      heading: 'Contact',
      body: `Privacy questions, data requests, or concerns: ${PLACEHOLDER_CONTACT}. We respond to every message within 5 business days.`,
    },
  ],
};

const TERMS = {
  title: 'Terms of Service',
  sections: [
    {
      heading: 'Welcome',
      body: `These are the terms that govern your use of haloFrame, operated by ${PLACEHOLDER_COMPANY}. By creating an account or using the app, you agree to them.`,
    },
    {
      heading: 'What the app does',
      body: `haloFrame helps you create memorial photo tributes using generative AI. Free accounts include one Enhance and one Reunite tribute. Paid plans include recurring tribute allowances. Canvas prints are a separate one-time purchase. Everything is delivered "as-is" — we do our best, but we can't guarantee any specific artistic result.`,
    },
    {
      heading: 'Acceptable use',
      body: `Upload photos you have the right to use. Don't upload photos of living people without their consent, of minors without their guardian's consent, or of people whose families have asked you not to. Don't use the app to harass, impersonate, or defraud. We reserve the right to remove content and terminate accounts that violate these rules.`,
    },
    {
      heading: 'Payments & refunds',
      body: `Subscriptions bill monthly or annually and auto-renew. You can cancel anytime in Settings — your existing tribute allowance stays active through the end of the current period. Canvas orders are custom-made; we can't accept returns, but we will reprint free of charge if the item arrives damaged or materially different from the preview. Contact ${PLACEHOLDER_CONTACT} within 14 days for reprints.`,
    },
    {
      heading: 'Your content',
      body: `You retain all rights to the photos you upload and the tributes you create. You grant us a non-exclusive, royalty-free license to store, process, and display your content solely to operate the service. We never use your content to train models or for any purpose you haven't opted into.`,
    },
    {
      heading: 'Our content',
      body: `The app itself, including the name, logo, UI, template artwork, and underlying software, belongs to ${PLACEHOLDER_COMPANY}. You may not copy, reverse-engineer, or resell it.`,
    },
    {
      heading: 'Disclaimers & limits',
      body: `The service is provided "as is" without warranties. We aren't liable for indirect, incidental, or consequential damages. Our total liability for any claim is limited to the amount you paid us in the 12 months before the claim arose. Some jurisdictions don't allow these limitations — if that applies to you, they apply only to the extent permitted by law.`,
    },
    {
      heading: 'Disputes',
      body: `Any dispute under these terms will be resolved by binding arbitration in ${PLACEHOLDER_JURISDICTION}, except that either party may bring small-claims-court actions individually. You and we both waive the right to participate in class actions.`,
    },
    {
      heading: 'Changes',
      body: `We may update these terms. Material changes get 30 days' advance notice by email. Continued use after the effective date means you accept the update. If you disagree, cancel before the effective date.`,
    },
    {
      heading: 'Contact',
      body: `Questions about these terms: ${PLACEHOLDER_CONTACT}.`,
    },
  ],
};

export function LegalScreen({ kind }: LegalScreenProps) {
  const nav = useNavigation();
  const doc = kind === 'privacy' ? PRIVACY : TERMS;
  const otherKind: Screen = kind === 'privacy' ? 'LEGAL_TERMS' : 'LEGAL_PRIVACY';

  return (
    <div className="legal-screen">
      <motion.header
        className="legal-header"
        variants={heroText}
        initial="initial"
        animate="animate"
      >
        <button
          type="button"
          className="legal-back"
          onClick={() => (nav.canGoBack ? nav.pop() : nav.reset())}
          aria-label="Back"
        >
          {'\u2190'} Back
        </button>
        <h1 className="legal-title">{doc.title}</h1>
        <p className="legal-meta">Last updated {LAST_UPDATED}</p>
      </motion.header>
      <article className="legal-body">
        {doc.sections.map((s) => (
          <section key={s.heading} className="legal-section">
            <h2>{s.heading}</h2>
            <p>{s.body}</p>
          </section>
        ))}
      </article>
      <nav className="legal-footnav">
        <button
          type="button"
          className="auth-link"
          onClick={() => nav.push(otherKind)}
        >
          {kind === 'privacy' ? 'Read the Terms of Service' : 'Read the Privacy Policy'}
        </button>
      </nav>
    </div>
  );
}
