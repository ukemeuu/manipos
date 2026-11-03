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
    subtitle: 'How ManiPOS collects, uses and protects restaurant and guest data across our cloud POS, menus and payments.',
    icon: ShieldCheck,
    sections: [
      {
        heading: 'Data we collect',
        body: 'We collect account details for restaurant owners and staff (name, email, role, restaurant), transactional data required to operate the point of sale (orders, payments, inventory movements), and guest details voluntarily provided for online ordering (name, phone, delivery address).',
      },
      {
        heading: 'How we use data',
        body: 'Data is used to operate your POS, process orders, generate receipts and reports, support your account, prevent fraud and meet tax and payment obligations. We do not sell personal data or use guest contact details for third-party marketing.',
      },
      {
        heading: 'Payments',
        body: 'M-Pesa and card transactions are processed by regulated payment providers. ManiPOS stores payment references and reconciliation records, not full card numbers or M-Pesa credentials.',
      },
      {
        heading: 'Retention and security',
        body: 'Operational records are retained for the period required by applicable tax and accounting law. Access is role-based, encrypted in transit, and protected by tenant isolation policies. Staff PINs are never displayed publicly.',
      },
      {
        heading: 'Your rights',
        body: `Restaurant owners may request export, correction or deletion of their account data. Guests may request correction or deletion of their ordering profile. Contact ${SUPPORT_EMAIL} and we will respond within 30 days.`,
      },
    ],
  },
  terms: {
    title: 'Terms of service',
    subtitle: 'The agreement between ManiPOS and the restaurants, staff and guests who use our platform.',
    icon: FileText,
    sections: [
      {
        heading: 'The service',
        body: 'ManiPOS provides cloud point of sale, online ordering, kitchen display, inventory and reporting software. The service is provided on a subscription basis with a free trial. Features vary by plan.',
      },
      {
        heading: 'Accounts and access',
        body: 'You are responsible for the accuracy of your restaurant details, for keeping staff credentials confidential, and for all activity under your account. Notify us immediately of unauthorised access.',
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
        body: 'We target high availability and provide offline mode, but the service is provided “as is” to the extent permitted by law. Our aggregate liability is limited to fees paid in the twelve months preceding a claim. Nothing limits liability that cannot be limited by law.',
      },
      {
        heading: 'Changes',
        body: `We may update these terms as the product evolves. Material changes will be announced in-app or by email. Questions: ${SUPPORT_EMAIL}.`,
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
          Last updated 3 November 2026. Contact <a className="text-amber-400 font-bold" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> for any question about this document.
        </div>
      </div>
    </PageShell>
  );
}
