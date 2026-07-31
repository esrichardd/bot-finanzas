export default function PublicLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="relative isolate flex min-h-svh flex-col overflow-x-hidden bg-background">
      <div
        aria-hidden
        className="absolute inset-0 -z-10 bg-[radial-gradient(circle,_var(--border)_1px,_transparent_1px)] [background-size:24px_24px] [mask-image:radial-gradient(ellipse_at_center,black_40%,transparent_75%)]"
      />
      <div className="relative z-0 flex min-h-svh flex-1 flex-col">
        {children}
      </div>
    </div>
  );
}
