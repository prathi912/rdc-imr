
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { User } from '@/types';
import Link from 'next/link';
import { User as UserIcon, LogOut, Settings, LayoutDashboard } from 'lucide-react';

interface UserNavProps {
  user: User | null;
  onLogout: () => void;
}

export function UserNav({ user, onLogout }: UserNavProps) {
  if (!user) {
    return null;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="relative h-10 pl-2 pr-2 rounded-full flex items-center gap-2">
           <div className="hidden sm:flex flex-col items-end text-right">
                <span className="text-sm font-medium leading-none text-foreground">
                    Hi, {user.name}
                </span>
           </div>
          <Avatar className="h-9 w-9">
            <AvatarImage src={user.photoURL || undefined} alt={user.name || 'User'} />
            <AvatarFallback>{user.name?.[0]?.toUpperCase() || 'U'}</AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56" align="end" forceMount>
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-medium leading-none">{user.name}</p>
            <p className="text-xs leading-none text-muted-foreground">{user.email}</p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <Link href="/dashboard" passHref>
             <DropdownMenuItem><LayoutDashboard className="mr-2 h-4 w-4" />Dashboard</DropdownMenuItem>
          </Link>
          {user.misId && (
            <Link href={`/profile/${user.misId}`} passHref>
              <DropdownMenuItem><UserIcon className="mr-2 h-4 w-4" />Profile</DropdownMenuItem>
            </Link>
          )}
          <Link href="/dashboard/settings" passHref>
            <DropdownMenuItem><Settings className="mr-2 h-4 w-4" />Settings</DropdownMenuItem>
          </Link>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onLogout}><LogOut className="mr-2 h-4 w-4" />Log out</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
