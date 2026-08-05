import { Skeleton } from "../../../components/ui/skeleton";

export default function AccountsLoading() {
  return (
    <section className="mx-auto max-w-6xl space-y-8 py-4 md:py-8">
      <div className="space-y-3"><Skeleton className="h-4 w-20" /><Skeleton className="h-12 w-48" /><Skeleton className="h-5 w-96 max-w-full" /></div>
      <div className="space-y-4"><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></div>
      <div className="overflow-hidden rounded-xl border"><Skeleton className="h-12 rounded-none" />{[1, 2, 3].map((item) => <Skeleton className="mx-4 my-4 h-16" key={item} />)}</div>
    </section>
  );
}
