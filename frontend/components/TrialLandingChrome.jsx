import Image from 'next/image';
import Link from 'next/link';

export function TrialLandingHeader() {
  return (
    <header className="fixed left-0 right-0 top-0 z-50 border-b border-black/5 bg-white/95 dark:border-white/10 dark:bg-[#020818]">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        <Link href="/" className="flex items-center" aria-label="Telyx ana sayfa">
          <Image
            src="/telyx-logo-horizontal-light.png"
            alt="Telyx"
            width={106}
            height={30}
            priority
            sizes="106px"
            className="h-auto w-[106px] object-contain"
          />
        </Link>
        <nav className="flex items-center gap-2" aria-label="Trial landing">
          <Link
            href="/login"
            className="hidden h-10 items-center justify-center rounded-md px-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100 hover:text-slate-950 dark:text-slate-200 dark:hover:bg-white/10 dark:hover:text-white sm:inline-flex"
          >
            Giriş
          </Link>
          <Link
            href="/signup"
            className="inline-flex h-10 items-center justify-center rounded-md bg-[#051752] px-4 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#000acf]"
          >
            14 gün dene
          </Link>
        </nav>
      </div>
    </header>
  );
}

export function TrialLandingFooter() {
  return (
    <footer className="border-t border-slate-200 bg-white dark:border-white/10 dark:bg-[#020818]">
      <div className="container mx-auto flex flex-col gap-4 px-6 py-8 text-sm text-slate-500 dark:text-slate-400 sm:flex-row sm:items-center sm:justify-between">
        <p>© 2026 Telyx AI</p>
        <nav className="flex flex-wrap gap-x-5 gap-y-2" aria-label="Trial landing footer">
          <Link href="/privacy" className="transition-colors hover:text-slate-950 dark:hover:text-white">
            Gizlilik
          </Link>
          <Link href="/terms" className="transition-colors hover:text-slate-950 dark:hover:text-white">
            Şartlar
          </Link>
          <Link href="/contact" className="transition-colors hover:text-slate-950 dark:hover:text-white">
            İletişim
          </Link>
        </nav>
      </div>
    </footer>
  );
}
