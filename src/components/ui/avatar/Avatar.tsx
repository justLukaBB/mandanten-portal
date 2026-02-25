import { cn } from "../../../lib/utils";
import { SIZE_CONFIG, type AvatarSize } from "./avatar.constants";
import { getInitials, getGradientStyle } from "./avatar.utils";

interface AvatarProps {
  name: string;
  size?: AvatarSize;
  className?: string;
}

function Avatar({ name, size = "md", className }: AvatarProps) {
  const config = SIZE_CONFIG[size];
  const initials = getInitials(name);
  const displayInitials = config.px <= 36 && initials.length > 1 ? initials[0] : initials;

  return (
    <div
      data-slot="avatar"
      role="img"
      aria-label={name.trim() || "Unknown user"}
      className={cn(
        "flex items-center justify-center rounded-full font-semibold text-white uppercase select-none shrink-0",
        "tracking-[0.02em]",
        className
      )}
      style={{
        width: config.px,
        height: config.px,
        fontSize: config.fontSize,
        background: getGradientStyle(name),
        fontFamily: "'DM Sans', sans-serif",
      }}
    >
      {displayInitials}
    </div>
  );
}

export { Avatar };
export type { AvatarProps };
