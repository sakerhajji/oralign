'use client';

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { User } from "@/lib/types";
import { getAvatarUrl } from "@/lib/utils";

interface UserAvatarProps {
  user: User;
  className?: string;
}

export function UserAvatar({ user, className }: UserAvatarProps) {
  const initials = user.fullName
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <Avatar className={className}>
      <AvatarImage src={getAvatarUrl(user.avatarUrl)} alt={user.fullName} />
      <AvatarFallback className="bg-gradient-to-br from-blue-500 to-purple-600 text-white">
        {initials}
      </AvatarFallback>
    </Avatar>
  );
}
