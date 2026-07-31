import { Header } from "../../components/shared/header";

export default function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <>
      <Header />
      <main className="flex flex-1 items-start justify-center px-6 py-12">
        <div className="w-full max-w-5xl">{children}</div>
      </main>
    </>
  );
}
