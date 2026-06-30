import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";

export function TableSkeleton({
  rows = 5,
  cols = 4,
}: {
  rows?: number;
  cols?: number;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          {Array.from({ length: cols }).map((_, i) => (
            <TableHead key={i}>
              <Skeleton className="h-4 w-[75%]" />
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {Array.from({ length: rows }).map((_, r) => (
          <TableRow key={r}>
            {Array.from({ length: cols }).map((_, c) => (
              <TableCell key={c}>
                <Skeleton
                  className={
                    c === 0
                      ? "h-4 w-[55%]"
                      : c === cols - 1
                        ? "h-5 w-14 rounded-full"
                        : "h-4 w-[80%]"
                  }
                />
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function KpiSkeleton() {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 pt-5 px-5">
        <div className="flex items-center gap-2 min-w-0">
          <Skeleton className="h-9 w-9 rounded-lg flex-shrink-0" />
          <Skeleton className="h-4 w-24" />
        </div>
      </CardHeader>
      <CardContent className="px-5 pb-5 pt-0">
        <Skeleton className="h-9 w-20 mb-2" />
        <Skeleton className="h-3 w-32" />
      </CardContent>
    </Card>
  );
}

export function ChatMessageSkeleton() {
  return (
    <div className="space-y-4">
      {/* User turn (right-aligned) */}
      <div className="flex flex-row-reverse items-start gap-3">
        <Skeleton className="h-8 w-8 rounded-full flex-shrink-0" />
        <div className="space-y-2 max-w-[75%]">
          <Skeleton className="h-4 w-[200px]" />
          <Skeleton className="h-4 w-[170px]" />
          <Skeleton className="h-4 w-[120px]" />
        </div>
      </div>
      {/* AI turn (left-aligned) */}
      <div className="flex flex-row items-start gap-3">
        <Skeleton className="h-8 w-8 rounded-full flex-shrink-0" />
        <div className="space-y-2 flex-1">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-[85%]" />
          <Skeleton className="h-4 w-[60%]" />
        </div>
      </div>
    </div>
  );
}

export function ListItemSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="space-y-0">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i}>
          <div className="flex items-center gap-3 py-3 px-1">
            <Skeleton className="h-10 w-10 rounded-full flex-shrink-0" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-4 w-[40%]" />
              <Skeleton className="h-3 w-[60%]" />
            </div>
          </div>
          {i < count - 1 && <Separator />}
        </div>
      ))}
    </div>
  );
}
