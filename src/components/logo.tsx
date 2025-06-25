import { FlaskConical } from 'lucide-react';

export function Logo() {
  return (
    <div className="flex items-center gap-2 p-2">
      <FlaskConical className="h-7 w-7 text-primary" />
      <h2 className="text-lg font-bold tracking-tighter text-foreground group-data-[collapsible=icon]:hidden">
        Parul Research Portal
      </h2>
    </div>
  );
}
