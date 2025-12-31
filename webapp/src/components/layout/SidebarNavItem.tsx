import React from "react";
import { NavLink } from "react-router-dom";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/cn";

export function SidebarNavItem({
  to,
  label,
  icon,
  collapsed,
  search,
}: {
  to: string;
  label: string;
  icon: React.ReactNode;
  collapsed: boolean;
  search: string;
}) {
  const link = (
    <NavLink
      to={{ pathname: to, search }}
      aria-label={label}
      className={({ isActive }) =>
        cn(
          "relative group rounded-2xl text-sm transition-colors",
          collapsed
            ? "grid h-11 w-11 place-items-center self-center leading-none"
            : "flex items-center gap-3 px-3 py-2",
          "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
          isActive && "bg-accent/70 text-foreground tint-accent",
          // Active indicator bar reads great in expanded mode, but in collapsed mode it can
          // visually pull the icon off-center (and is less useful without labels).
          isActive &&
            !collapsed &&
            "before:absolute before:left-0 before:top-2 before:bottom-2 before:w-1 before:rounded-r-full before:bg-primary",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
        )
      }
    >
      <span
        className={cn(
          "text-muted-foreground group-hover:text-foreground",
          collapsed ? "grid h-full w-full place-items-center" : "inline-flex items-center justify-center",
          "[&>svg]:block",
        )}
      >
        {icon}
      </span>
      {!collapsed && <span className="font-medium">{label}</span>}
    </NavLink>
  );

  if (!collapsed) return link;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}


