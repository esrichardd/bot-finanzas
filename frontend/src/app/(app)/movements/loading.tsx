import { Skeleton } from "../../../components/ui/skeleton";

export default function MovementsLoading() {
  return <section className="mx-auto max-w-6xl space-y-8 py-4 md:py-8"><div className="space-y-3"><Skeleton className="h-4 w-20" /><Skeleton className="h-12 w-56" /><Skeleton className="h-5 w-96 max-w-full" /></div><Skeleton className="h-28 w-full" /><div className="overflow-hidden rounded-xl border"><Skeleton className="h-10 rounded-none" />{[1, 2, 3, 4].map((item) => <Skeleton className="mx-4 my-4 h-16" key={item} />)}</div></section>;
}
