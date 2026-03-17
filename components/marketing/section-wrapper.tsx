interface SectionWrapperProps {
  children: React.ReactNode;
  id?: string;
  className?: string; // For background colors, dark sections, etc.
  innerClassName?: string; // For overriding inner container styles
}

// Consistent section container with max-width, padding, and vertical spacing.
// Use className for background colors (the full-width outer div)
// and innerClassName for inner layout overrides.
export default function SectionWrapper({
  children,
  id,
  className = "",
  innerClassName = "",
}: SectionWrapperProps) {
  return (
    <section id={id} className={`px-6 py-24 md:py-32 ${className}`}>
      <div className={`mx-auto max-w-7xl ${innerClassName}`}>{children}</div>
    </section>
  );
}
