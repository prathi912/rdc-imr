
'use client';

import { useState } from 'react';
import { Button } from './ui/button';
import { BookOpenCheck } from 'lucide-react';
import { WelcomeTutorial } from './dashboard/welcome-tutorial';
import type { User } from '@/types';

interface TutorialDialogProps {
    user: User;
}

export function TutorialDialog({ user }: TutorialDialogProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
        <Button variant="ghost" size="icon" aria-label="View Tutorial" onClick={() => setIsOpen(true)}>
            <BookOpenCheck className="h-[1.2rem] w-[1.2rem]" />
        </Button>
        {isOpen && <WelcomeTutorial user={user} isOpen={isOpen} onOpenChange={setIsOpen} />}
    </>
  );
}
