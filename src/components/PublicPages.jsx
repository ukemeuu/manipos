import React, { useEffect, useState } from 'react';
import {
  ArrowLeft, ShieldCheck, Activity, CheckCircle2, AlertTriangle, Server,
  CreditCard, Database, Wifi, Mail, FileText,
} from 'lucide-react';

const SUPPORT_EMAIL = 'support@manipos.com';

function PageShell({ title, subtitle, icon: Icon, onBack, children }) {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans">
      <header className="border-b border-slate-900 bg-slate-950/90 backdrop-blur-xl sticky top-0 z-20">
        <div className="max-w-4xl mx-auto px-6 h-16 flex items-center justify-between">
          <button onClick={onBack} className="flex items-center gap-3 cursor-pointer">
            <div className="w-8 h-8 bg-amber-400 rounded-lg flex items-center justify-center font-black text-slate-950 text-lg">M</div>
            <span className="text-xl font-black tracking-tight">Mani<span className="text-amber-400">POS</span></span>
          </button>
          <button
            onClick={onBack}
            className="text-xs font-bold text-slate-400 hover:text-white flex items-center gap-2 cursor-pointer"
          >
            <ArrowLeft size={14} /> Back to site
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-14 space-y-10">
        <div className="space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-amber-400/10 border border-amber-400/20 text-amber-400 flex items-center justify-center">
            <Icon size={26} />
          </div>
          <h1 className="text-4xl sm:text-5xl font-black tracking-tight text-white">{title}</h1>
          <p className="text-slate-400 text-base font-medium leading-relaxed max-w-2xl">{subtitle}</p>
        </div>
        {children}
      </main>

      <footer className="border-t border-slate-900 py-8 text-center text-xs text-slate-500">
        <p>ManiPOS · Cloud point of sale for African hospitality</p>
        <a href={`mailto:${SUPPORT_EMAIL}`} className="text-amber-400 hover:text-amber-300 font-bold">{SUPPORT_EMAIL}</a>
      </footer>
    </div>
  );
}

export function StatusPage({ onBack }) {
  const [now, setNow] = useState(new Date());
  const [online, setOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);

  useEffect(() => {
    const tick = setInterval(() => setNow(new Date()), 30000);
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      clearInterval(tick);
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);

  const services = [
    { name: 'POS register & order sync', icon: CreditCard, status: online ? 'operational' : 'offline' },
    { name: 'Guest menus & online ordering', icon: Wifi, status: 'operational' },
    { name: 'Kitchen display (KDS)', icon: Activity, status: 'operational' },
    { name: 'Inventory & recipes', icon: Database, status: 'operational' },
    { name: 'M-Pesa payment confirmation', icon: Server, status: 'operational' },
  ];

  return (
    <PageShell
      title="System status"
      subtitle="Live availability for ManiPOS cloud services. Offline-capable POS terminals keep selling and sync automatically when the connection returns."
      icon={Activity}
      onBack={onBack}
    >
      <div className="rounded-3xl border border-emerald-500/20 bg-emerald-500/5 p-6 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="w-3 h-3 rounded-full bg-emerald-400 animate-pulse" />
          <div>
            <p className="font-black text-emerald-300">All systems operational</p>
            <p className="text-xs text-slate-400 font-medium">Last checked {now.toLocaleTimeString('en-KE')}</p>
          </div>
        </div>
        <CheckCircle2 className="text-emerald-400" size={24} />
      </div>

      <div className="rounded-3xl border border-slate-800 bg-slate-900/40 divide-y divide-slate-800 overflow-hidden">
        {services.map((service) => (
          <div key={service.name} className="p-5 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 text-sm font-semibold text-slate-200">
              <service.icon size={17} className="text-slate-500" />
              {service.name}
            </div>
            <span className={`text-[10px] font-black uppercase tracking-wider px-3 py-1 rounded-full border ${
              service.status === 'operational'
                ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20'
                : 'bg-amber-500/10 text-amber-300 border-amber-500/20'
            }`}>
              {service.status}
            </span>
          </div>
        ))}
      </div>

      <div className="rounded-3xl border border-amber-500/20 bg-amber-500/5 p-6 flex items-start gap-3">
        <AlertTriangle className="text-amber-400 shrink-0 mt-0.5" size={18} />
        <p className="text-sm text-slate-300 leading-relaxed">
          Experiencing an issue not listed here? Email <a className="text-amber-400 font-bold" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> with your restaurant slug and the approximate time. Priority support responds within 2 business hours.
        </p>
      </div>
    </PageShell>
  );
}

const LEGAL = {
  privacy: {
    title: 'Privacy policy',
    subtitle: 'How ManiPOS collects, uses and protects restaurant and guest data across our cloud POS, menus and payments, under the Kenya Data Protection Act, 2019.',
    icon: ShieldCheck,
    sections: [
      {
        heading: 'Who is responsible for your data',
        body: 'For a restaurant’s own account, staff and sales records, the restaurant is the data controller and ManiPOS acts as its data processor: we hold and process that data only to run the service the restaurant has asked for. For our own website visitors, trial sign-ups and platform marketing, ManiPOS is the data controller. Where a guest orders through a restaurant’s menu, the restaurant decides what guest data it collects and why; ManiPOS processes it on the restaurant’s instructions.',
      },
      {
        heading: 'Data we collect',
        body: 'We collect account details for restaurant owners and staff (name, email, phone, role, restaurant), transactional data required to operate the point of sale (orders, payments, inventory movements), technical data needed to run and secure the service (device, browser, IP address, error logs), and guest details voluntarily provided for online ordering (name, phone, delivery address).',
      },
      {
        heading: 'Lawful basis for processing',
        body: 'Under the Data Protection Act, 2019 we rely on: performance of a contract, to provide the POS and process orders; compliance with a legal obligation, such as tax, accounting and anti-fraud record keeping; our legitimate interests, to secure the platform, prevent abuse and improve the product, balanced against your rights; and consent, where you opt in to marketing or optional communications. You may withdraw consent at any time without affecting processing already carried out.',
      },
      {
        heading: 'How we use data',
        body: 'Data is used to operate your POS, process orders, generate receipts and reports, support your account, prevent fraud and meet tax and payment obligations. We do not sell personal data or use guest contact details for third-party marketing.',
      },
      {
        heading: 'Payments',
        body: 'M-Pesa and card transactions are processed by regulated payment providers such as Safaricom Daraja. ManiPOS stores payment references and reconciliation records, not full card numbers or M-Pesa credentials. Customer phone numbers are shared with the payment provider only to send a payment prompt for that order.',
      },
      {
        heading: 'Where data is stored and cross-border transfer',
        body: 'ManiPOS is hosted on infrastructure in the European Union (Ireland), with backups held in the same region. This means personal data is transferred outside Kenya. We do this under the transfer safeguards recognised by section 48 of the Data Protection Act, 2019 — contractual protections with our processors and appropriate technical measures — and we keep the transfer to what is necessary to provide the service.',
      },
      {
        heading: 'How long we keep data',
        body: 'Sales, payment and tax records are kept for the period required by Kenyan tax and accounting law, currently seven years. Account records are kept while the subscription is active and for a short period afterwards so the restaurant can reactivate or export. Guest ordering profiles can be deleted on request. Error logs are kept briefly for diagnosis and then discarded.',
      },
      {
        heading: 'Security and breach notification',
        body: 'Access is role-based and scoped to each restaurant, data is encrypted in transit, staff PINs and passwords are hashed, and database access is restricted by row-level security. If a breach is likely to result in a risk to your rights, we notify the Office of the Data Protection Commissioner without undue delay and, where the risk is high, we notify affected individuals as required by section 43 of the Data Protection Act, 2019.',
      },
      {
        heading: 'Your rights',
        body: `You have the right to be informed, to access your data, to correct inaccurate data, to request erasure, to restrict or object to processing, to data portability, and not to be subject to a decision based solely on automated processing. Restaurant owners may export or delete their account data. Guests may request correction or deletion of their ordering profile. Contact ${SUPPORT_EMAIL} and we will respond within the timelines set by the Act.`,
      },
      {
        heading: 'Complaints',
        body: 'If you are unhappy with how we have handled your data, contact us first so we can put it right. You also have the right to complain to the Office of the Data Protection Commissioner (ODPC) in Kenya through dataprotection.go.ke.',
      },
      {
        heading: 'Children',
        body: 'ManiPOS is a business tool and is not directed at children. Restaurants should not collect data from anyone under 18 through the platform without a lawful basis and, where required, the consent of a parent or guardian.',
      },
      {
        heading: 'Changes',
        body: `We may update this policy as the product or the law changes. Material changes will be announced in-app or by email. Questions about this policy: ${SUPPORT_EMAIL}.`,
      },
    ],
  },
  terms: {
    title: 'Terms of service',
    subtitle: 'The agreement between ManiPOS and the restaurants, staff and guests who use our platform, governed by the laws of Kenya.',
    icon: FileText,
    sections: [
      {
        heading: 'The service',
        body: 'ManiPOS provides cloud point of sale, online ordering, kitchen display, inventory and reporting software. The service is provided on a subscription basis with a free trial. Features vary by plan.',
      },
      {
        heading: 'Accounts and access',
        body: 'You are responsible for the accuracy of your restaurant details, for keeping staff credentials and PINs confidential, and for all activity under your account. Notify us immediately of unauthorised access.',
      },
      {
        heading: 'Your data',
        body: 'The restaurant owns its business data — menu, orders, customers, stock and reports. You grant ManiPOS the licence needed to host, process and back up that data to provide the service. On termination you may export your data for a reasonable period before it is deleted, subject to records we must keep by law.',
      },
      {
        heading: 'Payments and billing',
        body: 'Subscription fees are billed in advance. M-Pesa or card payments made by your guests are settled directly to your nominated merchant account; ManiPOS does not hold guest funds. Failed or reversed payments may result in service suspension.',
      },
      {
        heading: 'Acceptable use',
        body: 'You may not use ManiPOS for unlawful sales, to infringe intellectual property, to transmit malware, or to attempt to access another tenant’s data. We may suspend accounts that threaten platform security or other customers.',
      },
      {
        heading: 'Availability and liability',
        body: 'We target high availability and provide an offline mode, but the service is provided “as is” to the extent permitted by law. Our aggregate liability is limited to fees paid in the twelve months preceding a claim. Nothing in these terms limits liability that cannot be limited by Kenyan law, including your rights under the Consumer Protection Act, 2012.',
      },
      {
        heading: 'Termination',
        body: 'You may cancel at any time; access continues to the end of the paid period. We may suspend or terminate for material breach, non-payment or unlawful use. Either party may terminate if the other becomes insolvent.',
      },
      {
        heading: 'Governing law and disputes',
        body: 'These terms are governed by the laws of Kenya. We will try to resolve any dispute amicably first; if that fails, the courts of Kenya have exclusive jurisdiction.',
      },
      {
        heading: 'Changes',
        body: `We may update these terms as the product evolves. Material changes will be announced in-app or by email before they take effect. Questions: ${SUPPORT_EMAIL}.`,
      },
    ],
  },
};

export function LegalPage({ kind = 'privacy', onBack }) {
  const doc = LEGAL[kind] || LEGAL.privacy;
  return (
    <PageShell title={doc.title} subtitle={doc.subtitle} icon={doc.icon} onBack={onBack}>
      <div className="space-y-8">
        {doc.sections.map((section) => (
          <section key={section.heading} className="space-y-2">
            <h2 className="text-lg font-black text-white">{section.heading}</h2>
            <p className="text-sm text-slate-400 leading-relaxed font-medium">{section.body}</p>
          </section>
        ))}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5 text-xs text-slate-500 font-medium">
          Last updated 9 November 2026. Contact <a className="text-amber-400 font-bold" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> for any question about this document.
        </div>
      </div>
    </PageShell>
  );
}
