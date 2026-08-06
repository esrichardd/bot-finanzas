import { Skeleton } from "../../../components/ui/skeleton";

export default function Loading() {
  return (
    <section className="mx-auto max-w-6xl space-y-8 py-4 md:py-8">
      <div className="flex items-end justify-between gap-5"><div className="space-y-3"><Skeleton className="h-4 w-20" /><Skeleton className="h-12 w-64" /><Skeleton className="h-5 w-96 max-w-full" /></div><Skeleton className="h-9 w-40" /></div>
      <div className="space-y-4"><Skeleton className="h-10 w-48" /><Skeleton className="h-9 w-full" /></div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 6 }, (_, index) => <Skeleton className="h-56 rounded-xl" key={index} />)}</div>
    </section>
  );
}
