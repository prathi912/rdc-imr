import Image from 'next/image';

export function Logo() {
  return (
    <div className="flex items-center justify-center p-2" style={{ minHeight: 49 }}>
      {/* Expanded Light mode logo */}
      <Image
        src="https://rdc-full.vercel.app/assets/RDC-PU-LOGO.svg"
        alt="Parul Research Portal Logo"
        width={350}
        height={100}
        className="block dark:hidden group-data-[collapsible=icon]:hidden"
        priority
      />
      {/* Expanded Dark mode logo */}
      <Image
        src="https://rdc-full.vercel.app/assets/RDC-PU-LOGO-WHITE.svg"
        alt="Parul Research Portal Logo"
        width={350}
        height={100}
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
