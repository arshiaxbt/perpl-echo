import Image from "next/image";
import { cn } from "@/lib/utils";

export const PERPL_ECHO_LOGO_URL = "/perpl-echo.png";

type BrandLogoProps = {
  className?: string;
  imageClassName?: string;
  priority?: boolean;
};

export function BrandLogo({ className, imageClassName, priority = false }: BrandLogoProps) {
  return (
    <span className={cn("flex items-center justify-center overflow-hidden rounded-sm", className)}>
      <Image
        src={PERPL_ECHO_LOGO_URL}
        alt="Perpl Echo"
        width={128}
        height={128}
        className={cn("h-full w-full object-contain", imageClassName)}
        priority={priority}
      />
    </span>
  );
}
