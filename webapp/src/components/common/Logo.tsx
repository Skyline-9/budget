import { cn } from "@/lib/cn";

export function LogoMark({
  className,
  size = 36,
  alt = "Budget",
}: {
  className?: string;
  size?: number;
  alt?: string;
}) {
  return (
    <img
      src="/favicon/favicon-64.png"
      width={size}
      height={size}
      alt={alt}
      className={cn(
        "rounded-2xl ring-1 ring-border/60 bg-background/30",
        "shadow-soft",
        className,
      )}
      loading="eager"
      decoding="async"
    />
  );
}










