import Image from 'next/image';
import { cn } from '@/lib/utils';

interface LogoProps {
  variant?: 'public' | 'dashboard';
  className?: string;
}

export function Logo({ variant = 'public', className }: LogoProps) {
  if (variant === 'dashboard') {
    return (
      <div className={cn("flex items-center justify-center p-6", className)} style={{ maxHeight: 40 }}>
        {/* Expanded Light mode logo */}
        <Image
          src="https://pinxoxpbufq92wb4.public.blob.vercel-storage.com/Research%20%26%20Development%20%E2%80%A8Cell%20b.svg"
          alt="RDC Logo"
          width={250}
          height={70}
          className="block dark:hidden group-data-[collapsible=icon]:hidden"
          priority
        />
        {/* Expanded Dark mode logo */}
        <Image
          src="https://pinxoxpbufq92wb4.public.blob.vercel-storage.com/Research%20%26%20Development%20%E2%80%A8Cell%20W.svg"
          alt="RDC Logo"
          width={250}
          height={70}
          className="hidden dark:block group-data-[collapsible=icon]:hidden"
          priority
        />
        {/* Collapsed Logo Icon */}
        <div className="hidden h-7 w-7 items-center justify-center rounded-sm bg-primary text-primary-foreground group-data-[collapsible=icon]:flex">
          <span className="text-sm font-bold">PU</span>
        </div>
      </div>
    );
  }

  // Default public logo
  return (
    <div className={cn("flex items-center justify-start py-2", className)} style={{ minHeight: 49 }}>
      <Image
        src="https://pinxoxpbufq92wb4.public.blob.vercel-storage.com/RDC-PU-LOGO-BLACK.svg"
        alt="RDC Logo"
        width={350}
        height={100}
        className="block dark:hidden"
        priority
      />
      <Image
        src="https://pinxoxpbufq92wb4.public.blob.vercel-storage.com/RDC-PU-LOGO-WHITE.svg"
        alt="RDC Logo"
        width={350}
        height={100}
        className="hidden dark:block"
        priority
      />
    </div>
  );
}
