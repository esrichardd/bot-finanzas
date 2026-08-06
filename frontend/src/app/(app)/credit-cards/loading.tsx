import { Skeleton } from "../../../components/ui/skeleton";

export default function CreditCardsLoading() {
  return <section className="mx-auto max-w-6xl space-y-8 py-4 md:py-8"><div className="space-y-3"><Skeleton className="h-4 w-20" /><Skeleton className="h-12 w-64" /><Skeleton className="h-5 w-96 max-w-full" /></div><Skeleton className="h-32 w-full" /><div className="grid grid-cols-1 gap-5 lg:grid-cols-2">{[1, 2, 3, 4].map((item) => <Skeleton className="h-80" key={item} />)}</div></section>;
}
