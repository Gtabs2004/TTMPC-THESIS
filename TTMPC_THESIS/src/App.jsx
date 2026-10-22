/* eslint-disable no-unused-vars -- the repo ESLint config does not mark destructured JSX components (icon: Icon) as used */
import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Banknote,
  Brain,
  CalendarDays,
  CircleCheck,
  Clock,
  Facebook,
  FileText,
  IdCard,
  Lock,
  MapPin,
  Menu as MenuIcon,
  PiggyBank,
  ShieldCheck,
  Handshake,
  Wallet,
  X,
  Zap,
  Activity,
} from 'lucide-react';

const FACEBOOK_URL = 'https://www.facebook.com/ttmpc.tubungan.5';
const OFFICE_HOURS = 'Tuesday to Saturday, 8:00 AM to 5:00 PM';
const OFFICE_ADDRESS = 'Teniente Benito, Tubungan, Iloilo 5027';

// Edge-to-edge sections: backgrounds always run full width, content gets
// generous side padding that grows with the screen instead of a narrow cap.
const GUTTER = 'px-5 sm:px-8 lg:px-14 xl:px-20 2xl:px-28';

// Shape rule for the page: panels and images are rounded-2xl, buttons, inputs
// and tabs are rounded-lg. No pills.

const NAV_LINKS = [
  { href: '#services', label: 'Services' },
  { href: '#loans', label: 'Loans' },
  { href: '#about', label: 'About' },
  { href: '#regant', label: 'REGANT' },
  { href: '#membership', label: 'Membership' },
  { href: '#contact', label: 'Contact' },
];

const FACTS = [
  { icon: Zap, title: 'Fast approvals', text: 'Rule-based loan checks keep decisions moving.' },
  { icon: Clock, title: '24/7 access', text: 'See balances and payment schedules any time.' },
  { icon: ShieldCheck, title: 'Audited records', text: 'Every approval and transaction leaves a trail.' },
  { icon: Wallet, title: 'One member record', text: 'Savings, share capital and loans in one place.' },
];

const SERVICES = [
  {
    icon: PiggyBank,
    title: 'Savings and Deposits',
    text: 'A regular passbook account for everyday needs, and Share Capital (CBU) that builds real ownership in the cooperative.',
    bullets: ['Passbook savings earn 1% interest per year', 'Yearly interest on share capital, paid in cash or added to your capital', 'A digital ledger you can check any time'],
  },
  {
    icon: Handshake,
    title: 'Member Ownership',
    text: 'Join as a co-owner with a ₱200 membership fee and build your share capital over time.',
    bullets: ['One member, one vote', 'A seat in the annual General Assembly', 'A share in the cooperative’s yearly results'],
  },
];

const REGANT_FEATURES = [
  {
    icon: Brain,
    title: 'Data-driven loan screening',
    text: 'Every application is weighed against real repayment history, not guesswork or favoritism, so approvals stay fair and consistent for every member.',
  },
  {
    icon: IdCard,
    title: 'Your full record, one place',
    text: 'Profile, capital contributions and complete loan history live in one secure record.',
  },
  {
    icon: Activity,
    title: 'Real-time oversight',
    text: 'Officers see the cooperative’s financial position as it changes.',
  },
  {
    icon: FileText,
    title: 'Board-ready reports',
    text: 'The Board reviews accurate reports every cycle, so your cooperative’s finances stay accountable.',
  },
];

const STEPS = [
  {
    title: 'Attend the Pre-Membership Seminar',
    text: 'The PMES covers cooperative principles, member rights and sound money habits. It runs every 2nd and 4th Saturday.',
  },
  {
    title: 'Submit your application',
    text: 'Fill out the online membership form with your requirements. The Board reviews and approves it.',
  },
  {
    title: 'Fund your share capital',
    text: 'Pay the ₱200 membership fee to unlock your account, loans and yearly returns, then log in to your member portal.',
  },
];

function Button({ children, variant = 'primary', className = '', to, href, ...props }) {
  const base =
    'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg px-6 py-3 text-sm font-semibold transition-all duration-200 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-coop-emerald';
  const variants = {
    primary: 'bg-coop-forest-mid text-white hover:bg-coop-forest',
    secondary: 'bg-white text-coop-forest border border-coop-sage hover:bg-coop-cream-warm',
    light: 'bg-white text-coop-forest hover:bg-coop-cream-tint',
    ghost: 'text-white border border-white/40 hover:bg-white/10',
  };
  const cls = `${base} ${variants[variant]} ${className}`;
  if (href) return <a href={href} className={cls} {...props}>{children}</a>;
  if (to) return <Link to={to} className={cls} {...props}>{children}</Link>;
  return <button className={cls} {...props}>{children}</button>;
}

// Fades a block up the first time it scrolls into view so sections read in
// sequence. IntersectionObserver only, disconnects after firing; motion-safe:
// keeps reduced-motion users on a plain, immediately visible page.
function Reveal({ children, className = '', delayMs = 0 }) {
  const ref = useRef(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.12 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`motion-safe:transition-all motion-safe:duration-700 motion-safe:ease-out ${
        isVisible ? 'opacity-100 translate-y-0' : 'motion-safe:opacity-0 motion-safe:translate-y-5'
      } ${className}`}
      style={delayMs ? { transitionDelay: `${delayMs}ms` } : undefined}
    >
      {children}
    </div>
  );
}

function SectionHeader({ title, text, className = '' }) {
  return (
    <div className={`flex max-w-2xl flex-col gap-3 ${className}`}>
      <h2 className="text-3xl font-bold leading-tight tracking-tight text-coop-forest sm:text-4xl">{title}</h2>
      {text && <p className="max-w-[60ch] text-base leading-relaxed text-coop-muted sm:text-lg">{text}</p>}
    </div>
  );
}

function Header() {
  const [menuOpen, setMenuOpen] = useState(false);
  const close = () => setMenuOpen(false);

  return (
    <header className="sticky top-0 z-50 w-full border-b border-coop-sage/70 bg-white/90 backdrop-blur-md">
      <div className={`flex h-16 items-center justify-between gap-4 md:h-[72px] ${GUTTER}`}>
        <Link to="/" className="flex shrink-0 items-center gap-3" onClick={close}>
          <img src="/img/ttmpc logo.png" alt="TTMPC logo" className="h-10 w-auto md:h-11" />
          <span className="hidden text-sm font-semibold leading-tight text-coop-forest sm:block">
            Tubungan Teachers’<br />Multi-Purpose Cooperative
          </span>
        </Link>

        <nav className="hidden items-center gap-7 xl:flex" aria-label="Primary">
          {NAV_LINKS.map((l) => (
            <a key={l.href} href={l.href} className="text-sm font-medium text-coop-muted transition-colors hover:text-coop-forest-mid">
              {l.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2.5">
          <Button to="/role_selection" variant="secondary" className="px-4 py-2.5 max-lg:hidden">
            <Lock className="h-4 w-4 text-coop-forest-mid" /> Portal Login
          </Button>
          <Button to="/membership_form" className="px-4 py-2.5 max-md:hidden">
            Become a Member
          </Button>
          <button
            className="rounded-lg border border-coop-sage bg-white p-2.5 text-coop-forest xl:hidden"
            onClick={() => setMenuOpen((o) => !o)}
            aria-label="Toggle menu"
            aria-expanded={menuOpen}
            aria-controls="mobile-menu-panel"
          >
            {menuOpen ? <X className="h-5 w-5" /> : <MenuIcon className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {menuOpen && (
        <div id="mobile-menu-panel" className={`flex flex-col gap-1 border-t border-coop-sage bg-white py-4 xl:hidden ${GUTTER}`}>
          {NAV_LINKS.map((l) => (
            <a key={l.href} href={l.href} onClick={close} className="rounded-lg px-3 py-3 text-sm font-medium text-coop-forest hover:bg-coop-cream-tint">
              {l.label}
            </a>
          ))}
          <div className="mt-3 flex flex-col gap-3 border-t border-coop-sage pt-4">
            <Button to="/membership_form" onClick={close}>Become a Member</Button>
            <Button to="/role_selection" variant="secondary" onClick={close}>Portal Login</Button>
          </div>
        </div>
      )}
    </header>
  );
}

function InfoStrip() {
  return (
    <div className="bg-coop-forest text-xs font-medium text-white">
      <div className={`flex items-center justify-between gap-4 py-2 ${GUTTER}`}>
        <span className="text-coop-mint">CDA-registered cooperative</span>
        <span className="hidden text-white/75 lg:inline">Open {OFFICE_HOURS}</span>
        <a href={FACEBOOK_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-white/85 hover:text-coop-mint">
          <Facebook className="h-3.5 w-3.5" /> Message us
        </a>
      </div>
    </div>
  );
}

function Hero() {
  return (
    <section id="home" className="bg-white pb-14 pt-10 sm:pb-20 lg:pb-24 lg:pt-16">
      <div className={`grid items-center gap-10 lg:grid-cols-12 lg:gap-14 ${GUTTER}`}>
        <div className="flex min-w-0 flex-col gap-6 lg:col-span-7">
          <p className="text-sm font-semibold text-coop-forest-mid">Tubungan, Iloilo. Serving members since 1995.</p>
          <h1 className="text-[2rem] font-bold leading-[1.15] tracking-tight text-coop-forest sm:text-5xl xl:text-6xl">
            Empowering Educators, <span className="text-coop-emerald">Sustaining Futures.</span>
          </h1>
          <p className="max-w-[52ch] text-base leading-relaxed text-coop-muted sm:text-lg">
            Savings, loans and a cooperative you co-own, built for Tubungan’s teachers and their families.
          </p>
          <div className="flex flex-col gap-3 pt-1 sm:flex-row sm:items-center sm:gap-4">
            <Button to="/membership_form" className="px-7 py-3.5">
              Become a Member <ArrowRight className="h-4 w-4" />
            </Button>
            <Button to="/role_selection" variant="secondary" className="px-7 py-3.5">
              <Lock className="h-4 w-4 text-coop-forest-mid" /> Portal Login
            </Button>
          </div>
        </div>

        <figure className="min-w-0 lg:col-span-5">
          <img
            src="/assets/img/TTMPC-1.jpg"
            alt="TTMPC officers and staff in front of the cooperative logo at the Tubungan office"
            width="2048"
            height="1536"
            fetchPriority="high"
            className="aspect-[4/3] w-full rounded-2xl object-cover object-[50%_55%] shadow-coop-lift"
          />
          <figcaption className="mt-3 text-sm text-coop-muted">Our officers and staff at the Tubungan office.</figcaption>
        </figure>
      </div>
    </section>
  );
}

function FactsStrip() {
  return (
    <section className="border-y border-coop-sage bg-coop-cream-warm">
      <dl className={`grid gap-y-8 py-10 sm:grid-cols-2 lg:grid-cols-4 lg:gap-0 lg:divide-x lg:divide-coop-sage ${GUTTER}`}>
        {FACTS.map(({ icon: Icon, title, text }) => (
          <div key={title} className="flex items-start gap-4 lg:px-8 lg:first:pl-0 lg:last:pr-0">
            <Icon className="mt-0.5 h-6 w-6 shrink-0 text-coop-forest-mid" />
            <div>
              <dt className="font-semibold text-coop-forest">{title}</dt>
              <dd className="mt-1 text-sm leading-relaxed text-coop-muted">{text}</dd>
            </div>
          </div>
        ))}
      </dl>
    </section>
  );
}

function Services() {
  return (
    <section id="services" className="bg-white py-20 sm:py-24">
      <div className={`grid gap-12 lg:grid-cols-12 lg:gap-16 ${GUTTER}`}>
        <Reveal className="lg:col-span-4">
          <div className="lg:sticky lg:top-28">
            <SectionHeader
              title="Core Cooperative Services"
              text="Simple products designed to build your savings and your stake in the cooperative."
            />
            <p className="mt-6 text-sm text-coop-muted">
              Looking for a loan? <a href="#loans" className="font-semibold text-coop-forest-mid underline underline-offset-4">Jump to the loan calculator.</a>
            </p>
          </div>
        </Reveal>

        <div className="flex flex-col divide-y divide-coop-sage lg:col-span-8">
          {SERVICES.map(({ icon: Icon, title, text, bullets }, i) => (
            <Reveal key={title} delayMs={i * 100}>
              <article className="grid gap-5 py-10 first:pt-0 last:pb-0 sm:grid-cols-[3.5rem_1fr] sm:gap-8">
                <span className="flex h-14 w-14 items-center justify-center rounded-lg bg-coop-cream-tint text-coop-forest-mid">
                  <Icon className="h-7 w-7" />
                </span>
                <div>
                  <h3 className="text-2xl font-bold text-coop-forest">{title}</h3>
                  <p className="mt-2 max-w-[60ch] leading-relaxed text-coop-muted">{text}</p>
                  <ul className="mt-5 flex flex-col gap-2.5 text-sm font-medium text-coop-forest">
                    {bullets.map((b) => (
                      <li key={b} className="flex items-start gap-2.5">
                        <CircleCheck className="mt-0.5 h-4 w-4 shrink-0 text-coop-emerald" />
                        <span>{b}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </article>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

const peso = (n) =>
  `₱${Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Fee/rate constants mirror the app's loan_fee_policies fallbacks and the
// loan policies (src/LOANFORMS/loanComputeApi.js). Public estimate only: the
// real figures are computed at application time.
const LOAN_TYPES = {
  consolidated: {
    label: 'Consolidated',
    icon: Banknote,
    summary:
      'Our main loan for larger needs such as tuition, home repairs or paying off other debts. Repay in fixed monthly amounts through salary or over the counter.',
    facts: ['0.83% interest per month (add-on)', 'Terms of 12, 24, 36, 48 or 60 months', 'Open to members in good standing (MIGS)'],
    terms: [12, 24, 36, 48, 60],
    defaultTerm: 24,
    min: 5000,
    max: 500000,
    step: 1000,
    defaultAmount: 100000,
  },
  emergency: {
    label: 'Emergency',
    icon: Zap,
    summary:
      'Quick help for urgent expenses like medical bills or calamity repairs. Small amounts, short terms and interest only on what you still owe.',
    facts: ['Up to ₱20,000', '2% interest per month on the remaining balance', '6 or 12 monthly payments'],
    terms: [6, 12],
    defaultTerm: 12,
    min: 1000,
    max: 20000,
    step: 500,
    defaultAmount: 10000,
  },
  bonus: {
    label: 'Bonus',
    icon: CalendarDays,
    summary:
      'A short bridge loan against your mid-year (May) or year-end (November) bonus. Interest is deducted upfront, and you pay back only the principal when the bonus arrives.',
    facts: ['2% per month for members, 3% for non-members', 'Interest taken upfront when the loan is released', 'Principal repaid from your bonus in May or November'],
    terms: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
    defaultTerm: 6,
    min: 5000,
    max: 100000,
    step: 1000,
    defaultAmount: 30000,
  },
};

function computeLoan(type, principal, term, isMember) {
  const p = Number(principal) || 0;
  if (p <= 0 || !term) return null;

  if (type === 'consolidated') {
    const interest = p * 0.0083 * term;
    const serviceFee = (Math.floor((Math.trunc(p) - 1) / 50000) + 1) * 100;
    const cbu = p * 0.02;
    const insurance = p * (1.35 / 1000);
    const notarial = 100;
    return {
      headline: { label: 'Monthly payment', value: (p + interest) / term },
      rows: [
        ['Interest over the whole term', interest],
        ['Total you repay', p + interest],
        ['Service fee', serviceFee],
        ['Share capital build-up (2%, stays yours)', cbu],
        ['Insurance', insurance],
        ['Notarial fee', notarial],
      ],
      net: p - (serviceFee + cbu + insurance + notarial),
      note: 'Net proceeds shown before any balance from a previous loan.',
    };
  }

  if (type === 'emergency') {
    const monthlyPrincipal = p / term;
    let balance = p;
    let totalInterest = 0;
    let first = 0;
    let last = 0;
    for (let i = 1; i <= term; i += 1) {
      balance -= monthlyPrincipal;
      const interest = Math.max(balance, 0) * 0.02;
      totalInterest += interest;
      if (i === 1) first = monthlyPrincipal + interest;
      if (i === term) last = monthlyPrincipal + interest;
    }
    const serviceFee = 100;
    const cbu = p * 0.02;
    return {
      headline: { label: 'First monthly payment', value: first },
      rows: [
        ['Last monthly payment', last],
        ['Total interest', totalInterest],
        ['Total you repay', p + totalInterest],
        ['Service fee', serviceFee],
        ['Share capital build-up (2%, stays yours)', cbu],
      ],
      net: p - serviceFee - cbu,
      note: 'Payments get smaller each month because interest is charged on what is left.',
    };
  }

  const upfront = p * (isMember ? 0.02 : 0.03) * term;
  const serviceFee = 100;
  return {
    headline: { label: 'You pay at your bonus', value: p },
    rows: [
      ['Interest deducted upfront', upfront],
      ['Service fee', serviceFee],
    ],
    net: p - upfront - serviceFee,
    note: 'Term is the number of months from release until your bonus month.',
  };
}

// One panel: pick a loan, read what it is, then see the numbers for it.
function Loans() {
  const [type, setType] = useState('consolidated');
  const cfg = LOAN_TYPES[type];
  const [amount, setAmount] = useState(cfg.defaultAmount);
  const [term, setTerm] = useState(cfg.defaultTerm);
  const [isMember, setIsMember] = useState(true);

  const switchType = (next) => {
    const n = LOAN_TYPES[next];
    setType(next);
    setAmount(n.defaultAmount);
    setTerm(n.defaultTerm);
  };

  const clamped = Math.min(Math.max(Number(amount) || 0, 0), cfg.max);
  const result = clamped >= cfg.min ? computeLoan(type, clamped, term, isMember) : null;

  return (
    <section id="loans" className="bg-coop-cream-warm py-20 sm:py-24">
      <div className={`flex flex-col gap-10 ${GUTTER}`}>
        <Reveal>
          <SectionHeader
            title="Pick a Loan, See the Numbers"
            text="Three loans for three kinds of need. Choose one to read how it works and estimate your payments."
          />
        </Reveal>

        <Reveal>
          <div className="overflow-hidden rounded-2xl border border-coop-sage bg-white shadow-coop-card">
            <div role="tablist" aria-label="Loan type" className="grid grid-cols-3 border-b border-coop-sage">
              {Object.entries(LOAN_TYPES).map(([key, t]) => (
                <button
                  key={key}
                  role="tab"
                  aria-selected={type === key}
                  onClick={() => switchType(key)}
                  className={`flex items-center justify-center gap-2 border-b-2 px-3 py-4 text-sm font-semibold transition-colors sm:text-base ${
                    type === key
                      ? 'border-coop-forest-mid bg-coop-cream-tint text-coop-forest'
                      : 'border-transparent text-coop-muted hover:bg-coop-cream-warm'
                  }`}
                >
                  <t.icon className="hidden h-5 w-5 sm:block" />
                  {t.label}
                </button>
              ))}
            </div>

            <div className="grid lg:grid-cols-12">
              <div className="flex flex-col gap-7 p-6 sm:p-8 lg:col-span-7">
                <div>
                  <p className="max-w-[60ch] leading-relaxed text-coop-muted">{cfg.summary}</p>
                  <ul className="mt-4 flex flex-col gap-2 text-sm font-medium text-coop-forest">
                    {cfg.facts.map((f) => (
                      <li key={f} className="flex items-start gap-2.5">
                        <CircleCheck className="mt-0.5 h-4 w-4 shrink-0 text-coop-emerald" />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="flex flex-col gap-2 border-t border-coop-sage pt-7">
                  <label htmlFor="calc-amount" className="text-sm font-semibold text-coop-forest">Loan amount</label>
                  <div className="flex items-center gap-2 rounded-lg border border-coop-muted/40 bg-white px-4 py-3 focus-within:border-coop-emerald focus-within:ring-4 focus-within:ring-coop-emerald/15">
                    <span className="font-semibold text-coop-muted">₱</span>
                    <input
                      id="calc-amount"
                      type="number"
                      inputMode="numeric"
                      min={cfg.min}
                      max={cfg.max}
                      step={cfg.step}
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      className="w-full bg-transparent text-lg font-semibold tabular-nums text-coop-forest outline-none"
                    />
                  </div>
                  <input
                    type="range"
                    min={cfg.min}
                    max={cfg.max}
                    step={cfg.step}
                    value={clamped || cfg.min}
                    onChange={(e) => setAmount(Number(e.target.value))}
                    aria-label="Loan amount slider"
                    className="w-full accent-coop-emerald"
                  />
                  <div className="flex justify-between text-xs text-coop-muted">
                    <span>{peso(cfg.min)}</span>
                    <span>Up to {peso(cfg.max)}</span>
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <span className="text-sm font-semibold text-coop-forest">
                    {type === 'bonus' ? 'Months until your bonus' : 'Term in months'}
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {cfg.terms.map((t) => (
                      <button
                        key={t}
                        onClick={() => setTerm(t)}
                        aria-pressed={term === t}
                        className={`min-w-12 rounded-lg border px-3.5 py-2 text-sm font-semibold transition-colors ${
                          term === t
                            ? 'border-coop-forest-mid bg-coop-forest-mid text-white'
                            : 'border-coop-muted/40 bg-white text-coop-forest hover:bg-coop-cream-tint'
                        }`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>

                {type === 'bonus' && (
                  <label className="flex cursor-pointer items-center gap-3 text-sm font-medium text-coop-forest">
                    <input
                      type="checkbox"
                      checked={isMember}
                      onChange={(e) => setIsMember(e.target.checked)}
                      className="h-4 w-4 accent-coop-emerald"
                    />
                    I am a TTMPC member (2% instead of 3%)
                  </label>
                )}
              </div>

              <div className="flex flex-col gap-5 border-t border-coop-sage bg-coop-cream-tint p-6 sm:p-8 lg:col-span-5 lg:border-l lg:border-t-0">
                {result ? (
                  <>
                    <div>
                      <p className="text-sm font-medium text-coop-muted">{result.headline.label}</p>
                      <p className="mt-1 text-4xl font-bold tabular-nums text-coop-forest sm:text-5xl">{peso(result.headline.value)}</p>
                    </div>
                    <dl className="flex flex-col divide-y divide-coop-sage text-sm">
                      {result.rows.map(([label, value]) => (
                        <div key={label} className="flex items-center justify-between gap-4 py-2.5">
                          <dt className="text-coop-muted">{label}</dt>
                          <dd className="font-semibold tabular-nums text-coop-forest">{peso(value)}</dd>
                        </div>
                      ))}
                    </dl>
                    <div className="rounded-lg bg-coop-forest-mid p-4 text-white">
                      <p className="text-sm font-medium text-white/85">Estimated net proceeds</p>
                      <p className="text-2xl font-bold tabular-nums">{peso(result.net)}</p>
                      <p className="mt-1 text-xs text-white/80">{result.note}</p>
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-coop-muted">Enter an amount of at least {peso(cfg.min)} to see your estimate.</p>
                )}
                <p className="mt-auto text-xs leading-relaxed text-coop-muted">
                  This is an estimate only. Final amounts depend on your approval, eligibility and any existing balance.
                </p>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function About() {
  const numbers = [
    { value: '30+', label: 'years serving Tubungan' },
    { value: '₱200', label: 'to become a co-owner' },
    { value: '1 vote', label: 'for every member' },
  ];
  return (
    <section id="about" className="bg-white py-20 sm:py-24">
      <div className={`flex flex-col gap-12 ${GUTTER}`}>
        <Reveal>
          <figure>
            <img
              src="/assets/img/news_2.jpg"
              alt="TTMPC members handing out school supplies at an elementary school"
              width="2048"
              height="1536"
              loading="lazy"
              className="aspect-[4/3] w-full rounded-2xl object-cover object-[50%_68%] sm:aspect-[16/9] lg:aspect-[21/9]"
            />
            <figcaption className="mt-3 text-sm text-coop-muted">TTMPC members delivering school supplies to a partner school.</figcaption>
          </figure>
        </Reveal>

        <Reveal className="grid gap-10 lg:grid-cols-12 lg:gap-16">
          <div className="flex flex-col gap-5 lg:col-span-7">
            <p className="text-sm font-semibold text-coop-forest-mid">Our legacy</p>
            <h2 className="text-3xl font-bold leading-tight tracking-tight text-coop-forest sm:text-4xl">
              Built by Tubungan’s teachers, for Tubungan’s teachers.
            </h2>
            <p className="max-w-[62ch] leading-relaxed text-coop-muted sm:text-lg">
              TTMPC began in 1995 with one mission: secure, accessible and fair financial services for educators and local families. We have grown from a small group pooling their savings into a registered cooperative, and we keep our records accountable through the REGANT system.
            </p>
          </div>
          <dl className="grid grid-cols-3 gap-4 self-end lg:col-span-5">
            {numbers.map((n) => (
              <div key={n.label} className="border-l-2 border-coop-emerald pl-4">
                <dd className="text-2xl font-bold tabular-nums text-coop-forest sm:text-3xl">{n.value}</dd>
                <dt className="mt-1 text-xs leading-snug text-coop-muted sm:text-sm">{n.label}</dt>
              </div>
            ))}
          </dl>
        </Reveal>
      </div>
    </section>
  );
}

function Regant() {
  const [main, ...rest] = REGANT_FEATURES;
  return (
    <section id="regant" className="bg-coop-cream-warm py-20 sm:py-24">
      <div className={`flex flex-col gap-12 ${GUTTER}`}>
        <Reveal>
          <SectionHeader
            title="Run With the Discipline of a Real Financial Institution"
            text="REGANT is the decision support system behind every deposit and loan. It keeps records accurate, approvals fair and officers accountable to every member."
          />
        </Reveal>

        <div className="grid gap-4 lg:grid-cols-3 lg:grid-rows-2">
          <Reveal className="lg:col-span-2 lg:row-span-2">
            <article className="relative flex h-full min-h-72 flex-col justify-between gap-10 overflow-hidden rounded-2xl bg-coop-forest-mid p-7 text-white sm:p-10">
              <div className="pointer-events-none absolute -bottom-20 -right-16 h-72 w-72 rounded-full bg-coop-emerald-bright/25 blur-3xl" aria-hidden="true" />
              <main.icon className="relative h-9 w-9 text-coop-mint" />
              <div className="relative">
                <h3 className="text-2xl font-bold sm:text-3xl">{main.title}</h3>
                <p className="mt-3 max-w-[48ch] leading-relaxed text-white/90 sm:text-lg">{main.text}</p>
              </div>
            </article>
          </Reveal>
          {rest.map(({ icon: Icon, title, text }, i) => (
            <Reveal key={title} delayMs={(i + 1) * 100}>
              <article
                className={`flex h-full flex-col gap-3 rounded-2xl p-6 ${
                  i === 0 ? 'bg-coop-cream-tint' : i === 1 ? 'border border-coop-sage bg-white' : 'bg-coop-sage/60'
                }`}
              >
                <Icon className="h-6 w-6 text-coop-forest-mid" />
                <h3 className="text-lg font-bold text-coop-forest">{title}</h3>
                <p className="text-sm leading-relaxed text-coop-muted">{text}</p>
              </article>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function Membership() {
  return (
    <section id="membership" className="bg-white py-20 sm:py-24">
      <div className={`grid items-start gap-12 lg:grid-cols-12 lg:gap-16 ${GUTTER}`}>
        <div className="flex flex-col gap-10 lg:col-span-7">
          <Reveal>
            <SectionHeader
              title="Become Part of the TTMPC Community"
              text="Three steps to become a co-owner of the cooperative."
            />
          </Reveal>
          <ol className="flex flex-col">
            {STEPS.map(({ title, text }, i) => (
              <Reveal key={title} delayMs={i * 100}>
                <li className="relative flex gap-5 pb-10 last:pb-0">
                  {i < STEPS.length - 1 && <span className="absolute left-5 top-11 h-[calc(100%-2.75rem)] w-px bg-coop-sage" aria-hidden="true" />}
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-coop-forest-mid font-bold text-white">
                    {i + 1}
                  </span>
                  <div>
                    <h3 className="text-xl font-bold text-coop-forest">{title}</h3>
                    <p className="mt-1.5 max-w-[56ch] leading-relaxed text-coop-muted">{text}</p>
                  </div>
                </li>
              </Reveal>
            ))}
          </ol>
        </div>

        <Reveal className="lg:col-span-5" delayMs={150}>
          <figure className="overflow-hidden rounded-2xl border border-coop-sage bg-white shadow-coop-card">
            <img
              src="/assets/img/TTMPC-4.jpg"
              alt="TTMPC officers and members at a community outreach"
              width="1536"
              height="1024"
              loading="lazy"
              className="aspect-[3/2] w-full object-cover"
            />
            <figcaption className="flex flex-col gap-4 p-6 sm:p-7">
              <p className="text-lg font-bold text-coop-forest">Ready to start?</p>
              <p className="text-sm leading-relaxed text-coop-muted">Apply online anytime, or visit our office in Tubungan.</p>
              <Button to="/membership_form" className="w-full sm:w-fit">
                Become a Member <ArrowRight className="h-4 w-4" />
              </Button>
            </figcaption>
          </figure>
        </Reveal>
      </div>
    </section>
  );
}

function ClosingCta() {
  return (
    <section className="bg-coop-forest-mid text-white">
      <div className={`flex flex-col items-start justify-between gap-8 py-14 sm:py-16 lg:flex-row lg:items-center ${GUTTER}`}>
        <Reveal className="max-w-2xl">
          <h2 className="text-3xl font-bold leading-tight tracking-tight sm:text-4xl">Own a share of your cooperative.</h2>
          <p className="mt-3 text-base leading-relaxed text-white/90 sm:text-lg">
            Join the teachers and families who have built TTMPC since 1995, or log in to manage your account.
          </p>
        </Reveal>
        <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
          <Button to="/membership_form" variant="light" className="px-8 py-3.5">Become a Member</Button>
          <Button to="/role_selection" variant="ghost" className="px-8 py-3.5">Portal Login</Button>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer id="contact" className="bg-coop-forest-deep text-white/80">
      <div className={`grid gap-10 py-14 sm:grid-cols-2 lg:grid-cols-4 ${GUTTER}`}>
        <div className="flex flex-col gap-4 sm:col-span-2 lg:col-span-1">
          <img src="/img/ttmpc logo.png" alt="TTMPC logo" className="h-14 w-auto self-start brightness-0 invert" />
          <p className="max-w-[40ch] text-sm leading-relaxed text-white/75">
            Tubungan Teachers’ Multi-Purpose Cooperative. A CDA-registered cooperative serving educators and families since 1995.
          </p>
        </div>

        <div className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold text-white">Explore</h3>
          <ul className="flex flex-col gap-2.5 text-sm text-white/75">
            {NAV_LINKS.map((l) => (
              <li key={l.href}><a href={l.href} className="transition-colors hover:text-coop-mint">{l.label}</a></li>
            ))}
          </ul>
        </div>

        <div className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold text-white">Get started</h3>
          <ul className="flex flex-col gap-2.5 text-sm text-white/75">
            <li><Link to="/membership_form" className="transition-colors hover:text-coop-mint">Become a Member</Link></li>
            <li><Link to="/role_selection" className="transition-colors hover:text-coop-mint">Portal Login</Link></li>
            <li><a href="#loans" className="transition-colors hover:text-coop-mint">Loan Calculator</a></li>
          </ul>
        </div>

        <div className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold text-white">Visit us</h3>
          <ul className="flex flex-col gap-3 text-sm leading-relaxed text-white/75">
            <li className="flex items-start gap-2.5">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-coop-mint" />
              <span>{OFFICE_ADDRESS}</span>
            </li>
            <li className="flex items-start gap-2.5">
              <Clock className="mt-0.5 h-4 w-4 shrink-0 text-coop-mint" />
              <span>{OFFICE_HOURS}</span>
            </li>
            <li>
              <a href={FACEBOOK_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2.5 transition-colors hover:text-coop-mint">
                <Facebook className="h-4 w-4 shrink-0 text-coop-mint" />
                facebook.com/ttmpc.tubungan.5
              </a>
            </li>
          </ul>
        </div>
      </div>
      <div className="border-t border-white/10 py-5">
        <p className={`text-center text-xs text-white/65 sm:text-left ${GUTTER}`}>
          &copy; {new Date().getFullYear()} Tubungan Teachers’ Multi-Purpose Cooperative. Powered by REGANT. All rights reserved.
        </p>
      </div>
    </footer>
  );
}

function App() {
  return (
    <div className="min-h-screen w-full overflow-x-clip bg-white font-body text-coop-forest antialiased selection:bg-coop-mint selection:text-coop-forest">
      <InfoStrip />
      <Header />
      <main className="w-full">
        <Hero />
        <FactsStrip />
        <Services />
        <Loans />
        <About />
        <Regant />
        <Membership />
        <ClosingCta />
      </main>
      <Footer />
    </div>
  );
}

export default App;
